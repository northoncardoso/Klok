/**
 * Apuração de distância e de perímetro para a batida de ponto.
 *
 * A coordenada do funcionário entra aqui e não sai: o chamador guarda apenas o
 * resultado da apuração, nunca a latitude e a longitude recebidas.
 */

const RAIO_DA_TERRA_EM_METROS = 6371000;

/** Raio mínimo de perímetro aceito, em metros. */
export const RAIO_MINIMO = 100;

/** Raio máximo de perímetro aceito, em metros. */
export const RAIO_MAXIMO = 150;

/** Converter graus em radianos. */
function paraRadianos(graus) {
    return (graus * Math.PI) / 180;
}

/**
 * Indicar se o valor é um número finito dentro da faixa de graus aceita.
 *
 * @param {unknown} valor Candidato a coordenada.
 * @param {number} limite Valor absoluto máximo, 90 para latitude e 180 para longitude.
 * @returns {boolean}
 */
function grauValido(valor, limite) {
    return typeof valor === 'number' && Number.isFinite(valor) && Math.abs(valor) <= limite;
}

/**
 * Calcular a distância em metros entre duas coordenadas pela fórmula de Haversine.
 *
 * @param {{ latitude: number, longitude: number }} origem Coordenada de partida.
 * @param {{ latitude: number, longitude: number }} destino Coordenada de chegada.
 * @returns {number} Distância em metros.
 */
export function distanciaEmMetros(origem, destino) {
    const lat1 = paraRadianos(origem.latitude);
    const lat2 = paraRadianos(destino.latitude);
    const deltaLat = lat2 - lat1;
    const deltaLon = paraRadianos(destino.longitude) - paraRadianos(origem.longitude);

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

    return 2 * RAIO_DA_TERRA_EM_METROS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Normalizar a precisão informada pelo aparelho, tratando valor inválido ou
 * negativo como zero para que nunca alargue o perímetro.
 *
 * @param {unknown} precisao Valor recebido do aplicativo.
 * @returns {number} Precisão em metros, nunca negativa.
 */
function precisaoValida(precisao) {
    const numero = Number(precisao);
    if (!Number.isFinite(numero) || numero < 0) return 0;
    return numero;
}

/**
 * Indicar se o raio informado está dentro da faixa aceita.
 *
 * @param {unknown} raio Raio em metros.
 * @returns {boolean}
 */
export function raioValido(raio) {
    const numero = Number(raio);
    return Number.isFinite(numero) && numero >= RAIO_MINIMO && numero <= RAIO_MAXIMO;
}

/**
 * Ler a coordenada enviada no corpo da requisição, sem aceitar valor parcial,
 * textual ou fora da faixa. A ausência completa da coordenada é válida e
 * significa batida sem verificação.
 *
 * @param {object} corpo Corpo da requisição, com latitude, longitude e precisaoMetros.
 * @returns {{ coordenada: { latitude: number, longitude: number, precisaoMetros: number }|null }|{ erro: string }}
 */
export function lerCoordenada(corpo) {
    const latitude = corpo?.latitude;
    const longitude = corpo?.longitude;
    const temLatitude = latitude !== undefined && latitude !== null;
    const temLongitude = longitude !== undefined && longitude !== null;

    if (!temLatitude && !temLongitude) return { coordenada: null };
    if (!temLatitude || !temLongitude) {
        return { erro: 'Latitude e longitude precisam vir juntas' };
    }
    if (!grauValido(latitude, 90) || !grauValido(longitude, 180)) {
        return { erro: 'Coordenada inválida' };
    }

    const precisao = corpo?.precisaoMetros;
    if (precisao !== undefined && precisao !== null && !Number.isFinite(Number(precisao))) {
        return { erro: 'Precisão inválida' };
    }

    return {
        coordenada: {
            latitude: Number(latitude),
            longitude: Number(longitude),
            precisaoMetros: precisaoValida(precisao),
        },
    };
}

/**
 * Escolher entre os candidatos o de menor distância.
 *
 * @param {object[]} candidatos Resultados parciais da apuração.
 * @returns {object|undefined}
 */
function maisProximo(candidatos) {
    return candidatos.reduce(
        (melhor, atual) => (melhor === undefined || atual.distanciaMetros < melhor.distanciaMetros ? atual : melhor),
        undefined
    );
}

/**
 * Apurar em qual perímetro a coordenada caiu, considerando a margem de precisão.
 *
 * A classificação tem três estados: 1 quando está dentro, 0 quando está fora e
 * nulo quando a precisão do aparelho não permite decidir. A escolha prioriza um
 * resultado dentro, depois um indeterminado, e por último um fora, sempre pelo
 * local mais próximo dentro da mesma classificação.
 *
 * @param {object[]} locais Perímetros ativos, com id, latitude, longitude e raioMetros.
 * @param {{ latitude: number, longitude: number, precisaoMetros?: number }} coordenada Leitura do aparelho.
 * @returns {{ localId: number, dentroPerimetro: number|null, distanciaMetros: number, precisaoMetros: number }|null}
 */
export function apurarPerimetro(locais, coordenada) {
    if (!Array.isArray(locais) || locais.length === 0) return null;
    if (!coordenada || !grauValido(coordenada.latitude, 90) || !grauValido(coordenada.longitude, 180)) {
        return null;
    }

    const precisaoMetros = precisaoValida(coordenada.precisaoMetros);

    const dentro = [];
    const indeterminado = [];
    const fora = [];

    for (const local of locais) {
        if (!grauValido(local.latitude, 90) || !grauValido(local.longitude, 180)) continue;

        const distancia = distanciaEmMetros(coordenada, local);
        const raio = Number(local.raioMetros);
        if (!Number.isFinite(raio)) continue;

        const resultado = {
            localId: local.id,
            dentroPerimetro: null,
            distanciaMetros: Math.round(distancia),
            precisaoMetros,
        };

        if (distancia + precisaoMetros <= raio) {
            resultado.dentroPerimetro = 1;
            dentro.push(resultado);
        } else if (distancia - precisaoMetros > raio) {
            resultado.dentroPerimetro = 0;
            fora.push(resultado);
        } else {
            indeterminado.push(resultado);
        }
    }

    return maisProximo(dentro) ?? maisProximo(indeterminado) ?? maisProximo(fora) ?? null;
}
