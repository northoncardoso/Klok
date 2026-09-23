import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarApp, logar, MESTRE_SENHA } from './helpers.js';

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

test('registro com usuário duplicado retorna 409', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const corpo = { usuario: 'duplicado', senha: '123456' };
    await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
    });
    const duplicado = await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
    });
    assert.equal(duplicado.status, 409);
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

    const token = await logar(s.baseUrl, 'mestre', MESTRE_SENHA);
    assert.ok(token, 'mestre deve autenticar com a senha semeada');
});

test('rate limit bloqueia login após muitas tentativas', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    let ultimo = 0;
    for (let i = 0; i < 22; i += 1) {
        const resp = await fetch(`${s.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ usuario: 'mestre', senha: 'senha-errada' }),
        });
        ultimo = resp.status;
    }
    assert.equal(ultimo, 429);
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

test('GET /api/auth/eu devolve dados do perfil', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'carla', senha: '123456', nome: 'Carla Dias' }),
    });
    const token = await logar(s.baseUrl, 'carla', '123456');

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resp.status, 200);
    const corpo = await resp.json();
    assert.equal(corpo.nome, 'Carla Dias');
    assert.equal(corpo.usuario, 'carla');
    assert.equal(corpo.hasSenha, true);
    assert.ok(corpo.funcionarioId != null, 'registro local cria funcionário vinculado');
});

test('PUT /api/auth/eu atualiza os dados do usuário', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'duda', senha: '123456', nome: 'Duda' }),
    });
    const token = await logar(s.baseUrl, 'duda', '123456');

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: 'Duda Ferreira', numero: '11999999999', email: 'duda@mail.com' }),
    });
    assert.equal(resp.status, 200);
    const corpo = await resp.json();
    assert.equal(corpo.nome, 'Duda Ferreira');
    assert.equal(corpo.numero, '11999999999');
    assert.equal(corpo.email, 'duda@mail.com');
});

test('mestre também atualiza dados próprios pelo perfil', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logar(s.baseUrl, 'mestre', MESTRE_SENHA);

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: 'Mestre da Empresa', numero: '', email: 'mestre@mail.com' }),
    });
    assert.equal(resp.status, 200);
    const corpo = await resp.json();
    assert.equal(corpo.nome, 'Mestre da Empresa');
    assert.equal(corpo.email, 'mestre@mail.com');
});

test('senha atual incorreta retorna 401 e não altera a senha', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'eva', senha: '123456' }),
    });
    const token = await logar(s.baseUrl, 'eva', '123456');

    const err = await fetch(`${s.baseUrl}/api/auth/senha`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ senhaAtual: 'errada', senhaNova: '654321' }),
    });
    assert.equal(err.status, 401);

    const loginAntigo = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'eva', senha: '123456' }),
    });
    assert.equal(loginAntigo.status, 200, 'senha antiga continua valendo');
});

test('trocar senha funciona e a nova passa a valer', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'fabi', senha: '123456' }),
    });
    const token = await logar(s.baseUrl, 'fabi', '123456');

    const ok = await fetch(`${s.baseUrl}/api/auth/senha`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ senhaAtual: '123456', senhaNova: 'nova-senha-1' }),
    });
    assert.equal(ok.status, 200);

    const antiga = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'fabi', senha: '123456' }),
    });
    assert.equal(antiga.status, 401, 'senha antiga deixa de valer');

    const nova = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'fabi', senha: 'nova-senha-1' }),
    });
    assert.equal(nova.status, 200, 'nova senha passa a valer');
});

test('nova senha igual à atual retorna 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'gabi', senha: '123456' }),
    });
    const token = await logar(s.baseUrl, 'gabi', '123456');

    const resp = await fetch(`${s.baseUrl}/api/auth/senha`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ senhaAtual: '123456', senhaNova: '123456' }),
    });
    assert.equal(resp.status, 400);
});