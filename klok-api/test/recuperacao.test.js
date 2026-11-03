import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { iniciarApp, logar, EMPRESA } from './helpers.js';

function hashDoToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

function tokenDoLink(urlApp) {
    return new URL(urlApp).searchParams.get('token');
}

test('recuperação envia link e redefinir senha funciona', async (t) => {
    const emailsEnviados = [];
    const s = await iniciarApp({
        enviarEmail: async ({ para, url, urlApp }) => emailsEnviados.push({ para, url, urlApp }),
    });
    t.after(() => s.fechar());

    s.banco.criarUsuarioLocal('lia', '123456', 'Lia Sousa');
    const token = await logar(s.baseUrl, 'lia', '123456');
    await fetch(`${s.baseUrl}/api/auth/eu`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: 'Lia Sousa', numero: '', email: 'lia@mail.com' }),
    });

    const resp = await fetch(`${s.baseUrl}/api/auth/esqueci-senha`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, email: 'LIA@mail.com' }),
    });
    assert.equal(resp.status, 200);
    assert.equal(emailsEnviados.length, 1);
    assert.equal(emailsEnviados[0].para, 'lia@mail.com');
    assert.ok(
        emailsEnviados[0].url.startsWith('http://localhost:3000/redefinir-senha/TESTE/'),
        'email leva para a página de confirmação da empresa'
    );
    assert.ok(
        emailsEnviados[0].urlApp.startsWith('klok://redefinir-senha?empresa=TESTE&token='),
        'link do app usa o esquema klok e leva a empresa'
    );
    const tokenReset = tokenDoLink(emailsEnviados[0].urlApp);

    const pagina = await fetch(`${s.baseUrl}/redefinir-senha/${EMPRESA}/${tokenReset}`);
    assert.equal(pagina.status, 200);
    const html = await pagina.text();
    assert.match(html, /Abrir o app Klok/);
    assert.match(html, new RegExp(`klok://redefinir-senha\\?empresa=TESTE&token=${tokenReset}`));

    const reset = await fetch(`${s.baseUrl}/api/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, token: tokenReset, novaSenha: 'nova-senha-lia' }),
    });
    assert.equal(reset.status, 200);

    const antiga = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, usuario: 'lia', senha: '123456' }),
    });
    assert.equal(antiga.status, 401, 'senha antiga deixa de valer');

    const nova = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, usuario: 'lia', senha: 'nova-senha-lia' }),
    });
    assert.equal(nova.status, 200, 'nova senha passa a valer');
});

test('email desconhecido não revela a existência e não envia link', async (t) => {
    const emailsEnviados = [];
    const s = await iniciarApp({
        enviarEmail: async ({ para, url }) => emailsEnviados.push({ para, url }),
    });
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/esqueci-senha`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, email: 'ninguem@mail.com' }),
    });
    assert.equal(resp.status, 200);
    const corpo = await resp.json();
    assert.match(corpo.mensagem, /cadastrado/i);
    assert.equal(emailsEnviados.length, 0);
    assert.equal(corpo.linkRedefinicao, undefined);
});

test('link só pode ser usado uma vez', async (t) => {
    const emailsEnviados = [];
    const s = await iniciarApp({
        enviarEmail: async ({ urlApp }) => emailsEnviados.push(urlApp),
    });
    t.after(() => s.fechar());

    s.banco.criarUsuarioLocal('mila', '123456', 'Mila');
    const token = await logar(s.baseUrl, 'mila', '123456');
    await fetch(`${s.baseUrl}/api/auth/eu`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: 'Mila', numero: '', email: 'mila@mail.com' }),
    });
    await fetch(`${s.baseUrl}/api/auth/esqueci-senha`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, email: 'mila@mail.com' }),
    });
    const tokenReset = tokenDoLink(emailsEnviados[0]);

    const primeira = await fetch(`${s.baseUrl}/api/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, token: tokenReset, novaSenha: 'abc12345' }),
    });
    assert.equal(primeira.status, 200);

    const segunda = await fetch(`${s.baseUrl}/api/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, token: tokenReset, novaSenha: 'outra-senha' }),
    });
    assert.equal(segunda.status, 400);
});

test('token inválido retorna 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const pagina = await fetch(`${s.baseUrl}/redefinir-senha/${EMPRESA}/token-inventado`);
    assert.equal(pagina.status, 200);
    assert.match(await pagina.text(), /Link inválido ou expirado/);

    const resp = await fetch(`${s.baseUrl}/api/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, token: 'token-inventado', novaSenha: '12345' }),
    });
    assert.equal(resp.status, 400);
});

test('link expirado retorna 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    s.banco.criarUsuarioLocal('nina', '123456', 'Nina');
    const usuario = s.banco.buscarUsuarioPorLogin('nina');
    const tok = 'token-expirado-teste';
    s.banco.criarRecuperacao(usuario.id, hashDoToken(tok), new Date(Date.now() - 1000).toISOString());

    const resp = await fetch(`${s.baseUrl}/api/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, token: tok, novaSenha: '12345' }),
    });
    assert.equal(resp.status, 400);
    assert.match((await resp.json()).erro, /expirado/i);
});
