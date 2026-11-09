import { statSync } from 'node:fs';

import { dataIso, inteiroPositivo, paginacao } from './validacao-painel.js';

const STATUS_SOLICITACAO = ['pendente', 'aprovado', 'recusado'];

// Consultas do painel de suporte. Elas abrem a empresa permitindo desativada,
// porque o painel precisa inspecionar empresa desligada.
export function criarConsultasAdmin({ gerenciador }) {
    function abrirParaAdmin(codigo) {
        return gerenciador.abrir(codigo, { permitirDesativada: true });
    }

    function responderAbertura(res, aberta) {
        if (aberta.erro) {
            res.status(aberta.status).json({ erro: aberta.erro });
            return false;
        }
        return true;
    }

    function resumo(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        res.json({
            codigo: aberta.empresa.codigo,
            nome: aberta.empresa.nome,
            desativadaEm: aberta.empresa.desativadaEm ?? null,
            ...aberta.banco.resumo(),
        });
    }

    function listarCoordenadores(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        res.json(aberta.banco.listarCoordenadores());
    }

    function listarFuncionarios(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        res.json(aberta.banco.listarFuncionarios());
    }

    function listarPontos(req, res) {
        const { limite, pagina, erro } = paginacao(req.query);
        if (erro) return res.status(400).json({ erro });

        const funcionarioId = inteiroPositivo(req.query.funcionarioId);
        if (req.query.funcionarioId && funcionarioId === null) {
            return res.status(400).json({ erro: 'Funcionário inválido' });
        }
        const de = dataIso(req.query.de);
        if (req.query.de && de === null) return res.status(400).json({ erro: 'Data inicial inválida' });
        const ate = dataIso(req.query.ate);
        if (req.query.ate && ate === null) return res.status(400).json({ erro: 'Data final inválida' });

        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const { pontos, total } = aberta.banco.listarPontosFiltrados({
            funcionarioId,
            de,
            ate,
            limite,
            pagina,
        });
        res.json({
            pontos,
            pagina,
            paginas: total === 0 ? 0 : Math.ceil(total / limite),
            limite,
            total,
        });
    }

    function listarSolicitacoes(req, res) {
        const status = req.query.status ?? 'pendente';
        if (!STATUS_SOLICITACAO.includes(status)) {
            return res.status(400).json({ erro: 'Status inválido' });
        }
        const { limite, pagina, erro } = paginacao(req.query);
        if (erro) return res.status(400).json({ erro });

        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const { solicitacoes, total } = aberta.banco.listarSolicitacoesPaginado({ status, limite, pagina });
        res.json({
            solicitacoes,
            pagina,
            paginas: total === 0 ? 0 : Math.ceil(total / limite),
            limite,
            total,
        });
    }

    function infoBanco(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        const caminho = gerenciador.caminhoDe(req.params.codigo);
        let tamanhoBytes = 0;
        try {
            tamanhoBytes = statSync(caminho).size;
        } catch {
            return res.status(404).json({ erro: 'Banco da empresa não encontrado no disco' });
        }
        res.json({
            codigo: aberta.empresa.codigo,
            caminho,
            versao: aberta.banco.userVersion(),
            tamanhoBytes,
        });
    }

    return {
        resumo,
        listarCoordenadores,
        listarFuncionarios,
        listarPontos,
        listarSolicitacoes,
        infoBanco,
    };
}
