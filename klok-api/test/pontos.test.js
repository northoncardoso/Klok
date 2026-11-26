import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarApp, logar, COORDENADOR_SENHA, LOCAL } from './helpers.js';

const DENTRO = { latitude: LOCAL.latitude, longitude: LOCAL.longitude, precisaoMetros: 5 };
const FORA = { latitude: -23.6, longitude: -46.7, precisaoMetros: 5 };

const CAMPOS_DO_CALCULO = ['localId', 'dentroPerimetro', 'distanciaMetros', 'precisaoMetros', 'localNome'];

async function bater(baseUrl, token, corpo) {
    const resp = await fetch(`${baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: 'batida', ...corpo }),
    });
    return { status: resp.status, corpo: await resp.json().catch(() => null) };
}

async function criarFuncionarioLogado(s, usuario) {
    s.banco.criarUsuarioLocal(usuario, '123456', usuario);
    return logar(s.baseUrl, usuario, '123456');
}

test('bater ponto sem token retorna 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: 'batida' }),
    });
    assert.equal(resp.status, 401);
});

test('funcionario bate ponto e vê o próprio histórico', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'ponto1');

    const bater = await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: 'batida' }),
    });
    assert.equal(bater.status, 201);
    const ponto = await bater.json();
    assert.equal(ponto.tipo, 'batida');

    const meus = await fetch(`${s.baseUrl}/api/pontos/meus`, {
        headers: { authorization: `Bearer ${token}` },
    });
    const historico = await meus.json();
    assert.equal(historico.length, 1);
    assert.equal(historico[0].id, ponto.id);
});

test('coordenador vê pontos de todos com nome do funcionario', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenFunc = await criarFuncionarioLogado(s, 'ponto2');
    const tokenCoordenador = await logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);

    await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFunc}` },
        body: JSON.stringify({ tipo: 'batida' }),
    });

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        headers: { authorization: `Bearer ${tokenCoordenador}` },
    });
    assert.equal(resp.status, 200);
    const todos = await resp.json();
    assert.ok(todos.length >= 1);
    assert.ok(todos.some((p) => p.funcionarioNome === 'ponto2'));
});

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
    // Linha legada, anterior ao vínculo obrigatório: o guard do controlador
    // continua valendo para banco que não passou pela migração.
    s.banco.db.prepare('UPDATE usuarios SET funcionarioId = NULL WHERE usuario = ?').run('coordenador');
    const token = await logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: 'batida' }),
    });
    assert.equal(resp.status, 400);
});

test('bater ponto com tipo inválido retorna 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'tipo-invalido');

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: 'almoco' }),
    });
    assert.equal(resp.status, 400);
});
test('batida dentro do perímetro grava o resultado e o coordenador vê', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenFunc = await criarFuncionarioLogado(s, 'dentro');
    const tokenCoordenador = await logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);

    const { status } = await bater(s.baseUrl, tokenFunc, DENTRO);
    assert.equal(status, 201);

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        headers: { authorization: `Bearer ${tokenCoordenador}` },
    });
    const todos = await resp.json();
    const ponto = todos.find((p) => p.funcionarioNome === 'dentro');
    assert.equal(ponto.dentroPerimetro, 1);
    assert.equal(ponto.localNome, LOCAL.nome);
    assert.equal(ponto.distanciaMetros, 0);
    assert.equal(ponto.precisaoMetros, 5);
});

test('batida fora do perímetro é registrada normalmente', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenFunc = await criarFuncionarioLogado(s, 'fora');
    const tokenCoordenador = await logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);

    const { status } = await bater(s.baseUrl, tokenFunc, FORA);
    assert.equal(status, 201);

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        headers: { authorization: `Bearer ${tokenCoordenador}` },
    });
    const ponto = (await resp.json()).find((p) => p.funcionarioNome === 'fora');
    assert.equal(ponto.dentroPerimetro, 0);
    assert.ok(ponto.distanciaMetros > 1000);
});

test('empresa sem perímetro aprovado responde 409', async (t) => {
    const s = await iniciarApp({ semLocal: true });
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'sem-local');

    const { status, corpo } = await bater(s.baseUrl, token, DENTRO);
    assert.equal(status, 409);
    assert.ok(corpo.erro);
    assert.equal(s.banco.listarPontos(1).length, 0, 'nada pode ser gravado');
});

test('empresa com todos os locais removidos responde 409', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'locais-removidos');
    s.banco.removerLocal(s.banco.listarLocais()[0].id);

    const { status } = await bater(s.baseUrl, token, DENTRO);
    assert.equal(status, 409);
});

test('batida sem coordenada grava resultado nulo', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'sem-coordenada');

    const { status, corpo } = await bater(s.baseUrl, token, {});
    assert.equal(status, 201);

    const linha = s.banco.db.prepare('SELECT * FROM pontos WHERE id = ?').get(corpo.id);
    assert.equal(linha.dentroPerimetro, null);
    assert.equal(linha.localId, null);
    assert.equal(linha.distanciaMetros, null);
    assert.equal(linha.precisaoMetros, null);
});

test('resposta da batida não traz campos do cálculo', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'sem-vazamento-post');

    const { status, corpo } = await bater(s.baseUrl, token, DENTRO);
    assert.equal(status, 201);
    for (const campo of CAMPOS_DO_CALCULO) {
        assert.equal(campo in corpo, false, `a resposta não pode trazer ${campo}`);
    }
});

test('histórico do funcionário não traz campos do cálculo', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'sem-vazamento-meus');
    await bater(s.baseUrl, token, DENTRO);

    const resp = await fetch(`${s.baseUrl}/api/pontos/meus`, {
        headers: { authorization: `Bearer ${token}` },
    });
    const historico = await resp.json();
    assert.equal(historico.length, 1);
    assert.deepEqual(Object.keys(historico[0]).sort(), ['dataHora', 'funcionarioId', 'id', 'tipo']);
});

test('coordenada inválida responde 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'coordenada-invalida');

    for (const corpo of [
        { latitude: 200, longitude: -46.6 },
        { latitude: -23.5, longitude: 200 },
        { latitude: 'abc', longitude: -46.6 },
        { latitude: -23.5 },
        { longitude: -46.6 },
        { latitude: -23.5, longitude: -46.6, precisaoMetros: 'x' },
    ]) {
        const { status } = await bater(s.baseUrl, token, corpo);
        assert.equal(status, 400, `deveria recusar ${JSON.stringify(corpo)}`);
    }
    assert.equal(s.banco.db.prepare('SELECT COUNT(*) AS total FROM pontos').get().total, 0);
});

test('precisão negativa não transforma batida distante em dentro', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'precisao-negativa');
    const tokenCoordenador = await logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);

    const { status } = await bater(s.baseUrl, token, { ...FORA, precisaoMetros: -500 });
    assert.equal(status, 201);

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        headers: { authorization: `Bearer ${tokenCoordenador}` },
    });
    const ponto = (await resp.json()).find((p) => p.funcionarioNome === 'precisao-negativa');
    assert.equal(ponto.dentroPerimetro, 0);
    assert.equal(ponto.precisaoMetros, 0);
});
