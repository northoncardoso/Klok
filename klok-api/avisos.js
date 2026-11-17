import { destinatarioValido } from './email.js';

/**
 * Montar o texto do email que avisa os coordenadores sobre um pedido de cadastro.
 * @param {object} dados empresa, nome, identificacao e email do pedido
 * @returns {string} corpo do email em texto puro
 */
export function textoNovoPedido({ empresa, nome, identificacao, email }) {
    return [
        `Chegou um pedido de cadastro na empresa ${empresa}.`,
        '',
        `Nome: ${nome || 'não informado'}`,
        `Identificação: ${identificacao}`,
        `Email: ${email}`,
        '',
        'Abra o app Klok, entre como coordenador e decida em Solicitações.',
    ].join('\n');
}

/**
 * Montar o texto do email de aprovação, escolhendo a instrução de entrada conforme
 * o pedido tenha usuário e senha ou login pelo Google.
 * @param {object} dados empresa e usuario, este vazio em pedido feito pelo Google
 * @returns {string} corpo do email em texto puro
 */
export function textoAprovacao({ empresa, usuario }) {
    const entrada = usuario
        ? `Entre no app Klok com o usuário ${usuario} e a senha que você cadastrou.`
        : 'Entre no app Klok com o botão Entrar com Google.';
    return [
        `Seu cadastro na empresa ${empresa} foi aprovado.`,
        '',
        entrada,
    ].join('\n');
}

/**
 * Enviar email para cada coordenador da empresa que tenha endereço válido, avisando
 * sobre o novo pedido. Falha de um envio é registrada no console e não interrompe os outros.
 * @param {object} dados banco da empresa, enviarEmail, empresa, nome, identificacao e email
 * @returns {Promise<void>}
 */
export async function avisarCoordenadores({ banco, enviarEmail, empresa, nome, identificacao, email }) {
    const assunto = `Klok: novo pedido de cadastro em ${empresa}`;
    const texto = textoNovoPedido({ empresa, nome, identificacao, email });
    for (const coordenador of banco.listarCoordenadores()) {
        if (!destinatarioValido(coordenador.email)) continue;
        try {
            await enviarEmail({ para: coordenador.email, assunto, texto });
        } catch (e) {
            console.error('[klok] falha ao avisar coordenador:', e);
        }
    }
}

/**
 * Enviar o email de aprovação para o candidato, pulando endereço inválido e
 * registrando no console a falha de envio sem propagar o erro.
 * @param {object} dados enviarEmail, empresa, usuario e email do candidato
 * @returns {Promise<void>}
 */
export async function avisarAprovacao({ enviarEmail, empresa, usuario, email }) {
    if (!destinatarioValido(email)) return;
    try {
        await enviarEmail({
            para: email,
            assunto: 'Klok: seu cadastro foi aprovado',
            texto: textoAprovacao({ empresa, usuario }),
        });
    } catch (e) {
        console.error('[klok] falha ao avisar candidato:', e);
    }
}
