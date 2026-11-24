# Geolocalização na batida de ponto: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar se cada batida de ponto ocorreu dentro de um perímetro da empresa, sem armazenar a localização do funcionário.

**Architecture:** Apuração no servidor com Haversine, coordenada descartada e apenas o resultado persistido. Perímetros em tabela própria, com criação, alteração e exclusão sempre submetidas à aprovação do administrador. Aplicativo consulta o GPS antes da batida e o painel exibe a situação.

**Tech Stack:** Node 22, Express, `node:sqlite`, `node:test`, React Native com Expo 57, `expo-location` e `@expo/vector-icons`.

**Spec:** `docs/superpowers/specs/2026-11-24-geolocalizacao-ponto-design.md`

## Global Constraints

- Node 22.5 ou superior, por causa do `node:sqlite`.
- Raio entre 100 e 150 metros, com padrão de 150.
- A coordenada do funcionário nunca será gravada no banco.
- Migrações versionadas por `PRAGMA user_version`, a próxima é a 10.
- Teste antes do código em todas as tarefas do backend.
- `npm run typecheck` limpo em todas as tarefas do aplicativo.
- Textos publicados no Git em linguagem formal, sem hífen e sem travessão.
- Campo do resultado com três estados: 1 para dentro, 0 para fora e nulo para não verificável.

## Review Focus

- Coordenada ausente, nula, textual ou fora da faixa precisa resultar em 400, nunca em gravação com valor inválido.
- Precisão negativa ou excessiva não pode transformar uma batida distante em dentro.
- Empresa com todos os locais removidos precisa responder 409, como empresa sem perímetro.
- Nenhuma resposta destinada ao funcionário, inclusive a do `POST`, pode conter o resultado.
- Raio fora da faixa de 100 a 150 metros precisa ser recusado no pedido e na aprovação.

---

### Task 1: Migração 10 e modelo de perímetros

**Files:**
- Modify: `klok-api/db.js:117-144` e o bloco de funções do banco
- Test: `klok-api/test/migracao.test.js`

**Interfaces:**
- Produz: `listarLocais()`, `buscarLocal(id)`, `criarLocal({ nome, latitude, longitude, raioMetros })`, `atualizarLocal(id, dados)`, `removerLocal(id)`, `contarLocaisAtivos()`, `listarPedidosLocal(status)`, `buscarPedidoLocal(id)`, `criarPedidoLocal(dados)`, `decidirPedidoLocal(id, { status, decididoPor, motivoRecusa })`, `existePedidoCriacaoPendente()`, `existePedidoPendenteParaLocal(localId)`, `emTransacao(fn)` e `baterPonto(funcionarioId, tipo, apuracao)` com o quarto parâmetro opcional.
- Produz: `PRAGMA user_version` igual a 10.

- [ ] **Step 1: Escrever os testes de migração**

Em `klok-api/test/migracao.test.js`, adicionar:

```js
test('migração 10 cria locais, pedidos e colunas da batida', () => {
    const banco = criarBanco(':memory:');
    assert.equal(banco.userVersion(), 10);
    const tabelas = banco.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((t) => t.name);
    assert.ok(tabelas.includes('locais'));
    assert.ok(tabelas.includes('pedidos_local'));
    const colunas = banco.db.prepare('PRAGMA table_info(pontos)').all().map((c) => c.name);
    for (const nome of ['localId', 'dentroPerimetro', 'distanciaMetros', 'precisaoMetros']) {
        assert.ok(colunas.includes(nome), `pontos precisa da coluna ${nome}`);
    }
    banco.db.close();
});

test('migração 10 preserva pontos existentes', () => {
    const banco = criarBanco(':memory:');
    const funcionario = banco.criarFuncionario('Antigo');
    const ponto = banco.baterPonto(funcionario.id, 'batida');
    assert.equal(ponto.dentroPerimetro, null);
    assert.equal(banco.userVersion(), 10);
    banco.db.close();
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `cd klok-api && node --test test/migracao.test.js`
Expected: falha porque a versão ainda é 9.

- [ ] **Step 3: Implementar a migração 10**

Adicionar em `MIGRACOES`, depois da versão 9:

```sql
CREATE TABLE IF NOT EXISTS locais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    raioMetros INTEGER NOT NULL DEFAULT 150,
    criadoEm TEXT NOT NULL,
    atualizadoEm TEXT,
    removidoEm TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_locais_nome_ativo
    ON locais(nome) WHERE removidoEm IS NULL;

CREATE TABLE IF NOT EXISTS pedidos_local (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    localId INTEGER,
    nome TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    raioMetros INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    solicitadoPor INTEGER NOT NULL,
    solicitadoEm TEXT NOT NULL,
    decididoPor TEXT,
    decididoEm TEXT,
    motivoRecusa TEXT,
    FOREIGN KEY (localId) REFERENCES locais(id)
);
CREATE INDEX IF NOT EXISTS idx_pedidos_local_status ON pedidos_local(status);

ALTER TABLE pontos ADD COLUMN localId INTEGER;
ALTER TABLE pontos ADD COLUMN dentroPerimetro INTEGER;
ALTER TABLE pontos ADD COLUMN distanciaMetros INTEGER;
ALTER TABLE pontos ADD COLUMN precisaoMetros INTEGER;
```

- [ ] **Step 4: Rodar os testes de migração**

Run: `cd klok-api && node --test test/migracao.test.js`
Expected: PASS nos três testes de migração.

- [ ] **Step 5: Escrever os testes das funções do banco**

Em `klok-api/test/locais-db.test.js`, cobrir: criação de local com `criarEm` preenchido, `listarLocais` ignorando removidos, `removerLocal` mantendo a linha, `contarLocaisAtivos`, criação e decisão de pedido, `existePedidoPendenteParaLocal` e `emTransacao` revertendo em erro. As asserções verificam nome, coordenadas e raio persistidos, e que o local removido não aparece em `listarLocais()`.

- [ ] **Step 6: Rodar e confirmar a falha**

Run: `cd klok-api && node --test test/locais-db.test.js`
Expected: falha porque as funções ainda não existem.

- [ ] **Step 7: Implementar as funções do banco**

Em `db.js`, seguir o padrão das funções de `solicitacoes`. `criarLocal` grava `criadoEm` com `new Date().toISOString()`. `removerLocal` faz `UPDATE locais SET removidoEm = ? WHERE id = ?`. `emTransacao(fn)` executa `BEGIN`, chama `fn()` e faz `COMMIT`, com `ROLLBACK` em erro. `baterPonto` passa a inserir `localId`, `dentroPerimetro`, `distanciaMetros` e `precisaoMetros` quando o terceiro argumento existir, mantendo o comportamento atual quando não existir.

- [ ] **Step 8: Rodar os testes e a suíte inteira**

Run: `cd klok-api && node --test test/locais-db.test.js && npm test`
Expected: PASS em tudo.

- [ ] **Step 9: Commit**

```bash
git add klok-api/db.js klok-api/test/migracao.test.js klok-api/test/locais-db.test.js
git commit -m "feat: adicionar estrutura de perímetros e verificação de batida"
```

---

### Task 2: Apuração de distância e perímetro

**Files:**
- Create: `klok-api/geolocalizacao.js`
- Test: `klok-api/test/geolocalizacao.test.js`

**Interfaces:**
- Produz: `distanciaEmMetros({ latitude, longitude }, { latitude, longitude })`, com resultado em metros.
- Produz: `apurarPerimetro(locais, { latitude, longitude, precisaoMetros })`, que devolve `{ localId, dentroPerimetro, distanciaMetros, precisaoMetros }` ou `null` quando não há local válido.
- Consome: lista de locais com `id`, `latitude`, `longitude` e `raioMetros`.

- [ ] **Step 1: Escrever os testes**

Em `klok-api/test/geolocalizacao.test.js`:

```js
const saoPaulo = { latitude: -23.5505, longitude: -46.6333 };
const rio = { latitude: -22.9068, longitude: -43.1729 };

test('distância entre São Paulo e Rio fica próxima de 360 km', () => {
    const metros = distanciaEmMetros(saoPaulo, rio);
    assert.ok(metros > 350000 && metros < 365000, `recebido ${metros}`);
});

test('apuração na borda respeita a margem de precisão', () => {
    const local = { id: 1, ...saoPaulo, raioMetros: 150 };
    const deslocado = { latitude: -23.5505 + 0.0013, longitude: -46.6333, precisaoMetros: 20 };
    const resultado = apurarPerimetro([local], deslocado);
    assert.equal(resultado.dentroPerimetro, null, 'a borda deve ficar indeterminada');
});

test('apuração escolhe o local com resultado dentro', () => {
    const longe = { id: 1, latitude: -23.6, longitude: -46.7, raioMetros: 100 };
    const perto = { id: 2, ...saoPaulo, raioMetros: 150 };
    const resultado = apurarPerimetro([longe, perto], { ...saoPaulo, precisaoMetros: 5 });
    assert.equal(resultado.localId, 2);
    assert.equal(resultado.dentroPerimetro, 1);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `cd klok-api && node --test test/geolocalizacao.test.js`
Expected: falha porque o módulo não existe.

- [ ] **Step 3: Implementar o módulo**

`distanciaEmMetros` usa Haversine com raio da Terra de 6.371.000 metros. `apurarPerimetro` calcula para todos os locais, aplica a margem e escolhe nesta ordem: o menor entre os que deram dentro, depois o menor entre os indeterminados, depois o menor entre os fora. `distanciaMetros` é arredondada com `Math.round`. `precisaoMetros` inválida é tratada como 0 antes do cálculo.

- [ ] **Step 4: Rodar e confirmar a aprovação**

Run: `cd klok-api && node --test test/geolocalizacao.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add klok-api/geolocalizacao.js klok-api/test/geolocalizacao.test.js
git commit -m "feat: implementar apuração de distância e perímetro"
```

---

### Task 3: Batida com apuração e proteção contra vazamento

**Files:**
- Modify: `klok-api/controladores/pontos.js`
- Modify: `klok-api/db.js` nas funções `listarPontos` e `listarTodosPontos`
- Modify: `klok-api/test/helpers.js`
- Modify: `klok-api/scripts/semear-dados.js`
- Test: `klok-api/test/pontos.test.js`

**Interfaces:**
- Consome: `apurarPerimetro(locais, coordenada)` da Task 2.
- Produz: `POST /api/pontos` com 409 para empresa sem perímetro.
- Produz: `GET /api/pontos` com `localNome`.
- Produz: `GET /api/pontos/meus` apenas com `id`, `funcionarioId`, `dataHora` e `tipo`.

- [ ] **Step 1: Adaptar o helper de teste**

Em `iniciarApp`, criar um local aprovado para `EMPRESA` e, quando `segundaEmpresa` for verdadeiro, para `OUTRA_EMPRESA`, usando `banco.criarLocal({ nome: 'Sede', latitude: -23.5505, longitude: -46.6333, raioMetros: 150 })`. Aceitar `opcoes.semLocal` para suprimir a criação. Exportar `LOCAL` com as coordenadas usadas.

- [ ] **Step 2: Escrever os testes da batida**

Em `klok-api/test/pontos.test.js`, adicionar:

```js
const dentro = { latitude: -23.5505, longitude: -46.6333, precisaoMetros: 5 };
const fora = { latitude: -23.6, longitude: -46.7, precisaoMetros: 5 };

test('batida dentro grava resultado e o coordenador vê', ...);
test('batida fora é registrada normalmente', ...);
test('empresa sem perímetro responde 409', ...);
test('empresa com todos os locais removidos responde 409', ...);
test('precisão negativa não transforma batida distante em dentro', ...);
test('batida sem coordenada grava resultado nulo', ...);
test('resposta da batida não traz campos do cálculo', ...);
test('histórico do funcionário não traz campos do cálculo', ...);
test('coordenada inválida responde 400', ...);
```

As asserções verificam o status, `ponto.dentroPerimetro` ausente na resposta ao funcionário, presença de `localNome` e `dentroPerimetro` na resposta ao coordenador, e `dentroPerimetro` nulo no banco quando a coordenada é omitida.

- [ ] **Step 3: Rodar e confirmar a falha**

Run: `cd klok-api && node --test test/pontos.test.js`
Expected: falha nos testes novos e possivelmente nos antigos, por causa do 409.

- [ ] **Step 4: Implementar a apuração na batida**

No controlador, ler `latitude`, `longitude` e `precisaoMetros` do corpo. Quando os dois primeiros vierem juntos, validar faixa e chamar `apurarPerimetro(banco.listarLocais(), coordenada)`. Quando não vierem, apurar apenas com `null`. Sem nenhum local ativo, responder 409 com `{ erro: 'Empresa sem perímetro aprovado' }`. Passar o resultado para `banco.baterPonto`.

- [ ] **Step 5: Proteger as projeções**

`listarPontos` passa a selecionar `id, funcionarioId, dataHora, tipo` explicitamente. `listarTodosPontos` inclui `p.dentroPerimetro`, `p.distanciaMetros`, `p.precisaoMetros`, `p.localId` e `l.nome AS localNome`, com `LEFT JOIN locais l ON l.id = p.localId`. A resposta do `POST` usa a mesma projeção de `listarPontos`.

- [ ] **Step 6: Atualizar o seed**

Em `scripts/semear-dados.js`, criar um local para cada empresa de exemplo, com coordenadas distintas e raio de 150.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `cd klok-api && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add klok-api/controladores/pontos.js klok-api/db.js klok-api/test/helpers.js klok-api/test/pontos.test.js klok-api/scripts/semear-dados.js
git commit -m "feat: apurar perímetro na batida de ponto"
```

---

### Task 4: Pedidos de perímetro pelo coordenador

**Files:**
- Create: `klok-api/controladores/locais.js`
- Create: `klok-api/rotas/locais.js`
- Modify: `klok-api/app.js:186-191`
- Test: `klok-api/test/locais.test.js`

**Interfaces:**
- Consome: funções de banco da Task 1.
- Produz: `GET /api/locais` com `{ locais, pendentes }`.
- Produz: `POST /api/locais/pedidos` com corpo `{ tipo, localId, nome, latitude, longitude, raioMetros }` e resposta 201 com o pedido.

- [ ] **Step 1: Escrever os testes**

Em `klok-api/test/locais.test.js`:

```js
test('coordenador cria pedido de novo perímetro', ...);
test('funcionário comum recebe 403', ...);
test('raio fora de 100 a 150 responde 400', ...);
test('coordenada inválida responde 400', ...);
test('segundo pedido de criação pendente responde 409', ...);
test('pedido de edição não altera o local vigente', ...);
test('pedido guarda autor e data', ...);
test('empresa não enxerga pedido de outra', ...);
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `cd klok-api && node --test test/locais.test.js`
Expected: falha porque a rota não existe.

- [ ] **Step 3: Implementar controlador e rota**

O controlador valida nome não vazio, latitude e longitude em faixa, raio entre 100 e 150, tipo em `criar`, `editar` ou `excluir`, e existência do local nos tipos `editar` e `excluir`. Cria o pedido pendente com `solicitadoPor` igual a `req.usuario.id`. A rota monta `/api/locais`, exige `autenticar` e `exigirCoordenador`.

- [ ] **Step 4: Rodar e confirmar a aprovação**

Run: `cd klok-api && node --test test/locais.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add klok-api/controladores/locais.js klok-api/rotas/locais.js klok-api/app.js klok-api/test/locais.test.js
git commit -m "feat: permitir pedidos de perímetro pelo coordenador"
```

---

### Task 5: Aprovação no painel e colunas de situação

**Files:**
- Modify: `klok-api/admin/rotas.js:22-49`
- Modify: `klok-api/admin/consultas.js`
- Modify: `klok-api/admin/escritas.js`
- Modify: `klok-api/admin/exportacoes.js`
- Modify: `klok-api/db.js` em `listarPontosFiltrados` e `contarPontosFiltrados`
- Modify: `klok-api/admin/painel/admin.js` e `klok-api/admin/painel/index.html`
- Test: `klok-api/test/admin-locais.test.js`

**Interfaces:**
- Consome: `listarPedidosLocal`, `buscarPedidoLocal`, `decidirPedidoLocal`, `emTransacao`, `criarLocal`, `atualizarLocal`, `removerLocal` e `contarLocaisAtivos`.
- Produz: rotas `GET /api/admin/empresas/:codigo/locais/pedidos`, `POST /api/admin/empresas/:codigo/locais/pedidos/:id/aprovar` e `POST /api/admin/empresas/:codigo/locais/pedidos/:id/recusar`.
- Produz: `localNome` e os campos do cálculo em `listarPontosFiltrados`.

- [ ] **Step 1: Escrever os testes do painel**

Em `klok-api/test/admin-locais.test.js`:

```js
test('admin lista pedidos da empresa', ...);
test('aprovação de criação aplica o local', ...);
test('aprovação de edição altera o local vigente', ...);
test('aprovação de exclusão remove o local', ...);
test('exclusão do último local responde 409', ...);
test('recusa guarda motivo e não altera o local', ...);
test('pedido já decidido responde 409', ...);
test('listagem de pontos traz local e situação', ...);
test('CSV traz as colunas de local e situação', ...);
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `cd klok-api && node --test test/admin-locais.test.js`
Expected: falha porque as rotas não existem.

- [ ] **Step 3: Implementar as rotas e a aplicação transacional**

A aprovação abre a empresa com `permitirDesativada`, busca o pedido pendente, aplica em `emTransacao` e decide o pedido na mesma transação. Na exclusão, verificar `contarLocaisAtivos() > 1` antes de remover. A recusa exige motivo opcional e grava `decididoPor` com o usuário do admin. As rotas ficam em `/api/admin`, com `autenticarAdmin`.

- [ ] **Step 4: Atualizar as colunas de pontos**

`listarPontosFiltrados` e o CSV passam a incluir `localNome` por `LEFT JOIN locais`, além de `dentroPerimetro`, `distanciaMetros` e `precisaoMetros`. O painel formata a situação como dentro, fora, indeterminado ou sem coordenada.

- [ ] **Step 5: Implementar a seção no painel**

Em `/admin`, na tela da empresa, adicionar seção de pedidos pendentes com os valores atuais e propostos, botões de aprovar e recusar e campo de motivo. Seguir o padrão das solicitações de cadastro.

- [ ] **Step 6: Rodar a suíte e conferir a tela**

Run: `cd klok-api && npm test`
Expected: PASS.
Conferir no navegador em `/admin` que aprovar e recusar refletem na lista.

- [ ] **Step 7: Commit**

```bash
git add klok-api/admin klok-api/db.js klok-api/test/admin-locais.test.js
git commit -m "feat: aprovar perímetros no painel administrativo"
```

---

### Task 6: GPS obrigatório na batida

**Files:**
- Modify: `package.json` e `app.json`
- Create: `localizacao.ts`
- Modify: `api.ts` em `baterPonto`
- Modify: `screens/PontoScreen.tsx`
- Modify: `types.ts`

**Interfaces:**
- Produz: `obterCoordenada(): Promise<{ latitude: number; longitude: number; precisaoMetros: number } | { motivo: 'servico' | 'permissao' | 'sinal' }>`.
- Produz: `api.baterPonto(tipo: string, coordenada: Coordenada | null, token: string)`.
- Produz: `type Coordenada = { latitude: number; longitude: number; precisaoMetros: number }`.

- [ ] **Step 1: Instalar e configurar**

Run: `npx expo install expo-location`
Adicionar em `app.json`, na lista `plugins`, `["expo-location", { "locationAlwaysAndWhenInUsePermission": "O Klok usa sua localização apenas para confirmar a batida de ponto." }]`.

- [ ] **Step 2: Implementar `obterCoordenada`**

Verificar `hasServicesEnabledAsync` e devolver `motivo: 'servico'` quando estiver desligado. Pedir permissão com `requestForegroundPermissionsAsync` e devolver `motivo: 'permissao'` quando negada. Fazer até 4 tentativas de `getCurrentPositionAsync({ accuracy: Location.Accuracy.High })`, com 10 segundos de limite por tentativa. Se todas falharem, devolver `motivo: 'sinal'`.

- [ ] **Step 3: Ajustar a API e a tela**

`baterPonto` envia `tipo` e, quando houver coordenada, `latitude`, `longitude` e `precisaoMetros`. A tela verifica a permissão antes de enviar. Serviço desligado e permissão negada abrem modal com botão para `Linking.openSettings()`. Ausência de sinal envia a batida sem coordenada e mostra "Ponto registrado sem coordenada verificada". Adicionar a frase neutra "Bata o ponto dentro dos perímetros da sua empresa" acima do botão.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck`
Expected: sem erros.
Testar no emulador com localização desligada, com permissão negada e com localização simulada dentro da sede.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json localizacao.ts api.ts screens/PontoScreen.tsx types.ts
git commit -m "feat: exigir GPS na batida de ponto"
```

---

### Task 7: Tela Configuração de Coordenadas

**Files:**
- Create: `screens/CoordenadasScreen.tsx`
- Modify: `App.tsx`
- Modify: `api.ts`
- Modify: `types.ts`
- Modify: `package.json`

**Interfaces:**
- Consome: `obterCoordenada` da Task 6.
- Produz: `api.listarLocais(token)` com `{ locais, pendentes }`.
- Produz: `api.pedirLocal(dados, token)`.
- Produz: `type Local = { id, nome, latitude, longitude, raioMetros }` e `type PedidoLocal = { id, tipo, localId, nome, latitude, longitude, raioMetros, status, solicitadoEm }`.

- [ ] **Step 1: Instalar os ícones**

Run: `npx expo install @expo/vector-icons`

- [ ] **Step 2: Adicionar os tipos e as chamadas**

Adicionar `Local` e `PedidoLocal` em `types.ts`. Adicionar `listarLocais` e `pedirLocal` em `api.ts`, seguindo o padrão das chamadas existentes.

- [ ] **Step 3: Implementar a tela**

Criar `CoordenadasScreen.tsx` com tabela de locais, situação do pedido pendente, ícone `+` para criação, lápis para edição e lixeira vermelha para exclusão da seleção. O modal de criação e edição tem nome, raio, botão de usar a localização atual e campos numéricos de latitude e longitude. Toda ação abre confirmação e envia pedido pendente.

- [ ] **Step 4: Adicionar ao menu**

Em `App.tsx`, importar a tela, adicionar o caso `case 'Coordenadas'` restrito a coordenador e o item no menu lateral com o texto Configuração de Coordenadas, também restrito a coordenador.

- [ ] **Step 5: Verificar**

Run: `npm run typecheck`
Expected: sem erros.
Testar com sessão de coordenador e de funcionário, confirmando que o item não aparece para funcionário.

- [ ] **Step 6: Commit**

```bash
git add screens/CoordenadasScreen.tsx App.tsx api.ts types.ts package.json package-lock.json
git commit -m "feat: criar tela de configuração de coordenadas"
```

---

## Verificação final

- `cd klok-api && npm test` com a suíte inteira verde.
- `npm run typecheck` sem erros.
- Conferir no banco de teste que `pontos` não tem coordenada.
- Conferir que `GET /api/pontos/meus` não devolve campos do cálculo.
- Conferir no painel a aprovação de um perímetro e a coluna de situação.
- Conferir no emulador os três cenários de GPS.
- Abrir o PR citando a issue #44 e fechar os blocos concluídos.
