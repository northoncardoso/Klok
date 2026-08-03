import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

const db = SQLite.openDatabaseSync('funcionarios.db');

export function criarTabela() {
    db.execSync(`
        CREATE TABLE IF NOT EXISTS funcionarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            numero TEXT,
            email TEXT
        );
    `);
}

export function criarTabelaUsuarios() {
    db.execSync(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT UNIQUE,
            senhaHash TEXT
        );
    `);
}

async function gerarHash(senha) {
    return await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        senha
    );
}

export async function cadastrarUsuario(usuario, senha, callback) {
    try {
        const senhaHash = await gerarHash(senha);
        db.runSync(
            "INSERT INTO usuarios (usuario, senhaHash) VALUES (?, ?)",
            [usuario, senhaHash]
        );
        callback({ sucesso: true });
    } catch (erro) {
        // erro.message geralmente indica violação do UNIQUE (usuário já existe)
        callback({ sucesso: false, erro: "Usuário já existe ou dados inválidos" });
    }
}

export async function validarUsuario(usuario, senha, callback) {
    const senhaHash = await gerarHash(senha);
    const resultado = db.getAllSync(
        "SELECT * FROM usuarios WHERE usuario = ? AND senhaHash = ?",
        [usuario, senhaHash]
    );

    if (resultado.length > 0) {
        callback({ sucesso: true });
    } else {
        callback({ sucesso: false, erro: "Usuário ou senha incorretos" });
    }
}

export function carregarFuncionarios(setLista) {
    const lista = db.getAllSync("SELECT * FROM funcionarios");
    setLista(lista);
}

export function inserirFuncionario(nome, numero, email, callback) {
    const resultado = db.runSync(
        "INSERT INTO funcionarios (nome, numero, email) VALUES (?, ?, ?)",
        [nome, numero, email]
    );

    callback({
        id: resultado.lastInsertRowId,
        nome,
        numero,
        email
    });
}

export function atualizarFuncionario(id, nome, numero, email, callback) {
    db.runSync(
        "UPDATE funcionarios SET nome = ?, numero = ?, email = ? WHERE id = ?",
        [nome, numero, email, id]
    );
    callback();
}

export function deletarFuncionario(id, callback) {
    db.runSync("DELETE FROM funcionarios WHERE id = ?", [id]);
    callback();
}