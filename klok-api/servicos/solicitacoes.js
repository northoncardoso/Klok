import { avisarAprovacao } from '../avisos.js';

/**
 * Aprovar o pedido no banco da empresa e, se a aprovação passou, avisar o candidato por email.
 * @param {object} dados banco da empresa, empresa, id do pedido e enviarEmail
 * @returns {Promise<object>} resultado do banco, com erro quando o pedido não pode ser aprovado
 */
export async function aprovarPedido({ banco, empresa, id, enviarEmail }) {
    const pedido = banco.buscarSolicitacaoPorId(id);
    const resultado = banco.aprovarSolicitacao(id);
    if (resultado.erro) return resultado;

    if (pedido) {
        await avisarAprovacao({
            enviarEmail,
            empresa,
            usuario: pedido.usuario,
            email: pedido.email,
        });
    }
    return resultado;
}

/**
 * Recusar o pedido no banco da empresa, mantendo o registro para histórico.
 * @param {object} dados banco da empresa e id do pedido
 * @returns {object} resultado do banco, com erro quando o pedido não pode ser recusado
 */
export function recusarPedido({ banco, id }) {
    return banco.recusarSolicitacao(id);
}
