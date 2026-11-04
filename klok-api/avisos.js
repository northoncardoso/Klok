import { destinatarioValido } from './email.js';

export function textoNovoPedido({ empresa, nome, identificacao, email }) {
    return [
        `Chegou um pedido de cadastro na empresa ${empresa}.`,
        '',
        `Nome: ${nome || 'não informado'}`,
        `Identificação: ${identificacao}`,
        `Email: ${email}`,
        '',
        'Abra o app Klok, entre como coordenador e decida em Solicitacoes.',
    ].join('\n');
}

export function textoAprovacao({ empresa, usuario }) {
    return [
        `Seu cadastro na empresa ${empresa} foi aprovado.`,
        '',
        `Entre no app Klok com o usuário ${usuario} e a senha que você cadastrou.`,
    ].join('\n');
}

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
