import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco } from '../db.js';

function novoSolicitacao(banco, dados = {}) {
    return banco.criarSolicitacao({
        usuario: 'ana',
        senhaHash: banco.criarHashSenha('1234'),
        nome: 'Ana',
        email: 'ana@teste.com',
        numero: '',
        googleId: null,
        ...dados,
    });
}

test('criarSolicitacao devolve pendente e sem senhaHash', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    assert.equal(pedido.status, 'pendente');
    assert.equal(pedido.senhaHash, undefined);
    assert.equal(banco.contarSolicitacoesPendentes(), 1);
    for (const linha of banco.listarSolicitacoes()) {
        assert.equal(linha.senhaHash, undefined, 'listagem não pode vazar senhaHash');
    }
    assert.equal(banco.buscarSolicitacaoPorUsuario('ana').senhaHash, undefined);
    assert.equal(banco.buscarSolicitacaoPorGoogleId('g-1'), undefined);
    banco.db.close();
});

test('criarSolicitacao barra nome repetido e pedido recusado também reserva', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    assert.equal(novoSolicitacao(banco).status, 409);
    banco.recusarSolicitacao(pedido.id);
    assert.equal(novoSolicitacao(banco).status, 409);
    banco.db.close();
});

test('criarSolicitacao exige usuário ou googleId', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const r = banco.criarSolicitacao({ usuario: null, senhaHash: null, nome: 'X', email: 'x@x.com', numero: '', googleId: null });
    assert.equal(r.status, 400);
    banco.db.close();
});

test('validarSenhaSolicitacao confere a senha do pedido', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    novoSolicitacao(banco);
    assert.equal(banco.validarSenhaSolicitacao('ana', 'errada'), null);
    assert.equal(banco.validarSenhaSolicitacao('ana', '1234').status, 'pendente');
    assert.equal(banco.validarSenhaSolicitacao('ana', '1234').senhaHash, undefined);
    banco.db.close();
});

test('aprovarSolicitacao cria funcionário e usuário com a empresa', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    const r = banco.aprovarSolicitacao(pedido.id);
    assert.equal(r.funcionario.nome, 'Ana');
    assert.equal(r.usuario.usuario, 'ana');
    assert.equal(r.usuario.empresa, 'ACME');
    assert.equal(r.usuario.tipo, 'funcionario');
    assert.equal(r.usuario.senhaHash, undefined);
    assert.ok(banco.buscarUsuarioPorLogin('ana'));
    assert.ok(banco.validarSenha('ana', '1234'), 'senha do pedido vale no usuário aprovado');
    assert.equal(banco.buscarSolicitacaoPorId(pedido.id).status, 'aprovado');
    banco.db.close();
});

test('aprovarSolicitacao recusa pedido já decidido e nome tomado', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    banco.criarUsuarioLocal('ana', 'outra-senha', 'Ana');
    const r = banco.aprovarSolicitacao(pedido.id);
    assert.equal(r.status, 409);
    assert.equal(banco.buscarSolicitacaoPorId(pedido.id).status, 'pendente');
    banco.db.close();
});

test('aprovarSolicitacao aceita pedido do Google sem senha', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco, { usuario: null, senhaHash: null, googleId: 'g-1' });
    const r = banco.aprovarSolicitacao(pedido.id);
    assert.equal(r.usuario.googleId, 'g-1');
    assert.equal(r.usuario.senhaHash, undefined);
    banco.db.close();
});

test('recusarSolicitacao grava decisão e mantém no histórico', () => {
    const banco = criarBanco(':memory:', { empresa: 'ACME' });
    const pedido = novoSolicitacao(banco);
    assert.equal(banco.recusarSolicitacao(pedido.id).solicitacao.status, 'recusado');
    assert.ok(banco.buscarSolicitacaoPorId(pedido.id).decididoEm);
    assert.equal(banco.recusarSolicitacao(pedido.id).status, 409);
    assert.equal(banco.recusarSolicitacao(999).status, 404);
    banco.db.close();
});
