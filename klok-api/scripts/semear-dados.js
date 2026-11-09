#!/usr/bin/env node
// Cria dados de exemplo nos bancos multiempresa do Klok.
//
// Uso:
//   npm run semear             cria o que ainda não existe
//   npm run semear -- --recriar apaga e recria os bancos das empresas de exemplo
//
// Os bancos ficam em klok-api/dados/: catalogo.db mais um CODIGO.db por empresa.
// A senha de todos os usuários de exemplo é senha123, e o admin é admin/admin12345.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { abrirCatalogo } from '../admin/catalogo.js';
import { criarBanco } from '../db.js';
import { criarHashSenha } from '../senha.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dadosDir = join(raiz, 'dados');
const recriar = process.argv.includes('--recriar');
const SENHA = 'senha123';
const HASH = criarHashSenha(SENHA);
const HOJE = new Date();

const EMPRESAS = [
    {
        codigo: 'ACME',
        nome: 'Atlas Comércio',
        ativa: true,
        coordenadores: [
            ['ana.souza', 'Ana Souza', 'ana.souza@atlas.com.br', '(11) 98888-1001'],
            ['bruno.lima', 'Bruno Lima', 'bruno.lima@atlas.com.br', '(11) 98888-1002'],
        ],
        funcionarios: [
            ['Carla Dias', 'carla.dias', 'carla.dias@atlas.com.br', '(11) 97777-2001'],
            ['Daniel Alves', 'daniel.alves', 'daniel.alves@atlas.com.br', '(11) 97777-2002'],
            ['Eduarda Nunes', 'eduarda.nunes', 'eduarda.nunes@atlas.com.br', '(11) 97777-2003'],
            ['Felipe Castro', 'felipe.castro', 'felipe.castro@atlas.com.br', '(11) 97777-2004'],
            ['Gabriela Rocha', 'gabriela.rocha', 'gabriela.rocha@atlas.com.br', '(11) 97777-2005'],
            ['Henrique Pires', null, 'henrique.pires@atlas.com.br', '(11) 97777-2006'],
            ['Igor Matos', null, 'igor.matos@atlas.com.br', '(11) 97777-2007'],
        ],
    },
    {
        codigo: 'GLOBEX',
        nome: 'Globex Tecnologia',
        ativa: true,
        coordenadores: [
            ['carla.mendes', 'Carla Mendes', 'carla.mendes@globex.com.br', '(21) 96666-3001'],
        ],
        funcionarios: [
            ['Joana Freitas', 'joana.freitas', 'joana.freitas@globex.com.br', '(21) 95555-4001'],
            ['Kaique Barbosa', 'kaique.barbosa', 'kaique.barbosa@globex.com.br', '(21) 95555-4002'],
            ['Larissa Pinto', 'larissa.pinto', 'larissa.pinto@globex.com.br', '(21) 95555-4003'],
            ['Marcelo Teixeira', 'marcelo.teixeira', 'marcelo.teixeira@globex.com.br', '(21) 95555-4004'],
            ['Natália Campos', 'natalia.campos', 'natalia.campos@globex.com.br', '(21) 95555-4005'],
            ['Otávio Reis', 'otavio.reis', 'otavio.reis@globex.com.br', '(21) 95555-4006'],
            ['Patrícia Lopes', null, 'patricia.lopes@globex.com.br', '(21) 95555-4007'],
        ],
    },
    {
        codigo: 'INITECH',
        nome: 'Initech Serviços',
        ativa: true,
        coordenadores: [
            ['diego.rocha', 'Diego Rocha', 'diego.rocha@initech.com.br', '(31) 94444-5001'],
        ],
        funcionarios: [
            ['Rafael Moura', 'rafael.moura', 'rafael.moura@initech.com.br', '(31) 93333-6001'],
            ['Sofia Cardoso', 'sofia.cardoso', 'sofia.cardoso@initech.com.br', '(31) 93333-6002'],
            ['Thiago Nascimento', 'thiago.nascimento', 'thiago.nascimento@initech.com.br', '(31) 93333-6003'],
            ['Vitória Araújo', 'vitoria.araujo', 'vitoria.araujo@initech.com.br', '(31) 93333-6004'],
            ['Wesley Farias', null, 'wesley.farias@initech.com.br', '(31) 93333-6005'],
        ],
    },
    {
        codigo: 'UMBRELLA',
        nome: 'Umbrella Logística',
        ativa: false,
        coordenadores: [
            ['elisa.prado', 'Elisa Prado', 'elisa.prado@umbrella.com.br', '(41) 92222-7001'],
        ],
        funcionarios: [
            ['Yuri Batista', 'yuri.batista', 'yuri.batista@umbrella.com.br', '(41) 91111-8001'],
            ['Zélia Moreira', 'zelia.moreira', 'zelia.moreira@umbrella.com.br', '(41) 91111-8002'],
            ['André Siqueira', 'andre.siqueira', 'andre.siqueira@umbrella.com.br', '(41) 91111-8003'],
            ['Bianca Duarte', null, 'bianca.duarte@umbrella.com.br', '(41) 91111-8004'],
        ],
    },
];

const SOLICITACOES = [
    ['ACME', 'lucas.ferreira', 'Lucas Ferreira', 'lucas.ferreira@email.com', '(11) 90000-0001', 'pendente', 2, null],
    ['ACME', 'marina.borges', 'Marina Borges', 'marina.borges@email.com', '(11) 90000-0002', 'pendente', 5, null],
    ['ACME', 'pedro.henrique', 'Pedro Henrique', 'pedro.henrique@email.com', '(11) 90000-0003', 'aprovado', 9, 8],
    ['ACME', 'renata.silva', 'Renata Silva', 'renata.silva@email.com', '(11) 90000-0004', 'recusado', 12, 11],
    ['GLOBEX', 'sabrina.melo', 'Sabrina Melo', 'sabrina.melo@email.com', '(21) 90000-0005', 'pendente', 1, null],
    ['GLOBEX', 'tomás.ribeiro', 'Tomás Ribeiro', 'tomas.ribeiro@email.com', '(21) 90000-0006', 'aprovado', 6, 5],
    ['INITECH', 'ursula.gomes', 'Úrsula Gomes', 'ursula.gomes@email.com', '(31) 90000-0007', 'pendente', 3, null],
    ['INITECH', 'vagner.costa', 'Vagner Costa', 'vagner.costa@email.com', '(31) 90000-0008', 'recusado', 10, 9],
    ['UMBRELLA', 'wagner.paiva', 'Wagner Paiva', 'wagner.paiva@email.com', '(41) 90000-0009', 'pendente', 4, null],
];

function diasUteis(quantidade) {
    const dias = [];
    for (let i = 0; dias.length < quantidade && i < 90; i++) {
        const dia = new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth(), HOJE.getUTCDate() - i));
        const diaDaSemana = dia.getUTCDay();
        if (diaDaSemana === 0 || diaDaSemana === 6) continue;
        dias.push(dia);
    }
    return dias.reverse();
}

const DIAS = diasUteis(25);

function garantirSolicitacoes(banco) {
    if (banco.userVersion() >= 8) return;
    banco.db.exec('BEGIN');
    try {
        banco.db.exec(`
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
            PRAGMA user_version = 8;
        `);
        banco.db.exec('COMMIT');
    } catch (erro) {
        banco.db.exec('ROLLBACK');
        throw erro;
    }
}

function dataIso(diasAtras, hora, minuto) {
    const dia = new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth(), HOJE.getUTCDate() - diasAtras));
    return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), hora + 3, minuto)).toISOString();
}

function semearEmpresa(empresa) {
    const caminho = join(dadosDir, `${empresa.codigo}.db`);
    if (existsSync(caminho) && !recriar) {
        console.log(`  ${empresa.codigo}: banco já existe, pulando (use --recriar para refazer)`);
        return;
    }
    if (recriar) {
        for (const sufixo of ['', '-wal', '-shm']) rmSync(caminho + sufixo, { force: true });
    }

    const banco = criarBanco(caminho, { empresa: empresa.codigo });
    garantirSolicitacoes(banco);

    for (const [usuario, nome, email, numero] of empresa.coordenadores) {
        banco.criarCoordenador(usuario, SENHA, nome, email, numero);
    }

    const inserirFuncionario = banco.db.prepare(
        'INSERT INTO funcionarios (nome, numero, email) VALUES (?, ?, ?)'
    );
    const inserirUsuario = banco.db.prepare(
        `INSERT INTO usuarios (usuario, senhaHash, tipo, funcionarioId, googleId, nome, numero, email, empresa)
         VALUES (?, ?, 'funcionario', ?, ?, ?, ?, ?, ?)`
    );
    const inserirPonto = banco.db.prepare(
        'INSERT INTO pontos (funcionarioId, dataHora, tipo) VALUES (?, ?, ?)'
    );

    const funcionarios = [];

    banco.db.exec('BEGIN');
    try {
        for (const [indice, [nome, usuario, email, numero]] of empresa.funcionarios.entries()) {
            const resultado = inserirFuncionario.run(nome, numero, email);
            const funcionarioId = Number(resultado.lastInsertRowid);
            funcionarios.push({ id: funcionarioId, indice });

            if (usuario) {
                inserirUsuario.run(usuario, HASH, funcionarioId, null, nome, numero, email, empresa.codigo);
            } else if (indice < empresa.funcionarios.length - 1) {
                const googleId = `google-${empresa.codigo.toLowerCase()}-${indice}`;
                inserirUsuario.run(null, null, funcionarioId, googleId, nome, numero, email, empresa.codigo);
            }
            // O último funcionário de cada empresa fica sem usuário, para praticar LEFT JOIN.
        }

        for (const { id, indice } of funcionarios) {
            for (const [diaIndice, dia] of DIAS.entries()) {
                if ((indice + diaIndice) % 11 === 0) continue;

                const variacao = (indice * 7 + diaIndice * 3) % 15;
                const horarios = [
                    [8, variacao],
                    [12, (variacao + 5) % 15],
                    [13, (variacao + 2) % 10],
                    [17, (variacao + 10) % 20],
                ];
                if (dia.getUTCDay() === 5) horarios[3] = [18, variacao % 15];

                for (const [hora, minuto] of horarios) {
                    const dataHora = new Date(
                        Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), hora + 3, minuto)
                    ).toISOString();
                    inserirPonto.run(id, dataHora, 'batida');
                }
            }
        }

        const inserirSolicitacao = banco.db.prepare(
            `INSERT INTO solicitacoes (usuario, senhaHash, nome, email, numero, googleId, status, criadoEm, decididoEm)
             VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`
        );
        for (const [codigo, usuario, nome, email, numero, status, criadaAtras, decididaAtras] of SOLICITACOES) {
            if (codigo !== empresa.codigo) continue;
            inserirSolicitacao.run(
                usuario,
                HASH,
                nome,
                email,
                numero,
                status,
                dataIso(criadaAtras, 9, 30),
                decididaAtras === null ? null : dataIso(decididaAtras, 10, 0)
            );
        }

        banco.db.exec('COMMIT');
    } catch (erro) {
        banco.db.exec('ROLLBACK');
        banco.db.close();
        throw erro;
    }

    const totais = {
        coordenadores: banco.contarCoordenadores(),
        funcionarios: banco.db.prepare('SELECT COUNT(*) AS total FROM funcionarios').get().total,
        pontos: banco.db.prepare('SELECT COUNT(*) AS total FROM pontos').get().total,
        solicitacoes: banco.db.prepare('SELECT COUNT(*) AS total FROM solicitacoes').get().total,
    };
    console.log(
        `  ${empresa.codigo}: ${totais.coordenadores} coordenadores, ${totais.funcionarios} funcionários, ` +
            `${totais.pontos} pontos, ${totais.solicitacoes} solicitações`
    );
    banco.db.close();
}

mkdirSync(dadosDir, { recursive: true });
console.log(`Dados em ${dadosDir}`);

const catalogo = abrirCatalogo(join(dadosDir, 'catalogo.db'));
if (catalogo.contarAdmins() === 0) {
    catalogo.criarAdmin({
        usuario: 'admin',
        senha: 'admin12345',
        nome: 'Admin Klok',
        email: 'admin@klok.local',
    });
    console.log('  admin criado: admin / admin12345');
}

for (const empresa of EMPRESAS) {
    if (!catalogo.buscarEmpresa(empresa.codigo)) {
        const criada = catalogo.criarEmpresa({ codigo: empresa.codigo, nome: empresa.nome });
        if (criada.erro) throw new Error(criada.erro);
    }
    if (!empresa.ativa && !catalogo.buscarEmpresa(empresa.codigo).desativadaEm) {
        catalogo.atualizarEmpresa(empresa.codigo, { ativa: false });
    }
    semearEmpresa(empresa);
}
catalogo.fechar();

console.log('');
console.log('Pronto. Senha de todos os usuários de exemplo: senha123');
console.log('Admin do painel: admin / admin12345');
console.log('Abra no DBeaver ou use: KLOK_DB=dados/ACME.db npm run sql');
