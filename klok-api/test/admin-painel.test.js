import { test } from 'node:test';
import assert from 'node:assert/strict';

import { campoCsv, dataIso, inteiroPositivo, paginacao } from '../admin/validacao-painel.js';
import { iniciarApp, logarAdmin } from './helpers.js';

test('valida inteiro, data e paginação', () => {
    assert.equal(inteiroPositivo('7', 1), 7);
    assert.equal(inteiroPositivo('abc', 1), null);
    assert.equal(inteiroPositivo('0', 1), null);
    assert.equal(dataIso('2026-11-09'), '2026-11-09');
    assert.equal(dataIso('09/11/2026'), null);
    assert.equal(dataIso('2026-02-31'), null, 'dia inexistente não pode virar 3 de março');
    assert.equal(dataIso('2026-02-29'), null, '2026 não é bissexto');
    assert.equal(dataIso('2024-02-29'), '2024-02-29');
    assert.equal(dataIso('2026-13-01'), null);
    assert.deepEqual(paginacao({}), { limite: 200, pagina: 1 });
    assert.deepEqual(paginacao({ limite: '10', pagina: '2' }), { limite: 10, pagina: 2 });
    assert.equal(paginacao({ limite: '201' }).erro, 'Limite deve estar entre 1 e 200');
});

test('escapa campo de CSV', () => {
    assert.equal(campoCsv('Ana'), 'Ana');
    assert.equal(campoCsv('Ana;Lima'), '"Ana;Lima"');
    assert.equal(campoCsv('diz "oi"'), '"diz ""oi"""');
    assert.equal(campoCsv('linha\nquebrada'), '"linha\nquebrada"');
});

async function prepararPainel(t) {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const cabecalhos = { authorization: `Bearer ${token}` };
    return { s, token, cabecalhos };
}

test('resumo, coordenadores, funcionários e banco por empresa', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const funcionarioId = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.baterPonto(funcionarioId, 'entrada');
    s.banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });

    const resumo = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/resumo`, { headers: cabecalhos })).json();
    assert.equal(resumo.funcionarios, 1);
    assert.equal(resumo.coordenadores, 1);
    assert.equal(resumo.pontos, 1);
    assert.equal(resumo.solicitacoesPendentes, 1);

    const coordenadores = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenadores`, { headers: cabecalhos })).json();
    assert.equal(coordenadores.length, 1);
    assert.equal(coordenadores[0].senhaHash, undefined);

    const funcionarios = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios`, { headers: cabecalhos })).json();
    assert.equal(funcionarios[0].nome, 'Ana');

    const banco = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco`, { headers: cabecalhos })).json();
    assert.ok(banco.versao >= 1);
    assert.ok(banco.tamanhoBytes > 0);
});

test('pontos pagina, filtra e recusa filtro inválido', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const ana = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    for (let i = 0; i < 3; i += 1) s.banco.baterPonto(ana, 'entrada');

    const pagina = await (await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/pontos?limite=2&pagina=1&funcionarioId=${ana}`,
        { headers: cabecalhos }
    )).json();
    assert.equal(pagina.pontos.length, 2);
    assert.equal(pagina.total, 3);
    assert.equal(pagina.paginas, 2);

    const invalido = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/pontos?de=09/11/2026`, { headers: cabecalhos });
    assert.equal(invalido.status, 400);
});

test('solicitações lista por status e recusa status desconhecido', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    s.banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });

    const lista = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes`, { headers: cabecalhos })).json();
    assert.equal(lista.solicitacoes.length, 1);

    const invalido = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes?status=outro`, { headers: cabecalhos });
    assert.equal(invalido.status, 400);
});

test('painel lê resumo de empresa desativada', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    s.catalogo.atualizarEmpresa('TESTE', { ativa: false });

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/resumo`, { headers: cabecalhos });
    assert.equal(resp.status, 200);
    assert.ok((await resp.json()).desativadaEm);
});

test('rotas novas exigem token de admin', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const rotas = [
        '/api/admin/empresas/TESTE/resumo',
        '/api/admin/empresas/TESTE/coordenadores',
        '/api/admin/empresas/TESTE/funcionarios',
        '/api/admin/empresas/TESTE/pontos',
        '/api/admin/empresas/TESTE/solicitacoes',
        '/api/admin/empresas/TESTE/banco',
    ];
    for (const rota of rotas) {
        assert.equal((await fetch(`${s.baseUrl}${rota}`)).status, 401, rota);
    }
});
