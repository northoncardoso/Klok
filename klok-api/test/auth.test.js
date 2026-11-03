import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarApp, logar, COORDENADOR, COORDENADOR_SENHA, EMPRESA } from './helpers.js';

function criarFuncionario(s, usuario, senha = '123456', nome = usuario) {
    return s.banco.criarUsuarioLocal(usuario, senha, nome);
}

test('coordenador autenticado cadastra e lista outro coordenador', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logar(s.baseUrl, COORDENADOR.usuario, COORDENADOR_SENHA);

    const resp = await fetch(`${s.baseUrl}/api/coordenadores`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
            usuario: 'coordenador2',
            senha: 'senha-2',
            nome: 'Segundo Coordenador',
            email: 'c2@klok.app',
            numero: '11988887777',
        }),
    });
    assert.equal(resp.status, 201);
    const corpo = await resp.json();
    assert.equal(corpo.tipo, 'coordenador');

    const lista = await (
        await fetch(`${s.baseUrl}/api/coordenadores`, {
            headers: { authorization: `Bearer ${token}` },
        })
    ).json();
    assert.equal(lista.length, 2, 'os dois coordenadores precisam aparecer na lista');
    assert.equal(s.banco.contarCoordenadores(), 2);

    const tokenNovo = await logar(s.baseUrl, 'coordenador2', 'senha-2');
    assert.ok(tokenNovo, 'o novo coordenador precisa conseguir entrar');
});

test('funcionário não lista nem cadastra coordenador', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    criarFuncionario(s, 'ana');
    const token = await logar(s.baseUrl, 'ana', '123456');

    const lista = await fetch(`${s.baseUrl}/api/coordenadores`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(lista.status, 403);

    const criar = await fetch(`${s.baseUrl}/api/coordenadores`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(COORDENADOR),
    });
    assert.equal(criar.status, 403);
});

test('novo coordenador com usuário já em uso retorna 409', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logar(s.baseUrl, COORDENADOR.usuario, COORDENADOR_SENHA);

    const resp = await fetch(`${s.baseUrl}/api/coordenadores`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...COORDENADOR, usuario: COORDENADOR.usuario }),
    });
    assert.equal(resp.status, 409);
});

test('email e número do coordenador reaparecem no próprio perfil', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const token = await logar(s.baseUrl, COORDENADOR.usuario, COORDENADOR_SENHA);
    const eu = await (
        await fetch(`${s.baseUrl}/api/auth/eu`, {
            headers: { authorization: `Bearer ${token}` },
        })
    ).json();

    assert.equal(eu.tipo, 'coordenador');
    assert.equal(eu.empresa, EMPRESA);
    assert.equal(eu.email, COORDENADOR.email);
    assert.equal(eu.numero, COORDENADOR.numero);
});

test('o autocadastro está fechado e não cria usuário', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, usuario: 'ana', senha: '123456' }),
    });
    assert.equal(resp.status, 403);
    assert.match((await resp.json()).erro, /temporariamente fechado/i);
    assert.equal(s.banco.buscarUsuarioPorLogin('ana'), undefined);
});

test('login local devolve token de empresa', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    criarFuncionario(s, 'ana', '123456', 'Ana Silva');

    const login = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, usuario: 'ana', senha: '123456' }),
    });
    assert.equal(login.status, 200);
    const corpo = await login.json();
    assert.ok(corpo.token, 'token deve estar presente');
    assert.equal(corpo.tipo, 'funcionario');
});

test('login com senha errada retorna 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, usuario: 'coordenador', senha: 'senha-errada' }),
    });
    assert.equal(resp.status, 401);
});

test('login do coordenador devolve token e tipo coordenador', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const token = await logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);
    assert.ok(token, 'coordenador deve autenticar com a senha semeada');
});

test('rate limit bloqueia login após muitas tentativas', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    let ultimo = 0;
    for (let i = 0; i < 22; i += 1) {
        const resp = await fetch(`${s.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ empresa: EMPRESA, usuario: 'coordenador', senha: 'senha-errada' }),
        });
        ultimo = resp.status;
    }
    assert.equal(ultimo, 429);
});

test('GET /api/auth/eu sem token retorna 401', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`);
    assert.equal(resp.status, 401);
});

test('GET /api/auth/eu com token retorna dados do usuário', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    criarFuncionario(s, 'bia');
    const token = await logar(s.baseUrl, 'bia', '123456');

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resp.status, 200);
    const corpo = await resp.json();
    assert.equal(corpo.usuario, 'bia');
    assert.equal(corpo.tipo, 'funcionario');
});

test('login com Google cria usuário e reutiliza em login seguinte', async (t) => {
    const clienteGoogle = {
        verifyIdToken: async () => ({
            getPayload: () => ({ sub: 'g123', name: 'Ana Google', email: 'ana@gmail.com' }),
        }),
    };
    const s = await iniciarApp({ clienteGoogle });
    t.after(() => s.fechar());

    const primeira = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, idToken: 'token-fake' }),
    });
    assert.equal(primeira.status, 200);
    const corpo1 = await primeira.json();
    assert.ok(corpo1.token);
    assert.equal(corpo1.tipo, 'funcionario');
    assert.equal(corpo1.nome, 'Ana Google');

    const segunda = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, idToken: 'token-fake' }),
    });
    assert.equal(segunda.status, 200);
    const corpo2 = await segunda.json();
    assert.equal(corpo2.id, corpo1.id, 'mesmo googleId não deve duplicar usuário');
});

test('login Google sem idToken retorna 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA }),
    });
    assert.equal(resp.status, 400);
});

test('GET /api/auth/eu devolve dados do perfil', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    criarFuncionario(s, 'carla', '123456', 'Carla Dias');
    const token = await logar(s.baseUrl, 'carla', '123456');

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resp.status, 200);
    const corpo = await resp.json();
    assert.equal(corpo.nome, 'Carla Dias');
    assert.equal(corpo.usuario, 'carla');
    assert.equal(corpo.hasSenha, true);
    assert.ok(corpo.funcionarioId != null, 'usuário local tem funcionário vinculado');
});

test('PUT /api/auth/eu atualiza os dados do usuário', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    criarFuncionario(s, 'duda', '123456', 'Duda');
    const token = await logar(s.baseUrl, 'duda', '123456');

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: 'Duda Ferreira', numero: '11999999999', email: 'duda@mail.com' }),
    });
    assert.equal(resp.status, 200);
    const corpo = await resp.json();
    assert.equal(corpo.nome, 'Duda Ferreira');
    assert.equal(corpo.numero, '11999999999');
    assert.equal(corpo.email, 'duda@mail.com');
});

test('coordenador também atualiza dados próprios pelo perfil', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    const token = await logar(s.baseUrl, 'coordenador', COORDENADOR_SENHA);

    const resp = await fetch(`${s.baseUrl}/api/auth/eu`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: 'Coordenador da Empresa', numero: '', email: 'coordenador@mail.com' }),
    });
    assert.equal(resp.status, 200);
    const corpo = await resp.json();
    assert.equal(corpo.nome, 'Coordenador da Empresa');
    assert.equal(corpo.email, 'coordenador@mail.com');
});

test('senha atual incorreta retorna 401 e não altera a senha', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    criarFuncionario(s, 'eva');
    const token = await logar(s.baseUrl, 'eva', '123456');

    const err = await fetch(`${s.baseUrl}/api/auth/senha`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ senhaAtual: 'errada', senhaNova: '654321' }),
    });
    assert.equal(err.status, 401);

    const loginAntigo = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, usuario: 'eva', senha: '123456' }),
    });
    assert.equal(loginAntigo.status, 200, 'senha antiga continua valendo');
});

test('trocar senha funciona e a nova passa a valer', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    criarFuncionario(s, 'fabi');
    const token = await logar(s.baseUrl, 'fabi', '123456');

    const ok = await fetch(`${s.baseUrl}/api/auth/senha`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ senhaAtual: '123456', senhaNova: 'nova-senha-1' }),
    });
    assert.equal(ok.status, 200);

    const antiga = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, usuario: 'fabi', senha: '123456' }),
    });
    assert.equal(antiga.status, 401, 'senha antiga deixa de valer');

    const nova = await fetch(`${s.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empresa: EMPRESA, usuario: 'fabi', senha: 'nova-senha-1' }),
    });
    assert.equal(nova.status, 200, 'nova senha passa a valer');
});

test('nova senha igual à atual retorna 400', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());
    criarFuncionario(s, 'gabi');
    const token = await logar(s.baseUrl, 'gabi', '123456');

    const resp = await fetch(`${s.baseUrl}/api/auth/senha`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ senhaAtual: '123456', senhaNova: '123456' }),
    });
    assert.equal(resp.status, 400);
});
