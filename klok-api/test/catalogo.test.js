import test from 'node:test';
import assert from 'node:assert/strict';

import { abrirCatalogo } from '../admin/catalogo.js';

test('cria admin e confere a senha', () => {
    const c = abrirCatalogo(':memory:');
    const admin = c.criarAdmin({ usuario: 'root', senha: 'senha-forte', nome: 'Root', email: 'root@klok.app' });
    assert.equal(admin.usuario, 'root');
    assert.ok(c.verificarSenhaAdmin('root', 'senha-forte'));
    assert.equal(c.verificarSenhaAdmin('root', 'errada'), null);
});

test('recusa admin repetido', () => {
    const c = abrirCatalogo(':memory:');
    c.criarAdmin({ usuario: 'root', senha: 'senha-forte', nome: 'Root', email: 'root@klok.app' });
    assert.equal(
        c.criarAdmin({ usuario: 'root', senha: 'outra', nome: 'Root', email: 'root@klok.app' }).erro,
        'Este usuário de admin já existe'
    );
});

test('cria, busca, lista e desativa empresa', () => {
    const c = abrirCatalogo(':memory:');
    assert.deepEqual(c.criarEmpresa({ codigo: 'ACME', nome: 'Acme Ltda' }).codigo, 'ACME');
    assert.equal(c.buscarEmpresa('ACME').nome, 'Acme Ltda');
    assert.equal(c.listarEmpresas().length, 1);
    c.atualizarEmpresa('ACME', { ativa: false });
    assert.ok(c.buscarEmpresa('ACME').desativadaEm);
    c.atualizarEmpresa('ACME', { ativa: true });
    assert.equal(c.buscarEmpresa('ACME').desativadaEm, null);
});

test('recusa código inválido e repetido', () => {
    const c = abrirCatalogo(':memory:');
    assert.equal(c.criarEmpresa({ codigo: 'acme', nome: 'X' }).status, 400);
    assert.equal(c.criarEmpresa({ codigo: '../X', nome: 'X' }).status, 400);
    c.criarEmpresa({ codigo: 'ACME', nome: 'X' });
    assert.equal(c.criarEmpresa({ codigo: 'ACME', nome: 'Y' }).status, 409);
});
