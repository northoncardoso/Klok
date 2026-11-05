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
        return async function enviarEmailSemSmtp({ para, assunto, texto }) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('SMTP não configurado em produção.');
            }
            if (!destinatarioValido(para)) {
                throw new Error('Destinatário de email inválido.');
            }
            console.log('[klok] email simulado');
            console.log(`[klok]   Para: ${para}`);
            console.log(`[klok]   Assunto: ${assunto}`);
            console.log(`[klok]   Texto: ${texto}`);
        };
    }

    const transportador = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    return async function enviarEmail({ para, assunto, texto }) {
        if (!destinatarioValido(para)) {
            throw new Error('Destinatário de email inválido.');
        }
        await transportador.sendMail({ from: remetente, to: para, subject: assunto, text: texto });
    };
}
