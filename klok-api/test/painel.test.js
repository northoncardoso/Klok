import { test } from 'node:test';
import assert from 'node:assert/strict';

import { iniciarApp } from './helpers.js';

test('GET /admin serve o painel', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/admin`);
    assert.equal(resp.status, 200);
    const html = await resp.text();
    assert.match(html, /Klok Admin/);
    assert.equal(resp.headers.get('cache-control'), 'no-store');

    assert.equal((await fetch(`${s.baseUrl}/admin/admin.js`)).status, 200);
    assert.equal((await fetch(`${s.baseUrl}/admin/admin.css`)).status, 200);
});

test('painel não deixa o token aparecer no HTML', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const html = await (await fetch(`${s.baseUrl}/admin`)).text();
    assert.doesNotMatch(html, /Bearer|token\s*[:=]/i);
});
