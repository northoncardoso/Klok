import { test } from 'node:test';
import assert from 'node:assert/strict';

import { iniciarApp, pedidoLogin, EMPRESA, COORDENADOR } from './helpers.js';

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
