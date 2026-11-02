# Empresas com banco próprio, catálogo e admin, parte 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o Klok do banco único e dar a cada empresa um banco SQLite próprio, com catálogo central e painel de admin da KLOK.

**Architecture:** Um catálogo SQLite guarda empresas e admins. Cada empresa tem `dados/<CODIGO>.db` com as tabelas atuais e uma coluna `empresa` em `usuarios`. O login resolve o banco pelo código da empresa, e o JWT carrega esse código com `audience` própria. O admin tem token separado e cria empresa, banco e primeiro coordenador.

**Tech Stack:** Node 22 com `node:sqlite`, Express, `jose`, `helmet`, React Native com Expo, HTML e JavaScript sem build no painel.

**Spec:** `docs/superpowers/specs/2026-11-02-admin-empresas-design.md`

## Global Constraints

* Node 22.5 ou mais novo, por causa de `node:sqlite`
* textos e comentários em PT-BR, sem hífen nem travessão
* código de empresa no formato `^[A-Z][A-Z0-9]{1,19}$`
* `dados/` fora do git
* nenhuma senha de admin em `.env`
* cada tarefa termina com `cd klok-api && npm test` verde
* tarefas que tocam o app terminam com `npm run typecheck` verde

## Review Focus

* código de empresa digitado em minúsculas ou com espaço precisa entrar, não recusar
* código com `..` ou barra não pode virar caminho de arquivo
* token da empresa A não pode abrir dados da empresa B
* empresa desativada com conexão já aberta precisa continuar bloqueada
* sessão gravada antes desta mudança, sem empresa, precisa ser descartada sem quebrar o app

---

### Task 1: Extrair o hash de senha e criar o catálogo

**Files:**
- Create: `klok-api/senha.js`
- Create: `klok-api/admin/catalogo.js`
- Modify: `klok-api/db.js:1-5` e as funções `criarHashSenha` e `verificarSenha`
- Test: `klok-api/test/catalogo.test.js`

**Interfaces:**
- Consumes: nada
- Produces:
  - `criarHashSenha(senha: string): string`
  - `verificarSenha(senha: string, hash: string): boolean`
  - `MIGRACOES_CATALOGO: Array<{ versao: number, nome: string, sql: string }>`
  - `abrirCatalogo(caminho?: string): Catalogo`
  - `Catalogo`: `db`, `fechar()`, `userVersion()`, `criarAdmin({ usuario, senha, nome, email })`, `verificarSenhaAdmin(usuario, senha)`, `buscarAdminPorLogin(usuario)`, `buscarAdminPorId(id)`, `atualizarSenhaAdmin(id, senha)`, `contarAdmins()`, `listarEmpresas()`, `buscarEmpresa(codigo)`, `criarEmpresa({ codigo, nome })`, `atualizarEmpresa(codigo, { nome, ativa })`
  - `CODIGO_EMPRESA = /^[A-Z][A-Z0-9]{1,19}$/`
  - `codigoValido(codigo): boolean`

- [ ] **Step 1: Write the failing test**

Em `klok-api/test/catalogo.test.js`, com banco em `:memory:`:

```js
test('cria admin e confere a senha', () => {
    const c = abrirCatalogo(':memory:');
    const admin = c.criarAdmin({ usuario: 'root', senha: 'senha-forte', nome: 'Root', email: 'root@klok.app' });
    assert.equal(admin.usuario, 'root');
    assert.ok(c.verificarSenhaAdmin('root', 'senha-forte'));
    assert.equal(c.verificarSenhaAdmin('root', 'errada'), null);
});

test('recusa admin repetido', () => {
    const c = abrirCatalogo(':memory:');
    c.criarAdmin({ usuario: 'root', senha: 'senha-forte', nome: 'Root', email: 'root@klok.app' });
    assert.equal(c.criarAdmin({ usuario: 'root', senha: 'outra', nome: 'Root', email: 'root@klok.app' }).erro, 'Este usuário de admin já existe');
});

test('cria, busca, lista e desativa empresa', () => {
    const c = abrirCatalogo(':memory:');
    assert.deepEqual(c.criarEmpresa({ codigo: 'ACME', nome: 'Acme Ltda' }).codigo, 'ACME');
    assert.equal(c.buscarEmpresa('ACME').nome, 'Acme Ltda');
    assert.equal(c.listarEmpresas().length, 1);
    c.atualizarEmpresa('ACME', { ativa: false });
    assert.ok(c.buscarEmpresa('ACME').desativadaEm);
    c.atualizarEmpresa('ACME', { ativa: true });
    assert.equal(c.buscarEmpresa('ACME').desativadaEm, null);
});

test('recusa código inválido e repetido', () => {
    const c = abrirCatalogo(':memory:');
    assert.equal(c.criarEmpresa({ codigo: 'acme', nome: 'X' }).status, 400);
    assert.equal(c.criarEmpresa({ codigo: '../X', nome: 'X' }).status, 400);
    c.criarEmpresa({ codigo: 'ACME', nome: 'X' });
    assert.equal(c.criarEmpresa({ codigo: 'ACME', nome: 'Y' }).status, 409);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd klok-api && node --test test/catalogo.test.js`
Expected: FAIL com `Cannot find module '../admin/catalogo.js'`

- [ ] **Step 3: Implement `klok-api/senha.js`**

Mover `PREFIXO_HASH`, `criarHashSenha` e `verificarSenha` de `db.js` para cá, exportados. `db.js` passa a importar e continua devolvendo `criarHashSenha` no objeto do banco, para não quebrar `auth.js`.

- [ ] **Step 4: Implement `klok-api/admin/catalogo.js`**

Duas migrações em `MIGRACOES_CATALOGO`, com `PRAGMA user_version`, no mesmo formato de `db.js`. `abrirCatalogo` cria o diretório do arquivo com `mkdirSync(dirname(caminho), { recursive: true })`, exceto em `:memory:`.

`criarAdmin` valida usuário não vazio, email válido e senha com pelo menos 8 caracteres, devolve `{ erro, status }` em falha e o admin em sucesso. `verificarSenhaAdmin` devolve o admin ou `null`.

`criarEmpresa` normaliza nada: recebe o código já validado, mas confere `codigoValido` e recusa repetido com 409. `atualizarEmpresa` aceita `nome` e `ativa`, e grava `desativadaEm` como ISO ou `null`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd klok-api && node --test test/catalogo.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add klok-api/senha.js klok-api/admin/catalogo.js klok-api/db.js klok-api/test/catalogo.test.js
git commit -m "feat: catalogo de empresas e admins com senha propria"
```

---

### Task 2: Comando para criar e redefinir admin

**Files:**
- Create: `klok-api/admin/criar-admin.js`
- Create: `klok-api/scripts/criar-admin.js`
- Modify: `klok-api/package.json` scripts
- Test: `klok-api/test/criar-admin.test.js`

**Interfaces:**
- Consumes: `abrirCatalogo` da Task 1
- Produces: `criarAdminComRespostas({ catalogo, respostas })` onde `respostas` tem `usuario`, `senha`, `nome`, `email`; devolve `{ criado: true, admin }` ou `{ erro, status }`

- [ ] **Step 1: Write the failing test**

```js
test('cria admin a partir das respostas', () => {
    const c = abrirCatalogo(':memory:');
    const r = criarAdminComRespostas({ catalogo: c, respostas: { usuario: 'root', senha: 'senha-forte', nome: 'Root', email: 'root@klok.app' } });
    assert.equal(r.criado, true);
    assert.ok(c.verificarSenhaAdmin('root', 'senha-forte'));
});

test('redefinir troca a senha e incrementa a versao', () => {
    const c = abrirCatalogo(':memory:');
    criarAdminComRespostas({ catalogo: c, respostas: { usuario: 'root', senha: 'senha-forte', nome: 'Root', email: 'root@klok.app' } });
    const antes = c.buscarAdminPorLogin('root').senhaVersao;
    criarAdminComRespostas({ catalogo: c, respostas: { usuario: 'root', senha: 'senha-nova', nome: 'Root', email: 'root@klok.app' }, redefinir: true });
    assert.equal(c.buscarAdminPorLogin('root').senhaVersao, antes + 1);
    assert.ok(c.verificarSenhaAdmin('root', 'senha-nova'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd klok-api && node --test test/criar-admin.test.js`
Expected: FAIL com módulo não encontrado

- [ ] **Step 3: Implement `admin/criar-admin.js`**

`criarAdminComRespostas` valida os campos, chama `catalogo.criarAdmin` ou, com `redefinir: true`, `catalogo.atualizarSenhaAdmin`. Devolve erro claro quando o usuário não existe no modo redefinir.

- [ ] **Step 4: Implement `scripts/criar-admin.js`**

Lê `process.argv.includes('--redefinir')`, usa `readline/promises` para pedir usuário, senha, nome e email, chama `criarAdminComRespostas` com `abrirCatalogo()` e imprime o resultado. Senha não aparece na tela: usar `readline` normal nesta primeira versão, com aviso de que o terminal mostra o que é digitado.

- [ ] **Step 5: Add the npm script**

Em `klok-api/package.json`, adicionar `"admin:criar": "node scripts/criar-admin.js"`.

- [ ] **Step 6: Run test and the command help**

Run: `cd klok-api && node --test test/criar-admin.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add klok-api/admin/criar-admin.js klok-api/scripts/criar-admin.js klok-api/package.json klok-api/test/criar-admin.test.js
git commit -m "feat: comando para criar e redefinir admin"
```

---

### Task 3: Migração 7 e empresa no banco da empresa

**Files:**
- Modify: `klok-api/db.js` (migração nova e assinatura de `criarBanco`)
- Test: `klok-api/test/migracao.test.js`

**Interfaces:**
- Consumes: `PAPEL_COORDENADOR`
- Produces: `criarBanco(caminho?: string, opcoes?: { empresa?: string })`; a coluna `usuarios.empresa` existe a partir da versão 7; `criarCoordenador`, `criarUsuarioLocal` e `criarOuBuscarUsuarioGoogle` gravam a empresa do banco

- [ ] **Step 1: Write the failing test**

```js
test('migração 7 cria a coluna empresa e grava nos usuários', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    assert.equal(banco.userVersion(), MIGRACOES.length);
    const coluna = banco.db.prepare("SELECT name FROM pragma_table_info('usuarios') WHERE name = 'empresa'").get();
    assert.equal(coluna.name, 'empresa');

    const coordenador = banco.criarCoordenador('chefe', 'senha-1234', 'Chefe', 'c@acme.com', '1');
    assert.equal(coordenador.empresa, 'ACME');
    assert.equal(banco.criarUsuarioLocal('ana', 'senha-1234', 'Ana').empresa, 'ACME');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd klok-api && node --test test/migracao.test.js`
Expected: FAIL porque `empresa` não existe

- [ ] **Step 3: Implement**

Adicionar a migração 7 em `MIGRACOES`:

```sql
ALTER TABLE usuarios ADD COLUMN empresa TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa);
```

`criarBanco` guarda `const empresa = opcoes?.empresa ?? ''` e passa a coluna em todos os INSERT de `usuarios` que existem: `criarCoordenador`, `criarUsuarioLocal`, `criarOuBuscarUsuarioGoogle` e o insert de aprovação que entra na parte 2.

- [ ] **Step 4: Run all backend tests**

Run: `cd klok-api && npm test`
Expected: PASS, com os testes antigos usando empresa vazia

- [ ] **Step 5: Commit**

```bash
git add klok-api/db.js klok-api/test/migracao.test.js
git commit -m "feat: coluna empresa no banco da empresa"
```

---

### Task 4: Gerenciador de bancos por empresa

**Files:**
- Create: `klok-api/admin/gerenciador-bancos.js`
- Test: `klok-api/test/gerenciador.test.js`

**Interfaces:**
- Consumes: `abrirCatalogo`, `codigoValido` da Task 1; `criarBanco` da Task 3
- Produces: `criarGerenciador({ catalogo, dadosDir })` com `abrir(codigo)`, `criarEmpresa({ codigo, nome })`, `listar()`, `atualizar(codigo, dados)`, `caminhoDe(codigo)`, `fechar()`. `abrir` devolve `{ banco, empresa }` ou `{ erro, status }`

- [ ] **Step 1: Write the failing test**

```js
test('criar empresa cria catálogo e arquivo e permite abrir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klok-emp-'));
    const catalogo = abrirCatalogo(join(dir, 'catalogo.db'));
    const g = criarGerenciador({ catalogo, dadosDir: dir });
    const criada = g.criarEmpresa({ codigo: 'ACME', nome: 'Acme' });
    assert.equal(criada.codigo, 'ACME');
    assert.ok(existsSync(join(dir, 'ACME.db')));
    assert.equal(g.abrir('ACME').banco.userVersion(), MIGRACOES.length);
});

test('empresa inexistente, desativada e código inválido não abrem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klok-emp-'));
    const catalogo = abrirCatalogo(join(dir, 'catalogo.db'));
    const g = criarGerenciador({ catalogo, dadosDir: dir });
    assert.equal(g.abrir('NADA').status, 404);
    g.criarEmpresa({ codigo: 'ACME', nome: 'Acme' });
    catalogo.atualizarEmpresa('ACME', { ativa: false });
    assert.equal(g.abrir('ACME').status, 403);
    assert.equal(g.criarEmpresa({ codigo: '../X', nome: 'X' }).status, 400);
});

test('não sobrescreve arquivo órfão', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klok-emp-'));
    writeFileSync(join(dir, 'ACME.db'), '');
    const catalogo = abrirCatalogo(join(dir, 'catalogo.db'));
    const g = criarGerenciador({ catalogo, dadosDir: dir });
    assert.equal(g.criarEmpresa({ codigo: 'ACME', nome: 'Acme' }).status, 409);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd klok-api && node --test test/gerenciador.test.js`
Expected: FAIL com módulo não encontrado

- [ ] **Step 3: Implement**

`criarGerenciador` monta o caminho com `join(dadosDir, codigo + '.db')` só depois de `codigoValido`. `criarEmpresa` confere catálogo e arquivo, cria o arquivo com `criarBanco(caminho, { empresa: codigo })` e só então grava no catálogo; se o catálogo falhar, apaga o arquivo. `abrir` consulta o catálogo em toda chamada, então desativar vale mesmo com conexão no cache. `fechar` fecha todas as conexões abertas.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd klok-api && node --test test/gerenciador.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add klok-api/admin/gerenciador-bancos.js klok-api/test/gerenciador.test.js
git commit -m "feat: gerenciador de bancos por empresa"
```

---

### Task 5: Controladores passam a usar o banco da requisição

**Files:**
- Modify: `klok-api/controladores/funcionarios.js`, `klok-api/controladores/pontos.js`, `klok-api/controladores/coordenadores.js`
- Modify: `klok-api/app.js` (middleware temporário que injeta `req.banco`)
- Test: `klok-api/test/funcionarios.test.js`, `klok-api/test/pontos.test.js`, `klok-api/test/auth.test.js`

**Interfaces:**
- Consumes: o objeto `banco` de `db.js`
- Produces: `criarControladoresFuncionarios()`, `criarControladoresPontos()` e `criarControladoresCoordenadores()` sem argumento; todos leem `req.banco`

- [ ] **Step 1: Add the temporary injection in `app.js`**

Antes de `app.use('/api/funcionarios', ...)`, adicionar:

```js
app.use('/api', (req, res, next) => {
    req.banco = banco;
    next();
});
```

- [ ] **Step 2: Refactor the controllers**

Trocar `{ banco }` do argumento por `req.banco` em cada função. `validarNovoCoordenador(banco, body)` continua recebendo o banco como parâmetro, chamado com `req.banco`.

- [ ] **Step 3: Run the existing tests unchanged**

Run: `cd klok-api && npm test`
Expected: PASS, 83 testes

- [ ] **Step 4: Commit**

```bash
git add klok-api/controladores klok-api/app.js
git commit -m "refactor: controladores usam o banco da requisicao"
```

---

### Task 6: App multiempresa, autenticação com empresa e rotas de login

**Files:**
- Modify: `klok-api/middlewares.js`, `klok-api/app.js`, `klok-api/server.js`, `klok-api/controladores/auth.js`, `klok-api/rotas/auth.js`
- Modify: `klok-api/test/helpers.js` e todos os testes que chamam `iniciarApp`, `logar` ou `criarCoordenador`
- Modify: `klok-api/validacao.js` (função `codigoEmpresa`)
- Test: `klok-api/test/isolamento.test.js`

**Interfaces:**
- Consumes: `criarGerenciador`, `abrirCatalogo`, `codigoValido`
- Produces:
  - `criarAutenticar({ gerenciador, segredo })`
  - `criarAutenticarAdmin({ catalogo, segredo })`
  - `criarResolverEmpresa({ gerenciador })`
  - `codigoEmpresa(valor): string` (trim e maiúsculas)
  - `criarApp({ gerenciador, catalogo, clienteGoogle, enviarEmail, limiteAuth })`
  - JWT de empresa com `aud: 'klok-empresa'` e `empresa`; JWT de admin com `aud: 'klok-admin'`
  - `req.banco`, `req.empresa`, `req.usuario` nas rotas autenticadas

- [ ] **Step 1: Write the failing isolation tests**

Em `klok-api/test/isolamento.test.js`:

```js
test('login exige empresa e não aceita empresa errada', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    assert.equal((await pedidoLogin(s.baseUrl, { usuario: 'coordenador', senha: 'senha-coordenador-teste' })).status, 400);
    assert.equal((await pedidoLogin(s.baseUrl, { empresa: 'OUTRA', usuario: 'coordenador', senha: 'senha-coordenador-teste' })).status, 401);
    assert.equal((await pedidoLogin(s.baseUrl, { empresa: 'teste', usuario: 'coordenador', senha: 'senha-coordenador-teste' })).status, 200);
});

test('token da empresa A não abre dados da empresa B', async (t) => {
    const s = await iniciarApp({ segundaEmpresa: true });
    t.after(() => s.fechar());
    const tokenA = await logar(s.baseUrl, 'coordenador', 'senha-coordenador-teste', 'TESTE');
    const resp = await fetch(`${s.baseUrl}/api/funcionarios`, {
        headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(resp.status, 200);
    assert.equal((await resp.json()).length, 0);

    const tokenB = await logar(s.baseUrl, 'coordenador', 'senha-coordenador-teste', 'OUTRA');
    const listaB = await (await fetch(`${s.baseUrl}/api/funcionarios`, {
        headers: { authorization: `Bearer ${tokenB}` },
    })).json();
    assert.equal(listaB.length, 0);
});

test('token de admin não entra em rota de empresa', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const resp = await fetch(`${s.baseUrl}/api/funcionarios`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resp.status, 401);
});

test('empresa desativada bloqueia login mesmo com banco no cache', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    s.catalogo.atualizarEmpresa('TESTE', { ativa: false });
    assert.equal((await pedidoLogin(s.baseUrl, { empresa: 'TESTE', usuario: 'coordenador', senha: 'senha-coordenador-teste' })).status, 401);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd klok-api && node --test test/isolamento.test.js`
Expected: FAIL porque `iniciarApp` não aceita as opções novas

- [ ] **Step 3: Implement `codigoEmpresa` e os middlewares**

`codigoEmpresa(valor)` em `validacao.js` devolve `texto(valor, 'empresa').toUpperCase()`, com tamanho máximo 20. `criarResolverEmpresa` lê `req.body.empresa`, `req.query.empresa` ou `req.params.empresa`, chama `gerenciador.abrir` e devolve 401 genérico quando o código não existe ou a empresa está desativada, para não revelar quais códigos existem. Em sucesso, define `req.banco` e `req.empresa`.

`criarAutenticar` valida `audience: 'klok-empresa'`, exige `payload.empresa`, chama `gerenciador.abrir(payload.empresa)`, confere `usuario.empresa === payload.empresa` e devolve 401 em qualquer falha. `criarAutenticarAdmin` valida `audience: 'klok-admin'`, procura por `payload.sub` no catálogo e confere `senhaVersao`.

- [ ] **Step 4: Rewrite `test/helpers.js`**

Criar um diretório temporário por app, catálogo em `catalogo.db`, empresa `TESTE` (e `OUTRA` quando `segundaEmpresa`), gerenciador com `dadosDir` no diretório, coordenador criado direto no banco e admin `root` com senha `senha-admin-teste`. `logar` ganha o quarto parâmetro `empresa`, com padrão `TESTE`. Adicionar `pedidoLogin` e `logarAdmin`.

- [ ] **Step 5: Rewrite auth and app wiring**

`criarApp` recebe `gerenciador` e `catalogo`. `gerarTokenEmpresa(usuario, empresa)` assina com `aud: 'klok-empresa'` e `empresa`. `gerarTokenAdmin(admin)` assina com `aud: 'klok-admin'`. As rotas `/api/auth/login`, `/registrar`, `/google`, `/esqueci-senha` e `/redefinir-senha` usam `resolverEmpresa`. A rota `/redefinir-senha/:empresa/:token` usa `req.params.empresa`. Remover `/api/auth/coordenador` e o limite `coordenador` que só ela usava.

`POST /api/auth/registrar` nesta entrega responde 403 com a mensagem `O cadastro está temporariamente fechado. Peça ao coordenador da sua empresa para criar seu acesso.`

`server.js` abre o catálogo em `join(DADOS_DIR, 'catalogo.db')`, cria o gerenciador e passa os dois para `criarApp`.

- [ ] **Step 6: Update the existing tests**

Trocar `criarCoordenador(baseUrl)` por criação direta no banco, e todo `registrar` seguido de `login` por `s.banco.criarUsuarioLocal(...)`. Onde o teste esperava `/api/auth/coordenador`, remover ou converter para admin.

Run: `cd klok-api && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add klok-api/middlewares.js klok-api/app.js klok-api/server.js klok-api/controladores/auth.js klok-api/rotas/auth.js klok-api/validacao.js klok-api/test
git commit -m "feat: login por empresa com isolamento de banco"
```

---

### Task 7: Rotas de admin

**Files:**
- Create: `klok-api/admin/controladores.js`
- Create: `klok-api/admin/rotas.js`
- Modify: `klok-api/app.js`
- Test: `klok-api/test/admin.test.js`

**Interfaces:**
- Consumes: `criarAutenticarAdmin`, `gerenciador`, `catalogo`, `validarNovoCoordenador`
- Produces:
  - `criarControladoresAdmin({ catalogo, gerenciador, gerarTokenAdmin })`
  - `criarRotaAdmin(deps)` com `limitadores.adminLogin`
  - rotas `POST /api/admin/login`, `GET /api/admin/empresas`, `POST /api/admin/empresas`, `PATCH /api/admin/empresas/:codigo`, `POST /api/admin/empresas/:codigo/coordenador`

- [ ] **Step 1: Write the failing tests**

```js
test('admin loga e cria empresa com primeiro coordenador', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');

    const criada = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ codigo: 'acme', nome: 'Acme' }),
    });
    assert.equal(criada.status, 201);
    assert.equal((await criada.json()).codigo, 'ACME');

    const coordenador = await fetch(`${s.baseUrl}/api/admin/empresas/ACME/coordenador`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ usuario: 'chefe', senha: 'senha-1234', nome: 'Chefe', email: 'chefe@acme.com', numero: '1' }),
    });
    assert.equal(coordenador.status, 201);
    assert.ok(await logar(s.baseUrl, 'chefe', 'senha-1234', 'ACME'));
});

test('token de empresa não acessa admin e admin não acessa empresa', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenEmpresa = await logar(s.baseUrl, 'coordenador', 'senha-coordenador-teste', 'TESTE');
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    assert.equal((await fetch(`${s.baseUrl}/api/admin/empresas`, { headers: { authorization: `Bearer ${tokenEmpresa}` } })).status, 401);
    assert.equal((await fetch(`${s.baseUrl}/api/funcionarios`, { headers: { authorization: `Bearer ${tokenAdmin}` } })).status, 401);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd klok-api && node --test test/admin.test.js`
Expected: FAIL com 404

- [ ] **Step 3: Implement**

`login` valida usuário e senha no catálogo e devolve `{ token, tipo: 'admin', nome, id }`. `criarEmpresa` normaliza com `codigoEmpresa`, chama `gerenciador.criarEmpresa` e devolve 400, 409 ou 201. `atualizarEmpresa` aceita `nome` e `ativa`. `criarCoordenador` abre a empresa, valida com `validarNovoCoordenador(banco, req.body)` e cria.

`criarRotaAdmin` deixa `/login` público com um limitador próprio (`limitadores.adminLogin`, 10 por 15 minutos por IP) e protege o resto com `autenticarAdmin`. `app.js` monta em `/api/admin`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd klok-api && node --test test/admin.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add klok-api/admin/controladores.js klok-api/admin/rotas.js klok-api/app.js klok-api/test/admin.test.js
git commit -m "feat: rotas do admin para empresas e coordenador"
```

---

### Task 8: Painel web básico

**Files:**
- Create: `klok-api/admin/painel/index.html`
- Create: `klok-api/admin/painel/admin.js`
- Create: `klok-api/admin/painel/admin.css`
- Modify: `klok-api/app.js` (estático e rota `/admin`)
- Test: `klok-api/test/painel.test.js`

**Interfaces:**
- Consumes: rotas da Task 7 e a chave `sessionStorage.klok_admin_token`
- Produces: página em `/admin` com login, lista de empresas, formulário de criação em duas etapas, renomear e desativar

- [ ] **Step 1: Write the failing test**

```js
test('GET /admin serve o painel', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const resp = await fetch(`${s.baseUrl}/admin`);
    assert.equal(resp.status, 200);
    const html = await resp.text();
    assert.match(html, /Klok Admin/);
    assert.equal((await fetch(`${s.baseUrl}/admin/admin.js`)).status, 200);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd klok-api && node --test test/painel.test.js`
Expected: FAIL com 404

- [ ] **Step 3: Implement the panel**

`index.html` tem três blocos: login, lista de empresas e painel da empresa. O formulário de criação tem a etapa 1 com código e nome e a etapa 2 com usuário, senha, nome, email e número do coordenador. `admin.js` guarda o token em `sessionStorage`, usa `fetch` com `Authorization` e trata 401 voltando para o login. `admin.css` tem layout simples de uma coluna, sem dependência externa.

Em `app.js`, servir o painel com `const painelDir = fileURLToPath(new URL('./admin/painel', import.meta.url))`, `app.use('/admin', express.static(painelDir))` e `app.get('/admin', ...)` devolvendo `join(painelDir, 'index.html')`.

- [ ] **Step 4: Run test and verify manually**

Run: `cd klok-api && node --test test/painel.test.js`
Expected: PASS

Manual: subir a API, abrir `http://localhost:3000/admin`, entrar com o admin criado, criar uma empresa e o primeiro coordenador.

- [ ] **Step 5: Commit**

```bash
git add klok-api/admin/painel klok-api/app.js klok-api/test/painel.test.js
git commit -m "feat: painel web basico do admin"
```

---

### Task 9: App com empresa no login

**Files:**
- Modify: `api.ts`, `types.ts`, `App.tsx`, `screens/HomeScreen.tsx`, `screens/FormularioRecuperarSenha.tsx`, `screens/RedefinirSenhaScreen.tsx`
- Delete: `screens/CriarCoordenadorScreen.tsx`
- Test: `npm run typecheck`

**Interfaces:**
- Consumes: API da Task 6
- Produces: `Sessao` com `empresa`; `salvarSessao` grava `klok_empresa`; `lerSessao` descarta sessão sem empresa

- [ ] **Step 1: Update types**

`Sessao` ganha `empresa: string`. Adicionar `lerEmpresa(): Promise<string>` e `salvarEmpresa(codigo: string): Promise<void>` em `api.ts`, na chave `klok_empresa`.

- [ ] **Step 2: Update `api.ts`**

`login(empresa, usuario, senha)`, `loginGoogle(empresa, idToken)`, `registrar(empresa, usuario, senha, nome)`, `esqueciSenha(empresa, email)` e `redefinirSenha(empresa, token, novaSenha)` passam a mandar `empresa`. `lerSessao` devolve `null` quando falta `empresa` ou quando os dados são inválidos. `limparSessao` apaga `klok_token` e `klok_session`, mas não `klok_empresa`.

- [ ] **Step 3: Update `HomeScreen`**

Campo `Empresa` acima do usuário, com `autoCapitalize="characters"` e valor inicial de `lerEmpresa()`. Validação exige empresa. Login, cadastro, Google e recuperação usam o código normalizado. Mensagem de sucesso do cadastro passa a dizer que o pedido aguarda aprovação do coordenador, conforme a parte 2; nesta entrega o servidor responde 403 e a mensagem do erro é mostrada.

- [ ] **Step 4: Update `App.tsx`**

Remover o import e o estado `coordenador-pendente`. O portão só carrega a sessão e vai para o login quando não há sessão. Remover `CriarCoordenadorScreen.tsx`.

- [ ] **Step 5: Update `RedefinirSenhaScreen` e `FormularioRecuperarSenha`**

Os dois recebem `empresa` por prop e repassam para a API. O link `klok://redefinir-senha` passa a carregar `empresa` na query.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: sem erro

- [ ] **Step 7: Commit**

```bash
git add api.ts types.ts App.tsx screens
git commit -m "feat: empresa no login e sessao do app"
```

---

### Task 10: Documentação, gitignore e verificação final

**Files:**
- Modify: `README.md`, `docs/SEGURANCA.md`, `AGENTS.md`, `.gitignore`, `klok-api/.env.example`

**Interfaces:**
- Consumes: tudo acima
- Produces: documentação coerente e suíte verde

- [ ] **Step 1: Update `.gitignore` and env example**

Adicionar `klok-api/dados/`. Em `klok-api/.env.example`, documentar `DADOS_DIR=dados` e manter `JWT_SECRET`.

- [ ] **Step 2: Update the docs**

README: nova arquitetura com catálogo, tabela de rotas de admin, `npm run admin:criar`, login com empresa, autocadastro fechado nesta entrega. `docs/SEGURANCA.md`: seção sobre isolamento por arquivo, audience dos tokens e caminho validado. `AGENTS.md`: programa de blocos com as partes 1, 2 e 3.

- [ ] **Step 3: Run everything**

```bash
cd klok-api && npm test
cd .. && npm run typecheck
```

Expected: todos os testes passando e typecheck sem erro.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/SEGURANCA.md AGENTS.md .gitignore klok-api/.env.example
git commit -m "docs: empresas, admin e login por empresa"
```

---

## Self-review

Cobertura do design nesta parte:

* catálogo, admin, empresas: Tasks 1, 2, 4, 7
* banco por empresa e migração 7: Tasks 3, 4
* token por audience e isolamento: Task 6, com Review Focus coberto por `isolamento.test.js`
* login, Google e recuperação com empresa: Task 6
* app com empresa: Task 9
* painel básico: Task 8
* documentação: Task 10

Fica para a parte 2: `solicitacoes`, aprovação, emails e tela de Solicitações. Fica para a parte 3: resumo, funcionários, pontos, backup e seletor de empresa no painel.
