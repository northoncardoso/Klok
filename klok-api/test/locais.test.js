import { test } from 'node:test';
import assert from 'node:assert/strict';

import { iniciarApp, logar, COORDENADOR_SENHA, LOCAL, OUTRA_EMPRESA } from './helpers.js';

async function logarCoordenador(s) {
    return logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);
}

async function criarFuncionarioLogado(s, usuario) {
    s.banco.criarUsuarioLocal(usuario, '123456', usuario);
    return logar(s.baseUrl, usuario, '123456');
}

async function pedir(baseUrl, token, corpo) {
    const resp = await fetch(`${baseUrl}/api/locais/pedidos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(corpo),
    });
    return { status: resp.status, corpo: await resp.json().catch(() => null) };
}

async function listar(baseUrl, token) {
    const resp = await fetch(`${baseUrl}/api/locais`, {
        headers: { authorization: `Bearer ${token}` },
    });
    return { status: resp.status, corpo: await resp.json().catch(() => null) };
}

const NOVO = {
    tipo: 'criar',
    nome: 'Filial Centro',
    latitude: -23.5489,
    longitude: -46.6388,
    raioMetros: 120,
};

test('coordenador cria pedido de novo perímetro', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);

    const { status, corpo } = await pedir(s.baseUrl, token, NOVO);
    assert.equal(status, 201);
    assert.equal(corpo.tipo, 'criar');
    assert.equal(corpo.status, 'pendente');
    assert.equal(corpo.nome, 'Filial Centro');
    assert.equal(corpo.raioMetros, 120);

    const lista = await listar(s.baseUrl, token);
    assert.equal(lista.status, 200);
    assert.equal(lista.corpo.pendentes.length, 1);
    assert.equal(lista.corpo.locais.length, 1, 'o local só existe depois da aprovação');
    assert.equal(lista.corpo.locais[0].nome, LOCAL.nome);
});

test('funcionário comum recebe 403 ao pedir perímetro', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'sem-permissao');

    const { status } = await pedir(s.baseUrl, token, NOVO);
    assert.equal(status, 403);

    const lista = await listar(s.baseUrl, token);
    assert.equal(lista.status, 403);
});

test('pedido sem token recebe 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/locais/pedidos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(NOVO),
    });
    assert.equal(resp.status, 401);
});

test('raio fora de 100 a 150 responde 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);

    for (const raioMetros of [99, 151, 0, -10, 'x', undefined]) {
        const { status } = await pedir(s.baseUrl, token, { ...NOVO, raioMetros });
        assert.equal(status, 400, `deveria recusar raio ${raioMetros}`);
    }
});

test('coordenada inválida responde 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);

    for (const corpo of [
        { ...NOVO, latitude: 200 },
        { ...NOVO, longitude: 200 },
        { ...NOVO, latitude: 'abc' },
        { ...NOVO, latitude: undefined },
    ]) {
        const { status } = await pedir(s.baseUrl, token, corpo);
        assert.equal(status, 400, `deveria recusar ${JSON.stringify(corpo)}`);
    }
});

test('nome vazio e tipo inválido respondem 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);

    assert.equal((await pedir(s.baseUrl, token, { ...NOVO, nome: '   ' })).status, 400);
    assert.equal((await pedir(s.baseUrl, token, { ...NOVO, tipo: 'apagar' })).status, 400);
});

test('segundo pedido de criação pendente responde 409', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);

    assert.equal((await pedir(s.baseUrl, token, NOVO)).status, 201);
    assert.equal((await pedir(s.baseUrl, token, { ...NOVO, nome: 'Outra Filial' })).status, 409);
});

test('pedido de edição não altera o local vigente', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);
    const local = s.banco.listarLocais()[0];

    const { status, corpo } = await pedir(s.baseUrl, token, {
        tipo: 'editar',
        localId: local.id,
        nome: 'Sede Renomeada',
        latitude: -23.55,
        longitude: -46.63,
        raioMetros: 100,
    });
    assert.equal(status, 201);
    assert.equal(corpo.status, 'pendente');

    const depois = s.banco.buscarLocal(local.id);
    assert.equal(depois.nome, LOCAL.nome, 'o local vigente continua igual');
    assert.equal(depois.raioMetros, 150);
});

test('pedido de edição de local inexistente responde 404', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);

    const { status } = await pedir(s.baseUrl, token, { ...NOVO, tipo: 'editar', localId: 999 });
    assert.equal(status, 404);
});

test('segundo pedido pendente para o mesmo local responde 409', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);
    const local = s.banco.listarLocais()[0];

    const primeiro = await pedir(s.baseUrl, token, { ...NOVO, tipo: 'editar', localId: local.id });
    assert.equal(primeiro.status, 201);

    const segundo = await pedir(s.baseUrl, token, { ...NOVO, tipo: 'excluir', localId: local.id });
    assert.equal(segundo.status, 409);
});

test('pedido guarda autor e data', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);

    await pedir(s.baseUrl, token, NOVO);

    const [pedido] = s.banco.listarPedidosLocal('pendente');
    const coordenador = s.banco.buscarUsuarioPorLogin('coordenador');
    assert.equal(pedido.solicitadoPor, coordenador.id);
    assert.equal(pedido.solicitanteUsuario, 'coordenador');
    assert.ok(pedido.solicitadoEm);
    assert.ok(!Number.isNaN(Date.parse(pedido.solicitadoEm)));
});

test('empresa não enxerga pedido de outra', async (t) => {
    const s = await iniciarApp({ segundaEmpresa: true });
    t.after(() => s.fechar());
    const token = await logarCoordenador(s);

    await pedir(s.baseUrl, token, NOVO);

    const outra = s.gerenciador.abrir(OUTRA_EMPRESA).banco;
    assert.equal(outra.listarPedidosLocal('pendente').length, 0);

    const lista = await listar(s.baseUrl, token);
    assert.equal(lista.corpo.pendentes.length, 1);
});
