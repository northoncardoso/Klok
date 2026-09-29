import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { criarBanco, MIGRACOES } from '../db.js';

test('criarBanco aplica migrações e marca a versão atual', () => {
    const banco = criarBanco(':memory:');

    assert.equal(banco.userVersion(), MIGRACOES.length);
    assert.equal(banco.existeMestre(), false, 'nenhum mestre é semeado no boot');
    banco.db.close();
});

test('banco legado migra sem perder dados', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klok-migra-'));
    const caminho = join(dir, 'klok.db');
    const bruto = new DatabaseSync(caminho);
    bruto.exec(MIGRACOES[0].sql);
    bruto.exec("INSERT INTO funcionarios (nome) VALUES ('Sobrevivente')");
    bruto.exec(
        "INSERT INTO usuarios (usuario, senhaHash, tipo) VALUES ('antigo', 'hash', 'funcionario')"
    );
    bruto.close();

    const banco = criarBanco(caminho);
    assert.equal(banco.userVersion(), MIGRACOES.length, 'user_version deve subir para a versão atual');
    assert.ok(
        banco.listarFuncionarios().some((f) => f.nome === 'Sobrevivente'),
        'dados existentes devem ser preservados'
    );
    const antigo = banco.buscarUsuarioPorLogin('antigo');
    assert.ok(antigo, 'usuário pré-migração deve continuar existindo');
    assert.equal(
        Number(antigo.senhaVersao),
        0,
        'usuário migrado começa na versão 0 de senha, para não invalidar a sessão dele'
    );
    banco.db.close();
    rmSync(dir, { recursive: true, force: true });
});

test('cada migração nova é aplicada em ordem e sem pular versão', () => {
    const versoes = MIGRACOES.map((m) => m.versao);
    assert.deepEqual(
        versoes,
        [...versoes].sort((a, b) => a - b),
        'as migrações precisam estar em ordem crescente'
    );
    assert.equal(new Set(versoes).size, versoes.length, 'não pode haver versão repetida');
    assert.equal(versoes[0], 1, 'a primeira migração é a versão 1');
    for (let i = 1; i < versoes.length; i += 1) {
        assert.equal(
            versoes[i],
            versoes[i - 1] + 1,
            `faltou a versão ${versoes[i - 1] + 1} entre ${versoes[i - 1]} e ${versoes[i]}`
        );
    }
});

test('atualizar senha incrementa a versão e mantém a sessão antiga revogada', () => {
    const banco = criarBanco(':memory:');
    banco.criarMestre('chefe', 'senha-1234', 'Chefe', 'chefe@teste.com', '1');
    const antes = banco.buscarUsuarioPorLogin('chefe');
    assert.equal(Number(antes.senhaVersao), 0);

    banco.atualizarSenha(antes.id, banco.criarHashSenha('outra-senha-9'));
    const depois = banco.buscarUsuarioPorLogin('chefe');
    assert.equal(Number(depois.senhaVersao), 1, 'a versão precisa subir a cada troca');

    banco.atualizarSenha(antes.id, banco.criarHashSenha('terceira-senha-8'));
    assert.equal(Number(banco.buscarUsuarioPorLogin('chefe').senhaVersao), 2);
    assert.ok(banco.validarSenha('terceira-senha-8', depois.senhaHash) === null, 'o hash antigo não vale mais');
    banco.db.close();
});