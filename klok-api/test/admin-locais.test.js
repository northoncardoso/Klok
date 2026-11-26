import { test } from 'node:test';
import assert from 'node:assert/strict';

import { iniciarApp, logar, logarAdmin, COORDENADOR_SENHA, EMPRESA, LOCAL } from './helpers.js';

const NOVO = {
    tipo: 'criar',
    nome: 'Filial Centro',
    latitude: -23.5489,
    longitude: -46.6388,
    raioMetros: 120,
};

async function logarCoordenador(s) {
    return logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);
}

async function pedir(baseUrl, token, corpo) {
    const resp = await fetch(`${baseUrl}/api/locais/pedidos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(corpo),
    });
    return { status: resp.status, corpo: await resp.json().catch(() => null) };
}

async function adminGet(s, token, caminho) {
    const resp = await fetch(`${s.baseUrl}${caminho}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    return { status: resp.status, corpo: await resp.json().catch(() => null) };
}

async function adminPost(s, token, caminho, corpo = {}) {
    const resp = await fetch(`${s.baseUrl}${caminho}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(corpo),
    });
    return { status: resp.status, corpo: await resp.json().catch(() => null) };
}

function caminhoPedidos(id = '') {
    return `/api/admin/empresas/${EMPRESA}/locais/pedidos${id === '' ? '' : `/${id}`}`;
}

test('admin lista os pedidos de perímetro da empresa', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenCoordenador = await logarCoordenador(s);
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    await pedir(s.baseUrl, tokenCoordenador, NOVO);

    const { status, corpo } = await adminGet(s, tokenAdmin, caminhoPedidos());
    assert.equal(status, 200);
    assert.equal(corpo.length, 1);
    assert.equal(corpo[0].nome, 'Filial Centro');
    assert.equal(corpo[0].tipo, 'criar');
    assert.equal(corpo[0].solicitanteUsuario, 'coordenador');
});

test('aprovação de criação aplica o local', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenCoordenador = await logarCoordenador(s);
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const { corpo: pedido } = await pedir(s.baseUrl, tokenCoordenador, NOVO);

    const { status } = await adminPost(s, tokenAdmin, `${caminhoPedidos(pedido.id)}/aprovar`);
    assert.equal(status, 200);

    const nomes = s.banco.listarLocais().map((l) => l.nome);
    assert.deepEqual(nomes, [LOCAL.nome, 'Filial Centro']);
    assert.equal(s.banco.buscarPedidoLocal(pedido.id).status, 'aprovado');
    assert.equal(s.banco.buscarPedidoLocal(pedido.id).decididoPor, 'root');
});

test('aprovação de edição altera o local vigente', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenCoordenador = await logarCoordenador(s);
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const local = s.banco.listarLocais()[0];
    const { corpo: pedido } = await pedir(s.baseUrl, tokenCoordenador, {
        tipo: 'editar',
        localId: local.id,
        nome: 'Sede Nova',
        latitude: -23.55,
        longitude: -46.63,
        raioMetros: 100,
    });

    const { status } = await adminPost(s, tokenAdmin, `${caminhoPedidos(pedido.id)}/aprovar`);
    assert.equal(status, 200);

    const depois = s.banco.buscarLocal(local.id);
    assert.equal(depois.nome, 'Sede Nova');
    assert.equal(depois.raioMetros, 100);
    assert.ok(depois.atualizadoEm);
});

test('aprovação de exclusão remove o local', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenCoordenador = await logarCoordenador(s);
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    s.banco.criarLocal({ nome: 'Filial', latitude: -23.6, longitude: -46.7, raioMetros: 150 });
    const filial = s.banco.listarLocais().find((l) => l.nome === 'Filial');
    const { corpo: pedido } = await pedir(s.baseUrl, tokenCoordenador, {
        tipo: 'excluir',
        localId: filial.id,
        nome: 'Filial',
        latitude: -23.6,
        longitude: -46.7,
        raioMetros: 150,
    });

    const { status } = await adminPost(s, tokenAdmin, `${caminhoPedidos(pedido.id)}/aprovar`);
    assert.equal(status, 200);

    assert.deepEqual(s.banco.listarLocais().map((l) => l.nome), [LOCAL.nome]);
    assert.ok(s.banco.buscarLocal(filial.id).removidoEm);
});

test('exclusão do último local responde 409', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenCoordenador = await logarCoordenador(s);
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const local = s.banco.listarLocais()[0];
    const { corpo: pedido } = await pedir(s.baseUrl, tokenCoordenador, {
        tipo: 'excluir',
        localId: local.id,
        nome: local.nome,
        latitude: local.latitude,
        longitude: local.longitude,
        raioMetros: local.raioMetros,
    });

    const { status, corpo } = await adminPost(s, tokenAdmin, `${caminhoPedidos(pedido.id)}/aprovar`);
    assert.equal(status, 409);
    assert.ok(corpo.erro);
    assert.equal(s.banco.listarLocais().length, 1, 'o local continua ativo');
    assert.equal(s.banco.buscarPedidoLocal(pedido.id).status, 'pendente');
});

test('recusa guarda motivo e não altera o local', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenCoordenador = await logarCoordenador(s);
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const local = s.banco.listarLocais()[0];
    const { corpo: pedido } = await pedir(s.baseUrl, tokenCoordenador, {
        tipo: 'editar',
        localId: local.id,
        nome: 'Sede Errada',
        latitude: -23.55,
        longitude: -46.63,
        raioMetros: 100,
    });

    const { status } = await adminPost(s, tokenAdmin, `${caminhoPedidos(pedido.id)}/recusar`, {
        motivo: 'Raio muito pequeno para a portaria',
    });
    assert.equal(status, 200);

    const decidido = s.banco.buscarPedidoLocal(pedido.id);
    assert.equal(decidido.status, 'recusado');
    assert.equal(decidido.motivoRecusa, 'Raio muito pequeno para a portaria');
    assert.equal(s.banco.buscarLocal(local.id).nome, LOCAL.nome);
});

test('pedido já decidido responde 409', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenCoordenador = await logarCoordenador(s);
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const { corpo: pedido } = await pedir(s.baseUrl, tokenCoordenador, NOVO);

    assert.equal((await adminPost(s, tokenAdmin, `${caminhoPedidos(pedido.id)}/aprovar`)).status, 200);
    assert.equal((await adminPost(s, tokenAdmin, `${caminhoPedidos(pedido.id)}/aprovar`)).status, 409);
    assert.equal((await adminPost(s, tokenAdmin, `${caminhoPedidos(pedido.id)}/recusar`)).status, 409);
});

test('pedido inexistente responde 404', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');

    assert.equal((await adminPost(s, tokenAdmin, `${caminhoPedidos(999)}/aprovar`)).status, 404);
    assert.equal((await adminPost(s, tokenAdmin, `${caminhoPedidos(999)}/recusar`)).status, 404);
});

test('aprovação recusa raio fora da faixa mesmo gravado no pedido', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenCoordenador = await logarCoordenador(s);
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const { corpo: pedido } = await pedir(s.baseUrl, tokenCoordenador, NOVO);
    // Simula pedido gravado por versão antiga ou alteração direta no banco.
    s.banco.db.prepare('UPDATE pedidos_local SET raioMetros = 900 WHERE id = ?').run(pedido.id);

    const { status } = await adminPost(s, tokenAdmin, `${caminhoPedidos(pedido.id)}/aprovar`);
    assert.equal(status, 400);
    assert.equal(s.banco.buscarPedidoLocal(pedido.id).status, 'pendente');
});

test('token de empresa não acessa a aprovação de perímetros', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenCoordenador = await logarCoordenador(s);

    const { status } = await adminGet(s, tokenCoordenador, caminhoPedidos());
    assert.equal(status, 401);
});

test('listagem de pontos do painel traz local e situação', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    s.banco.criarUsuarioLocal('painel', '123456', 'Painel');
    const tokenFunc = await logar(s.baseUrl, 'painel', '123456');
    await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFunc}` },
        body: JSON.stringify({
            tipo: 'batida',
            latitude: LOCAL.latitude,
            longitude: LOCAL.longitude,
            precisaoMetros: 5,
        }),
    });

    const { status, corpo } = await adminGet(s, tokenAdmin, `/api/admin/empresas/${EMPRESA}/pontos`);
    assert.equal(status, 200);
    const ponto = corpo.pontos[0];
    assert.equal(ponto.localNome, LOCAL.nome);
    assert.equal(ponto.dentroPerimetro, 1);
    assert.equal(ponto.distanciaMetros, 0);
    assert.equal(ponto.precisaoMetros, 5);
});

test('CSV de pontos traz as colunas de local e situação', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    s.banco.criarUsuarioLocal('painel-csv', '123456', 'Painel CSV');
    const tokenFunc = await logar(s.baseUrl, 'painel-csv', '123456');
    await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFunc}` },
        body: JSON.stringify({
            tipo: 'batida',
            latitude: LOCAL.latitude,
            longitude: LOCAL.longitude,
            precisaoMetros: 5,
        }),
    });

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/${EMPRESA}/pontos.csv`, {
        headers: { authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resp.status, 200);
    const texto = (await resp.text()).replace(/^\uFEFF/, '');
    const [cabecalho, linha] = texto.trim().split('\r\n');
    assert.equal(cabecalho, 'id;funcionario;dataHora;tipo;local;dentroPerimetro;distanciaMetros;precisaoMetros');
    assert.ok(linha.includes(LOCAL.nome));
    assert.ok(linha.endsWith(';1;0;5'), `linha recebida: ${linha}`);
});
