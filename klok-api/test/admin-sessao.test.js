import { test } from 'node:test';
import assert from 'node:assert/strict';

import { iniciarApp } from './helpers.js';

async function loginComCookies(baseUrl) {
    const resp = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'root', senha: 'senha-admin-teste' }),
    });
    assert.equal(resp.status, 200);
    const cookies = resp.headers.getSetCookie();
    const sessao = cookies.find((c) => c.startsWith('klok_admin=')).split(';')[0];
    const csrf = cookies.find((c) => c.startsWith('klok_csrf=')).split(';')[0];
    return { cookies, sessao, csrf, csrfValor: csrf.split('=')[1] };
}

test('login cria cookie httpOnly e csrf legível', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const { cookies } = await loginComCookies(s.baseUrl);

    const sessao = cookies.find((c) => c.startsWith('klok_admin='));
    assert.match(sessao, /HttpOnly/);
    assert.match(sessao, /SameSite=Strict/);
    assert.match(sessao, /Path=\/api\/admin/);

    const csrf = cookies.find((c) => c.startsWith('klok_csrf='));
    assert.doesNotMatch(csrf, /HttpOnly/);
    assert.match(csrf, /SameSite=Strict/);
});

test('cookie sem CSRF dá 403, com CSRF funciona e Bearer segue sem CSRF', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const { sessao, csrf, csrfValor } = await loginComCookies(s.baseUrl);

    const sem = await fetch(`${s.baseUrl}/api/admin/empresas`, { headers: { cookie: sessao } });
    assert.equal(sem.status, 403);

    const errado = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        headers: { cookie: `${sessao}; ${csrf}`, 'x-csrf-token': 'errado' },
    });
    assert.equal(errado.status, 403);

    const certo = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        headers: { cookie: `${sessao}; ${csrf}`, 'x-csrf-token': csrfValor },
    });
    assert.equal(certo.status, 200);

    const bearer = await fetch(`${s.baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'root', senha: 'senha-admin-teste' }),
    });
    const token = (await bearer.json()).token;
    const comBearer = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(comBearer.status, 200);
});

test('logout limpa os cookies', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const { sessao, csrf, csrfValor } = await loginComCookies(s.baseUrl);

    const resp = await fetch(`${s.baseUrl}/api/admin/logout`, {
        method: 'POST',
        headers: { cookie: `${sessao}; ${csrf}`, 'x-csrf-token': csrfValor },
    });
    assert.equal(resp.status, 204);
    const limpos = resp.headers.getSetCookie();
    assert.ok(limpos.some((c) => c.startsWith('klok_admin=;')));
    assert.ok(limpos.some((c) => c.startsWith('klok_csrf=;')));
});

test('cookie inválido dá 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const resp = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        headers: { cookie: 'klok_admin=invalido' },
    });
    assert.equal(resp.status, 401);
});

test('rotas de escrita exigem sessão', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const rotas = [
        ['POST', '/api/admin/empresas/TESTE/coordenadores/1/senha'],
        ['POST', '/api/admin/empresas/TESTE/coordenadores/1/impersonar'],
        ['PATCH', '/api/admin/empresas/TESTE/funcionarios/1'],
        ['DELETE', '/api/admin/empresas/TESTE/funcionarios/1'],
        ['POST', '/api/admin/empresas/TESTE/solicitacoes/1/aprovar'],
        ['POST', '/api/admin/empresas/TESTE/solicitacoes/1/recusar'],
        ['POST', '/api/admin/empresas/TESTE/banco/restaurar'],
        ['DELETE', '/api/admin/empresas/TESTE'],
        ['POST', '/api/admin/logout'],
    ];
    for (const [metodo, rota] of rotas) {
        assert.equal((await fetch(`${s.baseUrl}${rota}`, { method: metodo })).status, 401, rota);
    }
});
