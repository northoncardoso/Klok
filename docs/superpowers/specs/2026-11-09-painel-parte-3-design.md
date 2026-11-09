# Painel do admin, parte 3: suporte completo por empresa

Data: 2026-11-09
Issue: #32
Status: aprovado, com escopo ampliado a pedido do usuário
Design anterior: `docs/superpowers/specs/2026-11-02-admin-empresas-design.md`

## Intenção

O multiempresa está de pé: catálogo, banco por empresa, login com empresa,
autocadastro com aprovação e um painel que cria empresa, renomeia, ativa,
desativa e cadastra o primeiro coordenador. Falta a parte de suporte, que é o que
torna o painel útil no dia a dia.

O objetivo é o admin resolver tudo pelo navegador, sem abrir o terminal:

- ver o retrato de uma empresa;
- listar e redefinir senha de coordenadores;
- listar, editar, apagar e exportar funcionários;
- listar, filtrar, paginar e exportar pontos;
- aprovar e recusar pedidos de cadastro;
- ver dados do banco, baixar e restaurar backup;
- apagar empresa;
- impersonar um coordenador para reproduzir um problema.

A escrita no banco da empresa fica restrita a funcionários, pedidos e senha de
coordenador. Nada de mudar pontos.

## Decisão sobre empresa desativada

Hoje `gerenciador.abrir(codigo)` recusa empresa desativada com 403. Se o painel
usar essa função, o admin não consegue ver nem baixar backup de uma empresa
desativada, justamente quando o suporte costuma precisar.

Decisão aprovada: desativar bloqueia o login do app, não o suporte do admin.

- `abrir(codigo)` continua recusando empresa desativada, e é o caminho do login
  e do app.
- `abrir(codigo, { permitirDesativada: true })` ignora `desativadaEm` e é usado
  só nas rotas de admin, atrás de `autenticarAdmin`.

O catálogo continua sendo consultado em toda abertura, então desativar uma
empresa vale imediatamente para o app mesmo com a conexão em cache.

## Rotas

Todas exigem `autenticarAdmin` e usam a abertura com `permitirDesativada: true`.
Empresa inexistente continua 404 e código inválido continua 400.

### Leitura

| Método | Rota | Para que serve |
|---|---|---|
| GET | `/api/admin/empresas/:codigo/resumo` | contagens e último ponto |
| GET | `/api/admin/empresas/:codigo/coordenadores` | lista coordenadores |
| GET | `/api/admin/empresas/:codigo/funcionarios` | lista funcionários |
| GET | `/api/admin/empresas/:codigo/funcionarios.csv` | exporta funcionários |
| GET | `/api/admin/empresas/:codigo/pontos` | pontos com filtro e paginação |
| GET | `/api/admin/empresas/:codigo/pontos.csv` | exporta pontos filtrados |
| GET | `/api/admin/empresas/:codigo/solicitacoes` | pedidos por status |
| GET | `/api/admin/empresas/:codigo/banco` | versão, caminho e tamanho |
| GET | `/api/admin/empresas/:codigo/banco/backup` | baixa cópia consistente |

### Escrita

| Método | Rota | Para que serve |
|---|---|---|
| POST | `/api/admin/empresas/:codigo/coordenadores/:id/senha` | redefine a senha |
| POST | `/api/admin/empresas/:codigo/coordenadores/:id/impersonar` | gera token do coordenador |
| PATCH | `/api/admin/empresas/:codigo/funcionarios/:id` | edita funcionário |
| DELETE | `/api/admin/empresas/:codigo/funcionarios/:id` | apaga funcionário |
| POST | `/api/admin/empresas/:codigo/solicitacoes/:id/aprovar` | aprova pedido |
| POST | `/api/admin/empresas/:codigo/solicitacoes/:id/recusar` | recusa pedido |
| POST | `/api/admin/empresas/:codigo/banco/restaurar` | restaura backup enviado |
| DELETE | `/api/admin/empresas/:codigo` | apaga a empresa |

### Sessão

| Método | Rota | Para que serve |
|---|---|---|
| POST | `/api/admin/login` | login e criação dos cookies |
| POST | `/api/admin/logout` | limpa os cookies |

## Sessão com cookie e CSRF

O design de 2026-11-02 registrou o token em `sessionStorage` e deixou cookie
`httpOnly` com CSRF como próximo passo. Esta onda faz esse passo.

`POST /api/admin/login` passa a criar dois cookies:

- `klok_admin`: o JWT, `HttpOnly`, `SameSite=Strict`, `Path=/api/admin`,
  `Max-Age=43200`, `Secure` quando `NODE_ENV=production`;
- `klok_csrf`: 32 bytes aleatórios em hexadecimal, **sem** `HttpOnly`,
  `SameSite=Strict`, `Path=/`, `Max-Age=43200`, `Secure` em produção.

A resposta do login continua devolvendo o token no JSON, para os testes e para
um eventual cliente de linha de comando. O painel ignora esse campo.

`autenticarAdmin` passa a aceitar duas formas:

- header `Authorization: Bearer`, que não exige CSRF, usada por testes e CLI;
- cookie `klok_admin`, que exige o header `x-csrf-token` igual ao cookie
  `klok_csrf`, comparado com `timingSafeEqual`.

Cookie sem CSRF ou com valor errado devolve 403. Cookie inválido ou expirado
devolve 401. `POST /api/admin/logout` limpa os dois cookies e responde 204.

O parse de cookie é manual, sem dependência nova. O painel lê `klok_csrf` de
`document.cookie`, manda em `x-csrf-token` e usa `credentials: 'same-origin'`.
Nada de token em `sessionStorage`.

## Resumo

`GET .../resumo` devolve:

```json
{
  "codigo": "ACME",
  "nome": "Acme",
  "desativadaEm": null,
  "funcionarios": 7,
  "coordenadores": 2,
  "pontos": 640,
  "solicitacoesPendentes": 4,
  "ultimoPonto": "2026-11-06T21:04:00.000Z"
}
```

As contagens saem de uma função `resumo()` nova no `db.js`, com um
`SELECT COUNT(*)` por tabela e um `MAX(dataHora)` em `pontos`. Nada de somar
empresas diferentes, porque cada banco é um arquivo.

## Coordenadores

`GET .../coordenadores` devolve `id`, `usuario`, `nome`, `numero` e `email`, sem
`senhaHash`, usando `listarCoordenadores()` que já existe.

`POST .../coordenadores/:id/senha` recebe `{ "senha": "..." }`:

- valida com `senhaDe` e exige o mesmo `MINIMO_SENHA` do cadastro de coordenador;
- confere que o `id` existe e é coordenador, senão 404;
- grava com `banco.atualizarSenha(id, banco.criarHashSenha(senha))`, o que também
  incrementa `senhaVersao` e derruba tokens antigos;
- responde 204.

`POST .../coordenadores/:id/impersonar`:

- confere que o `id` existe e é coordenador, senão 404;
- gera token de empresa com `gerarTokenEmpresa(usuario, codigo)`, o mesmo usado
  pelo login normal, com validade de 12 horas;
- devolve `{ token, empresa, usuario, tipo, expiraEmHoras: 12 }`;
- registra no log do servidor `[klok] admin <usuario> impersonou <coordenador>
  na empresa <CODIGO>`, sem tabela de auditoria nesta onda;
- o painel mostra o token em campo somente leitura, com botão copiar e aviso de
  que expira em 12 horas.

Nunca impersona funcionário.

## Funcionários

`GET .../funcionarios` devolve `listarFuncionarios()` ordenado por nome, com
`id`, `nome`, `numero` e `email`.

`PATCH .../funcionarios/:id` usa a mesma validação do app, extraída de
`controladores/funcionarios.js` para uma função `prepararDadosFuncionario`.
Além de `atualizarFuncionario`, atualiza a linha de `usuarios` ligada ao
funcionário, quando existir, para nome, número e email não divergirem entre as
duas tabelas. Precisa de uma função nova `buscarUsuarioPorFuncionarioId` no
`db.js`.

`DELETE .../funcionarios/:id` usa `apagarFuncionario`, que já remove pontos e
usuário na mesma transação. O painel exige digitar o nome do funcionário antes
de confirmar.

`GET .../funcionarios.csv` exporta a mesma lista, com cabeçalho
`id;nome;numero;email`.

## Pontos

`GET .../pontos?funcionarioId=&de=&ate=&limite=&pagina=` devolve:

```json
{
  "pontos": [ ... ],
  "pagina": 1,
  "paginas": 4,
  "limite": 200,
  "total": 640
}
```

- `funcionarioId` é opcional e precisa ser inteiro positivo;
- `de` e `ate` são opcionais, no formato `AAAA-MM-DD`, comparados com
  `date(dataHora, '-3 hours')`, porque o painel mostra o dia de Brasília;
- `limite` é opcional, padrão 200, mínimo 1 e máximo 200;
- `pagina` é opcional, padrão 1, mínimo 1;
- `paginas` é `Math.ceil(total / limite)`, e `0` quando não há resultado;
- a resposta traz `funcionarioNome`, `dataHora` e `tipo`, ordenada do mais
  recente para o mais antigo;
- a consulta é montada com parâmetros, nunca com interpolação de string.

Valor inválido em qualquer filtro devolve 400 com mensagem clara.

`GET .../pontos.csv` usa os mesmos filtros, sem paginação, com teto de 10.000
linhas. Acima disso devolve 400 pedindo para filtrar mais. Cabeçalho
`id;funcionario;dataHora;tipo`, com data e hora em Brasília.

## CSV

Os dois CSV seguem o mesmo formato:

- separador `;`, porque é o que o Excel em português espera;
- BOM `\uFEFF` no começo, para acento abrir certo;
- fim de linha `\r\n`;
- campos com `;`, aspas ou quebra de linha ficam entre aspas, com aspas
  duplicadas;
- `Content-Type: text/csv; charset=utf-8`;
- `Content-Disposition: attachment; filename="klok-ACME-pontos-2026-11-09.csv"`;
- `Cache-Control: no-store`, herdado do app.

O painel baixa por `fetch` com blob, porque link direto não manda CSRF.

## Solicitações

`GET .../solicitacoes?status=&pagina=&limite=` usa `listarSolicitacoes(status)`,
que já remove `senhaHash`. `status` aceita `pendente`, `aprovado` e `recusado`,
com padrão `pendente`. Paginação igual à de pontos.

`POST .../solicitacoes/:id/aprovar` e `.../recusar` reutilizam a lógica que hoje
está em `controladores/solicitacoes.js`, extraída para
`servicos/solicitacoes.js`:

- `aprovarPedido({ banco, empresa, id, enviarEmail })` aprova, avisa o candidato
  por email e devolve o funcionário criado;
- `recusarPedido({ banco, id })` recusa e devolve o pedido atualizado.

O controlador do coordenador passa a chamar o mesmo serviço, para não existirem
duas versões da regra. Aprovar duas vezes continua 409, e o email ao candidato
continua saindo só na aprovação bem-sucedida.

## Banco, backup e restauração

`GET .../banco` devolve:

```json
{
  "codigo": "ACME",
  "caminho": "/.../dados/ACME.db",
  "versao": 8,
  "tamanhoBytes": 409600
}
```

`versao` vem de `PRAGMA user_version` e `tamanhoBytes` de `statSync`. Se o
arquivo não existir, devolve 404 explicando que o banco da empresa não está no
disco.

`GET .../banco/backup`:

1. cria um diretório temporário com `mkdtempSync`;
2. roda `VACUUM INTO ?` com o caminho do arquivo temporário, o que gera cópia
   consistente mesmo com o banco aberto em WAL;
3. responde com `res.download` e o nome `klok-<CODIGO>-<AAAA-MM-DD>.db`;
4. apaga o diretório temporário no callback do download, com ou sem erro.

`POST .../banco/restaurar`:

- corpo cru `application/octet-stream`, com `express.raw` montado só nesta rota e
  limite de 64 MB;
- exige o header `x-confirmar-codigo` igual ao código da empresa;
- confere a assinatura `SQLite format 3\0` nos primeiros 16 bytes;
- grava em arquivo temporário, abre com `DatabaseSync`, roda
  `PRAGMA integrity_check` e lê `user_version`, e exige versão entre 1 e
  `MIGRACOES.length`;
- fecha a conexão em cache;
- move o arquivo atual para `<CODIGO>.db.antes-de-restaurar-<timestamp>`;
- apaga `-wal` e `-shm` antigos e move o temporário para o lugar;
- reabre o banco e devolve o resumo;
- se qualquer passo falhar depois da troca, devolve o arquivo anterior ao lugar.

O arquivo `.antes-de-restaurar-*` fica no diretório de dados como rede de
segurança. O painel avisa que a operação substitui os dados e pede o código
digitado.

## Apagar empresa

`DELETE .../empresas/:codigo` exige o header `x-confirmar-codigo` igual ao
código. O gerenciador ganha `apagar(codigo)`:

1. fecha a conexão em cache;
2. remove a empresa do catálogo;
3. apaga `<CODIGO>.db`, `-wal` e `-shm`.

Se a remoção do catálogo funcionar e a dos arquivos falhar, a empresa some do
painel e sobra arquivo órfão, que `criarEmpresa` já recusa reaproveitar. O erro
é registrado no log. Não existe lixeira nesta onda.

## Painel

Continua HTML, CSS e JS puro, sem build, em `admin/painel/`. O `index.html` ganha
os cartões dentro do bloco da empresa selecionada:

- **Empresas**: lista com Abrir e Apagar, com confirmação digitada;
- **Resumo**: quatro números grandes e o último ponto em data e hora de Brasília;
- **Coordenadores**: tabela com Redefinir senha e Impersonar por linha;
- **Funcionários**: tabela com edição inline, apagar com confirmação e botão
  Exportar CSV;
- **Pontos**: filtros de funcionário, data inicial, data final, limite e
  paginação, com aviso "página X de Y, N de M" e botão Exportar CSV;
- **Solicitações**: seletor de status, aprovar e recusar por linha;
- **Banco**: versão, tamanho, Baixar backup e Restaurar backup com upload e
  confirmação.

Regras de tela:

- um `<select>` no topo escolhe a empresa;
- a escolha vai para a URL como `?empresa=ACME` e é lida no carregamento;
- cada seção tem seu `carregar...()` no `admin.js`;
- erro em uma seção não derruba as outras, e a mensagem aparece no cartão da
  seção com `role="alert"`;
- toda ação destrutiva pede confirmação e bloqueia toque duplo;
- o `admin.js` é dividido por seção, sem framework e sem bundler.

## Testes

Novos testes em `klok-api/test/admin-painel.test.js`, mais casos nos arquivos
existentes:

- resumo conta funcionários, coordenadores, pontos e pendentes só da empresa
  escolhida;
- coordenadores lista sem `senhaHash`;
- redefinir senha grava, o login com a senha nova funciona e o token antigo do
  coordenador é recusado;
- redefinir senha curta devolve 400 e id que não é coordenador devolve 404;
- impersonar coordenador devolve token que acessa `/api/funcionarios` e
  impersonar funcionário devolve 404;
- funcionários lista, edita, apaga e o CSV traz cabeçalho e linhas certas;
- pontos respeita o limite padrão, pagina, filtra por funcionário e período e
  devolve `total` e `paginas` com os mesmos filtros;
- filtro inválido devolve 400, e o CSV recusa acima de 10.000 linhas;
- solicitações lista, aprova com email e recusa, e aprovar duas vezes dá 409;
- banco devolve versão e tamanho;
- backup devolve arquivo que abre com `criarBanco` e tem as mesmas contagens;
- restaurar backup troca os dados, recusa arquivo que não é SQLite, recusa versão
  desconhecida e recusa confirmação errada;
- apagar empresa remove do catálogo e do disco, e recusa confirmação errada;
- empresa desativada continua bloqueando o login do app e o painel segue vendo
  resumo, baixando backup e restaurando;
- login cria `klok_admin` com `HttpOnly` e `klok_csrf` sem `HttpOnly`;
- rota com cookie sem CSRF devolve 403, com CSRF errado devolve 403 e com CSRF
  certo funciona;
- Bearer continua funcionando sem CSRF;
- logout limpa os cookies;
- todas as rotas novas devolvem 401 sem sessão.

O teste do gerenciador ganha os casos de `abrir(codigo, { permitirDesativada:
true })` em empresa desativada e de `apagar`.

## Riscos aceitos

- restaurar backup substitui os dados da empresa; a rede de segurança é o
  arquivo `.antes-de-restaurar-*`;
- apagar empresa é definitivo;
- impersonar gera um token de coordenador válido por 12 horas, registrado só no
  log do servidor;
- o painel continua sem trilha de auditoria em tabela nesta onda;
- o teto de 10.000 linhas no CSV evita resposta gigante, e o admin precisa
  filtrar para exportar mais.

## O que fica para o plano

- ordem das tarefas e divisão em commits;
- nomes exatos das funções novas no `db.js` e no gerenciador;
- textos finais do painel;
- decisão sobre mostrar caminho absoluto do banco ou só o nome do arquivo;
- formato do aviso de "página X de Y".
