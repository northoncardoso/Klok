import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { criarBanco } from '../db.js';
import { iniciarApp, logarAdmin } from './helpers.js';

async function preparar(t) {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logarAdmin(s.baseUrl, 'root', 'senha-admin-teste');
    return { s, cabecalhos: { authorization: `Bearer ${token}` } };
}

test('backup baixa arquivo SQLite legível', async (t) => {
    const { s, cabecalhos } = await preparar(t);
    const funcionarioId = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.baterPonto(funcionarioId, 'entrada');

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/backup`, { headers: cabecalhos });
    assert.equal(resp.status, 200);
    assert.match(resp.headers.get('content-disposition'), /klok-TESTE-\d{4}-\d{2}-\d{2}\.db/);
    const bytes = Buffer.from(await resp.arrayBuffer());
    assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\u0000');

    const dir = mkdtempSync(join(tmpdir(), 'klok-backup-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const caminho = join(dir, 'backup.db');
    writeFileSync(caminho, bytes);
    const copia = criarBanco(caminho, { empresa: 'TESTE' });
    t.after(() => copia.db.close());
    assert.equal(copia.listarFuncionarios().length, 1);
    assert.equal(copia.listarTodosPontos().length, 1);
});

test('restaura backup e recusa arquivo inválido', async (t) => {
    const { s, cabecalhos } = await preparar(t);
    const funcionarioId = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.baterPonto(funcionarioId, 'entrada');

    const backup = Buffer.from(
        await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/backup`, { headers: cabecalhos })).arrayBuffer()
    );

    s.banco.apagarFuncionario(funcionarioId);
    assert.equal(s.banco.listarFuncionarios().length, 0);

    const restaurado = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/restaurar`, {
        method: 'POST',
        headers: {
            ...cabecalhos,
            'content-type': 'application/octet-stream',
            'x-confirmar-codigo': 'TESTE',
        },
        body: backup,
    });
    assert.equal(restaurado.status, 200);
    assert.equal(s.gerenciador.abrir('TESTE').banco.listarFuncionarios().length, 1);

    const invalido = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/restaurar`, {
        method: 'POST',
        headers: {
            ...cabecalhos,
            'content-type': 'application/octet-stream',
            'x-confirmar-codigo': 'TESTE',
        },
        body: Buffer.from('não é sqlite'),
    });
    assert.equal(invalido.status, 400);
    assert.equal(s.gerenciador.abrir('TESTE').banco.listarFuncionarios().length, 1);

    const semConfirmacao = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/restaurar`, {
        method: 'POST',
        headers: { ...cabecalhos, 'content-type': 'application/octet-stream' },
        body: backup,
    });
    assert.equal(semConfirmacao.status, 400);
});

test('backup e restauração funcionam em empresa desativada', async (t) => {
    const { s, cabecalhos } = await preparar(t);
    s.catalogo.atualizarEmpresa('TESTE', { ativa: false });

    const backup = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/backup`, { headers: cabecalhos });
    assert.equal(backup.status, 200);

    const bytes = Buffer.from(await backup.arrayBuffer());
    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/restaurar`, {
        method: 'POST',
        headers: {
            ...cabecalhos,
            'content-type': 'application/octet-stream',
            'x-confirmar-codigo': 'TESTE',
        },
        body: bytes,
    });
    assert.equal(resp.status, 200);
});

test('falha na troca do arquivo mantém o banco anterior no lugar', async (t) => {
    const { s, cabecalhos } = await preparar(t);
    const funcionarioId = s.banco.criarFuncionario('Ana', '1', 'ana@teste.com');
    s.banco.baterPonto(funcionarioId, 'entrada');
    const backup = Buffer.from(
        await (await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/backup`, { headers: cabecalhos })).arrayBuffer()
    );

    // Injeta a falha exatamente na janela perigosa: depois de fechar a conexão
    // e antes de o arquivo novo ocupar o lugar. Com um diretório no caminho do
    // -wal, a limpeza dos auxiliares estoura e o rename nunca acontece.
    const caminho = s.gerenciador.caminhoDe('TESTE');
    unlinkSync(`${caminho}-wal`);
    mkdirSync(`${caminho}-wal`);

    const resp = await fetch(`${s.baseUrl}/api/admin/empresas/TESTE/banco/restaurar`, {
        method: 'POST',
        headers: {
            ...cabecalhos,
            'content-type': 'application/octet-stream',
            'x-confirmar-codigo': 'TESTE',
        },
        body: backup,
    });
    assert.equal(resp.status, 500);
    assert.match((await resp.json()).erro, /anterior foi mantido/);

    // Nenhum arquivo temporário ficou para trás e o banco anterior continua
    // guardado, além de seguir no lugar original com os dados.
    const arquivos = readdirSync(s.dadosDir);
    assert.deepEqual(arquivos.filter((nome) => nome.includes('.restaurando-')), []);
    assert.equal(arquivos.filter((nome) => nome.includes('.antes-de-restaurar-')).length, 1);

    rmSync(`${caminho}-wal`, { recursive: true, force: true });
    const depois = criarBanco(caminho, { empresa: 'TESTE' });
    t.after(() => depois.db.close());
    assert.equal(depois.listarFuncionarios().length, 1);
    assert.equal(depois.listarTodosPontos().length, 1);
});
