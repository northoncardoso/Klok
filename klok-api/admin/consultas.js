import { statSync } from 'node:fs';

import { codigoEmpresa } from '../validacao.js';
import { dataIso, inteiroPositivo, paginacao } from './validacao-painel.js';

const STATUS_SOLICITACAO = ['pendente', 'aprovado', 'recusado'];
const STATUS_PEDIDO_LOCAL = ['pendente', 'aprovado', 'recusado'];

// Consultas do painel de suporte. Elas abrem a empresa permitindo desativada,
// porque o painel precisa inspecionar empresa desligada.
// Rotas de leitura não criam banco: arquivo ausente vira 404, para não atrapalhar a restauração de backup.
/**
 * Montar os controladores de leitura do painel de suporte.
 * @param {object} deps gerenciador de bancos, que resolve o banco de cada empresa
 * @returns {object} controladores resumo, listas e estado do banco
 */
export function criarConsultasAdmin({ gerenciador }) {
    /** Abrir o banco da empresa permitindo desativada, porque o painel precisa inspecionar empresa desligada, e sem criar arquivo ausente. */
    function abrirParaAdmin(codigo) {
        return gerenciador.abrir(codigoEmpresa(codigo), {
            permitirDesativada: true,
            criarSeFaltar: false,
        });
    }

    /** Responder o erro da abertura e devolver false para o controlador parar. */
    function responderAbertura(res, aberta) {
        if (aberta.erro) {
            res.status(aberta.status).json({ erro: aberta.erro });
            return false;
        }
        return true;
    }

    /** Devolver o resumo da empresa aberta de propósito mesmo desativada e as contagens do banco dela. */
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

    /** Listar os coordenadores da empresa, inclusive de empresa desativada. */
    function listarCoordenadores(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        res.json(aberta.banco.listarCoordenadores());
    }

    /** Listar os funcionários da empresa, inclusive de empresa desativada. */
    function listarFuncionarios(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        res.json(aberta.banco.listarFuncionarios());
    }

    /**
     * Listar os pontos da empresa com filtro opcional por funcionário e período,
     * já paginado.
     * @param {object} req query com funcionarioId, de, ate, limite e pagina
     * @param {object} res resposta com pontos, pagina, paginas, limite e total
     */
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

    /**
     * Listar os pedidos de cadastro da empresa filtrados por status, com
     * pendente como padrão.
     * @param {object} req query com status, limite e pagina
     * @param {object} res resposta com solicitacoes, pagina, paginas, limite e total
     */
    function listarSolicitacoes(req, res) {
        const status = req.query.status || 'pendente';
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

    /**
     * Listar os pedidos de perímetro da empresa, com o autor, filtrados por
     * status, pendente por padrão.
     * @param {object} req query com status
     * @param {object} res lista de pedidos
     */
    function listarPedidosLocais(req, res) {
        const status = req.query.status || 'pendente';
        if (!STATUS_PEDIDO_LOCAL.includes(status)) {
            return res.status(400).json({ erro: 'Status inválido' });
        }

        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        res.json(aberta.banco.listarPedidosLocal(status));
    }

    /** Informar caminho, versão de migração e tamanho em disco do banco da empresa. */
    function infoBanco(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;
        // O 404 de banco ausente já vem da abertura; o statSync é a segunda checagem.
        const caminho = gerenciador.caminhoDe(aberta.empresa.codigo);
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
        listarPedidosLocais,
        infoBanco,
    };
}
