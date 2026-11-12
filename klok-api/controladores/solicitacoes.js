import { aprovarPedido, recusarPedido } from '../servicos/solicitacoes.js';

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
        const resultado = await aprovarPedido({
            banco: req.banco,
            empresa: req.empresa,
            id,
            enviarEmail,
        });
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
        res.status(201).json(resultado.funcionario);
    }

    function recusar(req, res) {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(404).json({ erro: 'Pedido não encontrado' });
        }
        const resultado = recusarPedido({ banco: req.banco, id });
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
        res.json({ sucesso: true });
    }

    return { listar, contagem, aprovar, recusar };
}
