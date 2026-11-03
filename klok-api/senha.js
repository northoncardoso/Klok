import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const PREFIXO_HASH = 'scrypt$';

export function paraTexto(valor) {
    return typeof valor === 'string' ? valor : valor === null || valor === undefined ? '' : String(valor);
}

export function criarHashSenha(senha) {
    const sal = randomBytes(16).toString('hex');
    const hash = scryptSync(paraTexto(senha), sal, 64).toString('hex');
    return `${PREFIXO_HASH}${sal}$${hash}`;
}

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
