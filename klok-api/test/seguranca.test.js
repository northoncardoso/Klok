import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { criarBanco } from '../db.js';
import { criarApp } from '../app.js';
import { iniciarApp, logar } from './helpers.js';

test('criarBanco falha sem SENHA_MESTRE em banco novo', () => {
    const antes = process.env.SENHA_MESTRE;
    delete process.env.SENHA_MESTRE;
    try {
        assert.throws(() => criarBanco(':memory:'), /SENHA_MESTRE/);
    } finally {
        process.env.SENHA_MESTRE = antes;
    }
});

test('criarApp falha sem JWT_SECRET', () => {
    const banco = criarBanco(':memory:');
    const antes = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
        assert.throws(() => criarApp({ banco }), /JWT_SECRET/);
    } finally {
        process.env.JWT_SECRET = antes;
    }
});

test('senha é armazenada com salt e timestamping seguro não quebra login', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const reg = await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario: 'comsalt', senha: 'minha-senha-1' }),
    });
    assert.equal(reg.status, 201);

    const guardado = s.banco.db
        .prepare('SELECT senhaHash FROM usuarios WHERE usuario = ?')
        .get('comsalt');
    assert.ok(guardado.senhaHash.startsWith('scrypt$'), 'hash deve usar salt');
    assert.notEqual(guardado.senhaHash, createHash('sha256').update('minha-senha-1').digest('hex'));

    const token = await logar(s.baseUrl, 'comsalt', 'minha-senha-1');
    assert.ok(token, 'login deve funcionar com o hash com salt');
});

test('login com hash legado sha256 migra para hash com salt', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const hashAntigo = createHash('sha256').update('senha-velha').digest('hex');
    s.banco.db.prepare(
        'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId) VALUES (?, ?, ?, NULL)'
    ).run('legado', hashAntigo, 'funcionario');

    const token = await logar(s.baseUrl, 'legado', 'senha-velha');
    assert.ok(token, 'usuário legado deve autenticar');

    const depois = s.banco.db
        .prepare('SELECT senhaHash FROM usuarios WHERE usuario = ?')
        .get('legado');
    assert.ok(depois.senhaHash.startsWith('scrypt$'), 'hash deve ser atualizado no login');
});