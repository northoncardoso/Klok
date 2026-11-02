import { criarBanco } from '../db.js';
import { criarApp } from '../app.js';

process.env.JWT_SECRET ??= 'segredo-de-teste';

export const COORDENADOR = {
    usuario: 'coordenador',
    senha: 'senha-coordenador-teste',
    email: 'coordenador@klok.app',
    numero: '11999999999',
};

export const COORDENADOR_SENHA = COORDENADOR.senha;

export async function iniciarApp(opcoes = {}) {
    const banco = criarBanco(':memory:');
    const clienteGoogle =
        opcoes.clienteGoogle ??
        { verifyIdToken: async () => { throw new Error('cliente google não configurado'); } };
    const app = criarApp({
        banco,
        clienteGoogle,
        enviarEmail: opcoes.enviarEmail,
        limiteAuth: opcoes.limiteAuth,
    });
    const servidor = app.listen(0);
    await new Promise((resolve) => servidor.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${servidor.address().port}`;

    if (opcoes.comCoordenador !== false) await criarCoordenador(baseUrl);

    return {
        banco,
        baseUrl,
        fechar: async () => {
            servidor.closeAllConnections();
            await new Promise((resolve) => servidor.close(resolve));
        },
    };
}

export async function criarCoordenador(baseUrl, dados = {}) {
    const resp = await fetch(`${baseUrl}/api/auth/coordenador`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...COORDENADOR, ...dados }),
    });
    return resp.json();
}

export async function logar(baseUrl, usuario, senha) {
    const resp = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
    });
    const corpo = await resp.json();
    if (!resp.ok) return null;
    return corpo.token;
}
