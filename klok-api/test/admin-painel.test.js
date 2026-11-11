import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';

import { campoCsv, dataIso, inteiroPositivo, paginacao } from '../admin/validacao-painel.js';
import { iniciarApp, logar, logarAdmin } from './helpers.js';

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

async function prepararPainel(t, opcoes = {}) {
    const registros = [];
    const s = await iniciarApp({ ...opcoes, registrar: (linha) => registros.push(linha) });
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const cabecalhos = { authorization: `Bearer ${token}` };
    return { s, token, cabecalhos, registros };
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

    for (const consulta of ['limite=0', 'funcionarioId=abc']) {
        const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/pontos?${consulta}`, { headers: cabecalhos });
        assert.equal(resp.status, 400, consulta);
    }
});

test('empresa inexistente devolve 404', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/NADA/resumo`, { headers: cabecalhos });
    assert.equal(resp.status, 404);
});

test('código de empresa em minúsculas funciona nas rotas de leitura', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    s.gerenciador.criarEmpresa({ codigo: 'ACME', nome: 'Acme' });

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/acme/resumo`, { headers: cabecalhos });
    assert.equal(resp.status, 200);
    assert.equal((await resp.json()).codigo, 'ACME');
});

test('solicitações lista por status e recusa status desconhecido', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    s.banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });

    const lista = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes`, { headers: cabecalhos })).json();
    assert.equal(lista.solicitacoes.length, 1);

    const vazio = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes?status=`, { headers: cabecalhos });
    assert.equal(vazio.status, 200, 'status vazio cai no padrão pendente');
    assert.equal((await vazio.json()).solicitacoes.length, 1);

    const invalido = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes?status=outro`, { headers: cabecalhos });
    assert.equal(invalido.status, 400);
});

test('aprova solicitação pelo painel e avisa por email', async (t) => {
    const emails = [];
    const s = await iniciarApp({ enviarEmail: async (dados) => emails.push(dados) });
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const cabecalhos = { authorization: `Bearer ${token}` };
    const pedido = s.banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });

    const resposta = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes/${pedido.id}/aprovar`, {
        method: 'POST',
        headers: cabecalhos,
    });
    assert.equal(resposta.status, 201);
    const criado = await resposta.json();
    assert.equal(criado.nome, 'Bia');
    assert.equal(s.banco.buscarUsuarioPorLogin('bia').usuario, 'bia');
    assert.equal(emails.length, 1);

    const deNovo = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes/${pedido.id}/aprovar`, {
        method: 'POST',
        headers: cabecalhos,
    });
    assert.equal(deNovo.status, 409);
    assert.equal(emails.length, 1, 'segunda aprovação não pode avisar de novo');
});

test('aprova solicitação de empresa desativada', async (t) => {
    const emails = [];
    const s = await iniciarApp({ enviarEmail: async (dados) => emails.push(dados) });
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    const cabecalhos = { authorization: `Bearer ${token}` };
    const pedido = s.banco.criarSolicitacao({ usuario: 'caio', nome: 'Caio', email: 'caio@teste.com' });
    s.catalogo.atualizarEmpresa('TESTE', { ativa: false });

    const resposta = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes/${pedido.id}/aprovar`, {
        method: 'POST',
        headers: cabecalhos,
    });
    assert.equal(resposta.status, 201, 'suporte precisa decidir pedido de empresa desativada');
    assert.equal(emails.length, 1);
    assert.equal(s.banco.buscarUsuarioPorLogin('caio').usuario, 'caio');
});

test('recusa solicitação pelo painel', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const pedido = s.banco.criarSolicitacao({ usuario: 'bia', nome: 'Bia', email: 'bia@teste.com' });
    const resposta = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/solicitacoes/${pedido.id}/recusar`, {
        method: 'POST',
        headers: cabecalhos,
    });
    assert.equal(resposta.status, 200);
    assert.equal(s.banco.buscarSolicitacaoPorId(pedido.id).status, 'recusado');
});

test('painel lê resumo de empresa desativada', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.catalogo.atualizarEmpresa('TESTE', { ativa: false });

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/resumo`, { headers: cabecalhos });
    assert.equal(resp.status, 200);
    assert.ok((await resp.json()).desativadaEm);

    const funcionarios = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios`, {
        headers: cabecalhos,
    });
    assert.equal(funcionarios.status, 200);
    assert.equal((await funcionarios.json())[0].nome, 'Ana');
});

test('banco ausente no disco devolve 404 e não é recriado', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const caminho = s.gerenciador.caminhoDe('TESTE');
    for (const sufixo of ['', '-wal', '-shm']) rmSync(caminho + sufixo, { force: true });

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco`, { headers: cabecalhos });
    assert.equal(resp.status, 404);
    assert.equal(existsSync(caminho), false);

    // Empresa que ainda não está no cache: aqui a abertura é que barra a criação.
    s.gerenciador.criarEmpresa({ codigo: 'SUMIDA', nome: 'Sumida' });
    const outro = s.gerenciador.caminhoDe('SUMIDA');
    for (const sufixo of ['', '-wal', '-shm']) rmSync(outro + sufixo, { force: true });

    const respOutra = await fetch(`${s.baseUrl}/api/admin/empresas/SUMIDA/banco`, { headers: cabecalhos });
    assert.equal(respOutra.status, 404);
    assert.equal(existsSync(outro), false);
});

test('redefine senha de coordenador e invalida token antigo', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const antigo = await logar(s.baseUrl, 'coordenador', 'senha-coordenador-teste', 'TESTE');
    const coordenadores = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenadores`, { headers: cabecalhos })).json();

    const resposta = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${coordenadores[0].id}/senha`,
        {
            method: 'POST',
            headers: { ...cabecalhos, 'content-type': 'application/json' },
            body: JSON.stringify({ senha: 'senha-nova-1234' }),
        }
    );
    assert.equal(resposta.status, 204);
    assert.ok(await logar(s.baseUrl, 'coordenador', 'senha-nova-1234', 'TESTE'));
    assert.equal(
        (await fetch(`${s.baseUrl}/api/funcionarios`, { headers: { authorization: `Bearer ${antigo}` } })).status,
        401
    );
});

test('recusa senha curta e id que não é coordenador', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const usuarioFuncionario = s.banco.criarUsuarioLocal('ana', 'senha-1234', 'Ana');
    const coordenadores = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenadores`, { headers: cabecalhos })).json();

    const curta = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${coordenadores[0].id}/senha`,
        {
            method: 'POST',
            headers: { ...cabecalhos, 'content-type': 'application/json' },
            body: JSON.stringify({ senha: '12' }),
        }
    );
    assert.equal(curta.status, 400);

    const errado = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${usuarioFuncionario.id}/senha`,
        {
            method: 'POST',
            headers: { ...cabecalhos, 'content-type': 'application/json' },
            body: JSON.stringify({ senha: 'senha-1234' }),
        }
    );
    assert.equal(errado.status, 404);
});

test('impersona coordenador e recusa funcionário', async (t) => {
    const { s, cabecalhos, registros } = await prepararPainel(t);
    const usuarioFuncionario = s.banco.criarUsuarioLocal('ana', 'senha-1234', 'Ana');
    const coordenadores = await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/coordenadores`, { headers: cabecalhos })).json();

    const resposta = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${coordenadores[0].id}/impersonar`,
        { method: 'POST', headers: cabecalhos }
    );
    assert.equal(resposta.status, 200);
    const { token, empresa, tipo } = await resposta.json();
    assert.equal(empresa, 'TESTE');
    assert.equal(tipo, 'coordenador');
    assert.equal(registros.length, 1);
    assert.match(registros[0], /admin root impersonou coordenador na empresa TESTE/);
    assert.equal(
        (await fetch(`${s.baseUrl}/api/funcionarios`, { headers: { authorization: `Bearer ${token}` } })).status,
        200
    );

    const errado = await fetch(
        `${s.baseUrl}/api/admin/empresas/TESTE/coordenadores/${usuarioFuncionario.id}/impersonar`,
        { method: 'POST', headers: cabecalhos }
    );
    assert.equal(errado.status, 404);
});

test('edita funcionário nas duas tabelas e apaga', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const funcionarioId = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.db.prepare(
        "INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, empresa) VALUES (?, ?, 'funcionario', ?, 'TESTE')"
    ).run('ana', s.banco.criarHashSenha('senha-1234'), funcionarioId);
    s.banco.baterPonto(funcionarioId, 'entrada');

    const editado = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios/${funcionarioId}`, {
        method: 'PATCH',
        headers: { ...cabecalhos, 'content-type': 'application/json' },
        body: JSON.stringify({ nome: 'Ana Lima', numero: '2', email: 'ana.lima@teste.com' }),
    });
    assert.equal(editado.status, 200);
    assert.equal((await editado.json()).nome, 'Ana Lima');
    const usuario = s.banco.buscarUsuarioPorFuncionarioId(funcionarioId);
    assert.equal(usuario.nome, 'Ana Lima');

    const apagado = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios/${funcionarioId}`, {
        method: 'DELETE',
        headers: cabecalhos,
    });
    assert.equal(apagado.status, 204);
    assert.equal(s.banco.buscarFuncionario(funcionarioId), undefined);
    assert.equal(s.banco.buscarUsuarioPorFuncionarioId(funcionarioId), undefined);
});

test('edita e apaga recusam funcionário inexistente', async (t) => {
    const { s, cabecalhos } = await prepararPainel(t);
    const editar = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios/999`, {
        method: 'PATCH',
        headers: { ...cabecalhos, 'content-type': 'application/json' },
        body: JSON.stringify({ nome: 'Nada' }),
    });
    assert.equal(editar.status, 404);
    assert.equal(
        (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios/999`, { method: 'DELETE', headers: cabecalhos })).status,
        404
    );
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

    for (const rota of [
        '/api/admin/empresas/TESTE/coordenadores/1/senha',
        '/api/admin/empresas/TESTE/coordenadores/1/impersonar',
        '/api/admin/empresas/TESTE/solicitacoes/1/aprovar',
        '/api/admin/empresas/TESTE/solicitacoes/1/recusar',
    ]) {
        assert.equal((await fetch(`${s.baseUrl}${rota}`, { method: 'POST' })).status, 401, rota);
    }

    for (const metodo of ['PATCH', 'DELETE']) {
        assert.equal(
            (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/funcionarios/1`, { method: metodo })).status,
            401,
            metodo
        );
    }
});
