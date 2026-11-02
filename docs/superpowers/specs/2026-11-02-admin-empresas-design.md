# Admin da KLOK e empresas com banco próprio

Data: 2026-11-02
Issue: #26
Status: revisado pelo builder, aguardando aprovação final

## Intenção

Hoje o Klok tem um único banco (`klok-api/klok.db`) e um único processo. Todo
mundo que fica nesse banco enxerga todo mundo. O objetivo é dividir o produto por
empresa: cada empresa tem o próprio banco SQLite, os próprios coordenadores e os
próprios funcionários, e ninguém de fora alcança esses dados.

Quem cria e opera as empresas é a KLOK, através de um admin. O admin é a única
pessoa com acesso a todos os bancos, e faz isso por um painel web, não pelo app
do funcionário.

O banco atual está vazio (0 usuários, 0 funcionários, 0 pontos, versão 5), então
não há migração de dados reais. Começamos com o catálogo limpo.

O autocadastro de funcionário continua, mas passa a exigir o código da empresa e
a virar um pedido pendente. Só um coordenador daquela empresa aprova. O design
do bloco C (`2026-10-13-pedido-funcionario-aprovacao-design.md`) é incorporado
aqui, adaptado para o banco por empresa.

## Objetivos

* catálogo central com as empresas, separado dos bancos das empresas
* um arquivo SQLite por empresa, criado junto com o cadastro da empresa
* admin com login próprio, criado por comando, e painel web
* criação de empresa e do primeiro coordenador dela no mesmo fluxo
* login do app com empresa, usuário e senha, isolado por banco
* autocadastro com código da empresa e aprovação obrigatória de um coordenador
  daquela empresa, tanto no login local quanto no Google
* suporte do admin: ver funcionários e pontos de uma empresa, redefinir senha de
  coordenador, ver dados do banco e baixar cópia para backup
* resumo por empresa: quantidade de funcionários, de coordenadores e de pontos,
  depois de selecionar a empresa

## Não objetivos

* apagar empresa pelo painel
* restaurar backup pelo painel
* entrar como se fosse um coordenador (impersonação)
* transferir empresa de dono
* cobrança, plano ou limite de funcionários por empresa
* painel com framework, build ou SPA

## Anti objetivos

* um erro de consulta que deixe uma empresa enxergar dados de outra
* senha de admin em arquivo, variável de ambiente ou histórico de shell
* caminho de arquivo montado a partir de texto não validado (path traversal)
* N processos do Node para N empresas, porque isso complica deploy e memória
* painel que precise de build de frontend para rodar

## Restrições

* Node 22.5 ou mais novo, por causa de `node:sqlite`
* Express, `helmet`, `jose` e `google-auth-library` continuam sendo as
  dependências do backend
* o app é React Native com Expo e não ganha tela de admin
* SQLite em modo WAL
* textos e comentários em PT-BR, sem hífen nem travessão

## Abordagens consideradas

### 1. Coluna `empresa` em um banco único, com filtro em toda consulta

Uma coluna `empresa` em `usuarios`, `funcionarios` e `pontos`, e um `WHERE
empresa = ?` em cada consulta.

Vantagens: uma conexão, uma migração, backup simples.

Desvantagens: o isolamento passa a depender de ninguém esquecer o `WHERE`. Um
endpoint novo sem filtro vaza dados entre empresas. Backup e restauração viram
um bloco só, então restaurar uma empresa mexe em todas. Foi descartada pelo
usuário, que pediu bancos separados.

### 2. Um banco por empresa, com catálogo central e painel de admin

Um banco pequeno de catálogo guarda empresas e admins. Cada empresa tem
`dados/<CODIGO>.db` com as tabelas atuais. O servidor resolve o arquivo pelo
código que vem no login e o token carrega a empresa.

Vantagens: isolamento físico, backup e restauração por empresa, um erro de
consulta não atravessa banco. O isolamento deixa de depender de disciplina em
cada `WHERE`.

Desvantagens: N conexões abertas, migração precisa rodar em cada arquivo,
consulta entre empresas exige abrir cada banco (o resumo do admin faz isso).
Escolhida.

### 3. Um processo por empresa, com proxy na frente

Cada empresa sobe a própria instância do Node, com porta e diretório próprios, e
um proxy decide pela empresa.

Vantagens: isolamento total, inclusive de memória e de processo.

Desvantagens: N processos para operar, subir, monitorar e atualizar. Para um app
de ponto com poucas empresas, o custo operacional não se paga. Descartada.

## Desenho escolhido

### Arquivos e processos

```
klok-api/
  dados/
    catalogo.db
    KLOK.db
    ACME.db
  admin/
    catalogo.js
    gerenciador-bancos.js
    controladores.js
    rotas.js
    painel/
      index.html
      admin.js
      admin.css
  scripts/
    criar-admin.js
```

`dados/` fica fora do git. O caminho base vem de `DADOS_DIR`, com padrão
`dados`, resolvido a partir da pasta `klok-api`.

### Banco de catálogo

Tabelas:

```sql
CREATE TABLE empresas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    criadaEm TEXT NOT NULL,
    desativadaEm TEXT
);

CREATE TABLE admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL UNIQUE,
    senhaHash TEXT NOT NULL,
    nome TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    senhaVersao INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL
);
```

O catálogo tem migrações próprias, em `admin/catalogo.js`, com a mesma ideia de
`PRAGMA user_version` usada em `db.js`. Não reaproveita `MIGRACOES` porque as
tabelas são outras.

`codigo` é validado por `^[A-Z][A-Z0-9]{1,19}$`: começa com letra, só letras e
números, de 2 a 20 caracteres. O nome do arquivo é sempre `<codigo>.db` montado
a partir do valor já validado, nunca do texto cru. `nome` aceita de 1 a 60
caracteres e não é único.

### Banco da empresa

Cada arquivo usa as migrações atuais de `db.js` mais duas:

```sql
-- migração 7
ALTER TABLE usuarios ADD COLUMN empresa TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa);

-- migração 8
CREATE TABLE solicitacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    senhaHash TEXT,
    nome TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    numero TEXT NOT NULL DEFAULT '',
    googleId TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    criadoEm TEXT NOT NULL,
    decididoEm TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitacoes_usuario
    ON solicitacoes(usuario) WHERE usuario IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitacoes_google
    ON solicitacoes(googleId) WHERE googleId IS NOT NULL;
```

A tabela `solicitacoes` guarda o pedido de cadastro antes de virar usuário. Ela
vive no banco da empresa, então a aprovação nunca atravessa empresa. Os índices
únicos parciais barram pedido duplicado e impedem reutilizar um nome de usuário
já pedido, mesmo recusado.

A coluna `empresa` é redundante em relação ao arquivo, e é de propósito: serve
como defesa em profundidade. O `autenticar` confere se o token é da mesma
empresa da linha do usuário. Se alguém trocar um arquivo no diretório, o token
para de valer. Toda criação de usuário passa a gravar a empresa: coordenador
local, funcionário local e usuário do Google.

`criarBanco(caminho, { empresa })` passa a receber a empresa. Quando não vier,
usa string vazia, para não quebrar teste antigo.

Funções novas em `db.js` para o fluxo de aprovação:

* `criarSolicitacao({ usuario, senhaHash, nome, email, numero, googleId })`
* `listarSolicitacoes(status)`
* `buscarSolicitacaoPorId(id)`
* `buscarSolicitacaoPorUsuario(usuario)`
* `buscarSolicitacaoPorGoogleId(googleId)`
* `contarSolicitacoesPendentes()`
* `validarSenhaSolicitacao(usuario, senha)`
* `aprovarSolicitacao(id)`: em transação, cria o funcionário e o usuário com a
  empresa e marca o pedido como aprovado
* `recusarSolicitacao(id)`

### Resolução do banco

`gerenciador-bancos.js` expõe:

* `abrir(codigo)`: consulta o catálogo, recusa empresa inexistente ou desativada
  e devolve o banco aberto. Mantém um `Map` de conexões abertas por código.
* `criarEmpresa({ codigo, nome })`: valida, grava no catálogo, cria o arquivo com
  `criarBanco` e roda as migrações. Se o arquivo já existir e o catálogo não
  tiver a empresa, recusa, para não sobrescrever banco órfão.
* `listarEmpresas()`: lê o catálogo.
* `atualizarEmpresa(codigo, { nome, ativa })`: renomeia e ativa/desativa.
* `resumo(codigo)`: abre o banco da empresa e conta funcionários, coordenadores e
  pontos, além do ponto mais recente.
* `copiaParaBackup(codigo, destino)`: usa `VACUUM INTO` para gerar uma cópia
  consistente, porque `node:sqlite` não expõe o método `backup`.

O `Map` de conexões não tem limite na primeira versão. Cada `DatabaseSync` é
barato, mas o número de descritores de arquivo cresce com o número de empresas.
Se o produto passar de algumas dezenas de empresas, entra um LRU. Fica anotado
como decisão adiada.

### Autenticação

Dois tipos de token, com o mesmo `JWT_SECRET` e `audience` diferente:

* empresa: `aud: 'klok-empresa'`, payload com `sub`, `tipo`, `v` e `empresa`
* admin: `aud: 'klok-admin'`, payload com `sub`, `tipo: 'admin'` e `v`

`criarAutenticar` passa a exigir a audience de empresa e compara
`payload.empresa` com `usuario.empresa`. `criarAutenticarAdmin` valida a audience
de admin, procura o admin no catálogo e confere `senhaVersao`.

Um token de admin não entra em rota de empresa, e um token de empresa não entra
em rota de admin, mesmo que o segredo seja o mesmo.

### Login do app

`POST /api/auth/login` passa a exigir `empresa`, além de `usuario` e `senha`. O
servidor resolve o banco pelo código, valida a senha e assina o token com a
empresa. Empresa inexistente e empresa desativada devolvem a mesma mensagem
genérica de credenciais inválidas, para não revelar quais códigos existem.

`POST /api/auth/registrar` passa a exigir `empresa`, `email` válido e cria um
pedido pendente no banco daquela empresa, sem criar usuário. Resposta 201 com
mensagem de aguardando aprovação. O nome de usuário precisa estar livre em
`usuarios` e em `solicitacoes`. Os coordenadores da empresa são avisados por
email quando o pedido entra.

Login de pedido pendente é bloqueado com uma mensagem clara. A senha é conferida
contra o hash do pedido antes de revelar o bloqueio, para a rota não virar
oráculo de quais nomes existem.

`POST /api/solicitacoes/:id/aprovar` e `POST /api/solicitacoes/:id/recusar`, com
`autenticar` e `exigirCoordenador`, decidem o pedido. Aprovar cria o funcionário e
o usuário com a empresa do banco. Aprovar duas vezes devolve 409. Se o nome foi
tomado nesse meio tempo, devolve 409 e o pedido continua pendente. O candidato é
avisado por email quando aprovado.

`POST /api/auth/google` também exige `empresa`. Se já existe usuário ativo com
aquele `googleId`, entra. Senão, cria ou reencontra um pedido pendente, avisa os
coordenadores e responde 403 com a mensagem de aguardando aprovação. Repetir o
login Google não duplica o pedido, porque o índice parcial em `googleId` barra.

`POST /api/auth/esqueci-senha` exige `empresa`, porque o token de recuperação
vive no banco da empresa. O link do email carrega a empresa:
`klok://redefinir-senha?token=...&empresa=KLOK` e
`/redefinir-senha/KLOK/<token>`. A tela de redefinição manda a empresa junto na
hora de gravar a senha nova.

Rotas removidas:

* `GET /api/auth/coordenador` e `POST /api/auth/coordenador`, porque o primeiro
  coordenador agora é criado pelo admin
* a tela `CriarCoordenadorScreen` do app

O app deixa de consultar status no boot e abre direto no login. Uma sessão
gravada antes desta mudança não tem `empresa`, então é descartada e o usuário
entra de novo.

### Mudanças no app

* `types.ts`: `Sessao` ganha `empresa`; tipos `Solicitacao` e `ResumoEmpresa`.
* `api.ts`: login, Google, cadastro, esqueci senha e redefinição mandam a
  empresa. O código fica em `klok_empresa`, chave separada de `klok_session`,
  então sobrevive ao "Sair" e preenche o campo no próximo login.
* `HomeScreen`: campo de empresa no login e no cadastro, email obrigatório no
  cadastro, aviso de pedido enviado e mensagem clara de conta pendente.
* `App.tsx` e `screens/SolicitacoesScreen.tsx`: tela de Solicitações no menu do
  coordenador, com contador de pendentes, aprovar e recusar.
* `screens/RedefinirSenhaScreen.tsx`: recebe e manda a empresa junto do token.
* `screens/CriarCoordenadorScreen.tsx` é removida, junto do status de primeiro
  acesso.

### Rotas do coordenador para pedidos

Todas com `autenticar` e `exigirCoordenador`:

* `GET /api/solicitacoes?status=` (padrão pendente)
* `POST /api/solicitacoes/:id/aprovar`
* `POST /api/solicitacoes/:id/recusar`

### Painel de admin

`/admin` serve `admin/painel/index.html`, `admin.js` e `admin.css`, sem build.
O login é uma chamada a `POST /api/admin/login`; o token fica em
`sessionStorage` e vai no header `Authorization` das chamadas seguintes.
`sessionStorage` é escolha consciente: o painel é interno, o HTML é nosso e o
token morre ao fechar a aba. Fica registrado que cookie `httpOnly` com CSRF
seria mais forte, e é o próximo passo se o painel ganhar mais superfície.

Rotas JSON:

| Método | Rota | Para que serve |
|---|---|---|
| POST | `/api/admin/login` | login do admin |
| GET | `/api/admin/empresas` | lista empresas com status |
| POST | `/api/admin/empresas` | cria empresa e o banco |
| PATCH | `/api/admin/empresas/:codigo` | renomeia e ativa ou desativa |
| GET | `/api/admin/empresas/:codigo/resumo` | contagens e último ponto |
| POST | `/api/admin/empresas/:codigo/coordenador` | cria o primeiro coordenador |
| GET | `/api/admin/empresas/:codigo/coordenadores` | lista coordenadores e seus ids |
| POST | `/api/admin/empresas/:codigo/coordenadores/:id/senha` | redefine senha |
| GET | `/api/admin/empresas/:codigo/funcionarios` | funcionários para suporte |
| GET | `/api/admin/empresas/:codigo/pontos` | pontos para suporte, com limite e filtros |
| GET | `/api/admin/empresas/:codigo/solicitacoes` | pedidos pendentes para suporte |
| GET | `/api/admin/empresas/:codigo/banco` | caminho, versão e tamanho |
| GET | `/api/admin/empresas/:codigo/banco/backup` | baixa cópia consistente |

O painel tem duas partes. A primeira lista empresas e permite criar, renomear e
desativar. A segunda só aparece depois de escolher uma empresa: mostra o resumo,
os coordenadores, o primeiro coordenador, a redefinição de senha, funcionários,
pontos, pedidos pendentes e o botão de backup. A seleção é um `<select>` no topo,
e a escolha fica na URL como `?empresa=KLOK` para sobreviver a recarregar a
página.

A criação da empresa é em duas etapas na mesma tela: primeiro código e nome;
depois do banco criado, usuário, senha, nome, email e número do primeiro
coordenador. Se a segunda etapa falhar, a empresa continua criada e sem
coordenador, e a tela mostra o botão para cadastrar o coordenador depois.

### Criação do admin

`npm run admin:criar` roda `scripts/criar-admin.js`, que abre o catálogo, pede
usuário, senha, nome e email, e grava o hash com `scrypt`, o mesmo formato do
resto do projeto. O comando recusa usuário repetido e senha com menos de 8
caracteres. Nada de `ADMIN_SENHA` no `.env`.

`npm run admin:criar -- --redefinir` procura o admin existente, grava a senha
nova e incrementa `senhaVersao`, o que revoga as sessões antigas. É o caminho
para admin que esqueceu a senha, sem editar arquivo nenhum.

## Ondas de entrega

O trabalho é grande e vai em três issues, cada uma com plano e PR próprios:

1. **Fundação multiempresa.** Catálogo, admin, criação de empresa, banco por
   empresa, login com empresa, isolamento, criação do primeiro coordenador pelo
   admin, painel básico e os ajustes do app. Nesta onda o autocadastro fica
   temporariamente fechado, com mensagem para o coordenador criar o acesso.
2. **Autocadastro com aprovação.** Migração 8, `solicitacoes`, aprovação pelo
   coordenador, emails e tela de Solicitações no app. Reabre o autocadastro.
3. **Suporte e resumo no painel.** Funcionários, coordenadores, pontos com
   limite, pedidos pendentes, dados do banco, backup e contagens por empresa.

A ordem importa: a onda 2 depende da 1, e a 3 depende das duas.

## ADRs

O Klok ainda não tem ADRs. Este design cria `docs/adr/` com quatro registros:
0001 sobre registrar decisões, 0002 sobre um banco por empresa, 0003 sobre o
admin em painel web e 0004 sobre tokens separados por audience.

## Segurança

* rate limit separado para login de admin e login de empresa, por IP e por
  usuário, como já existe no login atual
* mensagem genérica para empresa inexistente, empresa desativada e credencial
  errada
* `codigo` validado antes de qualquer montagem de caminho
* admin não loga em rota de empresa, e empresa não loga em rota de admin
* backup usa `VACUUM INTO` e é servido como download, sem gravar cópia no
  diretório de dados
* painel com `helmet`, `Cache-Control: no-store` e sem exibir token na tela
* pedido pendente não recebe token, não bate ponto e não entra no app
* cadastro exige email válido e o nome de usuário fica reservado em
  `solicitacoes`, mesmo se o pedido for recusado
* email para os coordenadores sai do banco daquela empresa, nunca de outro

## Testes

* catálogo: migração, criar admin, usuário repetido, criar empresa, código
  inválido, código repetido, arquivo já existente sem catálogo
* gerenciador: abrir empresa existente, inexistente, desativada; cache devolve a
  mesma conexão; `VACUUM INTO` gera cópia legível
* isolamento: token da empresa A recusado na empresa B; coordenador da A não vê
  funcionário da B; admin acessa as duas; coordenador não acessa rota de admin
* login: empresa obrigatória; empresa errada não autentica; Google com empresa;
  recuperação de senha com empresa no link
* criação: empresa e primeiro coordenador; falha na segunda etapa deixa empresa
  sem coordenador e permite retomar
* resumo: contagens corretas por empresa, sem somar empresas diferentes
* aprovação: cadastro vira pendente e não loga; coordenador lista, aprova e
  recusa; aprovar duas vezes dá 409; nome repetido dá 409; Google vira pedido e
  não duplica; email ao coordenador na entrada e ao candidato na aprovação
* migração 7 e 8: banco antigo ganha a coluna, o índice e a tabela de
  solicitações
* app: typecheck passa, login manda empresa, sessão antiga é descartada

## O que fica para o plano

* ordem das tarefas e em quais PRs entram
* nomes exatos dos módulos e funções, se o plano precisar ajustar
* textos do painel
* decisão sobre LRU de conexões, adiada
* cookie `httpOnly` com CSRF, adiado
* apagar empresa, restaurar backup e impersonação, adiados
