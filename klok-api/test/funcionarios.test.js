import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarApp, logar } from './helpers.js';

async function registrarFuncionario(s, usuario) {
    await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario, senha: '123456', nome: 'Funcionario Teste' }),
    });
    return logar(s.baseUrl, usuario, '123456');
}

test('listar funcionários sem token retorna 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/funcionarios`);
    assert.equal(resp.status, 401);
});

test('listar funcionários como funcionario retorna 403', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await registrarFuncionario(s, 'func1');

    const resp = await fetch(`${s.baseUrl}/api/funcionarios`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resp.status, 403);
});

test('mestre cria, lista, edita e apaga funcionário', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logar(s.baseUrl, 'mestre', '1234');

    const criar = await fetch(`${s.baseUrl}/api/funcionarios`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: 'Joao', numero: '119999', email: 'joao@teste.com' }),
    });
    assert.equal(criar.status, 201);
    const criado = await criar.json();
    assert.equal(criado.nome, 'Joao');

    const lista = await fetch(`${s.baseUrl}/api/funcionarios`, {
        headers: { authorization: `Bearer ${token}` },
    });
    const todos = await lista.json();
    assert.ok(todos.some((f) => f.id === criado.id));

    const editar = await fetch(`${s.baseUrl}/api/funcionarios/${criado.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: 'Joao Editado' }),
    });
    assert.equal(editar.status, 200);
    const editado = await editar.json();
    assert.equal(editado.nome, 'Joao Editado');

    const apagar = await fetch(`${s.baseUrl}/api/funcionarios/${criado.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(apagar.status, 204);
});

test('criar funcionário sem nome retorna 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logar(s.baseUrl, 'mestre', '1234');

    const resp = await fetch(`${s.baseUrl}/api/funcionarios`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: '' }),
    });
    assert.equal(resp.status, 400);
});