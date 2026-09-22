import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarApp, logar } from './helpers.js';

test('registro de usuário e login local devolvem token', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const reg = await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'ana', senha: '123456', nome: 'Ana Silva' }),
    });
    assert.equal(reg.status, 201);

    const login = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'ana', senha: '123456' }),
    });
    assert.equal(login.status, 200);
    const corpo = await login.json();
    assert.ok(corpo.token, 'token deve estar presente');
    assert.equal(corpo.tipo, 'funcionario');
});

test('registro sem usuário ou senha retorna 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: '', senha: '' }),
    });
    assert.equal(resp.status, 400);
});

test('login com senha errada retorna 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'mestre', senha: 'senha-errada' }),
    });
    assert.equal(resp.status, 401);
});

test('login do mestre devolve token e tipo mestre', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const token = await logar(s.baseUrl, 'mestre', '1234');
    assert.ok(token, 'mestre deve autenticar com a senha semeada');
});

test('GET /api/auth/eu sem token retorna 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`);
    assert.equal(resp.status, 401);
});

test('GET /api/auth/eu com token retorna dados do usuário', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'bia', senha: '123456' }),
    });
    const token = await logar(s.baseUrl, 'bia', '123456');

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resp.status, 200);
    const corpo = await resp.json();
    assert.equal(corpo.usuario, 'bia');
    assert.equal(corpo.tipo, 'funcionario');
});

test('login com Google cria usuário e reutiliza em login seguinte', async (t) => {
    const clienteGoogle = {
        verifyIdToken: async () => ({
            getPayload: () => ({ sub: 'g123', name: 'Ana Google', email: 'ana@gmail.com' }),
        }),
    };
    const s = await iniciarApp({ clienteGoogle });
    t.after(() => s.fechar());

    const primeira = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: 'token-fake' }),
    });
    assert.equal(primeira.status, 200);
    const corpo1 = await primeira.json();
    assert.ok(corpo1.token);
    assert.equal(corpo1.tipo, 'funcionario');
    assert.equal(corpo1.nome, 'Ana Google');

    const segunda = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: 'token-fake' }),
    });
    assert.equal(segunda.status, 200);
    const corpo2 = await segunda.json();
    assert.equal(corpo2.id, corpo1.id, 'mesmo googleId não deve duplicar usuário');
});

test('login Google sem idToken retorna 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(resp.status, 400);
});