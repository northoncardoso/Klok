import { avisarAprovacao } from '../avisos.js';

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

export function recusarPedido({ banco, id }) {
    return banco.recusarSolicitacao(id);
}
