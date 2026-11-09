import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { criarBanco } from '../db.js';

function preparar(t) {
    const dir = mkdtempSync(join(tmpdir(), 'klok-db-'));
    const banco = criarBanco(join(dir, 'TESTE.db'), { empresa: 'TESTE' });
    t.after(() => {
        banco.db.close();
        rmSync(dir, { recursive: true, force: true });
    });
    return banco;
}

test('resumo conta só o banco da empresa', (t) => {
    const banco = preparar(t);
    banco.criarCoordenador('chefe', 'senha-1234', 'Chefe', 'chefe@teste.com', '1');
    const funcionarioId = banco.criarFuncionario('Ana', '2', 'ana@teste.com');
    banco.baterPonto(funcionarioId, 'entrada');
    banco.baterPonto(funcionarioId, 'saida');
    banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });

    const r = banco.resumo();
    assert.equal(r.funcionarios, 1);
    assert.equal(r.coordenadores, 1);
    assert.equal(r.pontos, 2);
    assert.equal(r.solicitacoesPendentes, 1);
    assert.ok(r.ultimoPonto);
});

test('lista pontos com filtro, limite e página', (t) => {
    const banco = preparar(t);
    const ana = banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    const bia = banco.criarFuncionario('Bia', '2', 'bia@teste.com');
    for (let i = 0; i < 5; i += 1) banco.baterPonto(ana, 'entrada');
    banco.baterPonto(bia, 'entrada');

    const pagina1 = banco.listarPontosFiltrados({ limite: 2, pagina: 1 });
    assert.equal(pagina1.pontos.length, 2);
    assert.equal(pagina1.total, 6);

    const daAna = banco.listarPontosFiltrados({ funcionarioId: ana, limite: 10 });
    assert.equal(daAna.total, 5);

    assert.equal(banco.contarPontosFiltrados({ funcionarioId: bia }), 1);
});

test('filtro de data usa o dia de Brasília, não UTC', (t) => {
    const banco = preparar(t);
    const ana = banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    // 02:00 UTC do dia 9 ainda é 23:00 do dia 8 em Brasília.
    banco.db.prepare(
        'INSERT INTO pontos (funcionarioId, dataHora, tipo) VALUES (?, ?, ?)'
    ).run(ana, '2026-11-09T02:00:00.000Z', 'entrada');

    assert.equal(banco.contarPontosFiltrados({ de: '2026-11-08', ate: '2026-11-08' }), 1);
    assert.equal(banco.contarPontosFiltrados({ de: '2026-11-09', ate: '2026-11-09' }), 0);
});

test('lista solicitações paginadas e busca usuário por funcionário', (t) => {
    const banco = preparar(t);
    const usuario = banco.criarUsuarioLocal('ana', 'senha-1234', 'Ana');
    banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });
    banco.criarSolicitacao({ usuario: 'caio', nome: 'Caio', email: 'caio@teste.com' });

    const pagina = banco.listarSolicitacoesPaginado({ limite: 1, pagina: 2 });
    assert.equal(pagina.solicitacoes.length, 1);
    assert.equal(pagina.total, 2);
    assert.equal(banco.buscarUsuarioPorFuncionarioId(usuario.funcionarioId).usuario, 'ana');
});
