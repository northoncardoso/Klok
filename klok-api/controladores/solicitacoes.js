import { aprovarPedido, recusarPedido } from '../servicos/solicitacoes.js';

const STATUS_VALIDOS = ['pendente', 'aprovado', 'recusado'];

/**
 * Montar os controladores de solicitações de cadastro.
 * @param {object} deps Dependências com enviarEmail, usado no aviso de aprovação.
 * @returns {object} Controladores listar, contagem, aprovar e recusar.
 */
export function criarControladoresSolicitacoes({ enviarEmail }) {
    /**
     * Listar os pedidos de cadastro por status.
     * Responde 200 com a lista e 400 em status fora de pendente, aprovado ou
     * recusado. Exige coordenador, a checagem está no use da rota. Sem filtro
     * usa pendente.
     */
    function listar(req, res) {
        const status = req.query.status ?? 'pendente';
        if (!STATUS_VALIDOS.includes(status)) {
            return res.status(400).json({ erro: 'Status inválido' });
        }
        res.json(req.banco.listarSolicitacoes(status));
    }

    /**
     * Contar os pedidos pendentes da empresa.
     * Responde 200 com o total de pendentes, usado no contador do menu. Exige
     * coordenador, a checagem está no use da rota.
     */
    function contagem(req, res) {
        res.json({ pendentes: req.banco.contarSolicitacoesPendentes() });
    }

    /**
     * Aprovar um pedido de cadastro e criar o funcionário.
     * Responde 201 com o funcionário criado e 404 ou 409 conforme o id não
     * exista ou o pedido já tenha sido decidido. Exige coordenador, a checagem
     * está no use da rota. Efeito colateral: o serviço de aprovação manda email
     * de aviso para o pedido aprovado.
     */
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

    /**
     * Recusar um pedido de cadastro.
     * Responde 200 em sucesso e 404 ou 409 conforme o id não exista ou o pedido
     * já tenha sido decidido. Exige coordenador, a checagem está no use da
     * rota. O pedido recusado continua no histórico e bloqueia o login.
     */
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
