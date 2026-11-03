import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MIGRACOES } from '../db.js';
import { abrirCatalogo } from '../admin/catalogo.js';
import { criarGerenciador } from '../admin/gerenciador-bancos.js';

function preparar(t) {
    const dir = mkdtempSync(join(tmpdir(), 'klok-emp-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const catalogo = abrirCatalogo(join(dir, 'catalogo.db'));
    t.after(() => catalogo.fechar());
    const g = criarGerenciador({ catalogo, dadosDir: dir });
    t.after(() => g.fechar());
    return { dir, catalogo, g };
}

test('criar empresa cria catálogo e arquivo e permite abrir', (t) => {
    const { dir, g } = preparar(t);
    const criada = g.criarEmpresa({ codigo: 'ACME', nome: 'Acme' });
    assert.equal(criada.codigo, 'ACME');
    assert.ok(existsSync(join(dir, 'ACME.db')));
    assert.equal(g.abrir('ACME').banco.userVersion(), MIGRACOES.length);
});

test('empresa inexistente, desativada e código inválido não abrem', (t) => {
    const { catalogo, g } = preparar(t);
    assert.equal(g.abrir('NADA').status, 404);
    g.criarEmpresa({ codigo: 'ACME', nome: 'Acme' });
    catalogo.atualizarEmpresa('ACME', { ativa: false });
    assert.equal(g.abrir('ACME').status, 403);
    assert.equal(g.criarEmpresa({ codigo: '../X', nome: 'X' }).status, 400);
});

test('não sobrescreve arquivo órfão', (t) => {
    const { dir, g } = preparar(t);
    writeFileSync(join(dir, 'ACME.db'), '');
    assert.equal(g.criarEmpresa({ codigo: 'ACME', nome: 'Acme' }).status, 409);
});
