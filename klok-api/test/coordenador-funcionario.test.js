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

test('apagar funcionário de coordenador é recusado e não apaga nada', () => {
    const banco = criarBanco(':memory:');
    const chefe = banco.criarCoordenador('chefe', 'senha123', 'Chefe', 'chefe@teste.com', '1199');
    const funcionarioId = Number(chefe.funcionarioId);
    banco.baterPonto(funcionarioId, 'batida');

    const resultado = banco.apagarFuncionario(funcionarioId);

    assert.equal(resultado.apagou, false);
    assert.equal(resultado.motivo, 'coordenador');
    assert.ok(banco.buscarFuncionario(funcionarioId), 'o funcionário do coordenador continua');
    assert.ok(banco.buscarUsuarioPorLogin('chefe'), 'a conta do coordenador continua');
    assert.equal(banco.listarPontos(funcionarioId).length, 1, 'os pontos continuam');
    banco.db.close();
});

test('apagar funcionário comum continua apagando pontos e usuário', () => {
    const banco = criarBanco(':memory:');
    const funcionarioId = banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    banco.baterPonto(funcionarioId, 'batida');

    const resultado = banco.apagarFuncionario(funcionarioId);

    assert.equal(resultado.apagou, true);
    assert.equal(resultado.motivo, null);
    assert.equal(banco.buscarFuncionario(funcionarioId), undefined);
    assert.equal(banco.buscarUsuarioPorFuncionarioId(funcionarioId), undefined);
    banco.db.close();
});

test('editar funcionário de coordenador mantém usuarios e funcionarios iguais', () => {
    const banco = criarBanco(':memory:');
    const chefe = banco.criarCoordenador('chefe', 'senha123', 'Chefe', 'chefe@teste.com', '1199');
    const funcionarioId = Number(chefe.funcionarioId);

    banco.atualizarFuncionario(funcionarioId, 'Chefe Novo', '1188', 'novo@teste.com');

    const usuario = banco.buscarUsuarioPorLogin('chefe');
    assert.equal(usuario.nome, 'Chefe Novo');
    assert.equal(usuario.numero, '1188');
    assert.equal(usuario.email, 'novo@teste.com');
    const funcionario = banco.buscarFuncionario(funcionarioId);
    assert.equal(funcionario.nome, 'Chefe Novo');
    assert.equal(funcionario.numero, '1188');
    banco.db.close();
});
