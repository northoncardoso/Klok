import nodemailer from 'nodemailer';

export function criarEnviarEmail() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || (host ? 587 : 0));
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const remetente = process.env.SMTP_REMETENTE || (user ? `Klok <${user}>` : 'Klok');

    if (!host || !user || !pass) {
        return async function enviarEmailSemSmtp({ para, url, urlApp }) {
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
        await transportador.sendMail({
            from: remetente,
            to: para,
            subject: 'Klok — Redefinição de senha',
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