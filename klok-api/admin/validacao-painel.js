const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converter o valor em inteiro positivo, devolvendo o padrão quando vazio e
 * null quando não é inteiro positivo.
 */
export function inteiroPositivo(valor, padrao = null) {
    if (valor === undefined || valor === null || valor === '') return padrao;
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/** Validar a data no formato AAAA-MM-DD e devolver null quando ela não existe no calendário. */
export function dataIso(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    if (typeof valor !== 'string' || !DATA_ISO.test(valor)) return null;
    const data = new Date(`${valor}T00:00:00Z`);
    if (Number.isNaN(data.getTime())) return null;
    return data.toISOString().slice(0, 10) === valor ? valor : null;
}

/**
 * Ler limite e página da query, com padrão de 200 por página e teto de 200.
 * @param {object} query query da requisição
 * @returns {object} limite e pagina, ou erro de validação
 */
export function paginacao(query = {}) {
    const limite = inteiroPositivo(query.limite, 200);
    if (limite === null || limite > 200) {
        return { erro: 'Limite deve estar entre 1 e 200' };
    }
    const pagina = inteiroPositivo(query.pagina, 1);
    if (pagina === null) return { erro: 'Página inválida' };
    return { limite, pagina };
}

/** Escapar o campo do CSV quando ele tem aspas, ponto e vírgula ou quebra de linha. */
export function campoCsv(valor) {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[";\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}
