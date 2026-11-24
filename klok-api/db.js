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
    {
        versao: 9,
        nome: 'coordenador também é funcionário e bate ponto',
        sql: `
            CREATE TEMP TABLE migracao_coordenador AS
            SELECT u.id AS usuarioId,
                   (SELECT COALESCE(MAX(f.id), 0) FROM funcionarios f)
                       + ROW_NUMBER() OVER (ORDER BY u.id) AS funcionarioId,
                   COALESCE(u.nome, '') AS nome,
                   COALESCE(u.numero, '') AS numero,
                   COALESCE(u.email, '') AS email
            FROM usuarios u
            WHERE u.tipo = 'coordenador' AND u.funcionarioId IS NULL;

            INSERT INTO funcionarios (id, nome, numero, email)
            SELECT funcionarioId, nome, numero, email FROM migracao_coordenador
            ORDER BY funcionarioId;

            UPDATE usuarios
            SET funcionarioId = (
                SELECT m.funcionarioId FROM migracao_coordenador m WHERE m.usuarioId = usuarios.id
            )
            WHERE id IN (SELECT usuarioId FROM migracao_coordenador);

            DROP TABLE migracao_coordenador;
        `,
    },
    {
        versao: 10,
        nome: 'perímetros de batida e resultado da verificação',
        sql: `
            CREATE TABLE IF NOT EXISTS locais (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                raioMetros INTEGER NOT NULL DEFAULT 150,
                criadoEm TEXT NOT NULL,
                atualizadoEm TEXT,
                removidoEm TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_locais_nome_ativo
                ON locais(nome) WHERE removidoEm IS NULL;

            CREATE TABLE IF NOT EXISTS pedidos_local (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                localId INTEGER,
                nome TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                raioMetros INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pendente',
                solicitadoPor INTEGER NOT NULL,
                solicitadoEm TEXT NOT NULL,
                decididoPor TEXT,
                decididoEm TEXT,
                motivoRecusa TEXT,
                FOREIGN KEY (localId) REFERENCES locais(id)
            );
            CREATE INDEX IF NOT EXISTS idx_pedidos_local_status ON pedidos_local(status);

            ALTER TABLE pontos ADD COLUMN localId INTEGER;
            ALTER TABLE pontos ADD COLUMN dentroPerimetro INTEGER;
            ALTER TABLE pontos ADD COLUMN distanciaMetros INTEGER;
            ALTER TABLE pontos ADD COLUMN precisaoMetros INTEGER;
        `,
    },
];

/**
 * Abrir a conexão com o banco de uma empresa e aplicar as migrações pendentes.
 * Liga o modo WAL e devolve o objeto de acesso com as consultas fechadas sobre a conexão.
 *
 * @param {string} caminho Caminho do arquivo SQLite da empresa.
 * @param {object} opcoes Aceita `empresa`, o código gravado nas linhas novas de usuarios.
 * @returns {object} Conexão em `db`, `userVersion` e as funções de consulta.
 */
export function criarBanco(caminho = 'klok.db', opcoes = {}) {
    const empresa = opcoes?.empresa ?? '';
    const db = new DatabaseSync(caminho);

    db.exec('PRAGMA journal_mode = WAL;');

    /** Aplicar em ordem as migrações que ainda não rodaram, cada uma dentro de uma transação. */
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

    /** Informar se já existe algum coordenador cadastrado na tabela usuarios. */
    function existeCoordenador() {
        return !!db.prepare('SELECT id FROM usuarios WHERE tipo = ? LIMIT 1').get(PAPEL_COORDENADOR);
    }

    /**
     * Inserir um coordenador na tabela usuarios, com o código da empresa e a senha em hash scrypt.
     *
     * O coordenador também é uma pessoa da empresa, então nasce com um registro
     * em `funcionarios` vinculado, o que permite bater ponto. A transação evita
     * funcionário órfão quando o nome de usuário já existe.
     *
     * @returns {object|undefined} A linha do coordenador recém criado.
     */
    function criarCoordenador(usuario, senha, nome, email, numero) {
        const nomeLimpo = paraTexto(nome);
        const numeroLimpo = paraTexto(numero);
        const emailLimpo = paraTexto(email);
        db.exec('BEGIN');
        try {
            const funcionario = db
                .prepare('INSERT INTO funcionarios (nome, numero, email) VALUES (?, ?, ?)')
                .run(nomeLimpo, numeroLimpo, emailLimpo);
            const r = db.prepare(
                `INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, nome, numero, email, empresa)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
                paraTexto(usuario),
                criarHashSenha(senha),
                PAPEL_COORDENADOR,
                funcionario.lastInsertRowid,
                nomeLimpo,
                numeroLimpo,
                emailLimpo,
                empresa
            );
            db.exec('COMMIT');
            return buscarUsuarioPorId(r.lastInsertRowid);
        } catch (e) {
            db.exec('ROLLBACK');
            throw e;
        }
    }

    /** Contar os coordenadores da tabela usuarios. */
    function contarCoordenadores() {
        return Number(
            db.prepare('SELECT COUNT(*) AS total FROM usuarios WHERE tipo = ?').get(PAPEL_COORDENADOR).total
        );
    }

    /** Listar os coordenadores da tabela usuarios em ordem de nome de login. */
    function listarCoordenadores() {
        return db.prepare(
            `SELECT id, usuario, nome, numero, email
             FROM usuarios
             WHERE tipo = ?
             ORDER BY usuario`
        ).all(PAPEL_COORDENADOR);
    }

    /**
     * Inserir um funcionário na tabela funcionarios.
     *
     * @returns {number} Id gerado para a linha nova.
     */
    function criarFuncionario(nome, numero, email) {
        const r = db.prepare(
            'INSERT INTO funcionarios (nome, numero, email) VALUES (?, ?, ?)'
        ).run(paraTexto(nome), paraTexto(numero), paraTexto(email));
        return r.lastInsertRowid;
    }

    /** Listar todos os registros da tabela funcionarios. */
    function listarFuncionarios() {
        return db.prepare('SELECT * FROM funcionarios').all();
    }

    /**
     * Buscar um funcionário pelo id na tabela funcionarios.
     *
     * @returns {object|undefined} A linha encontrada ou undefined.
     */
    function buscarFuncionario(id) {
        return db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id);
    }

    /**
     * Sobrescrever nome, número e email de um funcionário na tabela funcionarios.
     *
     * Quando o funcionário é um coordenador, o mesmo dado é copiado para a linha
     * de `usuarios`, para a aba de funcionários e a de coordenadores não
     * mostrarem valores diferentes.
     */
    function atualizarFuncionario(id, nome, numero, email) {
        const nomeLimpo = paraTexto(nome);
        const numeroLimpo = paraTexto(numero);
        const emailLimpo = paraTexto(email);
        db.exec('BEGIN');
        try {
            db.prepare(
                'UPDATE funcionarios SET nome = ?, numero = ?, email = ? WHERE id = ?'
            ).run(nomeLimpo, numeroLimpo, emailLimpo, id);
            db.prepare(
                'UPDATE usuarios SET nome = ?, numero = ?, email = ? WHERE funcionarioId = ?'
            ).run(nomeLimpo, numeroLimpo, emailLimpo, id);
            db.exec('COMMIT');
        } catch (e) {
            db.exec('ROLLBACK');
            throw e;
        }
    }

    /**
     * Atualizar nome, número e email de um usuário na tabela usuarios.
     *
     * @returns {object|undefined} A linha atualizada do usuário.
     */
    function atualizarDadosUsuarios(id, nome, numero, email) {
        db.prepare(
            'UPDATE usuarios SET nome = ?, numero = ?, email = ? WHERE id = ?'
        ).run(paraTexto(nome), paraTexto(numero), paraTexto(email), id);
        return buscarUsuarioPorId(id);
    }

    /**
     * Gravar o hash novo da senha na tabela usuarios e subir a versão da senha, o que
     * revoga os tokens emitidos antes da troca.
     *
     * @param {string} hashSenha Hash já calculado por quem chama.
     */
    function atualizarSenha(id, hashSenha) {
        // Incrementar a versão invalida os tokens emitidos antes da troca. Um
        // contador foi escolhido no lugar de carimbo de tempo porque o iat do
        // JWT tem granularidade de segundo, e o token emitido no mesmo segundo
        // da troca não é distinguível do antigo.
        db.prepare(
            'UPDATE usuarios SET senhaHash = ?, senhaVersao = senhaVersao + 1 WHERE id = ?'
        ).run(hashSenha, id);
    }

    /**
     * Apagar um funcionário junto com os pontos e o usuário dele, tudo em uma transação.
     *
     * A conta de coordenador não pode ser apagada por aqui: ela existe na aba de
     * coordenadores, e a lista de funcionários mostra o coordenador como pessoa
     * da empresa. Sem esse guard, excluir o funcionário derrubaria o login dele.
     *
     * @returns {{apagou: boolean, motivo: string|null}} `motivo` é 'coordenador'
     * quando a exclusão foi recusada, ou null nos demais casos.
     */
    function apagarFuncionario(id) {
        const ligado = db
            .prepare('SELECT tipo FROM usuarios WHERE funcionarioId = ? LIMIT 1')
            .get(id);
        if (ligado?.tipo === PAPEL_COORDENADOR) {
            return { apagou: false, motivo: 'coordenador' };
        }
        db.exec('BEGIN');
        try {
            db.prepare('DELETE FROM pontos WHERE funcionarioId = ?').run(id);
            db.prepare('DELETE FROM usuarios WHERE funcionarioId = ?').run(id);
            const r = db.prepare('DELETE FROM funcionarios WHERE id = ?').run(id);
            db.exec('COMMIT');
            return { apagou: r.changes > 0, motivo: null };
        } catch (e) {
            db.exec('ROLLBACK');
            throw e;
        }
    }

    /**
     * Criar um funcionário e o usuário local dele, com senha em hash scrypt e o código da empresa.
     *
     * @returns {object|undefined} A linha do usuário recém criado.
     */
    function criarUsuarioLocal(usuario, senha, nome) {
        const funcionarioId = criarFuncionario(nome || usuario, '', '');
        db.prepare(
            'INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, empresa) VALUES (?, ?, ?, ?, ?)'
        ).run(paraTexto(usuario), criarHashSenha(senha), 'funcionario', funcionarioId, empresa);
        return buscarUsuarioPorLogin(usuario);
    }

    /** Buscar um usuário pelo nome de login na tabela usuarios. */
    function buscarUsuarioPorLogin(usuario) {
        return db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(paraTexto(usuario));
    }

    /**
     * Buscar um usuário pelo email, comparando sem diferenciar maiúsculas na tabela usuarios
     * e também no funcionário vinculado a ele.
     *
     * @returns {object|undefined} A linha do usuário ou undefined.
     */
    function buscarUsuarioPorEmail(email) {
        return db.prepare(
            `SELECT u.* FROM usuarios u
             LEFT JOIN funcionarios f ON f.id = u.funcionarioId
             WHERE LOWER(u.email) = ? OR (f.email IS NOT NULL AND LOWER(f.email) = ?)`
        ).get(paraTexto(email), paraTexto(email));
    }

    /** Gravar um token de recuperação de senha na tabela recuperacao_senha, já em hash. */
    function criarRecuperacao(usuarioId, tokenHash, expiraEm) {
        db.prepare(
            'INSERT INTO recuperacao_senha (usuarioId, tokenHash, expiraEm) VALUES (?, ?, ?)'
        ).run(usuarioId, tokenHash, expiraEm);
    }

    /** Buscar o registro de recuperação pelo hash do token, pela coluna indexada. */
    function buscarRecuperacaoPorToken(tokenHash) {
        return db.prepare('SELECT * FROM recuperacao_senha WHERE tokenHash = ?').get(paraTexto(tokenHash));
    }

    /** Marcar um token de recuperação como usado na tabela recuperacao_senha, pelo id do registro. */
    // Recebe o id do registro, não o do usuário: o token de uso único deve ser
    // invalidado sozinho. Marcar por usuário invalidaria de uma vez todos os
    // links pendentes daquele usuário.
    function marcarRecuperacaoUsada(registroId) {
        db.prepare('UPDATE recuperacao_senha SET usado = 1 WHERE id = ?').run(registroId);
    }

    /** Buscar um usuário pela conta Google na tabela usuarios. */
    function buscarUsuarioPorGoogleId(googleId) {
        return db.prepare('SELECT * FROM usuarios WHERE googleId = ?').get(paraTexto(googleId));
    }

    /** Buscar um usuário pelo id na tabela usuarios. */
    function buscarUsuarioPorId(id) {
        return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    }

    /**
     * Conferir a senha de um usuário local e devolver a linha dele quando confere.
     * Um hash legado em sha256 é aceito uma vez e regravado em scrypt na mesma chamada,
     * com escrita na tabela usuarios.
     *
     * @returns {object|null} A linha do usuário ainda com senhaHash, ou null.
     */
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

    /**
     * Inserir uma batida na tabela pontos com a data e hora atuais em ISO.
     *
     * @returns {object} A linha do ponto recém criado.
     */
    function baterPonto(funcionarioId, tipo, apuracao = null) {
        const dataHora = new Date().toISOString();
        const r = db.prepare(
            `INSERT INTO pontos
                (funcionarioId, dataHora, tipo, localId, dentroPerimetro, distanciaMetros, precisaoMetros)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
            paraTexto(funcionarioId),
            dataHora,
            paraTexto(tipo),
            apuracao?.localId ?? null,
            apuracao?.dentroPerimetro ?? null,
            apuracao?.distanciaMetros ?? null,
            apuracao?.precisaoMetros ?? null
        );
        return db.prepare('SELECT * FROM pontos WHERE id = ?').get(r.lastInsertRowid);
    }

    /** Listar os pontos de um funcionário da tabela pontos, do mais recente para o mais antigo. */
    function listarPontos(funcionarioId) {
        return db.prepare(
            'SELECT * FROM pontos WHERE funcionarioId = ? ORDER BY dataHora DESC'
        ).all(funcionarioId);
    }

    /** Listar todos os pontos com o nome do funcionário, do mais recente para o mais antigo. */
    function listarTodosPontos() {
        return db.prepare(
            `SELECT p.*, f.nome AS funcionarioNome
             FROM pontos p JOIN funcionarios f ON f.id = p.funcionarioId
             ORDER BY p.dataHora DESC`
        ).all();
    }

    /** Informar se o erro do SQLite é violação de índice único, pelo código 2067. */
    function ehConflitoDeUnicidade(erro) {
        return erro?.errcode === 2067;
    }

    /**
     * Devolver a linha sem o campo senhaHash antes de ela sair desta camada.
     *
     * @returns {object|undefined} Cópia da linha sem `senhaHash`.
     */
    function semSenha(linha) {
        if (!linha) return linha;
        const { senhaHash, ...resto } = linha;
        return resto;
    }

    /**
     * Gravar um pedido de cadastro na tabela solicitacoes com status pendente.
     * Exige nome de login ou conta Google e devolve erro quando um dos índices únicos barra a duplicata.
     *
     * @param {object} pedido Traz `usuario`, `senhaHash`, `nome`, `email`, `numero` e `googleId`.
     * @returns {object} O pedido sem `senhaHash`, ou um objeto com `erro` e `status`.
     */
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

    /** Escolher o texto de conflito conforme o pedido tenha conta Google ou nome de login. */
    function mensagemDeConflito(contaGoogle) {
        return contaGoogle ? 'Esta conta Google já está em uso' : 'Este nome de usuário já está em uso';
    }

    /** Listar os pedidos de um status na tabela solicitacoes, do mais antigo para o mais novo, sem senhaHash. */
    function listarSolicitacoes(status = 'pendente') {
        return db.prepare('SELECT * FROM solicitacoes WHERE status = ? ORDER BY criadoEm').all(status).map(semSenha);
    }

    /** Buscar um pedido pelo id na tabela solicitacoes, sem o campo senhaHash. */
    function buscarSolicitacaoPorId(id) {
        return semSenha(db.prepare('SELECT * FROM solicitacoes WHERE id = ?').get(id));
    }

    /** Buscar um pedido pelo nome de login na tabela solicitacoes, sem o campo senhaHash. */
    function buscarSolicitacaoPorUsuario(usuario) {
        return semSenha(db.prepare('SELECT * FROM solicitacoes WHERE usuario = ?').get(paraTexto(usuario)));
    }

    /** Buscar um pedido pela conta Google na tabela solicitacoes, sem o campo senhaHash. */
    function buscarSolicitacaoPorGoogleId(googleId) {
        return semSenha(db.prepare('SELECT * FROM solicitacoes WHERE googleId = ?').get(paraTexto(googleId)));
    }

    /** Contar os pedidos com status pendente na tabela solicitacoes, para o contador do menu e do painel. */
    function contarSolicitacoesPendentes() {
        return Number(db.prepare("SELECT COUNT(*) AS total FROM solicitacoes WHERE status = 'pendente'").get().total);
    }

    /**
     * Conferir a senha de um pedido de cadastro contra o hash em scrypt gravado em solicitacoes.
     * Só aceita hash no formato atual e nunca devolve o campo senhaHash.
     *
     * @returns {object|null} O pedido sem `senhaHash` quando a senha confere, senão null.
     */
    function validarSenhaSolicitacao(usuario, senha) {
        if (typeof senha !== 'string') return null;
        const linha = db.prepare('SELECT * FROM solicitacoes WHERE usuario = ?').get(paraTexto(usuario));
        if (!linha || !linha.senhaHash) return null;
        if (!linha.senhaHash.startsWith(PREFIXO_HASH)) return null;
        return verificarSenha(senha, linha.senhaHash) ? semSenha(linha) : null;
    }

    /**
     * Aprovar um pedido pendente: cria o funcionário e o usuário e grava a decisão no pedido,
     * tudo em uma transação. Duplicata nos índices únicos de usuario ou googleId devolve 409.
     *
     * @returns {object} `funcionario` e `usuario` criados, ou `erro` com `status`.
     */
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

    /**
     * Marcar um pedido pendente como recusado na tabela solicitacoes, guardando a data da decisão.
     * O login da conta recusada segue bloqueado porque nenhum usuário é criado.
     *
     * @returns {object} O pedido atualizado, ou `erro` com `status`.
     */
    function recusarSolicitacao(id) {
        const pedido = buscarSolicitacaoPorId(id);
        if (!pedido) return { erro: 'Pedido não encontrado', status: 404 };
        if (pedido.status !== 'pendente') return { erro: 'Este pedido já foi decidido', status: 409 };
        db.prepare('UPDATE solicitacoes SET status = ?, decididoEm = ? WHERE id = ?')
            .run('recusado', new Date().toISOString(), id);
        return { solicitacao: buscarSolicitacaoPorId(id) };
    }

    /**
     * Montar os totais da empresa para o painel: funcionários, coordenadores, pontos,
     * pedidos pendentes e a data do último ponto.
     *
     * @returns {object} Contadores por tabela e `ultimoPonto`.
     */
    function resumo() {
        /** Contar as linhas de uma consulta que devolve a coluna total. */
        const um = (sql) => Number(db.prepare(sql).get().total);
        const ultimo = db.prepare('SELECT MAX(dataHora) AS quando FROM pontos').get();
        return {
            funcionarios: um('SELECT COUNT(*) AS total FROM funcionarios'),
            coordenadores: contarCoordenadores(),
            pontos: um('SELECT COUNT(*) AS total FROM pontos'),
            solicitacoesPendentes: contarSolicitacoesPendentes(),
            ultimoPonto: ultimo.quando ?? null,
        };
    }

    /** Buscar o usuário ligado a um funcionário na tabela usuarios. */
    function buscarUsuarioPorFuncionarioId(funcionarioId) {
        return db.prepare('SELECT * FROM usuarios WHERE funcionarioId = ?').get(Number(funcionarioId));
    }

    /**
     * Montar o trecho WHERE e a lista de valores para filtrar a tabela pontos por funcionário
     * e por intervalo de datas. A data é comparada com três horas de recuo, pelo fuso de Brasília.
     *
     * @returns {object} `onde` com o trecho SQL e `valores` na ordem dos parâmetros.
     */
    function filtrosDePontos({ funcionarioId = null, de = null, ate = null } = {}) {
        const condicoes = [];
        const valores = [];
        if (funcionarioId) {
            condicoes.push('p.funcionarioId = ?');
            valores.push(Number(funcionarioId));
        }
        if (de) {
            condicoes.push("date(p.dataHora, '-3 hours') >= ?");
            valores.push(de);
        }
        if (ate) {
            condicoes.push("date(p.dataHora, '-3 hours') <= ?");
            valores.push(ate);
        }
        return { onde: condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '', valores };
    }

    /**
     * Contar os pontos que passam pelos mesmos filtros usados na listagem paginada.
     *
     * @returns {number} Total de linhas da tabela pontos para o filtro.
     */
    function contarPontosFiltrados(filtros = {}) {
        const { onde, valores } = filtrosDePontos(filtros);
        return Number(
            db.prepare(`SELECT COUNT(*) AS total FROM pontos p ${onde}`).get(...valores).total
        );
    }

    /**
     * Listar pontos com o nome do funcionário, aplicando filtro e paginação.
     *
     * @param {object} opcoes Traz `limite`, `pagina` e os filtros aceitos por `filtrosDePontos`.
     * @returns {object} `pontos` da página e `total` do filtro inteiro.
     */
    function listarPontosFiltrados({ limite = 200, pagina = 1, ...filtros } = {}) {
        const { onde, valores } = filtrosDePontos(filtros);
        const pontos = db.prepare(
            `SELECT p.*, f.nome AS funcionarioNome
             FROM pontos p JOIN funcionarios f ON f.id = p.funcionarioId
             ${onde}
             ORDER BY p.dataHora DESC, p.id DESC
             LIMIT ? OFFSET ?`
        ).all(...valores, Number(limite), (Number(pagina) - 1) * Number(limite));
        return { pontos, total: contarPontosFiltrados(filtros) };
    }

    /**
     * Listar os pedidos da tabela solicitacoes de um status, com paginação e total do status.
     *
     * @returns {object} `solicitacoes` da página, sem senhaHash, e `total`.
     */
    function listarSolicitacoesPaginado({ status = 'pendente', limite = 200, pagina = 1 } = {}) {
        const total = Number(
            db.prepare('SELECT COUNT(*) AS total FROM solicitacoes WHERE status = ?').get(status).total
        );
        const solicitacoes = db.prepare(
            'SELECT * FROM solicitacoes WHERE status = ? ORDER BY criadoEm, id LIMIT ? OFFSET ?'
        ).all(status, Number(limite), (Number(pagina) - 1) * Number(limite)).map(semSenha);
        return { solicitacoes, total };
    }

    /**
     * Inserir um perímetro ativo para a empresa.
     *
     * @param {object} dados Campo nome, latitude, longitude e raioMetros.
     * @returns {object} A linha do local gravado.
     */
    function criarLocal({ nome, latitude, longitude, raioMetros = 150 } = {}) {
        const r = db.prepare(
            `INSERT INTO locais (nome, latitude, longitude, raioMetros, criadoEm)
             VALUES (?, ?, ?, ?, ?)`
        ).run(
            paraTexto(nome),
            Number(latitude),
            Number(longitude),
            Number(raioMetros),
            new Date().toISOString()
        );
        return buscarLocal(r.lastInsertRowid);
    }

    /** Listar os perímetros ativos, do mais antigo para o mais novo. */
    function listarLocais() {
        return db
            .prepare('SELECT * FROM locais WHERE removidoEm IS NULL ORDER BY id')
            .all();
    }

    /** Buscar um perímetro pelo id, inclusive removido, para preservar o histórico. */
    function buscarLocal(id) {
        return db.prepare('SELECT * FROM locais WHERE id = ?').get(Number(id));
    }

    /**
     * Sobrescrever nome, coordenada e raio de um perímetro ativo.
     *
     * @returns {object|undefined} A linha atualizada.
     */
    function atualizarLocal(id, { nome, latitude, longitude, raioMetros } = {}) {
        db.prepare(
            `UPDATE locais
             SET nome = ?, latitude = ?, longitude = ?, raioMetros = ?, atualizadoEm = ?
             WHERE id = ? AND removidoEm IS NULL`
        ).run(
            paraTexto(nome),
            Number(latitude),
            Number(longitude),
            Number(raioMetros),
            new Date().toISOString(),
            Number(id)
        );
        return buscarLocal(id);
    }

    /**
     * Marcar um perímetro como removido sem apagar a linha.
     *
     * @returns {object|undefined} A linha depois da remoção lógica.
     */
    function removerLocal(id) {
        db.prepare(
            'UPDATE locais SET removidoEm = ? WHERE id = ? AND removidoEm IS NULL'
        ).run(new Date().toISOString(), Number(id));
        return buscarLocal(id);
    }

    /** Contar os perímetros ativos da empresa. */
    function contarLocaisAtivos() {
        return Number(
            db.prepare('SELECT COUNT(*) AS total FROM locais WHERE removidoEm IS NULL').get().total
        );
    }

    /**
     * Gravar um pedido de perímetro pendente.
     *
     * @param {object} dados Campo tipo, localId, nome, latitude, longitude, raioMetros e solicitadoPor.
     * @returns {object} O pedido gravado.
     */
    function criarPedidoLocal({
        tipo,
        localId = null,
        nome,
        latitude,
        longitude,
        raioMetros,
        solicitadoPor,
    } = {}) {
        const r = db.prepare(
            `INSERT INTO pedidos_local
                (tipo, localId, nome, latitude, longitude, raioMetros, status, solicitadoPor, solicitadoEm)
             VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?, ?)`
        ).run(
            paraTexto(tipo),
            localId == null ? null : Number(localId),
            paraTexto(nome),
            Number(latitude),
            Number(longitude),
            Number(raioMetros),
            Number(solicitadoPor),
            new Date().toISOString()
        );
        return buscarPedidoLocal(r.lastInsertRowid);
    }

    /**
     * Listar pedidos de perímetro, opcionalmente por status, com o autor.
     *
     * @param {string} [status] Status desejado, ou nada para todos.
     * @returns {object[]} Pedidos encontrados.
     */
    function listarPedidosLocal(status) {
        const filtro = status ? 'WHERE p.status = ?' : '';
        const valores = status ? [status] : [];
        return db.prepare(
            `SELECT p.*, u.usuario AS solicitanteUsuario, u.nome AS solicitanteNome
             FROM pedidos_local p LEFT JOIN usuarios u ON u.id = p.solicitadoPor
             ${filtro} ORDER BY p.solicitadoEm, p.id`
        ).all(...valores);
    }

    /** Buscar um pedido de perímetro pelo id, com o autor. */
    function buscarPedidoLocal(id) {
        return db.prepare(
            `SELECT p.*, u.usuario AS solicitanteUsuario, u.nome AS solicitanteNome
             FROM pedidos_local p LEFT JOIN usuarios u ON u.id = p.solicitadoPor
             WHERE p.id = ?`
        ).get(Number(id));
    }

    /**
     * Decidir um pedido pendente, gravando autor e motivo da recusa.
     *
     * @returns {object|undefined} O pedido depois da decisão.
     */
    function decidirPedidoLocal(id, { status, decididoPor, motivoRecusa = null } = {}) {
        db.prepare(
            `UPDATE pedidos_local
             SET status = ?, decididoPor = ?, decididoEm = ?, motivoRecusa = ?
             WHERE id = ? AND status = 'pendente'`
        ).run(
            paraTexto(status),
            paraTexto(decididoPor),
            new Date().toISOString(),
            paraTexto(motivoRecusa) || null,
            Number(id)
        );
        return buscarPedidoLocal(id);
    }

    /** Indicar se existe pedido de criação de perímetro pendente. */
    function existePedidoCriacaoPendente() {
        return Boolean(
            db.prepare(
                "SELECT 1 FROM pedidos_local WHERE tipo = 'criar' AND status = 'pendente' LIMIT 1"
            ).get()
        );
    }

    /** Indicar se existe pedido pendente para o local informado. */
    function existePedidoPendenteParaLocal(localId) {
        return Boolean(
            db.prepare(
                "SELECT 1 FROM pedidos_local WHERE localId = ? AND status = 'pendente' LIMIT 1"
            ).get(Number(localId))
        );
    }

    /**
     * Executar uma função dentro de uma transação.
     *
     * @param {Function} fn Função síncrona que usa o banco.
     * @returns {unknown} O retorno da função.
     */
    function emTransacao(fn) {
        db.exec('BEGIN');
        try {
            const resultado = fn();
            db.exec('COMMIT');
            return resultado;
        } catch (e) {
            db.exec('ROLLBACK');
            throw e;
        }
    }

    return {
        db,
        /** Ler a versão de migração gravada no banco da empresa. */
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
        resumo,
        buscarUsuarioPorFuncionarioId,
        contarPontosFiltrados,
        listarPontosFiltrados,
        listarSolicitacoesPaginado,
        listarLocais,
        buscarLocal,
        criarLocal,
        atualizarLocal,
        removerLocal,
        contarLocaisAtivos,
        listarPedidosLocal,
        buscarPedidoLocal,
        criarPedidoLocal,
        decidirPedidoLocal,
        existePedidoCriacaoPendente,
        existePedidoPendenteParaLocal,
        emTransacao,
    };
}
