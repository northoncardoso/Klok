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
    // TODO tarefa 4: o login de pedido pendente passa a responder 403 e esta asserção vira 403.
    assert.equal((await pedidoLogin(s.baseUrl, { empresa: EMPRESA, usuario: 'ana', senha: '1234' })).status, 401);
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
