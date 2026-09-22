import { criarBanco } from '../db.js';
import { criarApp } from '../app.js';

process.env.JWT_SECRET ??= 'segredo-de-teste';
process.env.SENHA_MESTRE ??= 'senha-mestre-teste';

export const MESTRE_SENHA = process.env.SENHA_MESTRE;

export async function iniciarApp(opcoes = {}) {
    const banco = criarBanco(':memory:');
    const clienteGoogle =
        opcoes.clienteGoogle ??
        { verifyIdToken: async () => { throw new Error('cliente google não configurado'); } };
    const app = criarApp({ banco, clienteGoogle });
    const servidor = app.listen(0);
    await new Promise((resolve) => servidor.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${servidor.address().port}`;
    return {
        banco,
        baseUrl,
        fechar: async () => {
            servidor.closeAllConnections();
            await new Promise((resolve) => servidor.close(resolve));
        },
    };
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