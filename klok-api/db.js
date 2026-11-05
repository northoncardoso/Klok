import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { PAPEL_COORDENADOR } from './constantes.js';
import { PREFIXO_HASH, criarHashSenha, paraTexto, verificarSenha } from './senha.js';

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
    {
        versao: 4,
        nome: 'versão da senha para revogar tokens antigos',
        sql: `
            ALTER TABLE usuarios ADD COLUMN senhaVersao INTEGER NOT NULL DEFAULT 0;
        `,
    },
    {
        versao: 5,
        nome: 'no máximo um usuário mestre',
        sql: `
            CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_mestre
                ON usuarios(tipo) WHERE tipo = 'mestre';
        `,
    },
    {
        versao: 6,
        nome: 'mestre vira coordenador e pode haver mais de um',
        sql: `
            UPDATE usuarios SET tipo = 'coordenador' WHERE tipo = 'mestre';
            DROP INDEX IF EXISTS idx_usuarios_mestre;
        `,
    },
    {
        versao: 7,
        nome: 'empresa dona do banco',
        sql: `
            ALTER TABLE usuarios ADD COLUMN empresa TEXT NOT NULL DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa);
        `,
    },
    {
        versao: 8,
        nome: 'pedidos de cadastro por empresa',
        sql: `
            CREATE TABLE IF NOT EXISTS solicitacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT,
                senhaHash TEXT,
                nome TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL,
                numero TEXT NOT NULL DEFAULT '',
                googleId TEXT,
                status TEXT NOT NULL DEFAULT 'pendente',
                criadoEm TEXT NOT NULL,
                decididoEm TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitacoes_usuario
                ON solicitacoes(usuario) WHERE usuario IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitacoes_google
                ON solicitacoes(googleId) WHERE googleId IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes(status);
        `,
    },
];

export function criarBanco(caminho = 'klok.db', opcoes = {}) {
    const empresa = opcoes?.empresa ?? '';
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

    function existeCoordenador() {
        return !!db.prepare('SELECT id FROM usuarios WHERE tipo = ? LIMIT 1').get(PAPEL_COORDENADOR);
    }

    function criarCoordenador(usuario, senha, nome, email, numero) {
        const r = db.prepare(
            `INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, nome, numero, email, empresa)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`
        ).run(
            paraTexto(usuario),
            criarHashSenha(senha),
            PAPEL_COORDENADOR,
            paraTexto(nome),
            paraTexto(numero),
            paraTexto(email),
            empresa
        );
        return buscarUsuarioPorId(r.lastInsertRowid);
    }

    function contarCoordenadores() {
        return Number(
            db.prepare('SELECT COUNT(*) AS total FROM usuarios WHERE tipo = ?').get(PAPEL_COORDENADOR).total
        );
    }

    function listarCoordenadores() {
        return db.prepare(
            `SELECT id, usuario, nome, numero, email
             FROM usuarios
             WHERE tipo = ?
             ORDER BY usuario`
        ).all(PAPEL_COORDENADOR);
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
        // Incrementar a versão invalida os tokens emitidos antes da troca. Um
        // contador foi escolhido no lugar de carimbo de tempo porque o iat do
        // JWT tem granularidade de segundo, e o token emitido no mesmo segundo
        // da troca não é distinguível do antigo.
        db.prepare(
            'UPDATE usuarios SET senhaHash = ?, senhaVersao = senhaVersao + 1 WHERE id = ?'
        ).run(hashSenha, id);
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
            'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, empresa) VALUES (?, ?, ?, ?, ?)'
        ).run(paraTexto(usuario), criarHashSenha(senha), 'funcionario', funcionarioId, empresa);
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

    // Recebe o id do registro, não o do usuário: o token de uso único deve ser
    // invalidado sozinho. Marcar por usuário invalidaria de uma vez todos os
    // links pendentes daquele usuário.
    function marcarRecuperacaoUsada(registroId) {
        db.prepare('UPDATE recuperacao_senha SET usado = 1 WHERE id = ?').run(registroId);
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

    function ehConflitoDeUnicidade(erro) {
        return erro?.errcode === 2067;
    }

    function semSenha(linha) {
        if (!linha) return linha;
        const { senhaHash, ...resto } = linha;
        return resto;
    }

    function criarSolicitacao({ usuario, senhaHash, nome, email, numero, googleId }) {
        const login = usuario ? paraTexto(usuario) : null;
        const contaGoogle = googleId ? paraTexto(googleId) : null;
        if (!login && !contaGoogle) {
            return { erro: 'Informe usuário ou conta Google', status: 400 };
        }
        try {
            const r = db.prepare(
                `INSERT INTO solicitacoes (usuario, senhaHash, nome, email, numero, googleId, status, criadoEm)
                 VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?)`
            ).run(login, senhaHash ?? null, paraTexto(nome), paraTexto(email), paraTexto(numero), contaGoogle, new Date().toISOString());
            return semSenha(buscarSolicitacaoPorId(r.lastInsertRowid));
        } catch (e) {
            if (ehConflitoDeUnicidade(e)) {
                return { erro: mensagemDeConflito(contaGoogle), status: 409 };
            }
            throw e;
        }
    }

    function mensagemDeConflito(contaGoogle) {
        return contaGoogle ? 'Esta conta Google já está em uso' : 'Este nome de usuário já está em uso';
    }

    function listarSolicitacoes(status = 'pendente') {
        return db.prepare('SELECT * FROM solicitacoes WHERE status = ? ORDER BY criadoEm').all(status).map(semSenha);
    }

    function buscarSolicitacaoPorId(id) {
        return semSenha(db.prepare('SELECT * FROM solicitacoes WHERE id = ?').get(id));
    }

    function buscarSolicitacaoPorUsuario(usuario) {
        return semSenha(db.prepare('SELECT * FROM solicitacoes WHERE usuario = ?').get(paraTexto(usuario)));
    }

    function buscarSolicitacaoPorGoogleId(googleId) {
        return semSenha(db.prepare('SELECT * FROM solicitacoes WHERE googleId = ?').get(paraTexto(googleId)));
    }

    function contarSolicitacoesPendentes() {
        return Number(db.prepare("SELECT COUNT(*) AS total FROM solicitacoes WHERE status = 'pendente'").get().total);
    }

    function validarSenhaSolicitacao(usuario, senha) {
        if (typeof senha !== 'string') return null;
        const linha = db.prepare('SELECT * FROM solicitacoes WHERE usuario = ?').get(paraTexto(usuario));
        if (!linha || !linha.senhaHash) return null;
        if (!linha.senhaHash.startsWith(PREFIXO_HASH)) return null;
        return verificarSenha(senha, linha.senhaHash) ? semSenha(linha) : null;
    }

    function aprovarSolicitacao(id) {
        // A linha crua é necessária para copiar o senhaHash; a versão pública sai sem ele.
        const cru = db.prepare('SELECT * FROM solicitacoes WHERE id = ?').get(id);
        if (!cru) return { erro: 'Pedido não encontrado', status: 404 };
        if (cru.status !== 'pendente') return { erro: 'Este pedido já foi decidido', status: 409 };
        if (cru.usuario && buscarUsuarioPorLogin(cru.usuario)) {
            return { erro: 'Este nome de usuário já está em uso', status: 409 };
        }
        if (cru.googleId && buscarUsuarioPorGoogleId(cru.googleId)) {
            return { erro: 'Esta conta Google já está em uso', status: 409 };
        }

        db.exec('BEGIN');
        try {
            const funcionarioId = criarFuncionario(cru.nome || cru.usuario || 'Sem nome', cru.numero, cru.email);
            const r = db.prepare(
                `INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, googleId, empresa)
                 VALUES (?, ?, 'funcionario', ?, ?, ?)`
            ).run(cru.usuario ?? null, cru.senhaHash ?? null, funcionarioId, cru.googleId ?? null, empresa);
            db.prepare('UPDATE solicitacoes SET status = ?, decididoEm = ? WHERE id = ?')
                .run('aprovado', new Date().toISOString(), id);
            db.exec('COMMIT');
            return {
                funcionario: buscarFuncionario(funcionarioId),
                usuario: semSenha(buscarUsuarioPorId(r.lastInsertRowid)),
            };
        } catch (e) {
            db.exec('ROLLBACK');
            if (ehConflitoDeUnicidade(e)) {
                return { erro: mensagemDeConflito(cru.googleId), status: 409 };
            }
            throw e;
        }
    }

    function recusarSolicitacao(id) {
        const pedido = buscarSolicitacaoPorId(id);
        if (!pedido) return { erro: 'Pedido não encontrado', status: 404 };
        if (pedido.status !== 'pendente') return { erro: 'Este pedido já foi decidido', status: 409 };
        db.prepare('UPDATE solicitacoes SET status = ?, decididoEm = ? WHERE id = ?')
            .run('recusado', new Date().toISOString(), id);
        return { solicitacao: buscarSolicitacaoPorId(id) };
    }

    return {
        db,
        userVersion: () => Number(db.prepare('PRAGMA user_version').get().user_version),
        existeCoordenador,
        contarCoordenadores,
        criarCoordenador,
        listarCoordenadores,
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
        buscarUsuarioPorGoogleId,
        buscarUsuarioPorId,
        validarSenha,
        baterPonto,
        listarPontos,
        listarTodosPontos,
        criarSolicitacao,
        listarSolicitacoes,
        buscarSolicitacaoPorId,
        buscarSolicitacaoPorUsuario,
        buscarSolicitacaoPorGoogleId,
        contarSolicitacoesPendentes,
        validarSenhaSolicitacao,
        aprovarSolicitacao,
        recusarSolicitacao,
    };
}
