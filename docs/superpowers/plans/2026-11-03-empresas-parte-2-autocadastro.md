# Autocadastro com pedido e aprovação por empresa: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para marcar progresso.

**Goal:** Reabrir o autocadastro como pedido pendente no banco da empresa, aprovado ou recusado por um coordenador da mesma empresa, com aviso por email no pedido e na aprovação.

**Architecture:** A tabela `solicitacoes` vive no banco de cada empresa, o mesmo que a parte 1 criou. O cadastro local e o login Google gravam ali, sem criar usuário. O login local confere a senha contra o pedido antes de revelar o 403. As rotas do coordenador usam `autenticar` e `exigirCoordenador`, então o banco já vem resolvido em `req.banco` e o isolamento é físico. A aprovação roda em transação e cria funcionário e usuário juntos.

**Tech Stack:** Node 22.23 com `node:sqlite`, Express 4, Node test runner, React Native com Expo 57 e TypeScript 6.

**Spec:** `docs/superpowers/specs/2026-11-03-empresas-parte-2-autocadastro-design.md`

## Global Constraints

- Node 22.5 ou superior, por causa do `node:sqlite`.
- Todo o fluxo roda em `req.banco`, nunca no catálogo central.
- Textos, comentários e mensagens em PT-BR, sem hífen nem travessão.
- O app não ganha biblioteca nova nesta parte.
- `senhaHash` não sai de `db.js` em nenhuma função que devolva solicitação.
- Nenhum envio de email pode derrubar cadastro ou aprovação.
- Mensagens fixas do design, copiadas literalmente:
  - pendente: `Seu cadastro está aguardando aprovação de um coordenador da sua empresa.`
  - recusado: `Seu pedido de cadastro foi recusado. Fale com um coordenador da sua empresa.`
  - assunto do pedido: `Klok: novo pedido de cadastro em <CODIGO>`
  - assunto da aprovação: `Klok: seu cadastro foi aprovado`

## Review Focus

- Pedido pendente tentando entrar: login local e login Google precisam devolver 403 sem token, e a senha errada continua 401 genérico.
- Coordenador da empresa A decidindo um id que só existe no banco da empresa B: precisa receber 404, nunca decidir.
- `senhaHash` aparecendo em listagem, contagem ou resposta de aprovação: precisa nunca aparecer.
- SMTP quebrado ou coordenador sem email durante o cadastro: o pedido precisa continuar criado e a resposta continuar 201.
- Nome de usuário de pedido recusado voltando a ficar livre: precisa continuar barrado com 409.

---

### Task 1: Migração 8 e funções de solicitação no banco

**Files:**
- Modify: `klok-api/db.js`
- Test: `klok-api/test/migracao.test.js`
- Create: `klok-api/test/solicitacoes-db.test.js`

**Interfaces:**
- Consumes: `criarBanco(caminho, { empresa })`, `criarHashSenha`, `criarFuncionario`, `buscarUsuarioPorLogin`, `buscarUsuarioPorGoogleId`, `buscarUsuarioPorId`.
- Produces, todas dentro do objeto devolvido por `criarBanco`:
  - `criarSolicitacao({ usuario, senhaHash, nome, email, numero, googleId })` devolve a linha criada sem `senhaHash` ou `{ erro, status }`.
  - `listarSolicitacoes(status = 'pendente')` devolve array sem `senhaHash`.
  - `buscarSolicitacaoPorId(id)`, `buscarSolicitacaoPorUsuario(usuario)`, `buscarSolicitacaoPorGoogleId(googleId)` devolvem a linha sem `senhaHash` ou `undefined`.
  - `contarSolicitacoesPendentes()` devolve number.
  - `validarSenhaSolicitacao(usuario, senha)` devolve a linha sem `senhaHash` quando a senha confere ou `null`.
  - `aprovarSolicitacao(id)` devolve `{ funcionario, usuario }` ou `{ erro, status }`.
  - `recusarSolicitacao(id)` devolve `{ solicitacao }` ou `{ erro, status }`.

- [ ] **Step 1: Escrever o teste da migração 8**

Em `klok-api/test/migracao.test.js`, acrescentar ao fim:

```js
test('migração 8 cria solicitacoes com índices parciais', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klok-migra-pedidos-'));
    const caminho = join(dir, 'klok.db');
    const bruto = new DatabaseSync(caminho);
    for (const migracao of MIGRACOES.slice(0, 7)) bruto.exec(migracao.sql);
    bruto.exec('PRAGMA user_version = 7');
    bruto.close();

    const banco = criarBanco(caminho);
    assert.equal(banco.userVersion(), MIGRACOES.length);
    const tabela = banco.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'solicitacoes'")
        .get();
    assert.equal(tabela.name, 'solicitacoes');
    const indices = banco.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'solicitacoes'")
        .all()
        .map((i) => i.name)
        .sort();
    assert.deepEqual(indices, ['idx_solicitacoes_google', 'idx_solicitacoes_status', 'idx_solicitacoes_usuario']);
    banco.db.close();
    rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd klok-api && node --test test/migracao.test.js`
Expected: FAIL porque `solicitacoes` não existe e `MIGRACOES.length` ainda é 7.

- [ ] **Step 3: Escrever os testes das funções de banco**

Criar `klok-api/test/solicitacoes-db.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco } from '../db.js';

function novoSolicitacao(banco, dados = {}) {
    return banco.criarSolicitacao({
        usuario: 'ana',
        senhaHash: banco.criarHashSenha('1234'),
        nome: 'Ana',
        email: 'ana@teste.com',
        numero: '',
        googleId: null,
        ...dados,
    });
}

test('criarSolicitacao devolve pendente e sem senhaHash', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    assert.equal(pedido.status, 'pendente');
    assert.equal(pedido.senhaHash, undefined);
    assert.equal(banco.contarSolicitacoesPendentes(), 1);
    banco.db.close();
});

test('criarSolicitacao barra nome repetido e pedido recusado também reserva', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    assert.equal(novoSolicitacao(banco).status, 409);
    banco.recusarSolicitacao(pedido.id);
    assert.equal(novoSolicitacao(banco).status, 409);
    banco.db.close();
});

test('criarSolicitacao exige usuário ou googleId', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const r = banco.criarSolicitacao({ usuario: null, senhaHash: null, nome: 'X', email: 'x@x.com', numero: '', googleId: null });
    assert.equal(r.status, 400);
    banco.db.close();
});

test('validarSenhaSolicitacao confere a senha do pedido', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    novoSolicitacao(banco);
    assert.equal(banco.validarSenhaSolicitacao('ana', 'errada'), null);
    assert.equal(banco.validarSenhaSolicitacao('ana', '1234').status, 'pendente');
    assert.equal(banco.validarSenhaSolicitacao('ana', '1234').senhaHash, undefined);
    banco.db.close();
});

test('aprovarSolicitacao cria funcionário e usuário com a empresa', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    const r = banco.aprovarSolicitacao(pedido.id);
    assert.equal(r.funcionario.nome, 'Ana');
    assert.equal(r.usuario.usuario, 'ana');
    assert.equal(r.usuario.empresa, 'ACME');
    assert.equal(r.usuario.tipo, 'funcionario');
    assert.ok(banco.buscarUsuarioPorLogin('ana'));
    assert.equal(banco.buscarSolicitacaoPorId(pedido.id).status, 'aprovado');
    banco.db.close();
});

test('aprovarSolicitacao recusa pedido já decidido e nome tomado', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    banco.criarUsuarioLocal('ana', 'outra-senha', 'Ana');
    const r = banco.aprovarSolicitacao(pedido.id);
    assert.equal(r.status, 409);
    assert.equal(banco.buscarSolicitacaoPorId(pedido.id).status, 'pendente');
    banco.db.close();
});

test('aprovarSolicitacao aceita pedido do Google sem senha', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco, { usuario: null, senhaHash: null, googleId: 'g-1' });
    const r = banco.aprovarSolicitacao(pedido.id);
    assert.equal(r.usuario.googleId, 'g-1');
    assert.equal(r.usuario.senhaHash, null);
    banco.db.close();
});

test('recusarSolicitacao grava decisão e mantém no histórico', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    assert.equal(banco.recusarSolicitacao(pedido.id).solicitacao.status, 'recusado');
    assert.ok(banco.buscarSolicitacaoPorId(pedido.id).decididoEm);
    assert.equal(banco.recusarSolicitacao(pedido.id).status, 409);
    assert.equal(banco.recusarSolicitacao(999).status, 404);
    banco.db.close();
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `cd klok-api && node --test test/solicitacoes-db.test.js`
Expected: FAIL com `banco.criarSolicitacao is not a function`.

- [ ] **Step 5: Adicionar a migração 8**

Em `MIGRACOES`, depois da versão 7:

```js
{
    versao: 8,
    nome: 'pedidos de cadastro por empresa',
    sql: `
        CREATE TABLE IF NOT EXISTS solicitacoes (
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
        CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes(status);
    `,
},
```

- [ ] **Step 6: Implementar as funções em `criarBanco`**

Antes do `return`, incluir. A coluna `usuario` do pedido é `usuario`; o helper `semSenha` remove o hash e o `errcode` 2067 identifica violação de unicidade, conferido no Node 22.23:

```js
function ehConflitoDeUnicidade(erro) {
    return erro?.errcode === 2067;
}

function semSenha(linha) {
    if (!linha) return linha;
    const { senhaHash, ...resto } = linha;
    return resto;
}

function criarSolicitacao({ usuario, senhaHash, nome, email, numero, googleId }) {
    const login = usuario ? paraTexto(usuario) : null;
    const contaGoogle = googleId ? paraTexto(googleId) : null;
    if (!login && !contaGoogle) {
        return { erro: 'Informe usuário ou conta Google', status: 400 };
    }
    try {
        const r = db.prepare(
            `INSERT INTO solicitacoes (usuario, senhaHash, nome, email, numero, googleId, status, criadoEm)
             VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?)`
        ).run(login, senhaHash ?? null, paraTexto(nome), paraTexto(email), paraTexto(numero), contaGoogle, new Date().toISOString());
        return semSenha(buscarSolicitacaoPorId(r.lastInsertRowid));
    } catch (e) {
        if (ehConflitoDeUnicidade(e)) {
            return { erro: 'Este nome de usuário já está em uso', status: 409 };
        }
        throw e;
    }
}

function listarSolicitacoes(status = 'pendente') {
    return db.prepare('SELECT * FROM solicitacoes WHERE status = ? ORDER BY criadoEm').all(status).map(semSenha);
}

function buscarSolicitacaoPorId(id) {
    return semSenha(db.prepare('SELECT * FROM solicitacoes WHERE id = ?').get(id));
}

function buscarSolicitacaoPorUsuario(usuario) {
    return semSenha(db.prepare('SELECT * FROM solicitacoes WHERE usuario = ?').get(paraTexto(usuario)));
}

function buscarSolicitacaoPorGoogleId(googleId) {
    return semSenha(db.prepare('SELECT * FROM solicitacoes WHERE googleId = ?').get(paraTexto(googleId)));
}

function contarSolicitacoesPendentes() {
    return Number(db.prepare("SELECT COUNT(*) AS total FROM solicitacoes WHERE status = 'pendente'").get().total);
}

function validarSenhaSolicitacao(usuario, senha) {
    if (typeof senha !== 'string') return null;
    const linha = db.prepare('SELECT * FROM solicitacoes WHERE usuario = ?').get(paraTexto(usuario));
    if (!linha || !linha.senhaHash) return null;
    if (!linha.senhaHash.startsWith(PREFIXO_HASH)) return null;
    return verificarSenha(senha, linha.senhaHash) ? semSenha(linha) : null;
}

function aprovarSolicitacao(id) {
    // A linha crua é necessária para copiar o senhaHash; a versão pública sai sem ele.
    const cru = db.prepare('SELECT * FROM solicitacoes WHERE id = ?').get(id);
    if (!cru) return { erro: 'Pedido não encontrado', status: 404 };
    if (cru.status !== 'pendente') return { erro: 'Este pedido já foi decidido', status: 409 };
    if (cru.usuario && buscarUsuarioPorLogin(cru.usuario)) {
        return { erro: 'Este nome de usuário já está em uso', status: 409 };
    }
    if (cru.googleId && buscarUsuarioPorGoogleId(cru.googleId)) {
        return { erro: 'Esta conta Google já está em uso', status: 409 };
    }

    db.exec('BEGIN');
    try {
        const funcionarioId = criarFuncionario(cru.nome || cru.usuario || 'Sem nome', cru.numero, cru.email);
        const r = db.prepare(
            `INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, googleId, empresa)
             VALUES (?, ?, 'funcionario', ?, ?, ?)`
        ).run(cru.usuario ?? null, cru.senhaHash ?? null, funcionarioId, cru.googleId ?? null, empresa);
        db.prepare('UPDATE solicitacoes SET status = ?, decididoEm = ? WHERE id = ?')
            .run('aprovado', new Date().toISOString(), id);
        db.exec('COMMIT');
        return {
            funcionario: buscarFuncionario(funcionarioId),
            usuario: buscarUsuarioPorId(r.lastInsertRowid),
        };
    } catch (e) {
        db.exec('ROLLBACK');
        if (ehConflitoDeUnicidade(e)) {
            return { erro: 'Este nome de usuário já está em uso', status: 409 };
        }
        throw e;
    }
}
```

```js
function recusarSolicitacao(id) {
    const pedido = buscarSolicitacaoPorId(id);
    if (!pedido) return { erro: 'Pedido não encontrado', status: 404 };
    if (pedido.status !== 'pendente') return { erro: 'Este pedido já foi decidido', status: 409 };
    db.prepare('UPDATE solicitacoes SET status = ?, decididoEm = ? WHERE id = ?')
        .run('recusado', new Date().toISOString(), id);
    return { solicitacao: buscarSolicitacaoPorId(id) };
}
```

Exporte as nove funções no objeto de retorno.

- [ ] **Step 7: Rodar os testes de banco e migração**

Run: `cd klok-api && node --test test/solicitacoes-db.test.js test/migracao.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add klok-api/db.js klok-api/test/solicitacoes-db.test.js klok-api/test/migracao.test.js
git commit -m "feat: criar solicitacoes de cadastro no banco da empresa (issue #31)"
```

---

### Task 2: Email genérico e redefinição de senha refatorada

**Files:**
- Modify: `klok-api/email.js`
- Modify: `klok-api/controladores/auth.js`
- Test: `klok-api/test/recuperacao.test.js`

**Interfaces:**
- Consumes: `criarEnviarEmail()` montado uma vez em `app.js` e injetado como `enviarEmail`.
- Produces: `enviarEmail({ para, assunto, texto })`, única assinatura usada por todos os avisos.

- [ ] **Step 1: Atualizar os testes existentes para o novo contrato**

Em `klok-api/test/recuperacao.test.js`, o arquivo tem três fakes de `enviarEmail`.
Trocar os três:

1. No teste `recuperação envia link e redefinir senha funciona`, trocar a linha
   17 por:

```js
enviarEmail: async ({ para, assunto, texto }) => emailsEnviados.push({ para, assunto, texto }),
```

2. No lugar das asserções de `url` e `urlApp` (linhas 37 a 45), usar:

```js
assert.equal(emailsEnviados[0].para, 'lia@mail.com');
assert.equal(emailsEnviados[0].assunto, 'Klok: Redefinição de senha');
assert.match(emailsEnviados[0].texto, /http:\/\/localhost:3000\/redefinir-senha\/TESTE\/[0-9a-f]{64}/);
const tokenReset = emailsEnviados[0].texto.match(
    /klok:\/\/redefinir-senha\?empresa=TESTE&token=([0-9a-f]{64})/
)[1];
```

3. No teste `email desconhecido não revela a existência e não envia link`,
   trocar a linha 78 por:

```js
enviarEmail: async ({ para }) => emailsEnviados.push({ para }),
```

4. No teste `link só pode ser usado uma vez`, trocar a linha 97 por:

```js
enviarEmail: async ({ texto }) => emailsEnviados.push(texto),
```

E trocar a linha 113 (`const tokenReset = tokenDoLink(emailsEnviados[0]);`) por:

```js
const tokenReset = emailsEnviados[0].match(/token=([0-9a-f]{64})/)[1];
```

Com isso o helper `tokenDoLink` deixa de ser usado e pode ser removido do topo
do arquivo.

O resto dos testes fica igual (página, redefinição, senha antiga e nova).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd klok-api && node --test test/recuperacao.test.js`
Expected: FAIL porque `assunto` chega `undefined`.

- [ ] **Step 3: Refatorar `email.js`**

Trocar as duas funções devolvidas por uma só:

```js
export function criarEnviarEmail() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || (host ? 587 : 0));
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const remetente = process.env.SMTP_REMETENTE || (user ? `Klok <${user}>` : 'Klok');
    const comSmtp = !!(host && user && pass);

    if (!comSmtp) {
        return async function enviarEmailSemSmtp({ para, assunto, texto }) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('SMTP não configurado em produção.');
            }
            if (!destinatarioValido(para)) {
                throw new Error('Destinatário de email inválido.');
            }
            console.log('[klok] email simulado');
            console.log(`[klok]   Para: ${para}`);
            console.log(`[klok]   Assunto: ${assunto}`);
            console.log(`[klok]   Texto: ${texto}`);
        };
    }

    const transportador = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    return async function enviarEmail({ para, assunto, texto }) {
        if (!destinatarioValido(para)) {
            throw new Error('Destinatário de email inválido.');
        }
        await transportador.sendMail({ from: remetente, to: para, subject: assunto, text: texto });
    };
}
```

- [ ] **Step 4: Refatorar `esqueciSenha`**

Montar assunto e texto antes de chamar:

```js
const assunto = 'Klok: Redefinição de senha';
const texto = [
    'Recebemos um pedido para redefinir sua senha no app Klok.',
    'Abra o link abaixo para confirmar que é você e definir uma nova senha:',
    '',
    url,
    urlApp,
    '',
    'Este link é válido por 30 minutos. Se você não pediu, ignore este email.',
].join('\n');
await enviarEmail({ para: email, assunto, texto });
```

- [ ] **Step 5: Rodar os testes de recuperação e a suíte**

Run: `cd klok-api && npm test`
Expected: PASS com 99 testes ou mais.

- [ ] **Step 6: Commit**

```bash
git add klok-api/email.js klok-api/controladores/auth.js klok-api/test/recuperacao.test.js
git commit -m "refactor: generalizar o envio de email (issue #31)"
```

---

### Task 3: Cadastro local vira pedido pendente

**Files:**
- Create: `klok-api/avisos.js`
- Modify: `klok-api/controladores/auth.js`
- Create: `klok-api/test/solicitacoes.test.js`
- Modify: `klok-api/test/auth.test.js`
- Modify: `klok-api/test/ataques.test.js`

**Interfaces:**
- Consumes: `criarSolicitacao`, `buscarSolicitacaoPorUsuario`, `listarCoordenadores`, `criarHashSenha` (Task 1) e `enviarEmail({ para, assunto, texto })` (Task 2).
- Produces:
  - `avisarCoordenadores({ banco, enviarEmail, empresa, nome, identificacao, email })` em `avisos.js`, que nunca lança.
  - `POST /api/auth/registrar` responde 201 com `{ sucesso: true, mensagem }`.

- [ ] **Step 1: Escrever os testes HTTP do cadastro**

Antes de criar o arquivo novo, ajustar os testes existentes que esperam o
cadastro fechado:

1. Em `klok-api/test/auth.test.js`, substituir o teste
   `o autocadastro está fechado e não cria usuário` (linhas 90 a 102) por:

```js
test('o autocadastro cria pedido e não cria usuário direto', async (t) => {
    const s = await iniciarApp({ enviarEmail: async () => {} });
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            empresa: EMPRESA,
            usuario: 'ana',
            senha: '123456',
            nome: 'Ana',
            email: 'ana@teste.com',
        }),
    });
    assert.equal(resp.status, 201);
    assert.equal((await resp.json()).token, undefined);
    assert.equal(s.banco.buscarUsuarioPorLogin('ana'), undefined);
    assert.equal(s.banco.contarSolicitacoesPendentes(), 1);
});
```

2. Em `klok-api/test/ataques.test.js`, renomear o teste
   `cadastro fechado recusa qualquer payload e não cria ninguém` para
   `cadastro recusa email malicioso e não cria usuário` e trocar a asserção
   `assert.equal(r.status, 403, ...)` por `assert.equal(r.status, 400, ...)`.
   Acrescentar ao fim do teste:

```js
assert.equal(s.banco.contarSolicitacoesPendentes(), 0, 'nenhum pedido pode ter sido criado');
```

Criar `klok-api/test/solicitacoes.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { iniciarApp, logar, pedidoLogin, EMPRESA, COORDENADOR, COORDENADOR_SENHA } from './helpers.js';

async function cadastrar(baseUrl, corpo = {}) {
    const resp = await fetch(`${baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            empresa: EMPRESA,
            usuario: 'ana',
            senha: '1234',
            nome: 'Ana',
            email: 'ana@teste.com',
            ...corpo,
        }),
    });
    return { status: resp.status, corpo: await resp.json() };
}

test('cadastro cria pedido pendente sem usuário e sem token', async (t) => {
    const emails = [];
    const s = await iniciarApp({ enviarEmail: async (m) => emails.push(m) });
    t.after(() => s.fechar());

    const r = await cadastrar(s.baseUrl);
    assert.equal(r.status, 201);
    assert.equal(r.corpo.token, undefined);
    assert.equal(s.banco.contarSolicitacoesPendentes(), 1);
    assert.equal(s.banco.buscarUsuarioPorLogin('ana'), undefined);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].para, COORDENADOR.email);
    assert.match(emails[0].assunto, /novo pedido de cadastro em TESTE/);
    assert.equal((await pedidoLogin(s.baseUrl, { empresa: EMPRESA, usuario: 'ana', senha: '1234' })).status, 403);
});

test('cadastro exige email válido e nome de usuário livre', async (t) => {
    const s = await iniciarApp({ enviarEmail: async () => {} });
    t.after(() => s.fechar());

    assert.equal((await cadastrar(s.baseUrl, { email: 'sem-arroba' })).status, 400);
    assert.equal((await cadastrar(s.baseUrl, { senha: '1' })).status, 400);

    await cadastrar(s.baseUrl);
    assert.equal((await cadastrar(s.baseUrl)).status, 409);
    s.banco.recusarSolicitacao(s.banco.buscarSolicitacaoPorUsuario('ana').id);
    assert.equal((await cadastrar(s.baseUrl)).status, 409);
});

test('falha de email não derruba o cadastro', async (t) => {
    const s = await iniciarApp({
        enviarEmail: async () => {
            throw new Error('SMTP fora');
        },
    });
    t.after(() => s.fechar());
    assert.equal((await cadastrar(s.baseUrl)).status, 201);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd klok-api && node --test test/solicitacoes.test.js`
Expected: FAIL com 403 no primeiro teste, porque o cadastro ainda está fechado.

- [ ] **Step 3: Criar `klok-api/avisos.js`**

```js
import { destinatarioValido } from './email.js';

export function textoNovoPedido({ empresa, nome, identificacao, email }) {
    return [
        `Chegou um pedido de cadastro na empresa ${empresa}.`,
        '',
        `Nome: ${nome || 'não informado'}`,
        `Identificação: ${identificacao}`,
        `Email: ${email}`,
        '',
        'Abra o app Klok, entre como coordenador e decida em Solicitacoes.',
    ].join('\n');
}

export function textoAprovacao({ empresa, usuario }) {
    return [
        `Seu cadastro na empresa ${empresa} foi aprovado.`,
        '',
        `Entre no app Klok com o usuário ${usuario} e a senha que você cadastrou.`,
    ].join('\n');
}

export async function avisarCoordenadores({ banco, enviarEmail, empresa, nome, identificacao, email }) {
    const assunto = `Klok: novo pedido de cadastro em ${empresa}`;
    const texto = textoNovoPedido({ empresa, nome, identificacao, email });
    for (const coordenador of banco.listarCoordenadores()) {
        if (!destinatarioValido(coordenador.email)) continue;
        try {
            await enviarEmail({ para: coordenador.email, assunto, texto });
        } catch (e) {
            console.error('[klok] falha ao avisar coordenador:', e);
        }
    }
}

export async function avisarAprovacao({ enviarEmail, empresa, usuario, email }) {
    if (!destinatarioValido(email)) return;
    try {
        await enviarEmail({
            para: email,
            assunto: 'Klok: seu cadastro foi aprovado',
            texto: textoAprovacao({ empresa, usuario }),
        });
    } catch (e) {
        console.error('[klok] falha ao avisar candidato:', e);
    }
}
```

- [ ] **Step 4: Trocar `registrar` no controlador**

```js
async function registrar(req, res) {
    const banco = req.banco;
    const usuario = texto(req.body?.usuario, 'usuario');
    const senhaLimpa = senhaDe(req.body?.senha);
    const nome = texto(req.body?.nome, 'nome') || usuario;
    const email = emailNormalizado(req.body?.email);

    if (!usuario || !semCaractereDeControle(usuario)) {
        return res.status(400).json({ erro: 'Informe um nome de usuário válido' });
    }
    if (senhaLimpa.length < MINIMO_SENHA) {
        return res.status(400).json({ erro: `A senha deve ter ao menos ${MINIMO_SENHA} caracteres` });
    }
    if (!emailValido(email)) {
        return res.status(400).json({ erro: 'Informe um email válido' });
    }
    if (banco.buscarUsuarioPorLogin(usuario) || banco.buscarSolicitacaoPorUsuario(usuario)) {
        return res.status(409).json({ erro: 'Este nome de usuário já está em uso' });
    }

    const criada = banco.criarSolicitacao({
        usuario,
        senhaHash: banco.criarHashSenha(senhaLimpa),
        nome,
        email,
        numero: '',
        googleId: null,
    });
    if (criada.erro) return res.status(criada.status).json({ erro: criada.erro });

    await avisarCoordenadores({
        banco,
        enviarEmail,
        empresa: req.empresa,
        nome,
        identificacao: usuario,
        email,
    });
    res.status(201).json({
        sucesso: true,
        mensagem: 'Seu cadastro foi enviado. Aguarde a aprovação de um coordenador da sua empresa.',
    });
}
```

Importar `avisarCoordenadores` de `../avisos.js` no topo do controlador.

- [ ] **Step 5: Rodar os testes**

Run: `cd klok-api && npm test`
Expected: PASS nos testes novos e nos ajustados.

- [ ] **Step 6: Commit**

```bash
git add klok-api/avisos.js klok-api/controladores/auth.js klok-api/test/solicitacoes.test.js klok-api/test/auth.test.js klok-api/test/ataques.test.js
git commit -m "feat: cadastro local vira pedido pendente com aviso (issue #31)"
```

---

### Task 4: Login local bloqueia pendente e recusado

**Files:**
- Modify: `klok-api/controladores/auth.js`
- Test: `klok-api/test/solicitacoes.test.js`

**Interfaces:**
- Consumes: `validarSenhaSolicitacao` (Task 1) e o cadastro da Task 3.
- Produces: 403 com mensagem fixa só depois de a senha conferir; 401 genérico em qualquer outro caso.

- [ ] **Step 1: Escrever os testes de login**

Acrescentar em `klok-api/test/solicitacoes.test.js`:

```js
test('login de pedido pendente só revela 403 com a senha certa', async (t) => {
    const s = await iniciarApp({ enviarEmail: async () => {} });
    t.after(() => s.fechar());
    await cadastrar(s.baseUrl);

    const certa = await pedidoLogin(s.baseUrl, { empresa: EMPRESA, usuario: 'ana', senha: '1234' });
    assert.equal(certa.status, 403);
    assert.match(certa.corpo.erro, /aguardando aprovação/);

    const errada = await pedidoLogin(s.baseUrl, { empresa: EMPRESA, usuario: 'ana', senha: 'errada' });
    assert.equal(errada.status, 401);
    assert.equal(errada.corpo.erro, 'Usuário ou senha incorretos');
});

test('login de pedido recusado dá 403 e nome continua reservado', async (t) => {
    const s = await iniciarApp({ enviarEmail: async () => {} });
    t.after(() => s.fechar());
    await cadastrar(s.baseUrl);
    s.banco.recusarSolicitacao(s.banco.buscarSolicitacaoPorUsuario('ana').id);

    const r = await pedidoLogin(s.baseUrl, { empresa: EMPRESA, usuario: 'ana', senha: '1234' });
    assert.equal(r.status, 403);
    assert.match(r.corpo.erro, /foi recusado/);
    assert.equal((await cadastrar(s.baseUrl)).status, 409);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd klok-api && node --test test/solicitacoes.test.js`
Expected: FAIL porque o login responde 401 para o pendente.

- [ ] **Step 3: Ajustar `login`**

```js
const encontrado = banco.validarSenha(usuarioLimpo, senhaLimpa);
if (encontrado) {
    const token = await gerarTokenEmpresa(encontrado, req.empresa);
    return res.json({ token, tipo: encontrado.tipo, nome: encontrado.usuario, id: encontrado.id });
}

const pedido = banco.validarSenhaSolicitacao(usuarioLimpo, senhaLimpa);
if (pedido) {
    const mensagem =
        pedido.status === 'pendente'
            ? 'Seu cadastro está aguardando aprovação de um coordenador da sua empresa.'
            : 'Seu pedido de cadastro foi recusado. Fale com um coordenador da sua empresa.';
    return res.status(403).json({ erro: mensagem });
}

return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `cd klok-api && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add klok-api/controladores/auth.js klok-api/test/solicitacoes.test.js
git commit -m "feat: bloquear login de pedido pendente ou recusado (issue #31)"
```

---

### Task 5: Login Google vira pedido pendente

**Files:**
- Modify: `klok-api/controladores/auth.js`
- Modify: `klok-api/db.js`
- Test: `klok-api/test/solicitacoes.test.js`
- Modify: `klok-api/test/auth.test.js`

**Interfaces:**
- Consumes: `buscarUsuarioPorGoogleId`, `buscarSolicitacaoPorGoogleId`, `criarSolicitacao`, `avisarCoordenadores`.
- Produces: usuário ativo entra; sem usuário ativo, responde 403 depois de criar ou reencontrar um único pedido.

- [ ] **Step 1: Reescrever o teste antigo do Google**

O teste `login com Google cria usuário e reutiliza em login seguinte`, em
`klok-api/test/auth.test.js` (linhas 179 a 207), espera 200 e passa a falhar de
propósito: sem usuário ativo o fluxo agora é pedido pendente. Substituir o
teste inteiro por:

```js
test('login Google sem usuário ativo vira pedido pendente', async (t) => {
    const clienteGoogle = {
        verifyIdToken: async () => ({
            getPayload: () => ({ sub: 'g123', name: 'Ana Google', email: 'ana@gmail.com' }),
        }),
    };
    const s = await iniciarApp({ clienteGoogle, enviarEmail: async () => {} });
    t.after(() => s.fechar());

    const primeira = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, idToken: 'token-fake' }),
    });
    assert.equal(primeira.status, 403);
    const corpo1 = await primeira.json();
    assert.equal(corpo1.token, undefined);
    assert.match(corpo1.erro, /aguardando aprovação/);

    const segunda = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, idToken: 'token-fake' }),
    });
    assert.equal(segunda.status, 403);
    assert.equal(s.banco.contarSolicitacoesPendentes(), 1, 'mesmo googleId não deve duplicar pedido');
});
```

- [ ] **Step 2: Acrescentar os testes novos do Google**

Acrescentar em `klok-api/test/solicitacoes.test.js`:

```js
function googleFake(payload) {
    return {
        verifyIdToken: async () => ({ getPayload: () => payload }),
    };
}

test('login Google cria um pedido, não duplica e avisa o coordenador', async (t) => {
    const emails = [];
    const s = await iniciarApp({
        clienteGoogle: googleFake({ sub: 'g-1', name: 'Gabi', email: 'gabi@teste.com' }),
        enviarEmail: async (m) => emails.push(m),
    });
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, idToken: 'token-google' }),
    });
    assert.equal(resp.status, 403);
    assert.equal(s.banco.contarSolicitacoesPendentes(), 1);
    assert.equal(s.banco.buscarUsuarioPorGoogleId('g-1'), undefined);

    const repetido = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, idToken: 'token-google' }),
    });
    assert.equal(repetido.status, 403);
    assert.equal(s.banco.contarSolicitacoesPendentes(), 1);
    assert.equal(emails.length, 1);
});

test('login Google sem email não cria pedido', async (t) => {
    const s = await iniciarApp({
        clienteGoogle: googleFake({ sub: 'g-2', name: 'Sem Email' }),
        enviarEmail: async () => {},
    });
    t.after(() => s.fechar());
    const resp = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, idToken: 'token-google' }),
    });
    assert.equal(resp.status, 400);
    assert.equal(s.banco.contarSolicitacoesPendentes(), 0);
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd klok-api && node --test test/solicitacoes.test.js`
Expected: FAIL porque o Google ainda cria usuário ativo. O teste novo de
`test/auth.test.js` também falha com 200.

- [ ] **Step 4: Trocar o fluxo em `loginGoogle`**

```js
const sub = texto(payload?.sub, 'usuario');
const nomeGoogle = texto(payload?.name, 'nome');
const email = emailNormalizado(payload?.email);
if (!sub) return res.status(401).json({ erro: 'Falha na autenticação com Google' });
if (!emailValido(email)) {
    return res.status(400).json({ erro: 'Sua conta Google não devolveu um email válido' });
}

const usuario = banco.buscarUsuarioPorGoogleId(sub);
if (usuario) {
    const token = await gerarTokenEmpresa(usuario, req.empresa);
    return res.json({ token, tipo: usuario.tipo, nome: nomeGoogle, id: usuario.id });
}

const pedido = banco.buscarSolicitacaoPorGoogleId(sub);
if (pedido?.status === 'pendente') {
    return res.status(403).json({ erro: 'Seu cadastro está aguardando aprovação de um coordenador da sua empresa.' });
}
if (pedido?.status === 'recusado') {
    return res.status(403).json({ erro: 'Seu pedido de cadastro foi recusado. Fale com um coordenador da sua empresa.' });
}

const criada = banco.criarSolicitacao({
    usuario: null,
    senhaHash: null,
    nome: nomeGoogle,
    email,
    numero: '',
    googleId: sub,
});
if (criada.erro) return res.status(criada.status).json({ erro: criada.erro });

await avisarCoordenadores({
    banco,
    enviarEmail,
    empresa: req.empresa,
    nome: nomeGoogle,
    identificacao: `conta Google ${email}`,
    email,
});
res.status(403).json({ erro: 'Seu cadastro está aguardando aprovação de um coordenador da sua empresa.' });
```

- [ ] **Step 5: Remover `criarOuBuscarUsuarioGoogle`**

Nenhum ponto do código usa a função depois desta troca. Remover a função de `db.js` e a linha do objeto de exportação.

- [ ] **Step 6: Rodar a suíte**

Run: `cd klok-api && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add klok-api/controladores/auth.js klok-api/db.js klok-api/test/solicitacoes.test.js klok-api/test/auth.test.js
git commit -m "feat: login Google vira pedido pendente (issue #31)"
```

---

### Task 6: Rotas do coordenador para listar, contar, aprovar e recusar

**Files:**
- Create: `klok-api/controladores/solicitacoes.js`
- Create: `klok-api/rotas/solicitacoes.js`
- Modify: `klok-api/app.js`
- Test: `klok-api/test/solicitacoes.test.js`

**Interfaces:**
- Consumes: `listarSolicitacoes`, `contarSolicitacoesPendentes`, `aprovarSolicitacao`, `recusarSolicitacao`, `avisarAprovacao`, `autenticar`, `exigirCoordenador`.
- Produces, com `Authorization: Bearer <token>` de coordenador:
  - `GET /api/solicitacoes?status=` devolve array, padrão `pendente`.
  - `GET /api/solicitacoes/contagem` devolve `{ pendentes: number }`.
  - `POST /api/solicitacoes/:id/aprovar` devolve 201 com o funcionário criado.
  - `POST /api/solicitacoes/:id/recusar` devolve 200 com `{ sucesso: true }`.

- [ ] **Step 1: Escrever os testes das rotas**

Acrescentar em `klok-api/test/solicitacoes.test.js`:

```js
async function decidir(baseUrl, token, id, acao) {
    const resp = await fetch(`${baseUrl}/api/solicitacoes/${id}/${acao}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
    });
    let corpo = null;
    try {
        corpo = await resp.json();
    } catch {
        corpo = null;
    }
    return { status: resp.status, corpo };
}

test('coordenador lista, conta, aprova e libera o login', async (t) => {
    const emails = [];
    const s = await iniciarApp({ enviarEmail: async (m) => emails.push(m) });
    t.after(() => s.fechar());
    await cadastrar(s.baseUrl);
    const token = await logar(s.baseUrl, COORDENADOR.usuario, COORDENADOR_SENHA);

    const lista = await (await fetch(`${s.baseUrl}/api/solicitacoes`, {
        headers: { authorization: `Bearer ${token}` },
    })).json();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].usuario, 'ana');
    assert.equal(lista[0].senhaHash, undefined);
    assert.equal(lista[0].email, 'ana@teste.com');

    const contagem = await (await fetch(`${s.baseUrl}/api/solicitacoes/contagem`, {
        headers: { authorization: `Bearer ${token}` },
    })).json();
    assert.equal(contagem.pendentes, 1);

    const aprovacao = await decidir(s.baseUrl, token, lista[0].id, 'aprovar');
    assert.equal(aprovacao.status, 201);
    assert.equal(aprovacao.corpo.nome, 'Ana');
    assert.ok(await logar(s.baseUrl, 'ana', '1234'));
    assert.equal((await decidir(s.baseUrl, token, lista[0].id, 'aprovar')).status, 409);
    assert.ok(emails.some((m) => m.assunto === 'Klok: seu cadastro foi aprovado'));
});

test('funcionário não acessa rotas de solicitação', async (t) => {
    const s = await iniciarApp({ enviarEmail: async () => {} });
    t.after(() => s.fechar());
    await cadastrar(s.baseUrl);
    const token = await logar(s.baseUrl, COORDENADOR.usuario, COORDENADOR_SENHA);
    const lista = await (await fetch(`${s.baseUrl}/api/solicitacoes`, {
        headers: { authorization: `Bearer ${token}` },
    })).json();
    await decidir(s.baseUrl, token, lista[0].id, 'aprovar');

    const tokenFuncionario = await logar(s.baseUrl, 'ana', '1234');
    const resp = await fetch(`${s.baseUrl}/api/solicitacoes`, {
        headers: { authorization: `Bearer ${tokenFuncionario}` },
    });
    assert.equal(resp.status, 403);
});

test('coordenador de outra empresa não vê nem decide pedido', async (t) => {
    const s = await iniciarApp({ segundaEmpresa: true, enviarEmail: async () => {} });
    t.after(() => s.fechar());
    await cadastrar(s.baseUrl);
    const id = s.banco.buscarSolicitacaoPorUsuario('ana').id;

    const tokenB = await logar(s.baseUrl, COORDENADOR.usuario, COORDENADOR_SENHA, 'OUTRA');
    const listaB = await (await fetch(`${s.baseUrl}/api/solicitacoes`, {
        headers: { authorization: `Bearer ${tokenB}` },
    })).json();
    assert.equal(listaB.length, 0);
    assert.equal((await decidir(s.baseUrl, tokenB, id, 'aprovar')).status, 404);
    assert.equal((await decidir(s.baseUrl, tokenB, id, 'recusar')).status, 404);
});

test('status inválido e recusa mantêm histórico', async (t) => {
    const s = await iniciarApp({ enviarEmail: async () => {} });
    t.after(() => s.fechar());
    await cadastrar(s.baseUrl);
    const token = await logar(s.baseUrl, COORDENADOR.usuario, COORDENADOR_SENHA);
    const id = s.banco.buscarSolicitacaoPorUsuario('ana').id;

    const invalido = await fetch(`${s.baseUrl}/api/solicitacoes?status=outro`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(invalido.status, 400);

    assert.equal((await decidir(s.baseUrl, token, id, 'recusar')).status, 200);
    assert.equal((await decidir(s.baseUrl, token, id, 'recusar')).status, 409);
    assert.equal((await pedidoLogin(s.baseUrl, { empresa: EMPRESA, usuario: 'ana', senha: '1234' })).status, 403);
    const recusados = await (await fetch(`${s.baseUrl}/api/solicitacoes?status=recusado`, {
        headers: { authorization: `Bearer ${token}` },
    })).json();
    assert.equal(recusados.length, 1);
});

test('falha no email de aprovação não derruba a aprovação', async (t) => {
    const s = await iniciarApp({
        enviarEmail: async () => {
            throw new Error('SMTP fora');
        },
    });
    t.after(() => s.fechar());
    await cadastrar(s.baseUrl);
    const token = await logar(s.baseUrl, COORDENADOR.usuario, COORDENADOR_SENHA);
    const id = s.banco.buscarSolicitacaoPorUsuario('ana').id;

    const aprovacao = await decidir(s.baseUrl, token, id, 'aprovar');
    assert.equal(aprovacao.status, 201);
    assert.ok(await logar(s.baseUrl, 'ana', '1234'));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd klok-api && node --test test/solicitacoes.test.js`
Expected: FAIL com 404 nas rotas novas.

- [ ] **Step 3: Criar o controlador**

`klok-api/controladores/solicitacoes.js`:

```js
import { avisarAprovacao } from '../avisos.js';

const STATUS_VALIDOS = ['pendente', 'aprovado', 'recusado'];

export function criarControladoresSolicitacoes({ enviarEmail }) {
    function listar(req, res) {
        const status = req.query.status ?? 'pendente';
        if (!STATUS_VALIDOS.includes(status)) {
            return res.status(400).json({ erro: 'Status inválido' });
        }
        res.json(req.banco.listarSolicitacoes(status));
    }

    function contagem(req, res) {
        res.json({ pendentes: req.banco.contarSolicitacoesPendentes() });
    }

    async function aprovar(req, res) {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(404).json({ erro: 'Pedido não encontrado' });
        }
        const pedido = req.banco.buscarSolicitacaoPorId(id);
        const resultado = req.banco.aprovarSolicitacao(id);
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });

        if (pedido) {
            await avisarAprovacao({
                enviarEmail,
                empresa: req.empresa,
                usuario: pedido.usuario ?? 'sua conta Google',
                email: pedido.email,
            });
        }
        res.status(201).json(resultado.funcionario);
    }

    function recusar(req, res) {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(404).json({ erro: 'Pedido não encontrado' });
        }
        const resultado = req.banco.recusarSolicitacao(id);
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
        res.json({ sucesso: true });
    }

    return { listar, contagem, aprovar, recusar };
}
```

- [ ] **Step 4: Criar a rota e montar no app**

`klok-api/rotas/solicitacoes.js`:

```js
import { Router } from 'express';
import { criarControladoresSolicitacoes } from '../controladores/solicitacoes.js';
import { asyncHandler } from '../middlewares.js';

export function criarRotaSolicitacoes(deps) {
    const rota = Router();
    const c = criarControladoresSolicitacoes(deps);
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    rota.use(autenticar, exigirCoordenador);
    rota.get('/', seguro(c.listar));
    rota.get('/contagem', seguro(c.contagem));
    rota.post('/:id/aprovar', seguro(c.aprovar));
    rota.post('/:id/recusar', seguro(c.recusar));

    return rota;
}
```

Em `app.js`, importar `criarRotaSolicitacoes` e montar depois de coordenadores:

```js
app.use('/api/solicitacoes', criarRotaSolicitacoes(deps));
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd klok-api && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add klok-api/controladores/solicitacoes.js klok-api/rotas/solicitacoes.js klok-api/app.js klok-api/test/solicitacoes.test.js
git commit -m "feat: rotas do coordenador para decidir pedidos (issue #31)"
```

---

### Task 7: App com email no cadastro, contador e tela de Solicitações

**Files:**
- Modify: `types.ts`
- Modify: `api.ts`
- Modify: `screens/HomeScreen.tsx`
- Modify: `App.tsx`
- Create: `screens/SolicitacoesScreen.tsx`

**Interfaces:**
- Consumes: rotas da Task 6 e `registrar` com email.
- Produces:
  - `Solicitacao` com `id`, `usuario`, `nome`, `email`, `numero`, `criadoEm`, `status`.
  - `api.registrar(empresa, usuario, senha, nome, email)`
  - `api.listarSolicitacoes(status, token)`, `api.contarSolicitacoes(token)`, `api.aprovarSolicitacao(id, token)`, `api.recusarSolicitacao(id, token)`.
  - Tela `Solicitacoes` no menu só para coordenador, com contador.

- [ ] **Step 1: Adicionar os tipos**

Em `types.ts`:

```ts
export type Solicitacao = {
    id: number;
    usuario: string | null;
    nome: string;
    email: string;
    numero: string;
    criadoEm: string;
    status: 'pendente' | 'aprovado' | 'recusado';
};
```

- [ ] **Step 2: Ajustar a API do app**

Em `api.ts`, importar `Solicitacao` e trocar a assinatura de `registrar` para
receber o email:

```ts
registrar: (empresa: string, usuario: string, senha: string, nome: string, email: string): Promise<RegistroUsuario> =>
    requisicao<RegistroUsuario>('/api/auth/registrar', 'POST', { empresa, usuario, senha, nome, email }),
```

Acrescentar as quatro funções de solicitação no mesmo objeto `api`:

```ts
listarSolicitacoes: (status: string, token: string): Promise<Solicitacao[]> =>
    requisicao<Solicitacao[]>(`/api/solicitacoes?status=${encodeURIComponent(status)}`, 'GET', null, token),
contarSolicitacoes: (token: string): Promise<{ pendentes: number }> =>
    requisicao<{ pendentes: number }>('/api/solicitacoes/contagem', 'GET', null, token),
aprovarSolicitacao: (id: number, token: string): Promise<Funcionario> =>
    requisicao<Funcionario>(`/api/solicitacoes/${id}/aprovar`, 'POST', null, token),
recusarSolicitacao: (id: number, token: string): Promise<{ sucesso: boolean }> =>
    requisicao<{ sucesso: boolean }>(`/api/solicitacoes/${id}/recusar`, 'POST', null, token),
```

- [ ] **Step 3: Campo de email no cadastro**

Em `HomeScreen.tsx`, criar `const [email, setEmail] = useState('')`, exibir o
`TextInput` de email só quando `modoCadastro`, no mesmo estilo dos outros campos,
e em `cadastrar` validar antes de chamar a API:

```tsx
if (!email.trim()) {
    Alert.alert('Atenção', 'Informe seu email para receber o aviso de aprovação.');
    return;
}
```

Trocar a chamada existente por:

```tsx
await api.registrar(codigo, usuario.trim(), senha, nome.trim(), email.trim());
```

Depois do sucesso, limpar também `setEmail('')`. A mensagem de sucesso `Pedido
enviado` continua igual. No `entrarComGoogle`, o `catch` já exibe a mensagem do
403 via `mensagemDeErro`, então o coordenador vê o aviso de pedido pendente sem
mudança extra.

- [ ] **Step 4: Criar a tela de solicitações**

`SolicitacoesScreen.tsx`, no padrão de `CoordenadoresScreen`:

```tsx
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';
import type { Solicitacao } from '../types';

type Props = {
    token: string;
    aoAtualizarContagem: () => Promise<void>;
};

export default function SolicitacoesScreen({ token, aoAtualizarContagem }: Props) {
    const [lista, setLista] = useState<Solicitacao[]>([]);
    const [carregando, setCarregando] = useState(false);

    const carregar = async () => {
        setCarregando(true);
        try {
            setLista(await api.listarSolicitacoes('pendente', token));
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        carregar();
    }, [token]);

    const agir = async (id: number, acao: 'aprovar' | 'recusar') => {
        try {
            if (acao === 'aprovar') await api.aprovarSolicitacao(id, token);
            else await api.recusarSolicitacao(id, token);
            await carregar();
            await aoAtualizarContagem();
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        }
    };

    return (
        <ScrollView>
            <TouchableOpacity style={estilos.containerCriarNovoFuncionario} onPress={carregar}>
                <Text style={{ textAlign: 'center', fontSize: 18, fontWeight: 'bold' }}>
                    {carregando ? 'Atualizando...' : 'Atualizar pedidos'}
                </Text>
            </TouchableOpacity>

            {lista.length === 0 && !carregando && (
                <Text style={{ textAlign: 'center', color: 'gray', marginTop: 20 }}>
                    Nenhum pedido pendente.
                </Text>
            )}

            {lista.map((pedido) => (
                <View
                    key={pedido.id}
                    style={{ backgroundColor: 'white', marginHorizontal: 12, marginTop: 10, padding: 14, borderRadius: 10 }}
                >
                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{pedido.nome}</Text>
                    <Text style={{ color: 'gray' }}>{pedido.usuario ? `@${pedido.usuario}` : 'conta Google'}</Text>
                    <Text style={{ color: 'gray' }}>{pedido.email}</Text>
                    <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }}>
                        <TouchableOpacity
                            style={{ flex: 1, backgroundColor: '#2e7d32', padding: 10, borderRadius: 8 }}
                            onPress={() => agir(pedido.id, 'aprovar')}
                        >
                            <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Aprovar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ flex: 1, backgroundColor: '#c62828', padding: 10, borderRadius: 8 }}
                            onPress={() => agir(pedido.id, 'recusar')}
                        >
                            <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Recusar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}
```

- [ ] **Step 5: Ligar no `App.tsx`**

Acrescentar `'Solicitacoes'` ao tipo `Tela`, importar a tela, criar `const [pendentes, setPendentes] = useState(0)` e:

```tsx
const atualizarContagemSolicitacoes = async () => {
    if (!sessao || sessao.tipo !== 'coordenador') {
        setPendentes(0);
        return;
    }
    try {
        setPendentes((await api.contarSolicitacoes(sessao.token)).pendentes);
    } catch {
        setPendentes(0);
    }
};

useEffect(() => {
    atualizarContagemSolicitacoes();
}, [sessao?.token, sessao?.tipo]);
```

No `switch`, case `'Solicitacoes'` renderiza `SolicitacoesScreen` quando o tipo for
coordenador, com `aoAtualizarContagem={atualizarContagemSolicitacoes}`. No menu,
depois do item `Coordenadores`, item só para coordenador com o texto
`Solicitações (${pendentes})` quando houver pendente, e `Solicitações` quando
zerado. Importar `api` em `App.tsx`.

`abrirMenu` chama `atualizarContagemSolicitacoes()` antes de animar, e
`irPara('Solicitacoes')` também chama, para o contador não ficar velho.

- [ ] **Step 6: Rodar o typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add types.ts api.ts screens/HomeScreen.tsx screens/SolicitacoesScreen.tsx App.tsx
git commit -m "feat: tela de solicitacoes e email no cadastro (issue #31)"
```

---

### Task 8: Documentação, contagem de testes e fechamento da issue

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/SEGURANCA.md`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.

- [ ] **Step 1: Rodar a suíte e o typecheck**

Run: `cd klok-api && npm test && cd .. && npm run typecheck`
Expected: tudo verde. Anote o total de testes exibido no fim.

- [ ] **Step 2: Atualizar a contagem e o estado do bloco D**

Em `AGENTS.md`, trocar o total de testes em "Como rodar e testar" pelo número
real. No programa de trabalho, marcar o bloco D como implementado, com o número
do PR. Se alguma decisão de design mudou durante a implementação, registre no
spec e inclua o arquivo no `git add`.

- [ ] **Step 3: Atualizar o README e o documento de segurança**

Em `README.md`, trocar a nota do topo e o parágrafo da linha 215: o autocadastro
não está mais fechado, agora vira pedido pendente aprovado pelo coordenador. Use
a lista de recursos do topo para acrescentar o aviso por email e a tela de
Solicitações.

Em `docs/SEGURANCA.md`, no item 10, trocar a descrição do cadastro fechado pelo
fluxo novo: pedido pendente no banco da empresa, aprovação por coordenador,
`senhaHash` nunca saindo do `db.js` e o nome do teste de regressão atualizado
(`cadastro recusa email malicioso e não cria usuário`).

- [ ] **Step 4: Verificação manual do app**

Com a API rodando (`cd klok-api && npm start`) e o app (`npx expo start`):

1. empresa `TESTE`, cadastro com email, conferir o aviso de pedido enviado.
2. entrar como coordenador, ver o contador no menu, abrir Solicitacoes.
3. aprovar e conferir que o candidato consegue entrar.
4. repetir com outro candidato e recusar, conferir o 403 no login.
5. entrar com Google numa empresa sem usuário e conferir o 403.

- [ ] **Step 5: Commit e abertura do PR**

```bash
git add AGENTS.md README.md docs/SEGURANCA.md
git commit -m "docs: fechar o bloco D do multiempresa (issue #31)"
git push -u origin feat/empresas-parte-2
gh pr create --title "feat: autocadastro com pedido e aprovacao por empresa (issue #31)" --body "Implementa o bloco D. Closes #31"
```

Fechar também a #19 como duplicata da #31, citando a #31 na mensagem.
