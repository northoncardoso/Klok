import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

const db = SQLite.openDatabaseSync('funcionarios2.db');

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
            senhaHash TEXT,
            tipo TEXT DEFAULT 'funcionario',
            funcionarioId INTEGER,
            FOREIGN KEY (funcionarioId) REFERENCES funcionarios(id)
        );
    `);
}

async function gerarHash(senha) {
    return await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        senha
    );
}
export async function criarUsuarioMestrePadrao() {
    const mestreExistente = db.getAllSync(
        "SELECT id FROM usuarios WHERE usuario = ?",
        ["mestre"]
    );

    if (mestreExistente.length === 0) {
        const senhaHash = await gerarHash("1234");
        db.runSync(
            "INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId) VALUES (?, ?, ?, ?)",
            ["mestre", senhaHash, "mestre", null]
        );
    }
}

export async function cadastrarUsuario(usuario, senha, callback) {
    try {
        criarTabela();
        const funcionarioInserido = db.runSync(
            "INSERT INTO funcionarios (nome, numero, email) VALUES (?, ?, ?)",
            [usuario, "", ""]
        );
        const senhaHash = await gerarHash(senha);
        db.runSync(
            "INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId) VALUES (?, ?, ?, ?)",
            [usuario, senhaHash, "funcionario", funcionarioInserido.lastInsertRowId]
        );
        callback({ sucesso: true, tipo: "funcionario" });
    } catch (erro) {
        callback({ sucesso: false, erro: "Usuário já existe ou dados inválidos" });
    }
}

export async function validarUsuario(usuario, senha, callback) {
    // 1ª etapa: o usuário existe?
    const usuarioEncontrado = db.getAllSync(
        "SELECT * FROM usuarios WHERE usuario = ?",
        [usuario]
    );

    if (usuarioEncontrado.length === 0) {
        callback({ sucesso: false, erro: "Usuário não cadastrado" });
        return;
    }

    // 2ª etapa: a senha bate?
    const senhaHash = await gerarHash(senha);
    const resultado = db.getAllSync(
        "SELECT * FROM usuarios WHERE usuario = ? AND senhaHash = ?",
        [usuario, senhaHash]
    );

    if (resultado.length > 0) {
        callback({ sucesso: true, tipo: resultado[0].tipo });
    } else {
        callback({ sucesso: false, erro: "Senha incorreta" });
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