import { test } from 'node:test';
import assert from 'node:assert/strict';

import { iniciarApp, logar, logarAdmin } from './helpers.js';

test('admin loga e cria empresa com primeiro coordenador', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');

    const criada = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ codigo: 'acme', nome: 'Acme' }),
    });
    assert.equal(criada.status, 201);
    assert.equal((await criada.json()).codigo, 'ACME');

    const coordenador = await fetch(`${s.baseUrl}/api/admin/empresas/ACME/coordenador`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
            usuario: 'chefe',
            senha: 'senha-1234',
            nome: 'Chefe',
            email: 'chefe@acme.com',
            numero: '1',
        }),
    });
    assert.equal(coordenador.status, 201);
    assert.ok(await logar(s.baseUrl, 'chefe', 'senha-1234', 'ACME'));
});

test('token de empresa não acessa admin e admin não acessa empresa', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenEmpresa = await logar(s.baseUrl, 'coordenador', 'senha-coordenador-teste', 'TESTE');
    const tokenAdmin = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    assert.equal(
        (
            await fetch(`${s.baseUrl}/api/admin/empresas`, {
                headers: { authorization: `Bearer ${tokenEmpresa}` },
            })
        ).status,
        401
    );
    assert.equal(
        (
            await fetch(`${s.baseUrl}/api/funcionarios`, {
                headers: { authorization: `Bearer ${tokenAdmin}` },
            })
        ).status,
        401
    );
});

test('admin lista, renomeia e desativa empresa', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const cabecalhos = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

    const lista = await (await fetch(`${s.baseUrl}/api/admin/empresas`, { headers: cabecalhos })).json();
    assert.ok(lista.some((e) => e.codigo === 'TESTE'));

    const renomeada = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE`, {
        method: 'PATCH',
        headers: cabecalhos,
        body: JSON.stringify({ nome: 'Teste Renomeada' }),
    });
    assert.equal(renomeada.status, 200);
    assert.equal((await renomeada.json()).nome, 'Teste Renomeada');

    const desativada = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE`, {
        method: 'PATCH',
        headers: cabecalhos,
        body: JSON.stringify({ ativa: false }),
    });
    assert.ok((await desativada.json()).desativadaEm);
});

test('admin recusa empresa repetida, código inválido e empresa inexistente', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const cabecalhos = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

    const repetida = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify({ codigo: 'TESTE', nome: 'Outra' }),
    });
    assert.equal(repetida.status, 409);

    const invalida = await fetch(`${s.baseUrl}/api/admin/empresas`, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify({ codigo: '../X', nome: 'X' }),
    });
    assert.equal(invalida.status, 400);

    const inexistente = await fetch(`${s.baseUrl}/api/admin/empresas/NADA`, {
        method: 'PATCH',
        headers: cabecalhos,
        body: JSON.stringify({ nome: 'X' }),
    });
    assert.equal(inexistente.status, 404);
});

test('admin sem token e com senha errada não entra', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    assert.equal((await fetch(`${s.baseUrl}/api/admin/empresas`)).status, 401);

    const errada = await fetch(`${s.baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'root', senha: 'senha-errada' }),
    });
    assert.equal(errada.status, 401);
});

test('admin cria coordenador em empresa inexistente e não duplica usuário', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const cabecalhos = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    const corpo = {
        usuario: 'chefe',
        senha: 'senha-1234',
        nome: 'Chefe',
        email: 'chefe@teste.com',
        numero: '1',
    };

    const semEmpresa = await fetch(`${s.baseUrl}/api/admin/empresas/NADA/coordenador`, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify(corpo),
    });
    assert.equal(semEmpresa.status, 404);

    const primeira = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenador`, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify(corpo),
    });
    assert.equal(primeira.status, 201);

    const repetida = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenador`, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify(corpo),
    });
    assert.equal(repetida.status, 409);
});
