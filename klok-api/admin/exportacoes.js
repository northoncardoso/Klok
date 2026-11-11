import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MIGRACOES } from '../db.js';
import { codigoEmpresa } from '../validacao.js';

const ASSINATURA_SQLITE = 'SQLite format 3\u0000';

// Exportação e importação do banco de uma empresa pelo painel.
//
// A restauração é o caminho mais arriscado do painel: o arquivo atual nunca é
// removido antes de o substituto estar validado e pronto no mesmo diretório.
// Assim a empresa nunca fica sem banco, mesmo se algo falhar no meio.
export function criarExportacoesAdmin({ gerenciador }) {
    function backup(req, res) {
        const aberta = gerenciador.abrir(codigoEmpresa(req.params.codigo), {
            permitirDesativada: true,
            criarSeFaltar: false,
        });
        if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

        const dir = mkdtempSync(join(tmpdir(), 'klok-backup-'));
        const arquivo = join(dir, `${aberta.empresa.codigo}.db`);
        try {
            // VACUUM INTO gera uma cópia consistente e compactada mesmo com o
            // banco aberto em WAL, sem depender de copiar o arquivo e o -wal.
            aberta.banco.db.prepare('VACUUM INTO ?').run(arquivo);
        } catch (erro) {
            rmSync(dir, { recursive: true, force: true });
            throw erro;
        }

        const nome = `klok-${aberta.empresa.codigo}-${new Date().toISOString().slice(0, 10)}.db`;
        // O callback roda no fim do envio e também em erro. É o único ponto em
        // que o diretório temporário pode ser apagado com segurança.
        res.download(arquivo, nome, (erro) => {
            rmSync(dir, { recursive: true, force: true });
            if (!erro) return;
            if (res.headersSent) return res.end();
            res.status(500).json({ erro: 'Falha ao enviar o backup' });
        });
    }

    function restaurarBackup(req, res) {
        const codigo = codigoEmpresa(req.params.codigo);
        // O header é a trava contra restauração por engano, então compara com o
        // código normalizado. A autenticação de admin continua sendo a segurança.
        const confirmacao = (req.get('x-confirmar-codigo') ?? '').trim().toUpperCase();
        if (!codigo || confirmacao !== codigo) {
            return res.status(400).json({ erro: 'Confirmação do código da empresa não confere' });
        }

        const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (bytes.length < 100 || bytes.subarray(0, 16).toString('latin1') !== ASSINATURA_SQLITE) {
            return res.status(400).json({ erro: 'O arquivo enviado não é um banco SQLite válido' });
        }

        const destino = gerenciador.caminhoDe(codigo);
        if (!destino) return res.status(400).json({ erro: 'Código de empresa inválido' });
        // Lido antes de abrir, porque abrir pode criar o arquivo quando falta.
        const tinhaAnterior = existsSync(destino);

        const aberta = gerenciador.abrir(codigo, { permitirDesativada: true });
        if (aberta.erro) return res.status(aberta.status).json({ erro: aberta.erro });

        const carimbo = Date.now();
        const candidato = `${destino}.restaurando-${carimbo}`;
        const anterior = `${destino}.antes-de-restaurar-${carimbo}`;

        // O candidato é escrito ao lado do banco de propósito: assim o rename
        // final é atômico e funciona mesmo com /tmp em outro sistema de arquivos.
        let versao = 0;
        try {
            writeFileSync(candidato, bytes);
            const teste = new DatabaseSync(candidato, { readOnly: true });
            try {
                const integridade = teste.prepare('PRAGMA integrity_check').get();
                versao = Number(teste.prepare('PRAGMA user_version').get().user_version);
                if (integridade.integrity_check !== 'ok') throw new Error('integridade');
                if (versao < 1 || versao > MIGRACOES.length) throw new Error('versão');
            } finally {
                teste.close();
            }
        } catch {
            rmSync(candidato, { force: true });
            return res.status(400).json({ erro: 'Backup inválido ou de uma versão desconhecida' });
        }

        try {
            // Cópia do banco atual pelo próprio SQLite, ainda com a conexão
            // aberta: é a garantia de que o arquivo guardado está consistente.
            if (tinhaAnterior) aberta.banco.db.prepare('VACUUM INTO ?').run(anterior);
        } catch {
            rmSync(candidato, { force: true });
            return res.status(500).json({ erro: 'Não foi possível guardar o banco atual. Nada foi alterado' });
        }

        gerenciador.fecharBanco(codigo);

        try {
            // Arquivos auxiliares do WAL pertenciam ao banco antigo: precisam
            // sair antes de o novo arquivo ocupar o lugar.
            rmSync(`${destino}-wal`, { force: true });
            rmSync(`${destino}-shm`, { force: true });
            // O rename substitui o arquivo de uma vez, então não existe janela
            // em que a empresa fique sem banco.
            renameSync(candidato, destino);
        } catch {
            rmSync(candidato, { force: true });
            // O banco antigo continua no lugar. Reabre para o painel seguir;
            // se a reabertura falhar, o arquivo em disco segue intacto.
            try {
                gerenciador.abrir(codigo, { permitirDesativada: true });
            } catch {
                // nada a fazer: o arquivo anterior está preservado no disco
            }
            return res.status(500).json({ erro: 'Falha ao trocar o banco. O anterior foi mantido' });
        }

        let reaberta;
        try {
            reaberta = gerenciador.abrir(codigo, { permitirDesativada: true });
        } catch {
            return res.status(500).json({ erro: 'Banco restaurado, mas não foi possível reabrir' });
        }
        if (reaberta.erro) {
            return res.status(500).json({ erro: 'Banco restaurado, mas não foi possível reabrir' });
        }

        res.json({ sucesso: true, versao: reaberta.banco.userVersion() });
    }

    return { backup, restaurarBackup };
}
