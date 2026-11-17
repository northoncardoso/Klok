import { test } from 'node:test';
import assert from 'node:assert/strict';

import { criarBanco } from '../db.js';

test('criar coordenador cria o funcionário e vincula', () => {
    const banco = criarBanco(':memory:');
    const criado = banco.criarCoordenador('chefe', 'senha123', 'Chefe', 'chefe@teste.com', '1199');

    assert.ok(criado.funcionarioId, 'coordenador nasce com funcionarioId');
    const funcionario = banco.buscarFuncionario(Number(criado.funcionarioId));
    assert.equal(funcionario.nome, 'Chefe');
    assert.equal(funcionario.numero, '1199');
    assert.equal(funcionario.email, 'chefe@teste.com');
    banco.db.close();
});

test('criar coordenador com usuário repetido não deixa funcionário órfão', () => {
    const banco = criarBanco(':memory:');
    banco.criarCoordenador('chefe', 'senha123', 'Chefe', 'chefe@teste.com', '1199');
    const antes = banco.listarFuncionarios().length;

    assert.throws(() => banco.criarCoordenador('chefe', 'outra', 'Outro', 'outro@teste.com', ''));

    assert.equal(
        banco.listarFuncionarios().length,
        antes,
        'rollback não pode deixar funcionário sem usuário'
    );
    banco.db.close();
});
