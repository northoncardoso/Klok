import { test } from 'node:test';
import assert from 'node:assert/strict';

import { iniciarApp, logar, logarAdmin, pedidoLogin } from './helpers.js';

test('login exige empresa e não aceita empresa errada', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    assert.equal(
        (await pedidoLogin(s.baseUrl, { usuario: 'coordenador', senha: 'senha-coordenador-teste' })).status,
        400
    );
    assert.equal(
        (
            await pedidoLogin(s.baseUrl, {
                empresa: 'OUTRA',
                usuario: 'coordenador',
                senha: 'senha-coordenador-teste',
            })
        ).status,
        401
    );
    assert.equal(
        (
            await pedidoLogin(s.baseUrl, {
                empresa: 'teste',
                usuario: 'coordenador',
                senha: 'senha-coordenador-teste',
            })
        ).status,
        200
    );
});

test('token da empresa A não abre dados da empresa B', async (t) => {
    const s = await iniciarApp({ segundaEmpresa: true });
    t.after(() => s.fechar());
    const tokenA = await logar(s.baseUrl, 'coordenador', 'senha-coordenador-teste', 'TESTE');
    const resp = await fetch(`${s.baseUrl}/api/funcionarios`, {
        headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(resp.status, 200);
    assert.equal((await resp.json()).length, 0);

    const tokenB = await logar(s.baseUrl, 'coordenador', 'senha-coordenador-teste', 'OUTRA');
    const listaB = await (
        await fetch(`${s.baseUrl}/api/funcionarios`, {
            headers: { authorization: `Bearer ${tokenB}` },
        })
    ).json();
    assert.equal(listaB.length, 0);
});

test('token de admin não entra em rota de empresa', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const resp = await fetch(`${s.baseUrl}/api/funcionarios`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resp.status, 401);
});

test('empresa desativada bloqueia login mesmo com banco no cache', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    s.catalogo.atualizarEmpresa('TESTE', { ativa: false });
    assert.equal(
        (
            await pedidoLogin(s.baseUrl, {
                empresa: 'TESTE',
                usuario: 'coordenador',
                senha: 'senha-coordenador-teste',
            })
        ).status,
        401
    );
});
