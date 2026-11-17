import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { criarHashSenha, verificarSenha } from '../senha.js';
import { emailNormalizado, emailValido, semCaractereDeControle, texto } from '../validacao.js';

export const CODIGO_EMPRESA = /^[A-Z][A-Z0-9]{1,19}$/;

const MINIMO_SENHA_ADMIN = 8;

/** Verificar se o código informado segue o padrão do catálogo de empresas. */
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

/** Devolver o instante atual em ISO, usado nos carimbos de criação. */
function agora() {
    return new Date().toISOString();
}

/** Remover o hash de senha antes de devolver o admin para fora do módulo. */
function semSegredo(admin) {
    if (!admin) return admin;
    const { senhaHash, ...resto } = admin;
    return resto;
}

/**
 * Abrir o catalogo.db, aplicar as migrações pendentes e devolver as operações
 * do catálogo de empresas e dos admins do painel.
 * @param {string} caminho caminho do arquivo do catálogo, aceita ':memory:'
 * @returns {object} conexão, fechar, userVersion e as funções do catálogo
 */
export function abrirCatalogo(caminho = 'catalogo.db') {
    if (caminho !== ':memory:') {
        mkdirSync(dirname(caminho), { recursive: true });
    }

    const db = new DatabaseSync(caminho);
    db.exec('PRAGMA journal_mode = WAL;');

    /** Aplicar em ordem as migrações que o catálogo ainda não tem, cada uma em transação. */
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

    /** Buscar a linha crua do admin pelo usuário, já com o hash de senha. */
    function linhaAdminPorLogin(usuario) {
        return db.prepare('SELECT * FROM admins WHERE usuario = ?').get(texto(usuario, 'usuario'));
    }

    /** Buscar o admin pelo usuário de login sem devolver o hash de senha. */
    function buscarAdminPorLogin(usuario) {
        return semSegredo(linhaAdminPorLogin(usuario));
    }

    /** Buscar o admin pelo id sem devolver o hash de senha. */
    function buscarAdminPorId(id) {
        return semSegredo(db.prepare('SELECT * FROM admins WHERE id = ?').get(Number(id)));
    }

    /**
     * Criar um admin do catálogo com senha própria, separada da senha do app.
     * @param {object} dados campo usuario, senha, nome e email do novo admin
     * @returns {object} admin criado sem o hash de senha, ou objeto com erro e status
     */
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

    /** Conferir a senha do admin e devolver seus dados sem o hash, ou null. */
    function verificarSenhaAdmin(usuario, senha) {
        const linha = linhaAdminPorLogin(usuario);
        if (!linha || !verificarSenha(senha, linha.senhaHash)) return null;
        return semSegredo(linha);
    }

    /** Trocar a senha do admin e subir a senhaVersao para derrubar os tokens antigos. */
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

    /** Contar quantos admins o catálogo já tem. */
    function contarAdmins() {
        return Number(db.prepare('SELECT COUNT(*) AS total FROM admins').get().total);
    }

    /** Listar as empresas do catálogo em ordem de código. */
    function listarEmpresas() {
        return db.prepare('SELECT * FROM empresas ORDER BY codigo').all();
    }

    /** Buscar uma empresa pelo código, ativa ou desativada. */
    function buscarEmpresa(codigo) {
        return db.prepare('SELECT * FROM empresas WHERE codigo = ?').get(codigo);
    }

    /**
     * Registrar uma empresa nova no catálogo, sem criar o banco dela.
     * @param {object} dados campo codigo em maiúsculas e nome da empresa
     * @returns {object} empresa criada, ou objeto com erro e status
     */
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

    /**
     * Renomear a empresa e desativar ou reativar pelo carimbo desativadaEm.
     * @param {string} codigo código da empresa no catálogo
     * @param {object} dados campo nome e ativa, ambos opcionais
     * @returns {object} empresa atualizada, ou objeto com erro e status
     */
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

    /** Remover a empresa do catálogo e informar se alguma linha foi apagada. */
    function apagarEmpresa(codigo) {
        return db.prepare('DELETE FROM empresas WHERE codigo = ?').run(codigo).changes > 0;
    }

    return {
        db,
        /** Fechar a conexão do catálogo e liberar o arquivo. */
        fechar: () => db.close(),
        /** Ler a versão de migração gravada no catálogo. */
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
