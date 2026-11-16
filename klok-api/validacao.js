const CONTROLE = /[\u0000-\u001F\u007F]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TAMANHOS = {
    usuario: 60,
    empresa: 20,
    nome: 120,
    email: 160,
    numero: 40,
    senha: 200,
    token: 200,
};

/**
 * Devolver o limite de tamanho do campo, com 200 como padrão.
 * @param {string} campo nome do campo, como usuario, empresa ou senha
 * @returns {number}
 */
export function tamanhoDe(campo) {
    return TAMANHOS[campo] ?? 200;
}

/**
 * Normalizar texto de entrada: descartar valor que não é string, aparar espaços
 * e truncar no limite do campo. O corte é silencioso, sem avisar o cliente.
 * @param {*} valor valor bruto da requisição
 * @param {string} campo campo usado para escolher o limite
 * @returns {string}
 */
export function texto(valor, campo = 'nome') {
    if (typeof valor !== 'string') return '';
    const limpo = valor.trim();
    const max = tamanhoDe(campo);
    return limpo.length > max ? limpo.slice(0, max) : limpo;
}

/**
 * Devolver a senha sem aparar nem truncar, para não alterar o que o usuário digitou.
 * @param {*} valor valor bruto da requisição
 * @returns {string} texto vazio quando o valor não é string
 */
export function senha(valor) {
    return typeof valor === 'string' ? valor : '';
}

// O código da empresa é digitado pelo usuário e pode vir em minúsculas, mas o
// catálogo guarda sempre em maiúsculas.
/**
 * Normalizar o código da empresa em maiúsculas, com o limite de 20 caracteres.
 * @param {*} valor código digitado pelo usuário
 * @returns {string}
 */
export function codigoEmpresa(valor) {
    return texto(valor, 'empresa').toUpperCase();
}

/**
 * Indicar se o valor é texto e não tem caractere de controle.
 * @param {*} valor valor bruto da requisição
 * @returns {boolean}
 */
export function semCaractereDeControle(valor) {
    return typeof valor === 'string' && !CONTROLE.test(valor);
}

/**
 * Normalizar email em minúsculas, aparando e truncando no limite de 160 caracteres.
 * Serve para comparar e gravar, sem validar o formato.
 * @param {*} valor valor bruto da requisição
 * @returns {string}
 */
export function emailNormalizado(valor) {
    return texto(valor, 'email').toLowerCase();
}

/**
 * Validar o formato do email depois da normalização.
 * @param {*} valor valor bruto da requisição
 * @returns {boolean}
 */
export function emailValido(valor) {
    const normalizado = emailNormalizado(valor);
    if (!normalizado || CONTROLE.test(normalizado)) return false;
    return EMAIL.test(normalizado);
}

/**
 * Validar um email que pode vir ausente: null, undefined e texto vazio passam.
 * @param {*} valor valor bruto da requisição
 * @returns {boolean}
 */
export function emailOpcionalValido(valor) {
    return valor === undefined || valor === null || valor === '' || emailValido(valor);
}
