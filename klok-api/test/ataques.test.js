import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { criarBanco } from '../db.js';
import { iniciarApp, criarMestre, logar, MESTRE, MESTRE_SENHA } from './helpers.js';
import { destinatarioValido } from '../email.js';

const rejeicoesNaoTratadas = [];
process.on('unhandledRejection', (erro) => rejeicoesNaoTratadas.push(erro));

const SEG = new TextEncoder().encode(process.env.JWT_SECRET);

function naoVazaInterno(texto) {
    return !(
        texto.includes('node_modules') ||
        texto.includes('at Object.') ||
        texto.includes('at Layer.') ||
        texto.includes('/home/') ||
        texto.includes('TypeError') ||
        texto.includes('ERR_')
    );
}

async function pedido(baseUrl, caminho, { metodo = 'POST', corpo, token } = {}) {
    const semCorpo = metodo === 'GET' || metodo === 'HEAD';
    const resp = await fetch(`${baseUrl}${caminho}`, {
        method: metodo,
        headers: {
            ...(corpo === undefined || semCorpo ? {} : { 'content-type': 'application/json' }),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: corpo === undefined || semCorpo ? undefined : corpo,
    });
    const texto = await resp.text();
    return { status: resp.status, texto, corpo: safeJson(texto) };
}

function safeJson(texto) {
    try {
        return JSON.parse(texto);
    } catch {
        return null;
    }
}

async function esperarRejeicoes() {
    await new Promise((resolve) => setTimeout(resolve, 60));
}

const PAYLOADS_MALFORMADOS = [
    ['login', '/api/auth/login', {}],
    ['login usuario objeto', '/api/auth/login', { usuario: { a: 1 }, senha: 'x' }],
    ['login usuario array', '/api/auth/login', { usuario: [1, 2], senha: 'x' }],
    ['login usuario null', '/api/auth/login', { usuario: null, senha: 'x' }],
    ['login usuario numero', '/api/auth/login', { usuario: 7, senha: 'x' }],
    ['login usuario booleano', '/api/auth/login', { usuario: true, senha: 'x' }],
    ['login senha objeto', '/api/auth/login', { usuario: 'alguem', senha: { a: 1 } }],
    ['login senha null', '/api/auth/login', { usuario: 'alguem', senha: null }],
    ['registrar usuario objeto', '/api/auth/registrar', { usuario: {}, senha: 'x' }],
    ['registrar nome objeto', '/api/auth/registrar', { usuario: 'novo', senha: 'x', nome: {} }],
    ['mestre email objeto', '/api/auth/mestre', { usuario: 'm', senha: 'abcd', email: {}, numero: '1' }],
    ['mestre usuario objeto', '/api/auth/mestre', { usuario: {}, senha: 'abcd', email: 'a@b.com', numero: '1' }],
    ['google idToken objeto', '/api/auth/google', { idToken: {} }],
    ['esqueci email objeto', '/api/auth/esqueci-senha', { email: {} }],
    ['esqueci email array', '/api/auth/esqueci-senha', { email: ['a@b.com'] }],
    ['redefinir token objeto', '/api/auth/redefinir-senha', { token: {}, novaSenha: 'abcd' }],
    ['redefinir novaSenha objeto', '/api/auth/redefinir-senha', { token: 'a'.repeat(64), novaSenha: {} }],
];

test('payload malformado nunca derruba a API nem vaza erro interno', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    for (const [nome, caminho, corpo] of PAYLOADS_MALFORMADOS) {
        const r = await pedido(s.baseUrl, caminho, { corpo: JSON.stringify(corpo) });
        assert.ok(
            r.status >= 400 && r.status < 500,
            `${nome} deveria responder 4xx, respondeu ${r.status}`
        );
        assert.ok(
            naoVazaInterno(r.texto),
            `${nome} vazou detalhe interno: ${r.texto.slice(0, 160)}`
        );
    }

    await esperarRejeicoes();
    assert.deepEqual(
        rejeicoesNaoTratadas.map((e) => e?.message),
        [],
        'nenhuma requisição pode gerar rejeição de promise não tratada'
    );
});

test('a API continua respondendo depois dos payloads malformados', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    for (const [, caminho, corpo] of PAYLOADS_MALFORMADOS) {
        await pedido(s.baseUrl, caminho, { corpo: JSON.stringify(corpo) });
    }

    const vivo = await pedido(s.baseUrl, '/api/auth/mestre', { metodo: 'GET' });
    assert.equal(vivo.status, 200, 'a API precisa continuar viva');
    assert.deepEqual(vivo.corpo, { cadastrado: true });
});

test('JSON malformado no corpo responde 400 sem stack trace', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    const r = await pedido(s.baseUrl, '/api/auth/login', { corpo: '{"usuario": ' });
    assert.equal(r.status, 400);
    assert.ok(naoVazaInterno(r.texto), `vazou: ${r.texto.slice(0, 160)}`);
    assert.equal(r.corpo.erro, 'Requisição inválida');
});

test('corpo grande demais responde 413 em vez de derrubar a API', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    const enorme = JSON.stringify({ usuario: 'a', senha: 'b', nome: 'x'.repeat(100_000) });
    const r = await pedido(s.baseUrl, '/api/auth/registrar', { corpo: enorme });
    assert.equal(r.status, 413);
    assert.ok(naoVazaInterno(r.texto));

    const vivo = await pedido(s.baseUrl, '/api/auth/mestre', { metodo: 'GET' });
    assert.equal(vivo.status, 200);
});

test('editar funcionário sem nome responde 400 e não derruba a API', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    const tokenMestre = await logar(s.baseUrl, MESTRE.usuario, MESTRE_SENHA);
    const criado = await pedido(s.baseUrl, '/api/funcionarios', {
        metodo: 'POST',
        token: tokenMestre,
        corpo: JSON.stringify({ nome: 'Joao Silva', numero: '1', email: 'joao@t.com' }),
    });
    assert.equal(criado.status, 201);

    for (const corpo of [{}, { nome: 123 }, { nome: {} }, { nome: '   ' }, { nome: 'ok', email: 'invalido' }]) {
        const r = await pedido(s.baseUrl, `/api/funcionarios/${criado.corpo.id}`, {
            metodo: 'PUT',
            token: tokenMestre,
            corpo: JSON.stringify(corpo),
        });
        assert.equal(r.status, 400, `esperava 400 para ${JSON.stringify(corpo)}`);
        assert.ok(naoVazaInterno(r.texto), `vazou: ${r.texto.slice(0, 160)}`);
    }

    const vivo = await pedido(s.baseUrl, '/api/funcionarios', { metodo: 'GET', token: tokenMestre });
    assert.equal(vivo.status, 200);
});

test('a API não anuncia a tecnologia e envia headers de proteção', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const resp = await fetch(`${s.baseUrl}/api/auth/mestre`);
    assert.equal(resp.headers.get('x-powered-by'), null);
    assert.equal(resp.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(resp.headers.get('x-frame-options'), 'DENY');
    assert.equal(resp.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(resp.headers.get('cache-control'), 'no-store');
});

test('rota de API inexistente devolve JSON em vez de HTML do Express', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const r = await pedido(s.baseUrl, '/api/nao-existe', { metodo: 'GET' });
    assert.equal(r.status, 404);
    assert.equal(r.corpo.erro, 'Rota não encontrada');
});

const INJECOES = [
    ['CRLF com Bcc', 'vitima@exemplo.com\r\nBcc: atacante@evil.com'],
    ['CR com header', 'vitima@exemplo.com\rCcs: atacante@evil.com'],
    ['LF com header', 'vitima@exemplo.com\nBcc: atacante@evil.com'],
    ['NUL no meio', 'vitima@exemplo.com\0@evil.com'],
    ['espaco no domínio', 'vitima@exemplo.com bcc: atacante@evil.com'],
];

test('email com CRLF é recusado no perfil e nenhum email é enviado', async (t) => {
    const enviados = [];
    const s = await iniciarApp({ limiteAuth: 1000, enviarEmail: async (e) => enviados.push(e) });
    t.after(() => s.fechar());

    await pedido(s.baseUrl, '/api/auth/registrar', {
        corpo: JSON.stringify({ usuario: 'atacante', senha: 'senha-1234', nome: 'Atacante' }),
    });
    const token = await logar(s.baseUrl, 'atacante', 'senha-1234');
    assert.ok(token);

    for (const [nome, malicioso] of INJECOES) {
        const r = await pedido(s.baseUrl, '/api/auth/eu', {
            metodo: 'PUT',
            token,
            corpo: JSON.stringify({ nome: 'Atacante', email: malicioso }),
        });
        assert.equal(r.status, 400, `esperava 400 no perfil para ${nome}`);
    }

    const perfil = await pedido(s.baseUrl, '/api/auth/eu', { metodo: 'GET', token });
    assert.equal(perfil.corpo.email, '', 'o email malicioso não pode ter sido gravado');
});

test('email com CRLF é recusado na recuperação e nenhum email é enviado', async (t) => {
    const enviados = [];
    const s = await iniciarApp({ limiteAuth: 1000, enviarEmail: async (e) => enviados.push(e) });
    t.after(() => s.fechar());

    for (const [nome, malicioso] of INJECOES) {
        const r = await pedido(s.baseUrl, '/api/auth/esqueci-senha', {
            corpo: JSON.stringify({ email: malicioso }),
        });
        assert.equal(r.status, 400, `esperava 400 em esqueci-senha para ${nome}`);
    }

    assert.deepEqual(enviados, [], 'nenhum email pode ter sido enviado');
});

test('cadastro do mestre recusa email com CRLF', async (t) => {
    const s = await iniciarApp({ comMestre: false, limiteAuth: 1000 });
    t.after(() => s.fechar());

    for (const [nome, malicioso] of INJECOES) {
        const r = await pedido(s.baseUrl, '/api/auth/mestre', {
            corpo: JSON.stringify({ ...MESTRE, email: malicioso }),
        });
        assert.equal(r.status, 400, `esperava 400 no cadastro do mestre para ${nome}`);
    }

    assert.equal(s.banco.existeMestre(), false, 'nenhum mestre pode ter sido criado');
});

test('destinatarioValido rejeita CRLF, tipos exóticos e email sem arroba', () => {
    assert.equal(destinatarioValido('alguem@exemplo.com'), true);
    for (const [, malicioso] of INJECOES) {
        assert.equal(destinatarioValido(malicioso), false, `deveria recusar: ${malicioso}`);
    }
    for (const invalido of ['', '   ', 'sem-arroba', 'a@b', {}, [], null, undefined, 7, true]) {
        assert.equal(destinatarioValido(invalido), false, `deveria recusar: ${String(invalido)}`);
    }
});

test('o link de redefinição não volta na resposta quando NODE_ENV é production', async (t) => {
    const antes = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    t.after(() => {
        if (antes === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = antes;
    });

    const s = await iniciarApp({ limiteAuth: 1000, enviarEmail: async () => {} });
    t.after(() => s.fechar());

    const tokenFuncionario = await logar(s.baseUrl, MESTRE.usuario, MESTRE_SENHA);
    await pedido(s.baseUrl, '/api/auth/eu', {
        metodo: 'PUT',
        token: tokenFuncionario,
        corpo: JSON.stringify({ nome: 'Mestre', email: MESTRE.email }),
    });

    const r = await pedido(s.baseUrl, '/api/auth/esqueci-senha', {
        corpo: JSON.stringify({ email: MESTRE.email }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.linkRedefinicao, undefined, 'o token não pode voltar na resposta');
    assert.equal(r.corpo.linkPagina, undefined, 'o token não pode voltar na resposta');
    assert.ok(!r.texto.includes('token='), 'a resposta não pode conter token nenhum');
});

test('senha curta é recusada no registro, troca e redefinição', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000, enviarEmail: async () => {} });
    t.after(() => s.fechar());

    const curto = await pedido(s.baseUrl, '/api/auth/registrar', {
        corpo: JSON.stringify({ usuario: 'curto', senha: '1' }),
    });
    assert.equal(curto.status, 400);

    const token = await logar(s.baseUrl, MESTRE.usuario, MESTRE_SENHA);
    const troca = await pedido(s.baseUrl, '/api/auth/senha', {
        metodo: 'PUT',
        token,
        corpo: JSON.stringify({ senhaAtual: MESTRE_SENHA, senhaNova: '123' }),
    });
    assert.equal(troca.status, 400);

    const redef = await pedido(s.baseUrl, '/api/auth/redefinir-senha', {
        corpo: JSON.stringify({ token: 'a'.repeat(64), novaSenha: '123' }),
    });
    assert.equal(redef.status, 400);
});

test('token de redefinição só é ecoado na página quando é hex de 64', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000, enviarEmail: async () => {} });
    t.after(() => s.fechar());

    for (const token of ["x' onclick='alert(1)", '<script>alert(1)</script>', '../../etc/passwd', 'curto']) {
        const resp = await fetch(`${s.baseUrl}/redefinir-senha/${encodeURIComponent(token)}`);
        const texto = await resp.text();
        assert.ok(!texto.includes('<script>'), `injeção de script em ${token}`);
        assert.ok(!texto.includes("onclick='alert"), `injeção de atributo em ${token}`);
    }
});

const ROTAS_SO_DO_MESTRE = [
    ['GET', '/api/funcionarios'],
    ['POST', '/api/funcionarios'],
    ['PUT', '/api/funcionarios/1'],
    ['DELETE', '/api/funcionarios/1'],
    ['GET', '/api/pontos'],
];

const ROTAS_DE_AUTOATENDIMENTO = [
    ['GET', '/api/auth/eu'],
    ['PUT', '/api/auth/eu'],
    ['PUT', '/api/auth/senha'],
];

test('funcionário é barrado em toda rota exclusiva do mestre, com ou sem token', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    await pedido(s.baseUrl, '/api/auth/registrar', {
        corpo: JSON.stringify({ usuario: 'ana', senha: 'senha-1234', nome: 'Ana' }),
    });
    const token = await logar(s.baseUrl, 'ana', 'senha-1234');
    assert.ok(token, 'o funcionário precisa autenticar');

    for (const [metodo, caminho] of ROTAS_SO_DO_MESTRE) {
        const semToken = await pedido(s.baseUrl, caminho, { metodo, corpo: '{}' });
        assert.equal(semToken.status, 401, `${metodo} ${caminho} sem token deve dar 401`);

        const comToken = await pedido(s.baseUrl, caminho, { metodo, token, corpo: '{}' });
        assert.equal(comToken.status, 403, `${metodo} ${caminho} como funcionário deve dar 403`);
    }
});

test('autoatendimento exige token mas aceita funcionário comum', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    await pedido(s.baseUrl, '/api/auth/registrar', {
        corpo: JSON.stringify({ usuario: 'ana', senha: 'senha-1234', nome: 'Ana' }),
    });
    const token = await logar(s.baseUrl, 'ana', 'senha-1234');
    assert.ok(token);

    for (const [metodo, caminho] of ROTAS_DE_AUTOATENDIMENTO) {
        const semToken = await pedido(s.baseUrl, caminho, { metodo, corpo: '{}' });
        assert.equal(semToken.status, 401, `${metodo} ${caminho} sem token deve dar 401`);

        const comToken = await pedido(s.baseUrl, caminho, { metodo, token, corpo: '{}' });
        assert.notEqual(comToken.status, 401, `${metodo} ${caminho} com token válido não pode dar 401`);
        assert.notEqual(comToken.status, 403, `${metodo} ${caminho} é de autoatendimento, não 403`);
    }
});

test('token forjado é recusado', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const forjados = [
        ['alg none', `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '1', tipo: 'mestre' })}.x`],
        ['alg none vazio', `${b64({ alg: 'none' })}.${b64({ sub: '1', tipo: 'mestre' })}.x`],
        ['sem assinatura', `${b64({ alg: 'HS256' })}.${b64({ sub: '1', tipo: 'mestre' })}.`],
        ['sub nao numerico', `${b64({ alg: 'HS256' })}.${b64({ sub: 'abc' })}x`],
        ['lixo', 'isto-nao-e-um-jwt'],
    ];

    for (const [nome, token] of forjados) {
        const r = await pedido(s.baseUrl, '/api/auth/eu', { metodo: 'GET', token });
        assert.equal(r.status, 401, `${nome} deveria dar 401`);
    }
});

test('token expirado é recusado mesmo com assinatura válida', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const expirado = await new SignJWT({ sub: '1', tipo: 'mestre' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(SEG);

    const r = await pedido(s.baseUrl, '/api/auth/eu', { metodo: 'GET', token: expirado });
    assert.equal(r.status, 401);
});

test('token com assinatura de outro segredo é recusado', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const outro = await new SignJWT({ sub: '1', tipo: 'mestre' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('12h')
        .sign(new TextEncoder().encode('segredo-que-nao-e-o-do-projeto'));

    const r = await pedido(s.baseUrl, '/api/auth/eu', { metodo: 'GET', token: outro });
    assert.equal(r.status, 401);
});

test('campo de texto acima do limite é truncado em vez de estourar o banco', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    const tokenMestre = await logar(s.baseUrl, MESTRE.usuario, MESTRE_SENHA);
    const r = await pedido(s.baseUrl, '/api/funcionarios', {
        metodo: 'POST',
        token: tokenMestre,
        corpo: JSON.stringify({ nome: 'x'.repeat(500), numero: '1', email: 'a@b.com' }),
    });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.nome.length, 120, 'o nome deve ser cortado no limite do campo');
});

test('campos com caractere de controle são recusados', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    const tokenMestre = await logar(s.baseUrl, MESTRE.usuario, MESTRE_SENHA);
    for (const nome of ['Joao Silva', 'Joao Silva', 'Joao\nSilva', 'Joao\tSilva']) {
        const r = await pedido(s.baseUrl, '/api/funcionarios', {
            metodo: 'POST',
            token: tokenMestre,
            corpo: JSON.stringify({ nome, numero: '1', email: 'a@b.com' }),
        });
        assert.equal(r.status, 400, `deveria recusar: ${JSON.stringify(nome)}`);
    }
});

test('o banco nunca recebe undefined, mesmo chamado direto', () => {
    const banco = criarBanco(':memory:');
    try {
        for (const valor of [undefined, null, {}, [], 7, true]) {
            assert.equal(banco.buscarUsuarioPorLogin(valor), undefined);
            assert.equal(banco.buscarUsuarioPorEmail(valor), undefined);
            assert.equal(banco.buscarUsuarioPorGoogleId(valor), undefined);
            assert.equal(banco.buscarRecuperacaoPorToken(valor), undefined);
            assert.equal(banco.validarSenha(valor, valor), null);
        }
        const id = banco.criarFuncionario(undefined, null, {});
        assert.ok(banco.buscarFuncionario(id), 'criarFuncionario deve normalizar, não quebrar');
        assert.equal(banco.buscarFuncionario(id).nome, '');
    } finally {
        banco.db.close();
    }
});

test('rate limit bloqueia depois de muitas tentativas', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const respostas = [];
    for (let i = 0; i < 30; i += 1) {
        const r = await pedido(s.baseUrl, '/api/auth/login', {
            corpo: JSON.stringify({ usuario: 'ninguem', senha: 'errada' }),
        });
        respostas.push(r.status);
    }
    assert.ok(respostas.includes(429), 'o limite precisa barrar em algum momento');
    assert.equal(respostas.at(-1), 429);

    const vivo = await pedido(s.baseUrl, '/api/auth/mestre', { metodo: 'GET' });
    assert.equal(vivo.status, 200, 'rotas não limitadas continuam funcionando');
});

test('criarMestre direto no banco normaliza os campos', () => {
    const banco = criarBanco(':memory:');
    try {
        const mestre = banco.criarMestre('chefe', 'senha-1234', undefined, undefined, null);
        assert.equal(mestre.tipo, 'mestre');
        assert.equal(mestre.email, '');
        assert.equal(banco.existeMestre(), true);
    } finally {
        banco.db.close();
    }
});

test('trocar a senha invalida o token anterior', async (t) => {
    const s = await iniciarApp({ limiteAuth: 1000 });
    t.after(() => s.fechar());

    const antigo = await logar(s.baseUrl, MESTRE.usuario, MESTRE_SENHA);
    assert.equal((await pedido(s.baseUrl, '/api/auth/eu', { metodo: 'GET', token: antigo })).status, 200);

    const troca = await pedido(s.baseUrl, '/api/auth/senha', {
        metodo: 'PUT',
        token: antigo,
        corpo: JSON.stringify({ senhaAtual: MESTRE_SENHA, senhaNova: 'senha-nova-1234' }),
    });
    assert.equal(troca.status, 200);

    const revogado = await pedido(s.baseUrl, '/api/funcionarios', { metodo: 'GET', token: antigo });
    assert.equal(revogado.status, 401, 'o token anterior não pode mais gerenciar funcionários');
    assert.match(revogado.corpo.erro, /sessão expirada/i);

    const novo = await logar(s.baseUrl, MESTRE.usuario, 'senha-nova-1234');
    assert.ok(novo, 'a senha nova precisa autenticar');
    const comNovo = await pedido(s.baseUrl, '/api/funcionarios', { metodo: 'GET', token: novo });
    assert.equal(comNovo.status, 200, 'o token novo precisa funcionar');
});

test('redefinir por email invalida o token anterior', async (t) => {
    const enviados = [];
    const s = await iniciarApp({
        limiteAuth: 1000,
        enviarEmail: async ({ urlApp }) => {
            enviados.push({ token: urlApp.split('token=')[1] });
        },
    });
    t.after(() => s.fechar());

    const antigo = await logar(s.baseUrl, MESTRE.usuario, MESTRE_SENHA);
    await pedido(s.baseUrl, '/api/auth/eu', {
        metodo: 'PUT',
        token: antigo,
        corpo: JSON.stringify({ nome: 'Mestre', email: MESTRE.email }),
    });

    const pedidoReset = await pedido(s.baseUrl, '/api/auth/esqueci-senha', {
        corpo: JSON.stringify({ email: MESTRE.email }),
    });
    assert.equal(pedidoReset.status, 200);
    assert.equal(enviados.length, 1, 'precisa ter enviado o email');

    const redef = await pedido(s.baseUrl, '/api/auth/redefinir-senha', {
        corpo: JSON.stringify({ token: enviados[0].token, novaSenha: 'senha-redefinida-9' }),
    });
    assert.equal(redef.status, 200, JSON.stringify(redef.corpo));

    const revogado = await pedido(s.baseUrl, '/api/funcionarios', { metodo: 'GET', token: antigo });
    assert.equal(revogado.status, 401, 'o token emitido antes do reset não pode valer');

    const novo = await logar(s.baseUrl, MESTRE.usuario, 'senha-redefinida-9');
    assert.ok(novo, 'a senha redefinida precisa autenticar');
});

test('um link de recuperação não invalida outro pendente do mesmo usuário', async (t) => {
    const enviados = [];
    const s = await iniciarApp({
        limiteAuth: 1000,
        enviarEmail: async ({ urlApp }) => {
            enviados.push({ token: urlApp.split('token=')[1] });
        },
    });
    t.after(() => s.fechar());

    const token = await logar(s.baseUrl, MESTRE.usuario, MESTRE_SENHA);
    await pedido(s.baseUrl, '/api/auth/eu', {
        metodo: 'PUT',
        token,
        corpo: JSON.stringify({ nome: 'Mestre', email: MESTRE.email }),
    });

    await pedido(s.baseUrl, '/api/auth/esqueci-senha', { corpo: JSON.stringify({ email: MESTRE.email }) });
    await pedido(s.baseUrl, '/api/auth/esqueci-senha', { corpo: JSON.stringify({ email: MESTRE.email }) });
    assert.equal(enviados.length, 2, 'dois links devem ter sido enviados');
    const [primeiro, segundo] = enviados.map((e) => e.token);
    assert.ok(primeiro, 'o email precisa expor o token pelo urlApp');
    assert.notEqual(primeiro, segundo);

    const usado = await pedido(s.baseUrl, '/api/auth/redefinir-senha', {
        corpo: JSON.stringify({ token: primeiro, novaSenha: 'senha-primeira-1' }),
    });
    assert.equal(usado.status, 200);

    const segundoAinda = await pedido(s.baseUrl, '/api/auth/redefinir-senha', {
        corpo: JSON.stringify({ token: segundo, novaSenha: 'senha-segunda-22' }),
    });
    assert.equal(segundoAinda.status, 200, 'usar um link não pode invalidar o outro pendente');

    const logado = await logar(s.baseUrl, MESTRE.usuario, 'senha-segunda-22');
    assert.ok(logado, 'a última senha definida é a que vale');
});

test('token sem iat é recusado depois de uma troca de senha', async (t) => {
    const s = await iniciarApp();
    t.after(() => s.fechar());

    const token = await logar(s.baseUrl, MESTRE.usuario, MESTRE_SENHA);
    await pedido(s.baseUrl, '/api/auth/senha', {
        metodo: 'PUT',
        token,
        corpo: JSON.stringify({ senhaAtual: MESTRE_SENHA, senhaNova: 'senha-nova-1234' }),
    });

    const semIat = await new SignJWT({ sub: '1', tipo: 'mestre' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('12h')
        .sign(SEG);

    const r = await pedido(s.baseUrl, '/api/funcionarios', { metodo: 'GET', token: semIat });
    assert.equal(r.status, 401, 'sem iat não dá para provar que o token é posterior à troca');
});

test('criarMestre pela API entrega token utilizável de uma vez', async (t) => {
    const s = await iniciarApp({ comMestre: false, limiteAuth: 1000 });
    t.after(() => s.fechar());

    const corpo = await criarMestre(s.baseUrl);
    assert.equal(corpo.tipo, 'mestre');

    const eu = await pedido(s.baseUrl, '/api/auth/eu', { metodo: 'GET', token: corpo.token });
    assert.equal(eu.status, 200);
    assert.equal(eu.corpo.tipo, 'mestre');

    const lista = await pedido(s.baseUrl, '/api/funcionarios', { metodo: 'GET', token: corpo.token });
    assert.equal(lista.status, 200, 'o mestre novo já gerencia funcionários');
});
