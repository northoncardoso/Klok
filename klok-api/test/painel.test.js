import { test } from 'node:test';
import assert from 'node:assert/strict';

import { iniciarApp } from './helpers.js';

test('GET /admin serve o painel', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/admin`);
    assert.equal(resp.status, 200);
    const html = await resp.text();
    assert.match(html, /Klok Admin/);
    assert.equal(resp.headers.get('cache-control'), 'no-store');

    assert.equal((await fetch(`${s.baseUrl}/admin/admin.js`)).status, 200);
    assert.equal((await fetch(`${s.baseUrl}/admin/admin.css`)).status, 200);
});

test('painel não deixa o token aparecer no HTML', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const html = await (await fetch(`${s.baseUrl}/admin`)).text();
    assert.doesNotMatch(html, /Bearer|token\s*[:=]/i);
});

test('painel tem as seções de suporte', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const html = await (await fetch(`${s.baseUrl}/admin`)).text();
    for (const id of [
        'seletor-empresa',
        'resumo-funcionarios',
        'resumo-coordenadores',
        'resumo-pontos',
        'resumo-pendentes',
        'resumo-ultimo-ponto',
        'tabela-coordenadores',
        'tabela-funcionarios',
        'tabela-pontos',
        'tabela-solicitacoes',
        'banco-versao',
        'banco-tamanho',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
});

test('painel tem as ações de suporte', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const js = await (await fetch(`${s.baseUrl}/admin/admin.js`)).text();
    for (const nome of [
        'redefinirSenha',
        'impersonar',
        'editarFuncionario',
        'apagarFuncionario',
        'aprovarSolicitacao',
        'recusarSolicitacao',
        'baixarBackup',
        'restaurarBackup',
        'apagarEmpresa',
        'baixarCsv',
    ]) {
        assert.match(js, new RegExp(nome));
    }
});

test('painel tem os botões de suporte', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const html = await (await fetch(`${s.baseUrl}/admin`)).text();
    for (const id of [
        'botao-backup',
        'botao-restaurar',
        'arquivo-restaurar',
        'botao-csv-funcionarios',
        'botao-csv-pontos',
        'botao-apagar-empresa',
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
});
