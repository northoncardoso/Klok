import test from 'node:test';
import assert from 'node:assert/strict';

import { abrirCatalogo } from '../admin/catalogo.js';
import { criarAdminComRespostas } from '../admin/criar-admin.js';

test('cria admin a partir das respostas', () => {
    const c = abrirCatalogo(':memory:');
    const r = criarAdminComRespostas({
        catalogo: c,
        respostas: { usuario: 'root', senha: 'senha-forte', nome: 'Root', email: 'root@klok.app' },
    });
    assert.equal(r.criado, true);
    assert.ok(c.verificarSenhaAdmin('root', 'senha-forte'));
});

test('redefinir troca a senha e incrementa a versao', () => {
    const c = abrirCatalogo(':memory:');
    criarAdminComRespostas({
        catalogo: c,
        respostas: { usuario: 'root', senha: 'senha-forte', nome: 'Root', email: 'root@klok.app' },
    });
    const antes = c.buscarAdminPorLogin('root').senhaVersao;
    criarAdminComRespostas({
        catalogo: c,
        respostas: { usuario: 'root', senha: 'senha-nova', nome: 'Root', email: 'root@klok.app' },
        redefinir: true,
    });
    assert.equal(c.buscarAdminPorLogin('root').senhaVersao, antes + 1);
    assert.ok(c.verificarSenhaAdmin('root', 'senha-nova'));
});
