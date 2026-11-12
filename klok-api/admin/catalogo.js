import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { criarHashSenha, verificarSenha } from '../senha.js';
import { emailNormalizado, emailValido, semCaractereDeControle, texto } from '../validacao.js';

export const CODIGO_EMPRESA = /^[A-Z][A-Z0-9]{1,19}$/;

const MINIMO_SENHA_ADMIN = 8;

export function codigoValido(codigo) {
    return typeof codigo === 'string' && CODIGO_EMPRESA.test(codigo);
}

export const MIGRACOES_CATALOGO = [
    {
        versao: 1,
        nome: 'cria as empresas',
        sql: `
            CREATE TABLE IF NOT EXISTS empresas (
                codigo TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                criadaEm TEXT NOT NULL,
                desativadaEm TEXT
            );
        `,
    },
    {
        versao: 2,
        nome: 'cria os admins',
        sql: `
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT NOT NULL UNIQUE,
                senhaHash TEXT NOT NULL,
                senhaVersao INTEGER NOT NULL DEFAULT 1,
                nome TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                criadoEm TEXT NOT NULL
            );
        `,
    },
];

function agora() {
    return new Date().toISOString();
}

function semSegredo(admin) {
    if (!admin) return admin;
    const { senhaHash, ...resto } = admin;
    return resto;
}

export function abrirCatalogo(caminho = 'catalogo.db') {
    if (caminho !== ':memory:') {
        mkdirSync(dirname(caminho), { recursive: true });
    }

    const db = new DatabaseSync(caminho);
    db.exec('PRAGMA journal_mode = WAL;');

    function aplicarMigracoes() {
        const atual = Number(db.prepare('PRAGMA user_version').get().user_version);
        for (const migracao of MIGRACOES_CATALOGO) {
            if (migracao.versao <= atual) continue;
            db.exec('BEGIN');
            try {
                db.exec(migracao.sql);
                db.exec(`PRAGMA user_version = ${migracao.versao}`);
                db.exec('COMMIT');
            } catch (e) {
                db.exec('ROLLBACK');
                throw e;
            }
        }
    }

    aplicarMigracoes();

    function linhaAdminPorLogin(usuario) {
        return db.prepare('SELECT * FROM admins WHERE usuario = ?').get(texto(usuario, 'usuario'));
    }

    function buscarAdminPorLogin(usuario) {
        return semSegredo(linhaAdminPorLogin(usuario));
    }

    function buscarAdminPorId(id) {
        return semSegredo(db.prepare('SELECT * FROM admins WHERE id = ?').get(Number(id)));
    }

    function criarAdmin({ usuario, senha, nome, email } = {}) {
        const usuarioLimpo = texto(usuario, 'usuario');
        const nomeLimpo = texto(nome, 'nome') || usuarioLimpo;
        const emailLimpo = emailNormalizado(email);

        if (!usuarioLimpo || !semCaractereDeControle(usuarioLimpo)) {
            return { erro: 'Informe um nome de usuário válido', status: 400 };
        }
        if (linhaAdminPorLogin(usuarioLimpo)) {
            return { erro: 'Este usuário de admin já existe', status: 409 };
        }
        if (typeof senha !== 'string' || senha.length < MINIMO_SENHA_ADMIN) {
            return {
                erro: `A senha do admin deve ter ao menos ${MINIMO_SENHA_ADMIN} caracteres`,
                status: 400,
            };
        }
        if (!emailValido(emailLimpo)) {
            return { erro: 'Informe um email válido para o admin', status: 400 };
        }

        const r = db.prepare(
            `INSERT INTO admins (usuario, senhaHash, nome, email, criadoEm)
             VALUES (?, ?, ?, ?, ?)`
        ).run(usuarioLimpo, criarHashSenha(senha), nomeLimpo, emailLimpo, agora());
        return buscarAdminPorId(r.lastInsertRowid);
    }

    function verificarSenhaAdmin(usuario, senha) {
        const linha = linhaAdminPorLogin(usuario);
        if (!linha || !verificarSenha(senha, linha.senhaHash)) return null;
        return semSegredo(linha);
    }

    function atualizarSenhaAdmin(id, senha) {
        if (typeof senha !== 'string' || senha.length < MINIMO_SENHA_ADMIN) {
            return {
                erro: `A senha do admin deve ter ao menos ${MINIMO_SENHA_ADMIN} caracteres`,
                status: 400,
            };
        }
        const r = db.prepare(
            'UPDATE admins SET senhaHash = ?, senhaVersao = senhaVersao + 1 WHERE id = ?'
        ).run(criarHashSenha(senha), Number(id));
        if (r.changes === 0) return { erro: 'Admin não encontrado', status: 404 };
        return buscarAdminPorId(id);
    }

    function contarAdmins() {
        return Number(db.prepare('SELECT COUNT(*) AS total FROM admins').get().total);
    }

    function listarEmpresas() {
        return db.prepare('SELECT * FROM empresas ORDER BY codigo').all();
    }

    function buscarEmpresa(codigo) {
        return db.prepare('SELECT * FROM empresas WHERE codigo = ?').get(codigo);
    }

    function criarEmpresa({ codigo, nome } = {}) {
        if (!codigoValido(codigo)) {
            return {
                erro: 'Código de empresa inválido. Use de 2 a 20 letras maiúsculas ou números, começando por letra',
                status: 400,
            };
        }
        const nomeLimpo = texto(nome, 'nome');
        if (!nomeLimpo) return { erro: 'Informe o nome da empresa', status: 400 };
        if (buscarEmpresa(codigo)) {
            return { erro: 'Já existe uma empresa com este código', status: 409 };
        }

        db.prepare('INSERT INTO empresas (codigo, nome, criadaEm) VALUES (?, ?, ?)').run(
            codigo,
            nomeLimpo,
            agora()
        );
        return buscarEmpresa(codigo);
    }

    function atualizarEmpresa(codigo, { nome, ativa } = {}) {
        const empresa = buscarEmpresa(codigo);
        if (!empresa) return { erro: 'Empresa não encontrada', status: 404 };

        if (nome !== undefined) {
            const nomeLimpo = texto(nome, 'nome');
            if (!nomeLimpo) return { erro: 'Informe o nome da empresa', status: 400 };
            db.prepare('UPDATE empresas SET nome = ? WHERE codigo = ?').run(nomeLimpo, codigo);
        }
        if (ativa !== undefined) {
            db.prepare('UPDATE empresas SET desativadaEm = ? WHERE codigo = ?').run(
                ativa ? null : agora(),
                codigo
            );
        }
        return buscarEmpresa(codigo);
    }

    function apagarEmpresa(codigo) {
        return db.prepare('DELETE FROM empresas WHERE codigo = ?').run(codigo).changes > 0;
    }

    return {
        db,
        fechar: () => db.close(),
        userVersion: () => Number(db.prepare('PRAGMA user_version').get().user_version),
        buscarAdminPorLogin,
        buscarAdminPorId,
        criarAdmin,
        verificarSenhaAdmin,
        atualizarSenhaAdmin,
        contarAdmins,
        listarEmpresas,
        buscarEmpresa,
        criarEmpresa,
        atualizarEmpresa,
        apagarEmpresa,
    };
}
