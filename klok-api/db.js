import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PREFIXO_HASH = 'scrypt$';

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

    function criarUsuarioMestre() {
        const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get('mestre');
        if (existe) return;
        const senha = process.env.SENHA_MESTRE;
        if (!senha) {
            throw new Error('SENHA_MESTRE não definida. Configure a variável de ambiente antes de subir a API.');
        }
        db.prepare(
            'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId) VALUES (?, ?, ?, ?)'
        ).run('mestre', criarHashSenha(senha), 'mestre', null);
    }

    function criarHashSenha(senha) {
        const sal = randomBytes(16).toString('hex');
        const hash = scryptSync(senha, sal, 64).toString('hex');
        return `${PREFIXO_HASH}${sal}$${hash}`;
    }

    function verificarSenha(senha, hashArmazenada) {
        if (hashArmazenada?.startsWith(PREFIXO_HASH)) {
            const partes = hashArmazenada.slice(PREFIXO_HASH.length).split('$');
            if (partes.length !== 2) return false;
            const [sal, hashEsperado] = partes;
            const hashGerado = scryptSync(senha, sal, 64);
            const esperado = Buffer.from(hashEsperado, 'hex');
            if (hashGerado.length !== esperado.length) return false;
            return timingSafeEqual(hashGerado, esperado);
        }
        return false;
    }

    function criarFuncionario(nome, numero, email) {
        const r = db.prepare(
            'INSERT INTO funcionarios (nome, numero, email) VALUES (?, ?, ?)'
        ).run(nome, numero ?? '', email ?? '');
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
        ).run(nome, numero ?? '', email ?? '', id);
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
        ).run(usuario, criarHashSenha(senha), 'funcionario', funcionarioId);
        return buscarUsuarioPorLogin(usuario);
    }

    function buscarUsuarioPorLogin(usuario) {
        return db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
    }

    function criarOuBuscarUsuarioGoogle(googleId, nome, email) {
        const existe = db.prepare('SELECT * FROM usuarios WHERE googleId = ?').get(googleId);
        if (existe) return existe;

        const funcionarioId = criarFuncionario(nome, '', email ?? '');
        db.prepare(
            'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, googleId) VALUES (?, ?, ?, ?, ?)'
        ).run(`google_${googleId}`, null, 'funcionario', funcionarioId, googleId);
        return buscarUsuarioPorGoogleId(googleId);
    }

    function buscarUsuarioPorGoogleId(googleId) {
        return db.prepare('SELECT * FROM usuarios WHERE googleId = ?').get(googleId);
    }

    function buscarUsuarioPorId(id) {
        return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    }

    function validarSenha(usuario, senha) {
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
        ).run(funcionarioId, dataHora, tipo);
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

    criarUsuarioMestre();

    return {
        db,
        userVersion: () => Number(db.prepare('PRAGMA user_version').get().user_version),
        criarUsuarioMestre,
        criarHashSenha,
        verificarSenha,
        criarFuncionario,
        listarFuncionarios,
        buscarFuncionario,
        atualizarFuncionario,
        apagarFuncionario,
        criarUsuarioLocal,
        buscarUsuarioPorLogin,
        criarOuBuscarUsuarioGoogle,
        buscarUsuarioPorGoogleId,
        buscarUsuarioPorId,
        validarSenha,
        baterPonto,
        listarPontos,
        listarTodosPontos,
    };
}