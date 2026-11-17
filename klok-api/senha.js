import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const PREFIXO_HASH = 'scrypt$';

/**
 * Converter um valor qualquer em string, tratando null e undefined como texto vazio.
 * @param {*} valor valor bruto vindo do banco ou da requisição
 * @returns {string}
 */
export function paraTexto(valor) {
    return typeof valor === 'string' ? valor : valor === null || valor === undefined ? '' : String(valor);
}

/**
 * Gerar o hash de uma senha com sal aleatório, no formato `scrypt$sal$hash`.
 * @param {string} senha senha em texto puro
 * @returns {string} hash pronto para gravar no banco
 */
export function criarHashSenha(senha) {
    const sal = randomBytes(16).toString('hex');
    const hash = scryptSync(paraTexto(senha), sal, 64).toString('hex');
    return `${PREFIXO_HASH}${sal}$${hash}`;
}

/**
 * Conferir a senha contra o hash armazenado com comparação de tempo constante.
 * @param {string} senha senha em texto puro
 * @param {string} hashArmazenada hash no formato `scrypt$sal$hash`
 * @returns {boolean} false quando a senha não é texto ou o hash está em outro formato
 */
export function verificarSenha(senha, hashArmazenada) {
    if (typeof senha !== 'string' || hashArmazenada?.startsWith(PREFIXO_HASH) !== true) {
        return false;
    }
    const partes = hashArmazenada.slice(PREFIXO_HASH.length).split('$');
    if (partes.length !== 2) return false;
    const [sal, hashEsperado] = partes;
    const hashGerado = scryptSync(senha, sal, 64);
    const esperado = Buffer.from(hashEsperado, 'hex');
    if (hashGerado.length !== esperado.length) return false;
    return timingSafeEqual(hashGerado, esperado);
}
