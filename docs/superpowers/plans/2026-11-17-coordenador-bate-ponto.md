# Coordenador com funcionário vinculado: plano de implementação

> **Para quem executa:** usar `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Os passos têm caixa de seleção.

**Objetivo:** fazer o coordenador ter registro em `funcionarios`, para bater
ponto como qualquer pessoa da empresa, sem abrir caminho para apagar a conta de
coordenador pela lista de funcionários.

**Arquitetura:** o vínculo nasce na criação (`criarCoordenador` em transação),
é corrigido nos bancos antigos por migração e protegido nas duas rotas de
exclusão. Nada muda no app.

**Stack:** Node 22, `node:sqlite`, Express, migrações por `PRAGMA user_version`.

**Spec:** `docs/superpowers/specs/2026-11-17-coordenador-bate-ponto-design.md`

## Restrições globais

- Banco por empresa, migração versionada, `MIGRACOES` em `klok-api/db.js`.
- Teste antes do código; suíte inteira verde (`cd klok-api && npm test`, 166
  testes hoje) e `npm run typecheck` limpo.
- Português, sem hífen nem travessão em texto gerado.
- Branch `feat/coordenador-bate-ponto`, saída da `main` já com os PRs #40 e #41.

## Review Focus

- Coordenador migrado com nome, número e email copiados errados, ou dois
  coordenadores com mesmo nome caindo no mesmo registro de funcionário.
- Criação de coordenador com usuário repetido deixando funcionário órfão.
- Exclusão de funcionário apagando a conta de coordenador por outro caminho que
  não o 409, por exemplo o painel.
- Edição do coordenador na lista de funcionários deixando `usuarios` e
  `funcionarios` divergentes.
- Banco já migrado que roda a migração 9 de novo.

---

### Tarefa 1: migração 9, coordenador antigo ganha funcionário

**Arquivos:**
- Modificar: `klok-api/db.js` (array `MIGRACOES`, depois da versão 8)
- Testar: `klok-api/test/migracao.test.js`

**Interfaces:**
- Produz: `MIGRACOES.length` passa de 8 para 9, e `userVersion()` devolve 9.

- [ ] **Passo 1: escrever o teste que falha**

```js
test('coordenador antigo ganha funcionário vinculado na migração', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klok-migra-coordenador-'));
    const caminho = join(dir, 'klok.db');
    const bruto = new DatabaseSync(caminho);
    for (const migracao of MIGRACOES.slice(0, 8)) bruto.exec(migracao.sql);
    bruto.exec('PRAGMA user_version = 8');
    bruto.exec(
        "INSERT INTO usuarios (usuario, senhaHash, tipo, nome, numero, email) VALUES ('chefe', 'hash', 'coordenador', 'Chefe Antigo', '1199', 'chefe@teste.com')"
    );
    bruto.exec(
        "INSERT INTO funcionarios (nome, numero, email) VALUES ('Ja Existia', '', '')"
    );
    bruto.close();

    const banco = criarBanco(caminho);
    const chefe = banco.buscarUsuarioPorLogin('chefe');
    assert.ok(chefe.funcionarioId, 'coordenador migrado precisa de funcionarioId');
    const funcionario = banco.buscarFuncionario(Number(chefe.funcionarioId));
    assert.equal(funcionario.nome, 'Chefe Antigo');
    assert.equal(funcionario.numero, '1199');
    assert.equal(funcionario.email, 'chefe@teste.com');
    assert.equal(banco.listarFuncionarios().length, 2, 'o funcionário que já existia continua');
    banco.db.close();
    rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Passo 2: rodar e ver falhar**

`cd klok-api && node --test test/migracao.test.js`
Esperado: falha em `chefe.funcionarioId` ou em `MIGRACOES.length`.

- [ ] **Passo 3: implementar a migração 9 em `klok-api/db.js`**

Depois do objeto da versão 8, acrescentar a versão 9 com:
uma `CREATE TEMP TABLE migracao_coordenador AS SELECT` que calcula
`funcionarioId` como `MAX(id)` de `funcionarios` mais `ROW_NUMBER() OVER
(ORDER BY u.id)`, um `INSERT INTO funcionarios` a partir dela, um `UPDATE
usuarios` casando por `usuarioId` e o `DROP TABLE`. O nome da migração é
"coordenador também é funcionário e bate ponto".

- [ ] **Passo 4: rodar e ver passar**

`cd klok-api && node --test test/migracao.test.js`
Esperado: todos os testes do arquivo passando, com `userVersion()` igual a 9.

- [ ] **Passo 5: commitar**

```bash
git add klok-api/db.js klok-api/test/migracao.test.js
git commit -m "feat: migração 9 vincula funcionário ao coordenador"
```

### Tarefa 2: criação de coordenador em transação

**Arquivos:**
- Modificar: `klok-api/db.js` (`criarCoordenador`)
- Testar: `klok-api/test/coordenador-funcionario.test.js` (novo)

**Interfaces:**
- Consome: `banco.criarCoordenador(usuario, senha, nome, email, numero)` como
  hoje, mesma assinatura e mesmo retorno.
- Produz: `banco.buscarUsuarioPorFuncionarioId(id)` e `banco.buscarFuncionario(id)`
  coerentes para o coordenador.

- [ ] **Passo 1: escrever o teste que falha**

```js
test('criar coordenador cria o funcionário e vincula', () => {
    const banco = criarBanco(':memory:');
    const criado = banco.criarCoordenador('chefe', 'senha123', 'Chefe', 'chefe@teste.com', '1199');

    assert.ok(criado.funcionarioId, 'coordenador nasce com funcionarioId');
    const funcionario = banco.buscarFuncionario(Number(criado.funcionarioId));
    assert.equal(funcionario.nome, 'Chefe');
    assert.equal(funcionario.numero, '1199');
    assert.equal(funcionario.email, 'chefe@teste.com');
    banco.db.close();
});

test('criar coordenador com usuário repetido não deixa funcionário órfão', () => {
    const banco = criarBanco(':memory:');
    banco.criarCoordenador('chefe', 'senha123', 'Chefe', 'chefe@teste.com', '1199');
    const antes = banco.listarFuncionarios().length;

    assert.throws(() => banco.criarCoordenador('chefe', 'outra', 'Outro', 'outro@teste.com', ''));

    assert.equal(banco.listarFuncionarios().length, antes, 'rollback não pode deixar funcionário sem usuário');
    banco.db.close();
});
```

- [ ] **Passo 2: rodar e ver falhar**

`cd klok-api && node --test test/coordenador-funcionario.test.js`

- [ ] **Passo 3: implementar**

Em `criarCoordenador`, abrir transação, inserir em `funcionarios`, usar o
`lastInsertRowid` no `funcionarioId` do `INSERT INTO usuarios` e confirmar, com
`ROLLBACK` no `catch` e o erro relançado.

- [ ] **Passo 4: rodar e ver passar**

`cd klok-api && node --test test/coordenador-funcionario.test.js`

- [ ] **Passo 5: commitar**

```bash
git add klok-api/db.js klok-api/test/coordenador-funcionario.test.js
git commit -m "feat: coordenador nasce com funcionário vinculado"
```

### Tarefa 3: coordenador bate ponto

**Arquivos:**
- Testar: `klok-api/test/pontos.test.js`
- Nada muda em `controladores/pontos.js`: a regra do 400 continua como defesa
  para linha legada sem vínculo.

- [ ] **Passo 1: trocar o teste antigo por dois**

Substituir `coordenador sem funcionário vinculado não consegue bater ponto` por:

```js
test('coordenador bate ponto como qualquer funcionário', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: 'batida' }),
    });
    assert.equal(resp.status, 201);
    const ponto = await resp.json();
    assert.ok(ponto.funcionarioId, 'a batida precisa estar ligada a um funcionário');

    const meus = await fetch(`${s.baseUrl}/api/pontos/meus`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(meus.status, 200);
    assert.equal((await meus.json()).length, 1);
});

test('usuário sem funcionário vinculado continua recusado', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    s.banco.db.prepare('UPDATE usuarios SET funcionarioId = NULL WHERE usuario = ?').run('coordenador');
    const token = await logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: 'batida' }),
    });
    assert.equal(resp.status, 400);
});
```

- [ ] **Passo 2: rodar e ver falhar** (o primeiro teste falha com 400)
- [ ] **Passo 3: nada a implementar**, a tarefa 2 já faz passar. Se falhar,
  voltar para a tarefa 2.
- [ ] **Passo 4: rodar e ver passar**
- [ ] **Passo 5: commitar**

### Tarefa 4: exclusão de coordenador pela lista de funcionários devolve 409

**Arquivos:**
- Modificar: `klok-api/db.js` (`apagarFuncionario`), `klok-api/controladores/funcionarios.js`,
  `klok-api/admin/escritas.js`
- Testar: `klok-api/test/coordenador-funcionario.test.js` e
  `klok-api/test/admin-painel.test.js`

**Interfaces:**
- Produz: `banco.apagarFuncionario(id)` devolve `{ apagou: boolean, motivo }`,
  onde `motivo` é `'coordenador'` ou `null`. Quem chama traduz em 409 com a
  mensagem "Coordenador não pode ser apagado como funcionário".

- [ ] **Passo 1: escrever os testes que falham** (db, app e painel)
- [ ] **Passo 2: rodar e ver falhar**
- [ ] **Passo 3: implementar o guard no db e o 409 nas duas camadas**
- [ ] **Passo 4: rodar e ver passar**
- [ ] **Passo 5: commitar**

### Tarefa 5: editar funcionário coordenador mantém os dados iguais

**Arquivos:**
- Modificar: `klok-api/db.js` (`atualizarFuncionario`)
- Testar: `klok-api/test/coordenador-funcionario.test.js`

- [ ] **Passo 1: escrever o teste que falha** (editar e conferir `usuarios`)
- [ ] **Passo 2: rodar e ver falhar**
- [ ] **Passo 3: implementar** com transação, atualizando `funcionarios` e
  `usuarios WHERE funcionarioId = ?`
- [ ] **Passo 4: rodar e ver passar**
- [ ] **Passo 5: commitar**

### Tarefa 6: verificação final e dados de exemplo

- [ ] `cd klok-api && npm test`, suíte inteira verde.
- [ ] `npm run typecheck` na raiz, limpo.
- [ ] `cd klok-api && npm run semear -- --recriar` e conferir no banco de ACME
  que `ana.souza` tem `funcionarioId`.
- [ ] Reiniciar a API e bater ponto com `ana.souza` pelo curl, esperando 201.
- [ ] Abrir o PR citando a issue e pedir revisão.
