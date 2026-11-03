import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignJWT } from 'jose';

import { criarApp } from '../app.js';
import { abrirCatalogo } from '../admin/catalogo.js';
import { criarGerenciador } from '../admin/gerenciador-bancos.js';

process.env.JWT_SECRET ??= 'segredo-de-teste';

export const EMPRESA = 'TESTE';
export const OUTRA_EMPRESA = 'OUTRA';

export const COORDENADOR = {
    usuario: 'coordenador',
    senha: 'senha-coordenador-teste',
    nome: 'Coordenador',
    email: 'coordenador@klok.app',
    numero: '11999999999',
};

export const COORDENADOR_SENHA = COORDENADOR.senha;

export const ADMIN = {
    usuario: 'root',
    senha: 'senha-admin-teste',
    nome: 'Root',
    email: 'root@klok.app',
};

function semearCoordenador(banco) {
    banco.criarCoordenador(
        COORDENADOR.usuario,
        COORDENADOR.senha,
        COORDENADOR.nome,
        COORDENADOR.email,
        COORDENADOR.numero
    );
}

export async function iniciarApp(opcoes = {}) {
    const dadosDir = mkdtempSync(join(tmpdir(), 'klok-teste-'));
    const catalogo = abrirCatalogo(join(dadosDir, 'catalogo.db'));
    catalogo.criarAdmin(ADMIN);
    const gerenciador = criarGerenciador({ catalogo, dadosDir });

    gerenciador.criarEmpresa({ codigo: EMPRESA, nome: 'Empresa Teste' });
    if (opcoes.segundaEmpresa) {
        gerenciador.criarEmpresa({ codigo: OUTRA_EMPRESA, nome: 'Outra Empresa' });
    }

    const banco = gerenciador.abrir(EMPRESA).banco;
    if (opcoes.comCoordenador !== false) {
        semearCoordenador(banco);
        if (opcoes.segundaEmpresa) semearCoordenador(gerenciador.abrir(OUTRA_EMPRESA).banco);
    }

    const clienteGoogle =
        opcoes.clienteGoogle ??
        { verifyIdToken: async () => { throw new Error('cliente google não configurado'); } };
    const app = criarApp({
        gerenciador,
        catalogo,
        clienteGoogle,
        enviarEmail: opcoes.enviarEmail,
        limiteAuth: opcoes.limiteAuth,
    });
    const servidor = app.listen(0);
    await new Promise((resolve) => servidor.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${servidor.address().port}`;

    return {
        banco,
        catalogo,
        gerenciador,
        dadosDir,
        baseUrl,
        fechar: async () => {
            servidor.closeAllConnections();
            await new Promise((resolve) => servidor.close(resolve));
            gerenciador.fechar();
            catalogo.fechar();
            rmSync(dadosDir, { recursive: true, force: true });
        },
    };
}

export async function pedidoLogin(baseUrl, corpo) {
    const resp = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
    });
    let dados = null;
    try {
        dados = await resp.json();
    } catch {
        dados = null;
    }
    return { status: resp.status, corpo: dados };
}

export async function logar(baseUrl, usuario, senha, empresa = EMPRESA) {
    const { status, corpo } = await pedidoLogin(baseUrl, { empresa, usuario, senha });
    if (status !== 200) return null;
    return corpo.token;
}

// A rota de login do admin só existe na Task 7. Até lá, o token é assinado
// aqui do mesmo jeito que ela vai assinar, para o teste de isolamento conferir
// a audience sem depender da rota.
export async function logarAdmin(app, usuario, senha) {
    const admin = app.catalogo.verificarSenhaAdmin(usuario, senha);
    if (!admin) return null;
    return new SignJWT({ sub: String(admin.id), v: Number(admin.senhaVersao) || 0 })
        .setProtectedHeader({ alg: 'HS256' })
        .setAudience('klok-admin')
        .setIssuedAt()
        .setExpirationTime('12h')
        .sign(new TextEncoder().encode(process.env.JWT_SECRET));
}
