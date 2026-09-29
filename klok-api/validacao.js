const CONTROLE = /[\u0000-\u001F\u007F]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TAMANHOS = {
    usuario: 60,
    nome: 120,
    email: 160,
    numero: 40,
    senha: 200,
    token: 200,
};

export function tamanhoDe(campo) {
    return TAMANHOS[campo] ?? 200;
}

export function texto(valor, campo = 'nome') {
    if (typeof valor !== 'string') return '';
    const limpo = valor.trim();
    const max = tamanhoDe(campo);
    return limpo.length > max ? limpo.slice(0, max) : limpo;
}

export function senha(valor) {
    return typeof valor === 'string' ? valor : '';
}

export function semCaractereDeControle(valor) {
    return typeof valor === 'string' && !CONTROLE.test(valor);
}

export function emailNormalizado(valor) {
    return texto(valor, 'email').toLowerCase();
}

export function emailValido(valor) {
    const normalizado = emailNormalizado(valor);
    if (!normalizado || CONTROLE.test(normalizado)) return false;
    return EMAIL.test(normalizado);
}

export function emailOpcionalValido(valor) {
    return valor === undefined || valor === null || valor === '' || emailValido(valor);
}
