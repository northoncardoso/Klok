import test from 'node:test';
import assert from 'node:assert/strict';

import { MIGRACOES, criarBanco } from '../db.js';

test('migração 7 cria a coluna empresa e grava nos usuários', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    assert.equal(banco.userVersion(), MIGRACOES.length);
    const coluna = banco.db
        .prepare("SELECT name FROM pragma_table_info('usuarios') WHERE name = 'empresa'")
        .get();
    assert.equal(coluna.name, 'empresa');

    const coordenador = banco.criarCoordenador('chefe', 'senha-1234', 'Chefe', 'c@acme.com', '1');
    assert.equal(coordenador.empresa, 'ACME');
    assert.equal(banco.criarUsuarioLocal('ana', 'senha-1234', 'Ana').empresa, 'ACME');
});
