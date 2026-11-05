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
    const login = await pedidoLogin(s.baseUrl, { empresa: EMPRESA, usuario: 'ana', senha: '1234' });
    assert.equal(login.status, 403);
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

test('aprovação de conta Google avisa e libera o login Google', async (t) => {
    const emails = [];
    const s = await iniciarApp({
        clienteGoogle: googleFake({ sub: 'g-3', name: 'Gabi Google', email: 'gabi@gmail.com' }),
        enviarEmail: async (m) => emails.push(m),
    });
    t.after(() => s.fechar());

    await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, idToken: 'token-google' }),
    });
    const token = await logar(s.baseUrl, COORDENADOR.usuario, COORDENADOR_SENHA);
    const lista = await (await fetch(`${s.baseUrl}/api/solicitacoes`, {
        headers: { authorization: `Bearer ${token}` },
    })).json();
    assert.equal((await decidir(s.baseUrl, token, lista[0].id, 'aprovar')).status, 201);

    const aprovacao = emails.find((m) => m.assunto === 'Klok: seu cadastro foi aprovado');
    assert.match(aprovacao.texto, /Entrar com Google/);

    const login = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, idToken: 'token-google' }),
    });
    assert.equal(login.status, 200);
    assert.ok((await login.json()).token);
});
