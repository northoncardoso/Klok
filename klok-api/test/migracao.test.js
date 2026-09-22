import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { criarBanco, MIGRACOES } from '../db.js';

process.env.SENHA_MESTRE ??= 'senha-mestre-teste';

test('criarBanco aplica migrações e marca a versão atual', () => {
    const banco = criarBanco(':memory:');

    assert.equal(banco.userVersion(), MIGRACOES.length);
    assert.ok(banco.buscarUsuarioPorLogin('mestre'), 'mestre deve ser semeado após migrar');
    banco.db.close();
});

test('banco legado migra sem perder dados', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klok-migra-'));
    const caminho = join(dir, 'klok.db');
    const bruto = new DatabaseSync(caminho);
    bruto.exec(MIGRACOES[0].sql);
    bruto.exec("INSERT INTO funcionarios (nome) VALUES ('Sobrevivente')");
    bruto.close();

    const banco = criarBanco(caminho);
    assert.equal(banco.userVersion(), MIGRACOES.length, 'user_version deve subir para a versão atual');
    assert.ok(
        banco.listarFuncionarios().some((f) => f.nome === 'Sobrevivente'),
        'dados existentes devem ser preservados'
    );
    banco.db.close();
    rmSync(dir, { recursive: true, force: true });
});