import nodemailer from 'nodemailer';

const CONTROLE = /[\u0000-\u001F\u007F]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function destinatarioValido(destinatario) {
    if (typeof destinatario !== 'string') return false;
    const normalizado = destinatario.trim().toLowerCase();
    if (!normalizado || CONTROLE.test(normalizado)) return false;
    return EMAIL.test(normalizado);
}

export function criarEnviarEmail() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || (host ? 587 : 0));
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const remetente = process.env.SMTP_REMETENTE || (user ? `Klok <${user}>` : 'Klok');
    const comSmtp = !!(host && user && pass);

    if (!comSmtp) {
        return async function enviarEmailSemSmtp({ para, url, urlApp }) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('SMTP não configurado em produção.');
            }
            console.log('[klok] SMTP não configurado, simule a recuperação em desenvolvimento:');
            console.log(`[klok]   Para: ${para}`);
            console.log(`[klok]   Página: ${url}`);
            console.log(`[klok]   App: ${urlApp}`);
        };
    }

    const transportador = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    return async function enviarEmail({ para, url }) {
        if (!destinatarioValido(para)) {
            throw new Error('Destinatário de email inválido.');
        }
        await transportador.sendMail({
            from: remetente,
            to: para,
            subject: 'Klok: Redefinição de senha',
            text: [
                'Recebemos um pedido para redefinir sua senha no app Klok.',
                'Clique no link abaixo para confirmar que é você e definir uma nova senha:',
                '',
                url,
                '',
                'Este link é válido por 30 minutos. Se você não pediu, ignore este email.',
            ].join('\n'),
        });
    };
}
