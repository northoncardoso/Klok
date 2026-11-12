import { randomBytes, timingSafeEqual } from 'node:crypto';

const NOME_SESSAO = 'klok_admin';
const NOME_CSRF = 'klok_csrf';
const MAX_AGE = 12 * 60 * 60;

export function criarValorCsrf() {
    return randomBytes(32).toString('hex');
}

export function lerCookies(header = '') {
    const cookies = {};
    for (const parte of header.split(';')) {
        const indice = parte.indexOf('=');
        if (indice < 0) continue;
        const nome = parte.slice(0, indice).trim();
        if (!nome) continue;
        const valor = parte.slice(indice + 1).trim();
        try {
            cookies[nome] = decodeURIComponent(valor);
        } catch {
            cookies[nome] = valor;
        }
    }
    return cookies;
}

// Secure só em produção: o painel local roda em http e o navegador descarta
// cookie Secure fora de https.
function atributos(producao) {
    return `SameSite=Strict; Max-Age=${MAX_AGE}${producao ? '; Secure' : ''}`;
}

export function definirCookiesSessao(res, { token, csrf, producao }) {
    res.append(
        'Set-Cookie',
        `${NOME_SESSAO}=${token}; HttpOnly; Path=/api/admin; ${atributos(producao)}`
    );
    res.append('Set-Cookie', `${NOME_CSRF}=${csrf}; Path=/; ${atributos(producao)}`);
}

export function limparCookiesSessao(res, { producao } = {}) {
    res.append(
        'Set-Cookie',
        `${NOME_SESSAO}=; HttpOnly; Path=/api/admin; Max-Age=0${producao ? '; Secure' : ''}`
    );
    res.append('Set-Cookie', `${NOME_CSRF}=; Path=/; Max-Age=0${producao ? '; Secure' : ''}`);
}

export function tokenDoCookie(req) {
    return lerCookies(req.headers.cookie)[NOME_SESSAO] ?? null;
}

export function csrfValido(req) {
    const esperado = lerCookies(req.headers.cookie)[NOME_CSRF];
    const recebido = req.get('x-csrf-token');
    if (!esperado || !recebido) return false;
    const a = Buffer.from(esperado);
    const b = Buffer.from(recebido);
    return a.length === b.length && timingSafeEqual(a, b);
}
