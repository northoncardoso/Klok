import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PAPEL_MESTRE } from './constantes.js';

const PREFIXO_HASH = 'scrypt$';

function paraTexto(valor) {
    return typeof valor === 'string' ? valor : valor === null || valor === undefined ? '' : String(valor);
}

export const MIGRACOES = [
    {
        versao: 1,
        nome: 'cria as tabelas iniciais',
        sql: `
            CREATE TABLE IF NOT EXISTS funcionarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                numero TEXT DEFAULT '',
                email TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT UNIQUE,
                senhaHash TEXT,
                tipo TEXT NOT NULL DEFAULT 'funcionario',
                funcionarioId INTEGER,
                googleId TEXT UNIQUE,
                FOREIGN KEY (funcionarioId) REFERENCES funcionarios(id)
            );

            CREATE TABLE IF NOT EXISTS pontos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                funcionarioId INTEGER NOT NULL,
                dataHora TEXT NOT NULL,
                tipo TEXT NOT NULL DEFAULT 'batida',
                FOREIGN KEY (funcionarioId) REFERENCES funcionarios(id)
            );
        `,
    },
    {
        versao: 2,
        nome: 'dados próprios de usuário para o perfil',
        sql: `
            ALTER TABLE usuarios ADD COLUMN nome TEXT DEFAULT '';
            ALTER TABLE usuarios ADD COLUMN numero TEXT DEFAULT '';
            ALTER TABLE usuarios ADD COLUMN email TEXT DEFAULT '';
            UPDATE usuarios SET nome = usuario WHERE nome IS NULL OR nome = '';
        `,
    },
    {
        versao: 3,
        nome: 'tokens de recuperação de senha',
        sql: `
            CREATE TABLE IF NOT EXISTS recuperacao_senha (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuarioId INTEGER NOT NULL,
                tokenHash TEXT NOT NULL,
                expiraEm TEXT NOT NULL,
                usado INTEGER NOT NULL DEFAULT 0,
                criadoEm TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (usuarioId) REFERENCES usuarios(id)
            );
            CREATE INDEX IF NOT EXISTS idx_recuperacao_token ON recuperacao_senha(tokenHash);
        `,
    },
];

export function criarBanco(caminho = 'klok.db') {
    const db = new DatabaseSync(caminho);

    db.exec('PRAGMA journal_mode = WAL;');

    function aplicarMigracoes() {
        const linha = db.prepare('PRAGMA user_version').get();
        const atual = Number(linha.user_version);
        for (const migracao of MIGRACOES) {
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

    function existeMestre() {
        return !!db.prepare('SELECT id FROM usuarios WHERE tipo = ? LIMIT 1').get(PAPEL_MESTRE);
    }

    function criarMestre(usuario, senha, nome, email, numero) {
        const r = db.prepare(
            `INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, nome, numero, email)
             VALUES (?, ?, ?, NULL, ?, ?, ?)`
        ).run(paraTexto(usuario), criarHashSenha(senha), PAPEL_MESTRE, paraTexto(nome), paraTexto(numero), paraTexto(email));
        return buscarUsuarioPorId(r.lastInsertRowid);
    }

    function criarHashSenha(senha) {
        const sal = randomBytes(16).toString('hex');
        const hash = scryptSync(paraTexto(senha), sal, 64).toString('hex');
        return `${PREFIXO_HASH}${sal}$${hash}`;
    }

    function verificarSenha(senha, hashArmazenada) {
        if (typeof senha !== 'string' || hashArmazenada?.startsWith(PREFIXO_HASH) !== true) {
            return false;
        }
        const partes = hashArmazenada.slice(PREFIXO_HASH.length).split('$');
        if (partes.length !== 2) return false;
        const [sal, hashEsperado] = partes;
        const hashGerado = scryptSync(senha, sal, 64);
        const esperado = Buffer.from(hashEsperado, 'hex');
        if (hashGerado.length !== esperado.length) return false;
        return timingSafeEqual(hashGerado, esperado);
    }

    function criarFuncionario(nome, numero, email) {
        const r = db.prepare(
            'INSERT INTO funcionarios (nome, numero, email) VALUES (?, ?, ?)'
        ).run(paraTexto(nome), paraTexto(numero), paraTexto(email));
        return r.lastInsertRowid;
    }

    function listarFuncionarios() {
        return db.prepare('SELECT * FROM funcionarios').all();
    }

    function buscarFuncionario(id) {
        return db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id);
    }

    function atualizarFuncionario(id, nome, numero, email) {
        db.prepare(
            'UPDATE funcionarios SET nome = ?, numero = ?, email = ? WHERE id = ?'
        ).run(paraTexto(nome), paraTexto(numero), paraTexto(email), id);
    }

    function atualizarDadosUsuarios(id, nome, numero, email) {
        db.prepare(
            'UPDATE usuarios SET nome = ?, numero = ?, email = ? WHERE id = ?'
        ).run(paraTexto(nome), paraTexto(numero), paraTexto(email), id);
        return buscarUsuarioPorId(id);
    }

    function atualizarSenha(id, hashSenha) {
        db.prepare('UPDATE usuarios SET senhaHash = ? WHERE id = ?').run(hashSenha, id);
    }

    function apagarFuncionario(id) {
        db.exec('BEGIN');
        try {
            db.prepare('DELETE FROM pontos WHERE funcionarioId = ?').run(id);
            db.prepare('DELETE FROM usuarios WHERE funcionarioId = ?').run(id);
            const r = db.prepare('DELETE FROM funcionarios WHERE id = ?').run(id);
            db.exec('COMMIT');
            return r.changes > 0;
        } catch (e) {
            db.exec('ROLLBACK');
            throw e;
        }
    }

    function criarUsuarioLocal(usuario, senha, nome) {
        const funcionarioId = criarFuncionario(nome || usuario, '', '');
        db.prepare(
            'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId) VALUES (?, ?, ?, ?)'
        ).run(paraTexto(usuario), criarHashSenha(senha), 'funcionario', funcionarioId);
        return buscarUsuarioPorLogin(usuario);
    }

    function buscarUsuarioPorLogin(usuario) {
        return db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(paraTexto(usuario));
    }

    function buscarUsuarioPorEmail(email) {
        return db.prepare(
            `SELECT u.* FROM usuarios u
             LEFT JOIN funcionarios f ON f.id = u.funcionarioId
             WHERE LOWER(u.email) = ? OR (f.email IS NOT NULL AND LOWER(f.email) = ?)`
        ).get(paraTexto(email), paraTexto(email));
    }

    function criarRecuperacao(usuarioId, tokenHash, expiraEm) {
        db.prepare(
            'INSERT INTO recuperacao_senha (usuarioId, tokenHash, expiraEm) VALUES (?, ?, ?)'
        ).run(usuarioId, tokenHash, expiraEm);
    }

    function buscarRecuperacaoPorToken(tokenHash) {
        return db.prepare('SELECT * FROM recuperacao_senha WHERE tokenHash = ?').get(paraTexto(tokenHash));
    }

    function marcarRecuperacaoUsada(usuarioId) {
        db.prepare('UPDATE recuperacao_senha SET usado = 1 WHERE usuarioId = ?').run(usuarioId);
    }

    function criarOuBuscarUsuarioGoogle(googleId, nome, email) {
        const existe = db.prepare('SELECT * FROM usuarios WHERE googleId = ?').get(paraTexto(googleId));
        if (existe) return existe;

        const funcionarioId = criarFuncionario(nome, '', email ?? '');
        db.prepare(
            'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, googleId) VALUES (?, ?, ?, ?, ?)'
        ).run(`google_${paraTexto(googleId)}`, null, 'funcionario', funcionarioId, paraTexto(googleId));
        return buscarUsuarioPorGoogleId(googleId);
    }

    function buscarUsuarioPorGoogleId(googleId) {
        return db.prepare('SELECT * FROM usuarios WHERE googleId = ?').get(paraTexto(googleId));
    }

    function buscarUsuarioPorId(id) {
        return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    }

    function validarSenha(usuario, senha) {
        if (typeof senha !== 'string') return null;
        const u = buscarUsuarioPorLogin(usuario);
        if (!u || !u.senhaHash) return null;
        if (u.senhaHash.startsWith(PREFIXO_HASH)) {
            return verificarSenha(senha, u.senhaHash) ? u : null;
        }
        const hashLegado = createHash('sha256').update(senha).digest('hex');
        if (hashLegado !== u.senhaHash) return null;
        const novo = criarHashSenha(senha);
        db.prepare('UPDATE usuarios SET senhaHash = ? WHERE id = ?').run(novo, u.id);
        return u;
    }

    function baterPonto(funcionarioId, tipo) {
        const dataHora = new Date().toISOString();
        const r = db.prepare(
            'INSERT INTO pontos (funcionarioId, dataHora, tipo) VALUES (?, ?, ?)'
        ).run(paraTexto(funcionarioId), dataHora, paraTexto(tipo));
        return db.prepare('SELECT * FROM pontos WHERE id = ?').get(r.lastInsertRowid);
    }

    function listarPontos(funcionarioId) {
        return db.prepare(
            'SELECT * FROM pontos WHERE funcionarioId = ? ORDER BY dataHora DESC'
        ).all(funcionarioId);
    }

    function listarTodosPontos() {
        return db.prepare(
            `SELECT p.*, f.nome AS funcionarioNome
             FROM pontos p JOIN funcionarios f ON f.id = p.funcionarioId
             ORDER BY p.dataHora DESC`
        ).all();
    }

    return {
        db,
        userVersion: () => Number(db.prepare('PRAGMA user_version').get().user_version),
        existeMestre,
        criarMestre,
        criarHashSenha,
        verificarSenha,
        criarFuncionario,
        listarFuncionarios,
        buscarFuncionario,
        atualizarFuncionario,
        atualizarDadosUsuarios,
        atualizarSenha,
        apagarFuncionario,
        criarUsuarioLocal,
        buscarUsuarioPorLogin,
        buscarUsuarioPorEmail,
        criarRecuperacao,
        buscarRecuperacaoPorToken,
        marcarRecuperacaoUsada,
        criarOuBuscarUsuarioGoogle,
        buscarUsuarioPorGoogleId,
        buscarUsuarioPorId,
        validarSenha,
        baterPonto,
        listarPontos,
        listarTodosPontos,
    };
}