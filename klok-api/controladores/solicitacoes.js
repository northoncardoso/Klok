import { avisarAprovacao } from '../avisos.js';

const STATUS_VALIDOS = ['pendente', 'aprovado', 'recusado'];

export function criarControladoresSolicitacoes({ enviarEmail }) {
    function listar(req, res) {
        const status = req.query.status ?? 'pendente';
        if (!STATUS_VALIDOS.includes(status)) {
            return res.status(400).json({ erro: 'Status inválido' });
        }
        res.json(req.banco.listarSolicitacoes(status));
    }

    function contagem(req, res) {
        res.json({ pendentes: req.banco.contarSolicitacoesPendentes() });
    }

    async function aprovar(req, res) {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(404).json({ erro: 'Pedido não encontrado' });
        }
        const pedido = req.banco.buscarSolicitacaoPorId(id);
        const resultado = req.banco.aprovarSolicitacao(id);
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });

        if (pedido) {
            await avisarAprovacao({
                enviarEmail,
                empresa: req.empresa,
                usuario: pedido.usuario ?? 'sua conta Google',
                email: pedido.email,
            });
        }
        res.status(201).json(resultado.funcionario);
    }

    function recusar(req, res) {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(404).json({ erro: 'Pedido não encontrado' });
        }
        const resultado = req.banco.recusarSolicitacao(id);
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
        res.json({ sucesso: true });
    }

    return { listar, contagem, aprovar, recusar };
}
