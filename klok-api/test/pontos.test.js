import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarApp, logar, MESTRE_SENHA } from './helpers.js';

async function criarFuncionarioLogado(s, usuario) {
    await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario, senha: '123456', nome: usuario }),
    });
    return logar(s.baseUrl, usuario, '123456');
}

test('bater ponto sem token retorna 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: 'batida' }),
    });
    assert.equal(resp.status, 401);
});

test('funcionario bate ponto e vê o próprio histórico', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await criarFuncionarioLogado(s, 'ponto1');

    const bater = await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: 'batida' }),
    });
    assert.equal(bater.status, 201);
    const ponto = await bater.json();
    assert.equal(ponto.tipo, 'batida');

    const meus = await fetch(`${s.baseUrl}/api/pontos/meus`, {
        headers: { authorization: `Bearer ${token}` },
    });
    const historico = await meus.json();
    assert.equal(historico.length, 1);
    assert.equal(historico[0].id, ponto.id);
});

test('mestre vê pontos de todos com nome do funcionario', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const tokenFunc = await criarFuncionarioLogado(s, 'ponto2');
    const tokenMestre = await logar(s.baseUrl, 'mestre', MESTRE_SENHA);

    await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFunc}` },
        body: JSON.stringify({ tipo: 'batida' }),
    });

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        headers: { authorization: `Bearer ${tokenMestre}` },
    });
    assert.equal(resp.status, 200);
    const todos = await resp.json();
    assert.ok(todos.length >= 1);
    assert.ok(todos.some((p) => p.funcionarioNome === 'ponto2'));
});

test('mestre sem funcionário vinculado não consegue bater ponto', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logar(s.baseUrl, 'mestre', MESTRE_SENHA);

    const resp = await fetch(`${s.baseUrl}/api/pontos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: 'batida' }),
    });
    assert.equal(resp.status, 400);
});