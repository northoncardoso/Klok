import { randomBytes, timingSafeEqual } from 'node:crypto';

const NOME_SESSAO = 'klok_admin';
const NOME_CSRF = 'klok_csrf';
const MAX_AGE = 12 * 60 * 60;

/** Gerar o valor de CSRF da sessão do painel, que o navegador devolve no cabeçalho da requisição. */
export function criarValorCsrf() {
    return randomBytes(32).toString('hex');
}

/** Ler o cabeçalho de cookies e devolver um objeto de nome para valor. */
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
/** Montar os atributos comuns dos cookies de sessão, ligando Secure apenas em produção. */
function atributos(producao) {
    return `SameSite=Strict; Max-Age=${MAX_AGE}${producao ? '; Secure' : ''}`;
}

/**
 * Gravar a sessão do painel em cookie httpOnly com validez de 12 horas e o
 * valor de CSRF em cookie legível pelo navegador.
 * @param {object} res resposta onde os cabeçalhos Set-Cookie são gravados
 * @param {object} dados token da sessão, valor de CSRF e se o ambiente é produção
 */
export function definirCookiesSessao(res, { token, csrf, producao }) {
    res.append(
        'Set-Cookie',
        `${NOME_SESSAO}=${token}; HttpOnly; Path=/api/admin; ${atributos(producao)}`
    );
    res.append('Set-Cookie', `${NOME_CSRF}=${csrf}; Path=/; ${atributos(producao)}`);
}

/** Expirar na hora os cookies de sessão e de CSRF no logout do painel. */
export function limparCookiesSessao(res, { producao } = {}) {
    res.append(
        'Set-Cookie',
        `${NOME_SESSAO}=; HttpOnly; Path=/api/admin; Max-Age=0${producao ? '; Secure' : ''}`
    );
    res.append('Set-Cookie', `${NOME_CSRF}=; Path=/; Max-Age=0${producao ? '; Secure' : ''}`);
}

/** Extrair o token de admin do cookie httpOnly da sessão do painel. */
export function tokenDoCookie(req) {
    return lerCookies(req.headers.cookie)[NOME_SESSAO] ?? null;
}

/** Comparar o valor de CSRF do cookie com o do cabeçalho em tempo constante. */
export function csrfValido(req) {
    const esperado = lerCookies(req.headers.cookie)[NOME_CSRF];
    const recebido = req.get('x-csrf-token');
    if (!esperado || !recebido) return false;
    const a = Buffer.from(esperado);
    const b = Buffer.from(recebido);
    return a.length === b.length && timingSafeEqual(a, b);
}
