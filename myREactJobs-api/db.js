import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

const db = new DatabaseSync('klok.db');

db.exec(`
    PRAGMA journal_mode = WAL;

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
`);

export function criarUsuarioMestre() {
    const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get('mestre');
    if (existe) return;
    db.prepare(
        'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId) VALUES (?, ?, ?, ?)'
    ).run('mestre', gerarHash('1234'), 'mestre', null);
}

export function gerarHash(senha) {
    return createHash('sha256').update(senha).digest('hex');
}

export function criarFuncionario(nome, numero, email) {
    const r = db.prepare(
        'INSERT INTO funcionarios (nome, numero, email) VALUES (?, ?, ?)'
    ).run(nome, numero ?? '', email ?? '');
    return r.lastInsertRowid;
}

export function listarFuncionarios() {
    return db.prepare('SELECT * FROM funcionarios').all();
}

export function buscarFuncionario(id) {
    return db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id);
}

export function atualizarFuncionario(id, nome, numero, email) {
    db.prepare(
        'UPDATE funcionarios SET nome = ?, numero = ?, email = ? WHERE id = ?'
    ).run(nome, numero ?? '', email ?? '', id);
}

export function apagarFuncionario(id) {
    db.prepare('DELETE FROM pontos WHERE funcionarioId = ?').run(id);
    db.prepare('DELETE FROM usuarios WHERE funcionarioId = ?').run(id);
    db.prepare('DELETE FROM funcionarios WHERE id = ?').run(id);
}

export function criarUsuarioLocal(usuario, senha, nome) {
    const funcionarioId = criarFuncionario(nome || usuario, '', '');
    db.prepare(
        'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId) VALUES (?, ?, ?, ?)'
    ).run(usuario, gerarHash(senha), 'funcionario', funcionarioId);
    return buscarUsuarioPorLogin(usuario);
}

export function buscarUsuarioPorLogin(usuario) {
    return db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
}

export function criarOuBuscarUsuarioGoogle(googleId, nome, email) {
    const existe = db.prepare('SELECT * FROM usuarios WHERE googleId = ?').get(googleId);
    if (existe) return existe;

    const funcionarioId = criarFuncionario(nome, '', email ?? '');
    db.prepare(
        'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, googleId) VALUES (?, ?, ?, ?, ?)'
    ).run(`google_${googleId}`, null, 'funcionario', funcionarioId, googleId);
    return buscarUsuarioPorGoogleId(googleId);
}

export function buscarUsuarioPorGoogleId(googleId) {
    return db.prepare('SELECT * FROM usuarios WHERE googleId = ?').get(googleId);
}

export function buscarUsuarioPorId(id) {
    return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
}

export function validarSenha(usuario, senha) {
    const u = buscarUsuarioPorLogin(usuario);
    if (!u || !u.senhaHash) return null;
    if (u.senhaHash !== gerarHash(senha)) return null;
    return u;
}

export function baterPonto(funcionarioId, tipo) {
    const dataHora = new Date().toISOString();
    const r = db.prepare(
        'INSERT INTO pontos (funcionarioId, dataHora, tipo) VALUES (?, ?, ?)'
    ).run(funcionarioId, dataHora, tipo);
    return db.prepare('SELECT * FROM pontos WHERE id = ?').get(r.lastInsertRowid);
}

export function listarPontos(funcionarioId) {
    return db.prepare(
        'SELECT * FROM pontos WHERE funcionarioId = ? ORDER BY dataHora DESC'
    ).all(funcionarioId);
}

export function listarTodosPontos() {
    return db.prepare(
        `SELECT p.*, f.nome AS funcionarioNome
         FROM pontos p JOIN funcionarios f ON f.id = p.funcionarioId
         ORDER BY p.dataHora DESC`
    ).all();
}

export { db };
