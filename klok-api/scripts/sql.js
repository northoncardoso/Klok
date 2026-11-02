#!/usr/bin/env node
// Atalho para abrir o banco do Klok no sqlite3, sem precisar lembrar o caminho.
//
// Uso:
//   npm run sql                       abre o modo interativo
//   npm run sql -- "SELECT * FROM pontos;"   roda uma consulta e sai
//   npm run sql -- sql/consultas.sql  roda um arquivo de consultas
//   KLOK_DB=/tmp/pratica.db npm run sql      usa outro banco (bom para treinar)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const banco = process.env.KLOK_DB ?? path.join(raiz, 'klok.db');
const inicio = path.join(raiz, 'sql', 'inicio.sql');

if (!existsSync(banco)) {
    console.error(`Banco não encontrado: ${banco}`);
    console.error('Rode a API uma vez para criar o banco, ou aponte outro arquivo com KLOK_DB=...');
    process.exit(1);
}

const versao = spawnSync('sqlite3', ['--version'], { encoding: 'utf8' });
if (versao.error) {
    console.error('O sqlite3 não está instalado. Ubuntu/Debian: sudo apt install -y sqlite3');
    process.exit(1);
}

const alvo = process.argv[2];
const argumentos = ['-init', inicio, banco];

if (alvo !== undefined) {
    // Arquivo .sql roda com .read, para poder ter vários comandos e comentários.
    argumentos.push(existsSync(alvo) ? `.read ${path.resolve(alvo)}` : alvo);
}

const resultado = spawnSync('sqlite3', argumentos, { stdio: 'inherit' });
process.exit(resultado.status ?? 1);
