import { test } from 'node:test';
import assert from 'node:assert/strict';

import { criarBanco } from '../db.js';

const SEDE = {
    nome: 'Sede',
    latitude: -23.5505,
    longitude: -46.6333,
    raioMetros: 150,
};

test('criarLocal grava os dados e listarLocais devolve apenas ativos', () => {
    const banco = criarBanco(':memory:');
    const local = banco.criarLocal(SEDE);

    assert.ok(local.id);
    assert.equal(local.nome, 'Sede');
    assert.equal(local.latitude, SEDE.latitude);
    assert.equal(local.raioMetros, 150);
    assert.ok(local.criadoEm, 'o local precisa de criadoEm');

    assert.deepEqual(banco.listarLocais().map((l) => l.id), [local.id]);
    banco.db.close();
});

test('removerLocal faz exclusão lógica e reduz a contagem de ativos', () => {
    const banco = criarBanco(':memory:');
    const local = banco.criarLocal(SEDE);

    banco.removerLocal(local.id);

    assert.equal(banco.listarLocais().length, 0, 'local removido sai da listagem');
    assert.equal(banco.contarLocaisAtivos(), 0);
    const linha = banco.buscarLocal(local.id);
    assert.ok(linha, 'a linha continua existindo para preservar o histórico');
    assert.ok(linha.removidoEm, 'a exclusão precisa ser registrada');
    banco.db.close();
});

test('pedido de local guarda autor e pode ser decidido', () => {
    const banco = criarBanco(':memory:');
    const coordenador = banco.criarCoordenador('chefe', 'senha-1234', 'Chefe', 'chefe@teste.com', '1');

    const pedido = banco.criarPedidoLocal({
        ...SEDE,
        tipo: 'criar',
        localId: null,
        solicitadoPor: coordenador.id,
    });

    assert.ok(pedido.id);
    assert.equal(pedido.status, 'pendente');
    assert.equal(pedido.solicitadoPor, coordenador.id);
    assert.ok(pedido.solicitadoEm);

    const pendentes = banco.listarPedidosLocal('pendente');
    assert.equal(pendentes.length, 1);
    assert.equal(pendentes[0].solicitanteUsuario, 'chefe');

    const decidido = banco.decidirPedidoLocal(pedido.id, {
        status: 'recusado',
        decididoPor: 'root',
        motivoRecusa: 'Raio incorreto',
    });
    assert.equal(decidido.status, 'recusado');
    assert.equal(decidido.decididoPor, 'root');
    assert.equal(decidido.motivoRecusa, 'Raio incorreto');
    assert.equal(banco.listarPedidosLocal('pendente').length, 0);
    banco.db.close();
});

test('pedido pendente é detectado por local e por criação', () => {
    const banco = criarBanco(':memory:');
    const coordenador = banco.criarCoordenador('chefe', 'senha-1234', 'Chefe', 'chefe@teste.com', '1');
    const local = banco.criarLocal(SEDE);

    assert.equal(banco.existePedidoCriacaoPendente(), false);
    banco.criarPedidoLocal({
        ...SEDE,
        nome: 'Filial',
        tipo: 'criar',
        localId: null,
        solicitadoPor: coordenador.id,
    });
    assert.equal(banco.existePedidoCriacaoPendente(), true);

    assert.equal(banco.existePedidoPendenteParaLocal(local.id), false);
    banco.criarPedidoLocal({
        ...SEDE,
        tipo: 'editar',
        localId: local.id,
        solicitadoPor: coordenador.id,
    });
    assert.equal(banco.existePedidoPendenteParaLocal(local.id), true);
    banco.db.close();
});

test('emTransacao reverte o que foi gravado quando a função lança', () => {
    const banco = criarBanco(':memory:');

    assert.throws(() =>
        banco.emTransacao(() => {
            banco.criarLocal(SEDE);
            throw new Error('falhou de propósito');
        })
    );

    assert.equal(banco.listarLocais().length, 0, 'o local não pode ficar gravado');
    banco.db.close();
});
