import * as SQLite from 'expo-sqlite';

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

export function deletarFuncionario(id, callback) {
    db.runSync("DELETE FROM funcionarios WHERE id = ?", [id]);
    callback();
}