# Painel do admin, parte 3: suporte completo por empresa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o painel de suporte do admin com resumo, coordenadores, funcionários, pontos, solicitações, banco, backup, restauração, exclusão de empresa, impersonação, CSV e sessão por cookie com CSRF.

**Architecture:** As rotas de admin ganham leitura e escrita por empresa usando `gerenciador.abrir(codigo, { permitirDesativada: true })`. O SQL novo fica no `db.js`, a validação de filtros em `admin/validacao-painel.js`, os cookies em `admin/sessao.js` e o painel continua HTML, CSS e JS puro, dividido por seção.

**Tech Stack:** Node.js 22.5+ com `node:sqlite`, Express 4, `jose`, HTML, CSS e JS sem build.

**Spec:** `docs/superpowers/specs/2026-11-09-painel-parte-3-design.md`

## Global Constraints

- Responder e escrever textos em PT-BR, sem hífen nem travessão.
- Não adicionar dependência nova. Cookie é lido e escrito à mão.
- O painel é HTML, CSS e JS puro, sem build e sem framework.
- Teste antes da regra. `cd klok-api && npm test` verde em toda tarefa.
- `npm run typecheck` limpo antes do PR.
- Limite de 200 por página em pontos e solicitações.
- Teto de 10.000 linhas por CSV.
- `permitirDesativada: true` só pode ser usado em rota de admin.
- Nunca commitar direto na main. Branch própria e PR com CI verde.
- Datas de filtro usam o dia de Brasília: `date(dataHora, '-3 hours')`.

## Review Focus

- Empresa desativada precisa continuar bloqueando o app e continuar acessível no painel, inclusive para backup e restauração.
- Restaurar arquivo que não é SQLite, com versão desconhecida ou com falha no meio da troca não pode deixar a empresa sem banco.
- Cookie de sessão sem CSRF precisa dar 403, e Bearer sem CSRF precisa continuar funcionando.
- Apagar empresa com conexão aberta em WAL não pode deixar `-wal` ou `-shm` presos.
- Filtro `de` e `ate` precisa bater com o dia mostrado no painel, que é Brasília, não UTC.

---

## Estrutura de arquivos

**Criar**

- `klok-api/admin/validacao-painel.js`: parse e validação de filtros, paginação, confirmação e CSV.
- `klok-api/admin/consultas.js`: controladores de leitura por empresa.
- `klok-api/admin/escritas.js`: controladores de escrita por empresa.
- `klok-api/admin/exportacoes.js`: CSV e backup.
- `klok-api/admin/sessao.js`: cookies, CSRF e logout.
- `klok-api/servicos/solicitacoes.js`: aprovação e recusa compartilhadas.
- `klok-api/test/admin-painel.test.js`: leitura e escrita do painel.
- `klok-api/test/admin-sessao.test.js`: cookie e CSRF.
- `klok-api/test/admin-backup.test.js`: backup e restauração.
- `klok-api/test/admin-db.test.js`: funções novas do `db.js`.

**Modificar**

- `klok-api/admin/gerenciador-bancos.js`: abertura com `permitirDesativada` e `apagar`.
- `klok-api/admin/catalogo.js`: `apagarEmpresa`.
- `klok-api/db.js`: `resumo`, `buscarUsuarioPorFuncionarioId`, `listarPontosFiltrados`, `contarPontosFiltrados`, `listarSolicitacoesPaginado`.
- `klok-api/admin/controladores.js`: compor os módulos novos e cuidar do login e logout.
- `klok-api/admin/rotas.js`: rotas novas e `express.raw` na restauração.
- `klok-api/middlewares.js`: `autenticarAdmin` aceita cookie com CSRF.
- `klok-api/controladores/funcionarios.js`: exporta `prepararDadosFuncionario`.
- `klok-api/controladores/solicitacoes.js`: usa `servicos/solicitacoes.js`.
- `klok-api/admin/painel/index.html`, `admin.js`, `admin.css`: seções e ações novas.
- `klok-api/test/painel.test.js`: confere os ids novos.
- `klok-api/test/gerenciador.test.js`: abertura de desativada e exclusão.
- `AGENTS.md`: contagem de testes ao final.

---

## Antes de começar

Criar a branch e, se o executor estiver em worktree, usar
`superpowers:using-git-worktrees`:

```bash
git switch -c feat/painel-parte-3
```

O plano assume Node 22.5 ou mais novo por causa do `node:sqlite`. Se o `node`
do sistema for antigo, rodar `mise use node@22` antes de qualquer teste.

---

### Task 1: Abrir empresa desativada para admin e apagar empresa

**Files:**
- Modify: `klok-api/admin/gerenciador-bancos.js`
- Modify: `klok-api/admin/catalogo.js`
- Test: `klok-api/test/gerenciador.test.js`

**Interfaces:**
- Produces: `abrir(codigo, { permitirDesativada = false } = {})` devolve `{ banco, empresa }` ou `{ erro, status }`.
- Produces: `apagar(codigo)` devolve `{ ok: true }` ou `{ erro, status }`.
- Produces: `catalogo.apagarEmpresa(codigo)` devolve `boolean`.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/gerenciador.test.js`, acrescentar:

```js
test('admin abre empresa desativada com permitirDesativada', (t) => {
    const { catalogo, g } = preparar(t);
    g.criarEmpresa({ codigo: 'ACME', nome: 'Acme' });
    catalogo.atualizarEmpresa('ACME', { ativa: false });
    assert.equal(g.abrir('ACME').status, 403);
    assert.ok(g.abrir('ACME', { permitirDesativada: true }).banco);
});

test('apagar empresa remove catálogo e arquivos', (t) => {
    const { dir, catalogo, g } = preparar(t);
    g.criarEmpresa({ codigo: 'ACME', nome: 'Acme' });
    g.abrir('ACME');
    const resultado = g.apagar('ACME');
    assert.deepEqual(resultado, { ok: true });
    assert.equal(catalogo.buscarEmpresa('ACME'), undefined);
    assert.equal(existsSync(join(dir, 'ACME.db')), false);
    assert.equal(g.apagar('ACME').status, 404);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/gerenciador.test.js`
Expected: FAIL porque `abrir` ignora a opção e `apagar` não existe.

- [ ] **Step 3: Implementar**

Em `catalogo.js`, antes do `return`:

```js
function apagarEmpresa(codigo) {
    return db.prepare('DELETE FROM empresas WHERE codigo = ?').run(codigo).changes > 0;
}
```

Exportar `apagarEmpresa` no objeto de retorno.

Em `gerenciador-bancos.js`, trocar a assinatura de `abrir` e a checagem:

```js
function abrir(codigo, { permitirDesativada = false } = {}) {
    // ...
    if (empresa.desativadaEm && !permitirDesativada) {
        return { erro: 'Empresa desativada', status: 403 };
    }
    // ...
}
```

Adicionar `apagar` e exportar:

```js
function apagar(codigo) {
    if (!codigoValido(codigo)) {
        return { erro: 'Código de empresa inválido', status: 400 };
    }
    if (!catalogo.buscarEmpresa(codigo)) {
        return { erro: 'Empresa não encontrada', status: 404 };
    }
    const aberto = abertos.get(codigo);
    if (aberto) {
        aberto.db.close();
        abertos.delete(codigo);
    }
    if (!catalogo.apagarEmpresa(codigo)) {
        return { erro: 'Empresa não encontrada', status: 404 };
    }
    apagarArquivos(caminhoDe(codigo));
    return { ok: true };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd klok-api && node --test test/gerenciador.test.js`
Expected: PASS em todos os testes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add klok-api/admin/gerenciador-bancos.js klok-api/admin/catalogo.js klok-api/test/gerenciador.test.js
git commit -m "feat: abrir empresa desativada no admin e apagar empresa"
```

---

### Task 2: Funções de resumo, pontos paginados e solicitações paginadas no banco

**Files:**
- Modify: `klok-api/db.js`
- Test: `klok-api/test/admin-db.test.js`

**Interfaces:**
- Produces: `resumo()` devolve `{ funcionarios, coordenadores, pontos, solicitacoesPendentes, ultimoPonto }`.
- Produces: `buscarUsuarioPorFuncionarioId(funcionarioId)` devolve a linha de `usuarios` ou `undefined`.
- Produces: `contarPontosFiltrados({ funcionarioId, de, ate })` devolve `number`.
- Produces: `listarPontosFiltrados({ funcionarioId, de, ate, limite, pagina })` devolve `{ pontos, total }`.
- Produces: `listarSolicitacoesPaginado({ status, limite, pagina })` devolve `{ solicitacoes, total }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/admin-db.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { criarBanco } from '../db.js';

function preparar(t) {
    const dir = mkdtempSync(join(tmpdir(), 'klok-db-'));
    const banco = criarBanco(join(dir, 'TESTE.db'), { empresa: 'TESTE' });
    t.after(() => {
        banco.db.close();
        rmSync(dir, { recursive: true, force: true });
    });
    return banco;
}

test('resumo conta só o banco da empresa', (t) => {
    const banco = preparar(t);
    banco.criarCoordenador('chefe', 'senha-1234', 'Chefe', 'chefe@teste.com', '1');
    const funcionarioId = banco.criarFuncionario('Ana', '2', 'ana@teste.com');
    banco.baterPonto(funcionarioId, 'entrada');
    banco.baterPonto(funcionarioId, 'saida');
    banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });

    const r = banco.resumo();
    assert.equal(r.funcionarios, 1);
    assert.equal(r.coordenadores, 1);
    assert.equal(r.pontos, 2);
    assert.equal(r.solicitacoesPendentes, 1);
    assert.ok(r.ultimoPonto);
});

test('lista pontos com filtro, limite e página', (t) => {
    const banco = preparar(t);
    const ana = banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    const bia = banco.criarFuncionario('Bia', '2', 'bia@teste.com');
    for (let i = 0; i < 5; i += 1) banco.baterPonto(ana, 'entrada');
    banco.baterPonto(bia, 'entrada');

    const pagina1 = banco.listarPontosFiltrados({ limite: 2, pagina: 1 });
    assert.equal(pagina1.pontos.length, 2);
    assert.equal(pagina1.total, 6);

    const daAna = banco.listarPontosFiltrados({ funcionarioId: ana, limite: 10 });
    assert.equal(daAna.total, 5);

    assert.equal(banco.contarPontosFiltrados({ funcionarioId: bia }), 1);
});

test('filtro de data usa o dia de Brasília, não UTC', (t) => {
    const banco = preparar(t);
    const ana = banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    // 02:00 UTC do dia 9 ainda é 23:00 do dia 8 em Brasília.
    banco.db.prepare(
        'INSERT INTO pontos (funcionarioId, dataHora, tipo) VALUES (?, ?, ?)'
    ).run(ana, '2026-11-09T02:00:00.000Z', 'entrada');

    assert.equal(banco.contarPontosFiltrados({ de: '2026-11-08', ate: '2026-11-08' }), 1);
    assert.equal(banco.contarPontosFiltrados({ de: '2026-11-09', ate: '2026-11-09' }), 0);
});

test('lista solicitações paginadas e busca usuário por funcionário', (t) => {
    const banco = preparar(t);
    const usuario = banco.criarUsuarioLocal('ana', 'senha-1234', 'Ana');
    banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });
    banco.criarSolicitacao({ usuario: 'caio', nome: 'Caio', email: 'caio@teste.com' });

    const pagina = banco.listarSolicitacoesPaginado({ limite: 1, pagina: 2 });
    assert.equal(pagina.solicitacoes.length, 1);
    assert.equal(pagina.total, 2);
    assert.equal(banco.buscarUsuarioPorFuncionarioId(usuario.funcionarioId).usuario, 'ana');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-db.test.js`
Expected: FAIL porque `resumo` não é uma função.

- [ ] **Step 3: Implementar no `db.js`**

Antes do `return`, adicionar:

```js
function resumo() {
    const um = (sql) => Number(db.prepare(sql).get().total);
    const ultimo = db.prepare('SELECT MAX(dataHora) AS quando FROM pontos').get();
    return {
        funcionarios: um('SELECT COUNT(*) AS total FROM funcionarios'),
        coordenadores: contarCoordenadores(),
        pontos: um('SELECT COUNT(*) AS total FROM pontos'),
        solicitacoesPendentes: contarSolicitacoesPendentes(),
        ultimoPonto: ultimo.quando ?? null,
    };
}

function buscarUsuarioPorFuncionarioId(funcionarioId) {
    return db.prepare('SELECT * FROM usuarios WHERE funcionarioId = ?').get(Number(funcionarioId));
}

function filtrosDePontos({ funcionarioId = null, de = null, ate = null } = {}) {
    const condicoes = [];
    const valores = [];
    if (funcionarioId) {
        condicoes.push('p.funcionarioId = ?');
        valores.push(Number(funcionarioId));
    }
    if (de) {
        condicoes.push("date(p.dataHora, '-3 hours') >= ?");
        valores.push(de);
    }
    if (ate) {
        condicoes.push("date(p.dataHora, '-3 hours') <= ?");
        valores.push(ate);
    }
    return { onde: condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '', valores };
}

function contarPontosFiltrados(filtros = {}) {
    const { onde, valores } = filtrosDePontos(filtros);
    return Number(
        db.prepare(`SELECT COUNT(*) AS total FROM pontos p ${onde}`).get(...valores).total
    );
}

function listarPontosFiltrados({ limite = 200, pagina = 1, ...filtros } = {}) {
    const { onde, valores } = filtrosDePontos(filtros);
    const pontos = db.prepare(
        `SELECT p.*, f.nome AS funcionarioNome
         FROM pontos p JOIN funcionarios f ON f.id = p.funcionarioId
         ${onde}
         ORDER BY p.dataHora DESC
         LIMIT ? OFFSET ?`
    ).all(...valores, Number(limite), (Number(pagina) - 1) * Number(limite));
    return { pontos, total: contarPontosFiltrados(filtros) };
}

function listarSolicitacoesPaginado({ status = 'pendente', limite = 200, pagina = 1 } = {}) {
    const total = Number(
        db.prepare('SELECT COUNT(*) AS total FROM solicitacoes WHERE status = ?').get(status).total
    );
    const solicitacoes = db.prepare(
        'SELECT * FROM solicitacoes WHERE status = ? ORDER BY criadoEm LIMIT ? OFFSET ?'
    ).all(status, Number(limite), (Number(pagina) - 1) * Number(limite)).map(semSenha);
    return { solicitacoes, total };
}
```

Exportar as cinco funções no objeto de retorno.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd klok-api && node --test test/admin-db.test.js`
Expected: PASS nos três testes.

- [ ] **Step 5: Commit**

```bash
git add klok-api/db.js klok-api/test/admin-db.test.js
git commit -m "feat: consultas paginadas e resumo por empresa"
```

---

### Task 3: Serviço compartilhado de aprovação e recusa

**Files:**
- Create: `klok-api/servicos/solicitacoes.js`
- Modify: `klok-api/controladores/solicitacoes.js`
- Test: `klok-api/test/solicitacoes.test.js` (já existe, roda sem mudar)

**Interfaces:**
- Produces: `aprovarPedido({ banco, empresa, id, enviarEmail })` devolve o resultado de `banco.aprovarSolicitacao(id)`, com email enviado só no sucesso.
- Produces: `recusarPedido({ banco, id })` devolve o resultado de `banco.recusarSolicitacao(id)`.

- [ ] **Step 1: Rodar os testes atuais como linha de base**

Run: `cd klok-api && node --test test/solicitacoes.test.js`
Expected: PASS. Guardar a contagem.

- [ ] **Step 2: Criar o serviço**

```js
import { avisarAprovacao } from '../avisos.js';

export async function aprovarPedido({ banco, empresa, id, enviarEmail }) {
    const pedido = banco.buscarSolicitacaoPorId(id);
    const resultado = banco.aprovarSolicitacao(id);
    if (resultado.erro) return resultado;

    if (pedido) {
        await avisarAprovacao({
            enviarEmail,
            empresa,
            usuario: pedido.usuario,
            email: pedido.email,
        });
    }
    return resultado;
}

export function recusarPedido({ banco, id }) {
    return banco.recusarSolicitacao(id);
}
```

- [ ] **Step 3: Usar o serviço no controlador atual**

Em `controladores/solicitacoes.js`, trocar o corpo de `aprovar` e `recusar` pelas chamadas ao serviço, mantendo os mesmos status e respostas. Remover o import de `avisarAprovacao`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd klok-api && npm test`
Expected: PASS, mesma contagem de antes.

- [ ] **Step 5: Commit**

```bash
git add klok-api/servicos/solicitacoes.js klok-api/controladores/solicitacoes.js
git commit -m "refactor: extrair serviço de decisão de solicitações"
```

---

### Task 4: Validação de filtros do painel

**Files:**
- Create: `klok-api/admin/validacao-painel.js`
- Test: `klok-api/test/admin-painel.test.js`

**Interfaces:**
- Produces: `inteiroPositivo(valor, padrao)` devolve `number` ou `null` quando inválido.
- Produces: `dataIso(valor)` devolve `'AAAA-MM-DD'` ou `null` quando inválido.
- Produces: `paginacao(query)` devolve `{ limite, pagina }` ou `{ erro }`.
- Produces: `campoCsv(valor)` devolve o campo escapado para CSV.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/admin-painel.test.js` com:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { campoCsv, dataIso, inteiroPositivo, paginacao } from '../admin/validacao-painel.js';

test('valida inteiro, data e paginação', () => {
    assert.equal(inteiroPositivo('7', 1), 7);
    assert.equal(inteiroPositivo('abc', 1), null);
    assert.equal(inteiroPositivo('0', 1), null);
    assert.equal(dataIso('2026-11-09'), '2026-11-09');
    assert.equal(dataIso('09/11/2026'), null);
    assert.deepEqual(paginacao({}), { limite: 200, pagina: 1 });
    assert.deepEqual(paginacao({ limite: '10', pagina: '2' }), { limite: 10, pagina: 2 });
    assert.equal(paginacao({ limite: '201' }).erro, 'Limite deve estar entre 1 e 200');
});

test('escapa campo de CSV', () => {
    assert.equal(campoCsv('Ana'), 'Ana');
    assert.equal(campoCsv('Ana;Lima'), '"Ana;Lima"');
    assert.equal(campoCsv('diz "oi"'), '"diz ""oi"""');
    assert.equal(campoCsv('linha\nquebrada'), '"linha\nquebrada"');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Implementar**

```js
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function inteiroPositivo(valor, padrao = null) {
    if (valor === undefined || valor === null || valor === '') return padrao;
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

export function dataIso(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    if (typeof valor !== 'string' || !DATA_ISO.test(valor)) return null;
    const data = new Date(`${valor}T00:00:00Z`);
    if (Number.isNaN(data.getTime())) return null;
    return data.toISOString().slice(0, 10) === valor ? valor : null;
}

export function paginacao(query = {}) {
    const limite = inteiroPositivo(query.limite, 200);
    if (limite === null || limite > 200) {
        return { erro: 'Limite deve estar entre 1 e 200' };
    }
    const pagina = inteiroPositivo(query.pagina, 1);
    if (pagina === null) return { erro: 'Página inválida' };
    return { limite, pagina };
}

export function campoCsv(valor) {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[";\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add klok-api/admin/validacao-painel.js klok-api/test/admin-painel.test.js
git commit -m "feat: validação de filtros e CSV do painel"
```

---

### Task 5: Controladores de leitura por empresa

**Files:**
- Create: `klok-api/admin/consultas.js`
- Modify: `klok-api/admin/controladores.js`
- Modify: `klok-api/admin/rotas.js`
- Test: `klok-api/test/admin-painel.test.js`

**Interfaces:**
- Produces: `criarConsultasAdmin({ gerenciador })` devolve `{ resumo, listarCoordenadores, listarFuncionarios, listarPontos, listarSolicitacoes, infoBanco }`.
- Consumes: `gerenciador.abrir(codigo, { permitirDesativada: true })` da Task 1.
- Consumes: `banco.resumo()`, `banco.listarPontosFiltrados()`, `banco.listarSolicitacoesPaginado()` da Task 2.
- Consumes: `paginacao`, `inteiroPositivo`, `dataIso` da Task 4.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `test/admin-painel.test.js`:

```js
import { iniciarApp, logarAdmin } from './helpers.js';

async function prepararPainel(t) {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const cabecalhos = { authorization: `Bearer ${token}` };
    return { s, token, cabecalhos };
}

test('resumo, coordenadores, funcionários e banco por empresa', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const funcionarioId = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.baterPonto(funcionarioId, 'entrada');
    s.banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });

    const resumo = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/resumo`, { headers: cabecalhos })).json();
    assert.equal(resumo.funcionarios, 1);
    assert.equal(resumo.coordenadores, 1);
    assert.equal(resumo.pontos, 1);
    assert.equal(resumo.solicitacoesPendentes, 1);

    const coordenadores = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenadores`, { headers: cabecalhos })).json();
    assert.equal(coordenadores.length, 1);
    assert.equal(coordenadores[0].senhaHash, undefined);

    const funcionarios = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios`, { headers: cabecalhos })).json();
    assert.equal(funcionarios[0].nome, 'Ana');

    const banco = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco`, { headers: cabecalhos })).json();
    assert.ok(banco.versao >= 1);
    assert.ok(banco.tamanhoBytes > 0);
});

test('pontos pagina, filtra e recusa filtro inválido', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const ana = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    for (let i = 0; i < 3; i += 1) s.banco.baterPonto(ana, 'entrada');

    const pagina = await (await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/pontos?limite=2&pagina=1&funcionarioId=${ana}`,
        { headers: cabecalhos }
    )).json();
    assert.equal(pagina.pontos.length, 2);
    assert.equal(pagina.total, 3);
    assert.equal(pagina.paginas, 2);

    const invalido = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/pontos?de=09/11/2026`, { headers: cabecalhos });
    assert.equal(invalido.status, 400);
});

test('solicitações lista por status e recusa status desconhecido', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    s.banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });

    const lista = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes`, { headers: cabecalhos })).json();
    assert.equal(lista.solicitacoes.length, 1);

    const invalido = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes?status=outro`, { headers: cabecalhos });
    assert.equal(invalido.status, 400);
});

test('painel lê resumo de empresa desativada', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    s.catalogo.atualizarEmpresa('TESTE', { ativa: false });

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/resumo`, { headers: cabecalhos });
    assert.equal(resp.status, 200);
    assert.ok((await resp.json()).desativadaEm);
});

test('rotas novas exigem token de admin', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const rotas = [
        '/api/admin/empresas/TESTE/resumo',
        '/api/admin/empresas/TESTE/coordenadores',
        '/api/admin/empresas/TESTE/funcionarios',
        '/api/admin/empresas/TESTE/pontos',
        '/api/admin/empresas/TESTE/solicitacoes',
        '/api/admin/empresas/TESTE/banco',
    ];
    for (const rota of rotas) {
        assert.equal((await fetch(`${s.baseUrl}${rota}`)).status, 401, rota);
    }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: FAIL com 404 nas rotas novas.

- [ ] **Step 3: Implementar `admin/consultas.js`**

Estrutura:

```js
import { statSync } from 'node:fs';
import { dataIso, inteiroPositivo, paginacao } from './validacao-painel.js';

const STATUS_SOLICITACAO = ['pendente', 'aprovado', 'recusado'];

export function criarConsultasAdmin({ gerenciador }) {
    function abrirParaAdmin(codigo) {
        return gerenciador.abrir(codigo, { permitirDesativada: true });
    }

    function responderAbertura(res, aberta) {
        if (aberta.erro) {
            res.status(aberta.status).json({ erro: aberta.erro });
            return false;
        }
        return true;
    }

    function resumo(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        res.json({
            codigo: aberta.empresa.codigo,
            nome: aberta.empresa.nome,
            desativadaEm: aberta.empresa.desativadaEm ?? null,
            ...aberta.banco.resumo(),
        });
    }

    function listarCoordenadores(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        res.json(aberta.banco.listarCoordenadores());
    }

    function listarFuncionarios(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        res.json(aberta.banco.listarFuncionarios());
    }

    function listarPontos(req, res) {
        const { limite, pagina, erro } = paginacao(req.query);
        if (erro) return res.status(400).json({ erro });

        const funcionarioId = inteiroPositivo(req.query.funcionarioId);
        if (req.query.funcionarioId && funcionarioId === null) {
            return res.status(400).json({ erro: 'Funcionário inválido' });
        }
        const de = dataIso(req.query.de);
        if (req.query.de && de === null) return res.status(400).json({ erro: 'Data inicial inválida' });
        const ate = dataIso(req.query.ate);
        if (req.query.ate && ate === null) return res.status(400).json({ erro: 'Data final inválida' });

        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const { pontos, total } = aberta.banco.listarPontosFiltrados({
            funcionarioId,
            de,
            ate,
            limite,
            pagina,
        });
        res.json({
            pontos,
            pagina,
            paginas: total === 0 ? 0 : Math.ceil(total / limite),
            limite,
            total,
        });
    }

    function listarSolicitacoes(req, res) {
        const status = req.query.status ?? 'pendente';
        if (!STATUS_SOLICITACAO.includes(status)) {
            return res.status(400).json({ erro: 'Status inválido' });
        }
        const { limite, pagina, erro } = paginacao(req.query);
        if (erro) return res.status(400).json({ erro });

        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const { solicitacoes, total } = aberta.banco.listarSolicitacoesPaginado({ status, limite, pagina });
        res.json({
            solicitacoes,
            pagina,
            paginas: total === 0 ? 0 : Math.ceil(total / limite),
            limite,
            total,
        });
    }

    function infoBanco(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        const caminho = gerenciador.caminhoDe(req.params.codigo);
        let tamanhoBytes = 0;
        try {
            tamanhoBytes = statSync(caminho).size;
        } catch {
            return res.status(404).json({ erro: 'Banco da empresa não encontrado no disco' });
        }
        res.json({
            codigo: aberta.empresa.codigo,
            caminho,
            versao: aberta.banco.userVersion(),
            tamanhoBytes,
        });
    }

    return { resumo, listarCoordenadores, listarFuncionarios, listarPontos, listarSolicitacoes, infoBanco };
}
```

- [ ] **Step 4: Compor em `admin/controladores.js` e ligar as rotas**

Em `criarControladoresAdmin`, aceitar `{ catalogo, gerenciador, gerarTokenAdmin, gerarTokenEmpresa, enviarEmail }`, importar `criarConsultasAdmin` e espalhar o resultado no objeto devolvido.

Em `admin/rotas.js`, adicionar:

```js
rota.get('/empresas/:codigo/resumo', autenticarAdmin, seguro(c.resumo));
rota.get('/empresas/:codigo/coordenadores', autenticarAdmin, seguro(c.listarCoordenadores));
rota.get('/empresas/:codigo/funcionarios', autenticarAdmin, seguro(c.listarFuncionarios));
rota.get('/empresas/:codigo/pontos', autenticarAdmin, seguro(c.listarPontos));
rota.get('/empresas/:codigo/solicitacoes', autenticarAdmin, seguro(c.listarSolicitacoes));
rota.get('/empresas/:codigo/banco', autenticarAdmin, seguro(c.infoBanco));
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: PASS nos testes de leitura.

- [ ] **Step 6: Commit**

```bash
git add klok-api/admin/consultas.js klok-api/admin/controladores.js klok-api/admin/rotas.js klok-api/test/admin-painel.test.js
git commit -m "feat: rotas de leitura do painel por empresa"
```

---

### Task 6: Senha de coordenador e impersonação

**Files:**
- Create: `klok-api/admin/escritas.js`
- Modify: `klok-api/admin/controladores.js`
- Modify: `klok-api/admin/rotas.js`
- Test: `klok-api/test/admin-painel.test.js`

**Interfaces:**
- Produces: `criarEscritasAdmin({ gerenciador, gerarTokenEmpresa, enviarEmail, registrar })` devolve `{ redefinirSenhaCoordenador, impersonarCoordenador }` nesta tarefa. `enviarEmail` só passa a ser usado na Task 8, mas entra na assinatura desde já.
- Consumes: `MINIMO_SENHA` e `senhaDe`.

- [ ] **Step 1: Escrever os testes que falham**

```js
import { logar } from './helpers.js';

test('redefine senha de coordenador e invalida token antigo', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const antigo = await logar(s.baseUrl, 'coordenador', 'senha-coordenador-teste', 'TESTE');
    const coordenadores = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenadores`, { headers: cabecalhos })).json();

    const resposta = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${coordenadores[0].id}/senha`,
        {
            method: 'POST',
            headers: { ...cabecalhos, 'content-type': 'application/json' },
            body: JSON.stringify({ senha: 'senha-nova-1234' }),
        }
    );
    assert.equal(resposta.status, 204);
    assert.ok(await logar(s.baseUrl, 'coordenador', 'senha-nova-1234', 'TESTE'));
    assert.equal(
        (await fetch(`${s.baseUrl}/api/funcionarios`, { headers: { authorization: `Bearer ${antigo}` } })).status,
        401
    );
});

test('recusa senha curta e id que não é coordenador', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const usuarioFuncionario = s.banco.criarUsuarioLocal('ana', 'senha-1234', 'Ana');
    const coordenadores = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenadores`, { headers: cabecalhos })).json();

    const curta = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${coordenadores[0].id}/senha`,
        {
            method: 'POST',
            headers: { ...cabecalhos, 'content-type': 'application/json' },
            body: JSON.stringify({ senha: '12' }),
        }
    );
    assert.equal(curta.status, 400);

    const errado = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${usuarioFuncionario.id}/senha`,
        {
            method: 'POST',
            headers: { ...cabecalhos, 'content-type': 'application/json' },
            body: JSON.stringify({ senha: 'senha-1234' }),
        }
    );
    assert.equal(errado.status, 404);
});

test('impersona coordenador e recusa funcionário', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const usuarioFuncionario = s.banco.criarUsuarioLocal('ana', 'senha-1234', 'Ana');
    const coordenadores = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenadores`, { headers: cabecalhos })).json();

    const resposta = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${coordenadores[0].id}/impersonar`,
        { method: 'POST', headers: cabecalhos }
    );
    assert.equal(resposta.status, 200);
    const { token, empresa, tipo } = await resposta.json();
    assert.equal(empresa, 'TESTE');
    assert.equal(tipo, 'coordenador');
    assert.equal(
        (await fetch(`${s.baseUrl}/api/funcionarios`, { headers: { authorization: `Bearer ${token}` } })).status,
        200
    );

    const errado = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${usuarioFuncionario.id}/impersonar`,
        { method: 'POST', headers: cabecalhos }
    );
    assert.equal(errado.status, 404);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: FAIL com 404 nas rotas novas.

- [ ] **Step 3: Implementar `admin/escritas.js`**

```js
import { MINIMO_SENHA } from '../controladores/coordenadores.js';
import { PAPEL_COORDENADOR } from '../constantes.js';
import { senha as senhaDe } from '../validacao.js';

export function criarEscritasAdmin({ gerenciador, gerarTokenEmpresa, enviarEmail, registrar = console.log }) {
    function abrirParaAdmin(codigo) {
        return gerenciador.abrir(codigo, { permitirDesativada: true });
    }

    function coordenadorDaEmpresa(banco, id) {
        const usuario = banco.buscarUsuarioPorId(Number(id));
        return usuario && usuario.tipo === PAPEL_COORDENADOR ? usuario : null;
    }

    function redefinirSenhaCoordenador(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

        const coordenador = coordenadorDaEmpresa(aberta.banco, req.params.id);
        if (!coordenador) return res.status(404).json({ erro: 'Coordenador não encontrado' });

        const senha = senhaDe(req.body?.senha);
        if (senha.length < MINIMO_SENHA) {
            return res.status(400).json({
                erro: `A senha do coordenador deve ter ao menos ${MINIMO_SENHA} caracteres`,
            });
        }
        aberta.banco.atualizarSenha(coordenador.id, aberta.banco.criarHashSenha(senha));
        res.status(204).end();
    }

    async function impersonarCoordenador(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

        const coordenador = coordenadorDaEmpresa(aberta.banco, req.params.id);
        if (!coordenador) return res.status(404).json({ erro: 'Coordenador não encontrado' });

        const token = await gerarTokenEmpresa(coordenador, aberta.empresa.codigo);
        registrar(
            `[klok] admin ${req.admin?.usuario ?? '?'} impersonou ${coordenador.usuario} na empresa ${aberta.empresa.codigo}`
        );
        res.json({
            token,
            empresa: aberta.empresa.codigo,
            usuario: coordenador.usuario,
            tipo: coordenador.tipo,
            expiraEmHoras: 12,
        });
    }

    return { redefinirSenhaCoordenador, impersonarCoordenador };
}
```

- [ ] **Step 4: Compor e ligar as rotas**

Em `criarControladoresAdmin`, importar `criarEscritasAdmin` e espalhar o resultado. Em `admin/rotas.js`:

```js
rota.post('/empresas/:codigo/coordenadores/:id/senha', autenticarAdmin, seguro(c.redefinirSenhaCoordenador));
rota.post('/empresas/:codigo/coordenadores/:id/impersonar', autenticarAdmin, seguro(c.impersonarCoordenador));
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: PASS nos testes de senha e impersonação.

- [ ] **Step 6: Commit**

```bash
git add klok-api/admin/escritas.js klok-api/admin/controladores.js klok-api/admin/rotas.js klok-api/test/admin-painel.test.js
git commit -m "feat: senha e impersonação de coordenador no painel"
```

---

### Task 7: Editar e apagar funcionário pelo painel

**Files:**
- Modify: `klok-api/controladores/funcionarios.js`
- Modify: `klok-api/admin/escritas.js`
- Modify: `klok-api/admin/rotas.js`
- Test: `klok-api/test/admin-painel.test.js`

**Interfaces:**
- Produces: `prepararDadosFuncionario(body)` exportado, devolve `{ nome, numero, email }` ou `{ erro, status }`.
- Produces: `atualizarFuncionario`, `apagarFuncionario` no objeto de `criarEscritasAdmin`.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('edita funcionário nas duas tabelas e apaga', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const funcionarioId = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.db.prepare(
        "INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, empresa) VALUES (?, ?, 'funcionario', ?, 'TESTE')"
    ).run('ana', s.banco.criarHashSenha('senha-1234'), funcionarioId);
    s.banco.baterPonto(funcionarioId, 'entrada');

    const editado = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios/${funcionarioId}`, {
        method: 'PATCH',
        headers: { ...cabecalhos, 'content-type': 'application/json' },
        body: JSON.stringify({ nome: 'Ana Lima', numero: '2', email: 'ana.lima@teste.com' }),
    });
    assert.equal(editado.status, 200);
    assert.equal((await editado.json()).nome, 'Ana Lima');
    const usuario = s.banco.buscarUsuarioPorFuncionarioId(funcionarioId);
    assert.equal(usuario.nome, 'Ana Lima');

    const apagado = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios/${funcionarioId}`, {
        method: 'DELETE',
        headers: cabecalhos,
    });
    assert.equal(apagado.status, 204);
    assert.equal(s.banco.buscarFuncionario(funcionarioId), undefined);
    assert.equal(s.banco.buscarUsuarioPorFuncionarioId(funcionarioId), undefined);
});

test('edita e apaga recusam funcionário inexistente', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const editar = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios/999`, {
        method: 'PATCH',
        headers: { ...cabecalhos, 'content-type': 'application/json' },
        body: JSON.stringify({ nome: 'Nada' }),
    });
    assert.equal(editar.status, 404);
    assert.equal(
        (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios/999`, { method: 'DELETE', headers: cabecalhos })).status,
        404
    );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: FAIL com 404.

- [ ] **Step 3: Exportar a validação compartilhada**

Em `controladores/funcionarios.js`, renomear `preparar` para `prepararDadosFuncionario` e exportar. Manter o uso interno.

- [ ] **Step 4: Implementar em `admin/escritas.js`**

```js
import { prepararDadosFuncionario } from '../controladores/funcionarios.js';

function atualizarFuncionario(req, res) {
    const aberta = abrirParaAdmin(req.params.codigo);
    if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

    const id = Number(req.params.id);
    if (!aberta.banco.buscarFuncionario(id)) {
        return res.status(404).json({ erro: 'Funcionário não encontrado' });
    }
    const dados = prepararDadosFuncionario(req.body);
    if (dados.erro) return res.status(dados.status).json({ erro: dados.erro });

    aberta.banco.atualizarFuncionario(id, dados.nome, dados.numero, dados.email);
    const usuario = aberta.banco.buscarUsuarioPorFuncionarioId(id);
    if (usuario) {
        aberta.banco.atualizarDadosUsuarios(usuario.id, dados.nome, dados.numero, dados.email);
    }
    res.json(aberta.banco.buscarFuncionario(id));
}

function apagarFuncionario(req, res) {
    const aberta = abrirParaAdmin(req.params.codigo);
    if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });
    if (!aberta.banco.apagarFuncionario(Number(req.params.id))) {
        return res.status(404).json({ erro: 'Funcionário não encontrado' });
    }
    res.status(204).end();
}
```

Adicionar as duas funções ao retorno e às rotas:

```js
rota.patch('/empresas/:codigo/funcionarios/:id', autenticarAdmin, seguro(c.atualizarFuncionario));
rota.delete('/empresas/:codigo/funcionarios/:id', autenticarAdmin, seguro(c.apagarFuncionario));
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd klok-api && npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 6: Commit**

```bash
git add klok-api/controladores/funcionarios.js klok-api/admin/escritas.js klok-api/admin/rotas.js klok-api/test/admin-painel.test.js
git commit -m "feat: editar e apagar funcionário pelo painel"
```

---

### Task 8: Aprovar e recusar solicitação pelo painel

**Files:**
- Modify: `klok-api/admin/escritas.js`
- Modify: `klok-api/admin/rotas.js`
- Test: `klok-api/test/admin-painel.test.js`

**Interfaces:**
- Consumes: `aprovarPedido` e `recusarPedido` da Task 3.
- Produces: `aprovarSolicitacao` e `recusarSolicitacao` no objeto de `criarEscritasAdmin`.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('aprova solicitação pelo painel e avisa por email', async (t) => {
    const emails = [];
    const s = await iniciarApp({ enviarEmail: async (dados) => emails.push(dados) });
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const cabecalhos = { authorization: `Bearer ${token}` };
    const pedido = s.banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });

    const resposta = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes/${pedido.id}/aprovar`, {
        method: 'POST',
        headers: cabecalhos,
    });
    assert.equal(resposta.status, 201);
    assert.equal(s.banco.buscarUsuarioPorLogin('bia').usuario, 'bia');
    assert.equal(emails.length, 1);

    const deNovo = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes/${pedido.id}/aprovar`, {
        method: 'POST',
        headers: cabecalhos,
    });
    assert.equal(deNovo.status, 409);
});

test('recusa solicitação pelo painel', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const pedido = s.banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });
    const resposta = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes/${pedido.id}/recusar`, {
        method: 'POST',
        headers: cabecalhos,
    });
    assert.equal(resposta.status, 200);
    assert.equal(s.banco.buscarSolicitacaoPorId(pedido.id).status, 'recusado');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: FAIL com 404.

- [ ] **Step 3: Implementar em `admin/escritas.js`**

```js
import { aprovarPedido, recusarPedido } from '../servicos/solicitacoes.js';

async function aprovarSolicitacao(req, res) {
    const aberta = abrirParaAdmin(req.params.codigo);
    if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).json({ erro: 'Pedido não encontrado' });
    }
    const resultado = await aprovarPedido({
        banco: aberta.banco,
        empresa: aberta.empresa.codigo,
        id,
        enviarEmail,
    });
    if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
    res.status(201).json(resultado.funcionario);
}

function recusarSolicitacao(req, res) {
    const aberta = abrirParaAdmin(req.params.codigo);
    if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).json({ erro: 'Pedido não encontrado' });
    }
    const resultado = recusarPedido({ banco: aberta.banco, id });
    if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
    res.json({ sucesso: true });
}
```

Adicionar `enviarEmail` ao parâmetro de `criarEscritasAdmin`, incluir as funções no retorno e ligar as rotas:

```js
rota.post('/empresas/:codigo/solicitacoes/:id/aprovar', autenticarAdmin, seguro(c.aprovarSolicitacao));
rota.post('/empresas/:codigo/solicitacoes/:id/recusar', autenticarAdmin, seguro(c.recusarSolicitacao));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd klok-api && npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 5: Commit**

```bash
git add klok-api/admin/escritas.js klok-api/admin/rotas.js klok-api/test/admin-painel.test.js
git commit -m "feat: aprovar e recusar solicitação pelo painel"
```

---

### Task 9: Backup e restauração

**Files:**
- Create: `klok-api/admin/exportacoes.js`
- Modify: `klok-api/admin/controladores.js`
- Modify: `klok-api/admin/rotas.js`
- Test: `klok-api/test/admin-backup.test.js`

**Interfaces:**
- Produces: `criarExportacoesAdmin({ gerenciador })` devolve `{ backup, restaurarBackup }`.
- Consumes: `gerenciador.caminhoDe` e `gerenciador.abrir(codigo, { permitirDesativada: true })`.

- [ ] **Step 1: Escrever o teste que falha**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { criarBanco } from '../db.js';
import { iniciarApp, logarAdmin } from './helpers.js';

async function preparar(t) {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    return { s, cabecalhos: { authorization: `Bearer ${token}` } };
}

test('backup baixa arquivo SQLite legível', async (t) => {
    const { s, cabecalhos } = await preparar(t);
    const funcionarioId = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.baterPonto(funcionarioId, 'entrada');

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/backup`, { headers: cabecalhos });
    assert.equal(resp.status, 200);
    assert.match(resp.headers.get('content-disposition'), /klok-TESTE-\d{4}-\d{2}-\d{2}\.db/);
    const bytes = Buffer.from(await resp.arrayBuffer());
    assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\u0000');

    const dir = mkdtempSync(join(tmpdir(), 'klok-backup-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const caminho = join(dir, 'backup.db');
    writeFileSync(caminho, bytes);
    const copia = criarBanco(caminho, { empresa: 'TESTE' });
    t.after(() => copia.db.close());
    assert.equal(copia.listarFuncionarios().length, 1);
    assert.equal(copia.listarTodosPontos().length, 1);
});

test('restaura backup e recusa arquivo inválido', async (t) => {
    const { s, cabecalhos } = await preparar(t);
    const funcionarioId = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.baterPonto(funcionarioId, 'entrada');

    const backup = Buffer.from(
        await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/backup`, { headers: cabecalhos })).arrayBuffer()
    );

    s.banco.apagarFuncionario(funcionarioId);
    assert.equal(s.banco.listarFuncionarios().length, 0);

    const restaurado = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/restaurar`, {
        method: 'POST',
        headers: {
            ...cabecalhos,
            'content-type': 'application/octet-stream',
            'x-confirmar-codigo': 'TESTE',
        },
        body: backup,
    });
    assert.equal(restaurado.status, 200);
    assert.equal(s.gerenciador.abrir('TESTE').banco.listarFuncionarios().length, 1);

    const invalido = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/restaurar`, {
        method: 'POST',
        headers: {
            ...cabecalhos,
            'content-type': 'application/octet-stream',
            'x-confirmar-codigo': 'TESTE',
        },
        body: Buffer.from('não é sqlite'),
    });
    assert.equal(invalido.status, 400);
    assert.equal(s.gerenciador.abrir('TESTE').banco.listarFuncionarios().length, 1);

    const semConfirmacao = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/restaurar`, {
        method: 'POST',
        headers: { ...cabecalhos, 'content-type': 'application/octet-stream' },
        body: backup,
    });
    assert.equal(semConfirmacao.status, 400);
});

test('backup e restauração funcionam em empresa desativada', async (t) => {
    const { s, cabecalhos } = await preparar(t);
    s.catalogo.atualizarEmpresa('TESTE', { ativa: false });

    const backup = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/backup`, { headers: cabecalhos });
    assert.equal(backup.status, 200);

    const bytes = Buffer.from(await backup.arrayBuffer());
    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/restaurar`, {
        method: 'POST',
        headers: {
            ...cabecalhos,
            'content-type': 'application/octet-stream',
            'x-confirmar-codigo': 'TESTE',
        },
        body: bytes,
    });
    assert.equal(resp.status, 200);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-backup.test.js`
Expected: FAIL com 404.

- [ ] **Step 3: Implementar `admin/exportacoes.js`**

```js
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MIGRACOES } from '../db.js';

const ASSINATURA_SQLITE = 'SQLite format 3\u0000';

export function criarExportacoesAdmin({ gerenciador }) {
    function backup(req, res) {
        const aberta = gerenciador.abrir(req.params.codigo, { permitirDesativada: true });
        if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

        const dir = mkdtempSync(join(tmpdir(), 'klok-backup-'));
        const arquivo = join(dir, `${aberta.empresa.codigo}.db`);
        try {
            aberta.banco.db.prepare('VACUUM INTO ?').run(arquivo);
        } catch (e) {
            rmSync(dir, { recursive: true, force: true });
            throw e;
        }
        const nome = `klok-${aberta.empresa.codigo}-${new Date().toISOString().slice(0, 10)}.db`;
        res.download(arquivo, nome, () => rmSync(dir, { recursive: true, force: true }));
    }

    function restaurarBackup(req, res) {
        const codigo = req.params.codigo;
        if (req.get('x-confirmar-codigo') !== codigo) {
            return res.status(400).json({ erro: 'Confirmação do código da empresa não confere' });
        }
        const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (bytes.length < 100 || bytes.subarray(0, 16).toString('latin1') !== ASSINATURA_SQLITE) {
            return res.status(400).json({ erro: 'O arquivo enviado não é um banco SQLite válido' });
        }

        const aberta = gerenciador.abrir(codigo, { permitirDesativada: true });
        if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

        const dir = mkdtempSync(join(tmpdir(), 'klok-restaurar-'));
        const temporario = join(dir, 'novo.db');
        writeFileSync(temporario, bytes);

        try {
            const teste = new DatabaseSync(temporario);
            const integridade = teste.prepare('PRAGMA integrity_check').get();
            const versao = Number(teste.prepare('PRAGMA user_version').get().user_version);
            teste.close();
            if (integridade.integrity_check !== 'ok') throw new Error('integridade');
            if (versao < 1 || versao > MIGRACOES.length) throw new Error('versão');
        } catch {
            rmSync(dir, { recursive: true, force: true });
            return res.status(400).json({ erro: 'Backup inválido ou de uma versão desconhecida' });
        }

        const destino = gerenciador.caminhoDe(codigo);
        const anterior = `${destino}.antes-de-restaurar-${Date.now()}`;
        const tinhaAnterior = existsSync(destino);
        gerenciador.fecharBanco(codigo);

        try {
            if (tinhaAnterior) renameSync(destino, anterior);
            rmSync(`${destino}-wal`, { force: true });
            rmSync(`${destino}-shm`, { force: true });
            renameSync(temporario, destino);
            rmSync(dir, { recursive: true, force: true });
        } catch {
            if (tinhaAnterior) {
                rmSync(destino, { force: true });
                renameSync(anterior, destino);
            }
            rmSync(dir, { recursive: true, force: true });
            return res.status(500).json({ erro: 'Falha ao trocar o banco. O anterior foi mantido' });
        }

        const reaberta = gerenciador.abrir(codigo, { permitirDesativada: true });
        if (reaberta.erro) return res.status(500).json({ erro: 'Banco restaurado, mas não foi possível reabrir' });
        res.json({ sucesso: true, versao: reaberta.banco.userVersion() });
    }

    return { backup, restaurarBackup };
}
```

O `gerenciador` precisa de `fecharBanco(codigo)` para remover só uma conexão do
cache, sem conflitar com o `fechar()` que fecha tudo. Adicionar em
`gerenciador-bancos.js` e exportar:

```js
function fecharBanco(codigo) {
    const aberto = abertos.get(codigo);
    if (!aberto) return;
    aberto.db.close();
    abertos.delete(codigo);
}
```

- [ ] **Step 4: Compor e ligar as rotas**

Em `admin/controladores.js`, importar `criarExportacoesAdmin` e espalhar o resultado. Em `admin/rotas.js`, importar `express` e montar:

```js
rota.get('/empresas/:codigo/banco/backup', autenticarAdmin, seguro(c.backup));
rota.post(
    '/empresas/:codigo/banco/restaurar',
    autenticarAdmin,
    express.raw({ type: 'application/octet-stream', limit: '64mb' }),
    seguro(c.restaurarBackup)
);
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd klok-api && node --test test/admin-backup.test.js`
Expected: PASS nos dois testes.

- [ ] **Step 6: Commit**

```bash
git add klok-api/admin/exportacoes.js klok-api/admin/gerenciador-bancos.js klok-api/admin/controladores.js klok-api/admin/rotas.js klok-api/test/admin-backup.test.js
git commit -m "feat: backup e restauração de banco no painel"
```

---

### Task 10: Apagar empresa pelo painel

**Files:**
- Modify: `klok-api/admin/escritas.js`
- Modify: `klok-api/admin/rotas.js`
- Test: `klok-api/test/admin-painel.test.js`

**Interfaces:**
- Consumes: `gerenciador.apagar(codigo)` da Task 1.
- Produces: `apagarEmpresa` no objeto de `criarEscritasAdmin`.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('apaga empresa com confirmação do código e some com o WAL', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const caminho = s.gerenciador.caminhoDe('TESTE');

    const errada = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE`, {
        method: 'DELETE',
        headers: { ...cabecalhos, 'x-confirmar-codigo': 'OUTRA' },
    });
    assert.equal(errada.status, 400);
    assert.ok(s.catalogo.buscarEmpresa('TESTE'));

    const certa = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE`, {
        method: 'DELETE',
        headers: { ...cabecalhos, 'x-confirmar-codigo': 'TESTE' },
    });
    assert.equal(certa.status, 204);
    assert.equal(s.catalogo.buscarEmpresa('TESTE'), undefined);
    assert.equal(existsSync(caminho), false);
    assert.equal(existsSync(`${caminho}-wal`), false);
    assert.equal(existsSync(`${caminho}-shm`), false);
});
```

Acrescentar `import { existsSync } from 'node:fs';` no topo de
`test/admin-painel.test.js`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: FAIL com 404.

- [ ] **Step 3: Implementar**

Em `admin/escritas.js`:

```js
function apagarEmpresa(req, res) {
    const codigo = req.params.codigo;
    if (req.get('x-confirmar-codigo') !== codigo) {
        return res.status(400).json({ erro: 'Confirmação do código da empresa não confere' });
    }
    const resultado = gerenciador.apagar(codigo);
    if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
    res.status(204).end();
}
```

Incluir no retorno e ligar a rota:

```js
rota.delete('/empresas/:codigo', autenticarAdmin, seguro(c.apagarEmpresa));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd klok-api && npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 5: Commit**

```bash
git add klok-api/admin/escritas.js klok-api/admin/rotas.js klok-api/test/admin-painel.test.js
git commit -m "feat: apagar empresa pelo painel"
```

---

### Task 11: Exportação CSV

**Files:**
- Modify: `klok-api/admin/exportacoes.js`
- Modify: `klok-api/admin/rotas.js`
- Test: `klok-api/test/admin-painel.test.js`

**Interfaces:**
- Consumes: `campoCsv`, `dataIso`, `inteiroPositivo` da Task 4.
- Produces: `exportarFuncionariosCsv` e `exportarPontosCsv` no objeto de `criarExportacoesAdmin`.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('exporta funcionários e pontos em CSV', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const ana = s.banco.criarFuncionario('Ana; Lima', '1', 'ana@teste.com');
    s.banco.baterPonto(ana, 'entrada');

    const funcionarios = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios.csv`, { headers: cabecalhos });
    assert.equal(funcionarios.status, 200);
    assert.match(funcionarios.headers.get('content-type'), /text\/csv/);
    const textoFuncionarios = await funcionarios.text();
    assert.ok(textoFuncionarios.startsWith('\uFEFFid;nome;numero;email'));
    assert.match(textoFuncionarios, /"Ana; Lima"/);

    const pontos = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/pontos.csv`, { headers: cabecalhos });
    assert.equal(pontos.status, 200);
    const textoPontos = await pontos.text();
    assert.ok(textoPontos.startsWith('\uFEFFid;funcionario;dataHora;tipo'));
    assert.match(textoPontos, /Ana; Lima/);
});

test('CSV de pontos recusa mais de 10.000 linhas', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const ana = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.db.exec('BEGIN');
    const inserir = s.banco.db.prepare('INSERT INTO pontos (funcionarioId, dataHora, tipo) VALUES (?, ?, ?)');
    for (let i = 0; i < 10001; i += 1) {
        inserir.run(ana, new Date(Date.now() + i).toISOString(), 'entrada');
    }
    s.banco.db.exec('COMMIT');

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/pontos.csv`, { headers: cabecalhos });
    assert.equal(resp.status, 400);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: FAIL com 404.

- [ ] **Step 3: Implementar**

Em `admin/exportacoes.js`, adicionar:

```js
import { campoCsv, dataIso, inteiroPositivo } from './validacao-painel.js';

function enviarCsv(res, nome, linhas) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(`\uFEFF${linhas.join('\r\n')}\r\n`);
}

function exportarFuncionariosCsv(req, res) {
    const aberta = gerenciador.abrir(req.params.codigo, { permitirDesativada: true });
    if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

    const linhas = ['id;nome;numero;email'];
    for (const f of aberta.banco.listarFuncionarios()) {
        linhas.push([f.id, f.nome, f.numero, f.email].map(campoCsv).join(';'));
    }
    enviarCsv(res, `klok-${aberta.empresa.codigo}-funcionarios-${new Date().toISOString().slice(0, 10)}.csv`, linhas);
}

function exportarPontosCsv(req, res) {
    const funcionarioId = inteiroPositivo(req.query.funcionarioId);
    if (req.query.funcionarioId && funcionarioId === null) {
        return res.status(400).json({ erro: 'Funcionário inválido' });
    }
    const de = dataIso(req.query.de);
    if (req.query.de && de === null) return res.status(400).json({ erro: 'Data inicial inválida' });
    const ate = dataIso(req.query.ate);
    if (req.query.ate && ate === null) return res.status(400).json({ erro: 'Data final inválida' });

    const aberta = gerenciador.abrir(req.params.codigo, { permitirDesativada: true });
    if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

    const total = aberta.banco.contarPontosFiltrados({ funcionarioId, de, ate });
    if (total > 10000) {
        return res.status(400).json({ erro: 'Mais de 10.000 pontos. Filtre por funcionário ou período.' });
    }
    const { pontos } = aberta.banco.listarPontosFiltrados({ funcionarioId, de, ate, limite: 10000, pagina: 1 });

    const linhas = ['id;funcionario;dataHora;tipo'];
    for (const p of pontos) {
        const quando = new Date(p.dataHora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        linhas.push([p.id, p.funcionarioNome, quando, p.tipo].map(campoCsv).join(';'));
    }
    enviarCsv(res, `klok-${aberta.empresa.codigo}-pontos-${new Date().toISOString().slice(0, 10)}.csv`, linhas);
}
```

Incluir as funções no retorno e ligar as rotas:

```js
rota.get('/empresas/:codigo/funcionarios.csv', autenticarAdmin, seguro(c.exportarFuncionariosCsv));
rota.get('/empresas/:codigo/pontos.csv', autenticarAdmin, seguro(c.exportarPontosCsv));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd klok-api && node --test test/admin-painel.test.js`
Expected: PASS nos testes de CSV.

- [ ] **Step 5: Commit**

```bash
git add klok-api/admin/exportacoes.js klok-api/admin/rotas.js klok-api/test/admin-painel.test.js
git commit -m "feat: exportação CSV de funcionários e pontos"
```

---

### Task 12: Sessão por cookie com CSRF

**Files:**
- Create: `klok-api/admin/sessao.js`
- Modify: `klok-api/middlewares.js`
- Modify: `klok-api/admin/controladores.js`
- Modify: `klok-api/admin/rotas.js`
- Test: `klok-api/test/admin-sessao.test.js`

**Interfaces:**
- Produces: `criarValorCsrf()` devolve 64 caracteres hexadecimais.
- Produces: `lerCookies(header)` devolve um objeto.
- Produces: `definirCookiesSessao(res, { token, csrf, producao })`.
- Produces: `limparCookiesSessao(res, { producao })`.
- Produces: `csrfValido(req)` devolve `boolean`.

- [ ] **Step 1: Escrever o teste que falha**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { iniciarApp } from './helpers.js';

async function loginComCookies(baseUrl) {
    const resp = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'root', senha: 'senha-admin-teste' }),
    });
    assert.equal(resp.status, 200);
    const cookies = resp.headers.getSetCookie();
    const sessao = cookies.find((c) => c.startsWith('klok_admin=')).split(';')[0];
    const csrf = cookies.find((c) => c.startsWith('klok_csrf=')).split(';')[0];
    return { cookies, sessao, csrf, csrfValor: csrf.split('=')[1] };
}

test('login cria cookie httpOnly e csrf legível', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const { cookies } = await loginComCookies(s.baseUrl);

    const sessao = cookies.find((c) => c.startsWith('klok_admin='));
    assert.match(sessao, /HttpOnly/);
    assert.match(sessao, /SameSite=Strict/);
    assert.match(sessao, /Path=\/api\/admin/);

    const csrf = cookies.find((c) => c.startsWith('klok_csrf='));
    assert.doesNotMatch(csrf, /HttpOnly/);
    assert.match(csrf, /SameSite=Strict/);
});

test('cookie sem CSRF dá 403, com CSRF funciona e Bearer segue sem CSRF', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const { sessao, csrf, csrfValor } = await loginComCookies(s.baseUrl);

    const sem = await fetch(`${s.baseUrl}/api/admin/empresas`, { headers: { cookie: sessao } });
    assert.equal(sem.status, 403);

    const errado = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        headers: { cookie: `${sessao}; ${csrf}`, 'x-csrf-token': 'errado' },
    });
    assert.equal(errado.status, 403);

    const certo = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        headers: { cookie: `${sessao}; ${csrf}`, 'x-csrf-token': csrfValor },
    });
    assert.equal(certo.status, 200);

    const bearer = await fetch(`${s.baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'root', senha: 'senha-admin-teste' }),
    });
    const token = (await bearer.json()).token;
    const comBearer = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(comBearer.status, 200);
});

test('logout limpa os cookies', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const { sessao, csrf, csrfValor } = await loginComCookies(s.baseUrl);

    const resp = await fetch(`${s.baseUrl}/api/admin/logout`, {
        method: 'POST',
        headers: { cookie: `${sessao}; ${csrf}`, 'x-csrf-token': csrfValor },
    });
    assert.equal(resp.status, 204);
    const limpos = resp.headers.getSetCookie();
    assert.ok(limpos.some((c) => c.startsWith('klok_admin=;')));
    assert.ok(limpos.some((c) => c.startsWith('klok_csrf=;')));
});

test('cookie inválido dá 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const resp = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        headers: { cookie: 'klok_admin=invalido' },
    });
    assert.equal(resp.status, 401);
});

test('rotas de escrita exigem sessão', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const rotas = [
        ['POST', '/api/admin/empresas/TESTE/coordenadores/1/senha'],
        ['POST', '/api/admin/empresas/TESTE/coordenadores/1/impersonar'],
        ['PATCH', '/api/admin/empresas/TESTE/funcionarios/1'],
        ['DELETE', '/api/admin/empresas/TESTE/funcionarios/1'],
        ['POST', '/api/admin/empresas/TESTE/solicitacoes/1/aprovar'],
        ['POST', '/api/admin/empresas/TESTE/solicitacoes/1/recusar'],
        ['POST', '/api/admin/empresas/TESTE/banco/restaurar'],
        ['DELETE', '/api/admin/empresas/TESTE'],
        ['POST', '/api/admin/logout'],
    ];
    for (const [metodo, rota] of rotas) {
        assert.equal((await fetch(`${s.baseUrl}${rota}`, { method: metodo })).status, 401, rota);
    }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/admin-sessao.test.js`
Expected: FAIL porque o login ainda não cria cookies.

- [ ] **Step 3: Implementar `admin/sessao.js`**

```js
import { randomBytes, timingSafeEqual } from 'node:crypto';

const NOME_SESSAO = 'klok_admin';
const NOME_CSRF = 'klok_csrf';
const MAX_AGE = 12 * 60 * 60;

export function criarValorCsrf() {
    return randomBytes(32).toString('hex');
}

export function lerCookies(header = '') {
    const cookies = {};
    for (const parte of header.split(';')) {
        const indice = parte.indexOf('=');
        if (indice < 0) continue;
        const nome = parte.slice(0, indice).trim();
        if (!nome) continue;
        const valor = parte.slice(indice + 1).trim();
        try {
            cookies[nome] = decodeURIComponent(valor);
        } catch {
            cookies[nome] = valor;
        }
    }
    return cookies;
}

function atributos(producao) {
    return `SameSite=Strict; Max-Age=${MAX_AGE}${producao ? '; Secure' : ''}`;
}

export function definirCookiesSessao(res, { token, csrf, producao }) {
    res.append(
        'Set-Cookie',
        `${NOME_SESSAO}=${token}; HttpOnly; Path=/api/admin; ${atributos(producao)}`
    );
    res.append('Set-Cookie', `${NOME_CSRF}=${csrf}; Path=/; ${atributos(producao)}`);
}

export function limparCookiesSessao(res, { producao } = {}) {
    res.append(
        'Set-Cookie',
        `${NOME_SESSAO}=; HttpOnly; Path=/api/admin; Max-Age=0${producao ? '; Secure' : ''}`
    );
    res.append('Set-Cookie', `${NOME_CSRF}=; Path=/; Max-Age=0${producao ? '; Secure' : ''}`);
}

export function tokenDoCookie(req) {
    return lerCookies(req.headers.cookie)[NOME_SESSAO] ?? null;
}

export function csrfValido(req) {
    const esperado = lerCookies(req.headers.cookie)[NOME_CSRF];
    const recebido = req.get('x-csrf-token');
    if (!esperado || !recebido) return false;
    const a = Buffer.from(esperado);
    const b = Buffer.from(recebido);
    return a.length === b.length && timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Ajustar `autenticarAdmin` em `middlewares.js`**

```js
import { csrfValido, tokenDoCookie } from './admin/sessao.js';

export function criarAutenticarAdmin({ catalogo, segredo }) {
    return async function autenticarAdmin(req, res, next) {
        const header = req.headers.authorization;
        const porBearer = header?.startsWith('Bearer ');
        const token = porBearer ? header.slice(7) : tokenDoCookie(req);
        if (!token) {
            return res.status(401).json({ erro: 'Token não informado' });
        }
        try {
            // ... jwtVerify e validação do admin iguais, usando `token` no lugar
            // de header.slice(7), e sem chamar next() ainda
            if (!porBearer && !csrfValido(req)) {
                return res.status(403).json({ erro: 'CSRF inválido' });
            }
            req.admin = admin;
            next();
        } catch {
            return res.status(401).json({ erro: 'Token inválido ou expirado' });
        }
    };
}
```

- [ ] **Step 5: Login e logout no controlador**

Em `admin/controladores.js`:

```js
import { criarValorCsrf, definirCookiesSessao, limparCookiesSessao } from './sessao.js';

// dentro de criarControladoresAdmin
const producao = () => process.env.NODE_ENV === 'production';

async function login(req, res) {
    // ... validação e verificação iguais
    const token = await gerarTokenAdmin(admin);
    const csrf = criarValorCsrf();
    definirCookiesSessao(res, { token, csrf, producao: producao() });
    res.json({ token, tipo: 'admin', nome: admin.usuario, id: admin.id });
}

function logout(req, res) {
    limparCookiesSessao(res, { producao: producao() });
    res.status(204).end();
}
```

Incluir `logout` no retorno. Em `admin/rotas.js`:

```js
rota.post('/logout', autenticarAdmin, seguro(c.logout));
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd klok-api && npm test`
Expected: PASS em toda a suíte, incluindo os testes antigos de Bearer.

- [ ] **Step 7: Commit**

```bash
git add klok-api/admin/sessao.js klok-api/middlewares.js klok-api/admin/controladores.js klok-api/admin/rotas.js klok-api/test/admin-sessao.test.js
git commit -m "feat: sessão do admin por cookie httpOnly com CSRF"
```

---

### Task 13: Painel, estrutura e leitura

**Files:**
- Modify: `klok-api/admin/painel/index.html`
- Modify: `klok-api/admin/painel/admin.js`
- Modify: `klok-api/admin/painel/admin.css`
- Test: `klok-api/test/painel.test.js`

**Interfaces:**
- Consumes: rotas de leitura das Tasks 5, 6, 9 e 11.
- Produces: ids usados pela Task 14: `resumo-funcionarios`, `resumo-coordenadores`, `resumo-pontos`, `resumo-pendentes`, `resumo-ultimo-ponto`, `tabela-coordenadores`, `tabela-funcionarios`, `tabela-pontos`, `tabela-solicitacoes`, `banco-versao`, `banco-tamanho`, `seletor-empresa`.

- [ ] **Step 1: Escrever o teste que falha**

Em `test/painel.test.js`, acrescentar:

```js
test('painel tem as seções de suporte', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const html = await (await fetch(`${s.baseUrl}/admin`)).text();
    for (const id of [
        'seletor-empresa',
        'resumo-funcionarios',
        'resumo-coordenadores',
        'resumo-pontos',
        'resumo-pendentes',
        'resumo-ultimo-ponto',
        'tabela-coordenadores',
        'tabela-funcionarios',
        'tabela-pontos',
        'tabela-solicitacoes',
        'banco-versao',
        'banco-tamanho',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/painel.test.js`
Expected: FAIL no teste novo.

- [ ] **Step 3: Atualizar o HTML**

Dentro de `#bloco-painel`, logo antes de `#bloco-empresa`, inserir o seletor:

```html
<div class="cartao">
    <label for="seletor-empresa">Empresa em atendimento</label>
    <select id="seletor-empresa"></select>
</div>
```

Dentro de `#bloco-empresa`, antes do formulário de primeiro coordenador,
inserir:

```html
<h3>Resumo</h3>
<div class="numeros">
    <div><strong id="resumo-funcionarios">0</strong><span>funcionários</span></div>
    <div><strong id="resumo-coordenadores">0</strong><span>coordenadores</span></div>
    <div><strong id="resumo-pontos">0</strong><span>pontos</span></div>
    <div><strong id="resumo-pendentes">0</strong><span>pedidos pendentes</span></div>
</div>
<p class="dica">Último ponto: <strong id="resumo-ultimo-ponto">nenhum</strong></p>

<h3>Coordenadores</h3>
<div class="tabela-rolagem"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Email</th><th>Ações</th></tr></thead><tbody id="tabela-coordenadores"></tbody></table></div>

<h3>Funcionários</h3>
<div class="tabela-rolagem"><table><thead><tr><th>Nome</th><th>Número</th><th>Email</th><th>Ações</th></tr></thead><tbody id="tabela-funcionarios"></tbody></table></div>

<h3>Pontos</h3>
<form id="filtro-pontos" class="formulario">
    <label for="ponto-funcionario">Funcionário</label>
    <select id="ponto-funcionario"><option value="">Todos</option></select>
    <label for="ponto-de">De</label><input id="ponto-de" type="date" />
    <label for="ponto-ate">Até</label><input id="ponto-ate" type="date" />
    <label for="ponto-limite">Limite</label><input id="ponto-limite" type="number" min="1" max="200" value="200" />
    <button type="submit">Filtrar</button>
</form>
<p id="ponto-paginacao" class="dica"></p>
<div class="tabela-rolagem"><table><thead><tr><th>Funcionário</th><th>Quando</th><th>Tipo</th></tr></thead><tbody id="tabela-pontos"></tbody></table></div>

<h3>Solicitações</h3>
<select id="solicitacao-status"><option value="pendente">Pendentes</option><option value="aprovado">Aprovadas</option><option value="recusado">Recusadas</option></select>
<div class="tabela-rolagem"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Email</th><th>Criado em</th><th>Ações</th></tr></thead><tbody id="tabela-solicitacoes"></tbody></table></div>

<h3>Banco</h3>
<p class="dica">Versão: <strong id="banco-versao"></strong> · Tamanho: <strong id="banco-tamanho"></strong></p>
```

- [ ] **Step 4: Atualizar o `admin.js`**

Trocar o token por CSRF:

```js
const estado = { empresas: [], selecionada: null, csrf: '', pontosPagina: 1 };

function csrfDoCookie() {
    const par = document.cookie.split('; ').find((item) => item.startsWith('klok_csrf='));
    return par ? par.slice('klok_csrf='.length) : '';
}

async function api(caminho, { method = 'GET', corpo } = {}) {
    const resp = await fetch(caminho, {
        method,
        credentials: 'same-origin',
        headers: {
            ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
            ...(estado.csrf ? { 'x-csrf-token': estado.csrf } : {}),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    // ... tratamento igual, mas 401 chama sair()
}
```

No login, depois do sucesso: `estado.csrf = csrfDoCookie();` e `entrarNoPainel()`.

No boot: `estado.csrf = csrfDoCookie(); if (estado.csrf) carregarEmpresas();`.

O `sair()` deixa de limpar `sessionStorage` e passa a chamar
`POST /api/admin/logout` com `fetch` direto, não com `api()`, para um 401 do
logout não chamar `sair()` de novo em laço. Depois limpa `estado.csrf` e mostra
o login. O `CHAVE_TOKEN` e o `sessionStorage` saem do arquivo.

Adicionar `carregarResumo()`, `carregarCoordenadores()`, `carregarFuncionarios()`, `carregarPontos()`, `carregarSolicitacoes()`, `carregarBanco()`, todas chamadas por `selecionarEmpresa`, e `formatarDataHora` com `America/Sao_Paulo`.

Em `desenharEmpresas()`, preencher também o `#seletor-empresa` com as empresas
e marcar a selecionada. Ligar o evento `change` do seletor a
`selecionarEmpresa(valor)`. O `selecionarEmpresa` já grava `?empresa=` na URL.

- [ ] **Step 5: Estilo**

Em `admin.css`, adicionar `.numeros` com quatro colunas em grid, quebrando para duas em tela pequena, e `.tabela-rolagem` já existe.

- [ ] **Step 6: Rodar e ver passar**

Run: `cd klok-api && node --test test/painel.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add klok-api/admin/painel/index.html klok-api/admin/painel/admin.js klok-api/admin/painel/admin.css klok-api/test/painel.test.js
git commit -m "feat: seções de leitura no painel do admin"
```

---

### Task 14: Painel, ações de suporte

**Files:**
- Modify: `klok-api/admin/painel/index.html`
- Modify: `klok-api/admin/painel/admin.js`
- Modify: `klok-api/admin/painel/admin.css`
- Test: `klok-api/test/painel.test.js`

**Interfaces:**
- Consumes: rotas de escrita das Tasks 6, 7, 8, 9, 10 e 11.
- Produces: botões e formulários com os ids `botao-backup`, `botao-restaurar`, `arquivo-restaurar`, `botao-csv-funcionarios`, `botao-csv-pontos`, `botao-apagar-empresa`.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('painel tem as ações de suporte', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const js = await (await fetch(`${s.baseUrl}/admin/admin.js`)).text();
    for (const nome of [
        'redefinirSenha',
        'impersonar',
        'editarFuncionario',
        'apagarFuncionario',
        'aprovarSolicitacao',
        'recusarSolicitacao',
        'baixarBackup',
        'restaurarBackup',
        'apagarEmpresa',
        'baixarCsv',
    ]) {
        assert.match(js, new RegExp(nome));
    }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd klok-api && node --test test/painel.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar as ações no `admin.js`**

Cada função segue o mesmo padrão: monta a chamada, desabilita o botão durante a ação, trata erro com `mensagem()`, recarrega a seção afetada.

- `redefinirSenha(id)`: pede a senha com `prompt`, valida `length >= 4`, chama `POST .../coordenadores/:id/senha`, limpa o prompt.
- `impersonar(id)`: chama `POST .../coordenadores/:id/impersonar`, mostra o token em `prompt` para copiar e avisa que expira em 12 horas.
- `editarFuncionario(id)`: transforma a linha em campos de nome, número e email, com Salvar e Cancelar, e chama `PATCH`.
- `apagarFuncionario(id, nome)`: pede o nome digitado com `prompt` e só apaga se for igual.
- `aprovarSolicitacao(id)` e `recusarSolicitacao(id)`: confirmam e chamam as rotas, depois recarregam resumo e solicitações.
- `baixarBackup()`: `fetch` com `credentials` e CSRF, converte para blob e dispara `<a download>`.
- `restaurarBackup()`: lê o arquivo de `#arquivo-restaurar`, pede o código digitado, envia como `application/octet-stream` com `x-confirmar-codigo`, e recarrega tudo.
- `apagarEmpresa()`: pede o código digitado, chama `DELETE` e volta para a lista de empresas.
- `baixarCsv(tipo)`: monta a URL com os filtros atuais de pontos, baixa por blob.
- `carregarPontos(pagina)`: botões Anterior e Próxima respeitam `paginas`.

- [ ] **Step 4: HTML dos botões**

```html
<h3>Banco</h3>
<p class="dica">Versão: <strong id="banco-versao"></strong> · Tamanho: <strong id="banco-tamanho"></strong></p>
<button id="botao-backup" class="secundario" type="button">Baixar backup</button>
<label for="arquivo-restaurar">Restaurar backup</label>
<input id="arquivo-restaurar" type="file" accept=".db,application/octet-stream" />
<button id="botao-restaurar" class="secundario" type="button">Restaurar</button>

<button id="botao-csv-funcionarios" class="secundario" type="button">Exportar funcionários CSV</button>
<button id="botao-csv-pontos" class="secundario" type="button">Exportar pontos CSV</button>
<button id="botao-apagar-empresa" class="perigo" type="button">Apagar empresa</button>
```

Adicionar `.perigo` no CSS com cor vermelha do tema atual.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd klok-api && npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 6: Commit**

```bash
git add klok-api/admin/painel/index.html klok-api/admin/painel/admin.js klok-api/admin/painel/admin.css klok-api/test/painel.test.js
git commit -m "feat: ações de suporte no painel do admin"
```

---

### Task 15: Verificação final, documentação e PR

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/SEGURANCA.md`
- Test: suíte inteira

**Interfaces:**
- Consumes: tudo das tarefas anteriores.

- [ ] **Step 1: Rodar a suíte inteira**

Run: `cd klok-api && npm test`
Expected: PASS. Anotar o total de testes.

- [ ] **Step 2: Rodar o typecheck do app**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Atualizar a documentação**

Em `AGENTS.md`, trocar a contagem de testes pelo total novo e registrar o bloco E concluído na seção "Programa de trabalho em andamento".

Em `docs/SEGURANCA.md`, acrescentar a seção de sessão do admin: cookie `klok_admin` com `HttpOnly` e `SameSite=Strict`, CSRF por `x-csrf-token`, Bearer mantido para testes e CLI, e aviso de que impersonação gera token de 12 horas registrado no log.

- [ ] **Step 4: Conferir o diff**

Run: `git status --short && git diff --stat`
Expected: só os arquivos do plano.

- [ ] **Step 5: Commit final e PR**

```bash
git add AGENTS.md docs/SEGURANCA.md
git commit -m "docs: fechar o bloco E do painel do admin"
git push -u origin feat/painel-parte-3
gh pr create --base main --head feat/painel-parte-3 \
  --title "feat: painel de suporte por empresa (parte 3)" \
  --body "Fecha a issue #32 com resumo, coordenadores, funcionários, pontos, solicitações, banco, backup, restauração, exclusão de empresa, impersonação, CSV e sessão por cookie com CSRF."
```

- [ ] **Step 6: Esperar a CI e mergear**

Run: `gh pr checks <numero>`
Expected: `backend` e `app` com `pass`. Se ainda estiverem pendentes, esperar
alguns segundos e repetir, porque esta versão do `gh` não tem `--watch` nem
`--interval`.

Depois do merge, fechar a issue citando o PR:

```bash
gh issue close 32 --comment "Resolvido no PR #<numero>."
```

---

## Autoverificação do plano

**Cobertura da spec:**

- resumo: Tasks 2 e 5.
- coordenadores e senha: Tasks 5 e 6.
- impersonação: Task 6.
- funcionários e edição: Tasks 5 e 7.
- pontos com filtro, paginação e limite 200: Tasks 2 e 5.
- solicitações e decisão: Tasks 3, 5 e 8.
- banco, backup e restauração: Tasks 5 e 9.
- apagar empresa: Tasks 1 e 10.
- CSV: Tasks 4 e 11.
- cookie httpOnly e CSRF: Task 12.
- painel: Tasks 13 e 14.
- empresa desativada no painel: Tasks 1 e 5.
- testes de 401: cobertos pelos testes existentes de admin e pelos novos de sessão.

**Consistência de tipos:** `abrir(codigo, { permitirDesativada })`, `resumo()`, `listarPontosFiltrados({ funcionarioId, de, ate, limite, pagina })`, `listarSolicitacoesPaginado({ status, limite, pagina })`, `paginacao(query)`, `campoCsv(valor)` e `criarEscritasAdmin({ gerenciador, gerarTokenEmpresa, enviarEmail })` aparecem com a mesma assinatura em todas as tarefas.

**Review Focus:** cada linha tem teste na tarefa dona do código: empresa desativada nas Tasks 1 e 5, restauração na Task 9, CSRF na Task 12, exclusão com WAL na Task 10 e filtro de data na Task 2.
