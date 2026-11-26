import * as Location from 'expo-location';

import type { Coordenada } from './types';

const TENTATIVAS = 4;
const LIMITE_POR_TENTATIVA_MS = 10000;

export type FalhaLocalizacao = {
    motivo: 'servico' | 'permissao' | 'sinal';
};

/**
 * Limitar uma promessa a um tempo máximo, para a leitura do GPS não travar a tela.
 *
 * @param {Promise<T>} promessa Promessa que pode demorar.
 * @param {number} limiteMs Tempo máximo em milissegundos.
 * @returns {Promise<T>} O valor da promessa ou o erro de tempo esgotado.
 */
function comLimite<T>(promessa: Promise<T>, limiteMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const relogio = setTimeout(() => reject(new Error('Tempo esgotado')), limiteMs);
        promessa.then(
            (valor) => {
                clearTimeout(relogio);
                resolve(valor);
            },
            (erro) => {
                clearTimeout(relogio);
                reject(erro);
            }
        );
    });
}

/**
 * Obter a coordenada do aparelho para a batida de ponto.
 *
 * O serviço desligado e a permissão negada impedem a batida. A ausência de
 * sinal é tentada mais três vezes e, se persistir, devolve o motivo para a tela
 * registrar o ponto sem coordenada.
 *
 * @returns {Promise<Coordenada | FalhaLocalizacao>} Coordenada pronta ou o motivo da falha.
 */
export async function obterCoordenada(): Promise<Coordenada | FalhaLocalizacao> {
    const servicoLigado = await Location.hasServicesEnabledAsync().catch(() => false);
    if (!servicoLigado) return { motivo: 'servico' };

    const permissao = await Location.requestForegroundPermissionsAsync();
    if (!permissao.granted) return { motivo: 'permissao' };

    for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
        try {
            const posicao = await comLimite(
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
                LIMITE_POR_TENTATIVA_MS
            );
            return {
                latitude: posicao.coords.latitude,
                longitude: posicao.coords.longitude,
                precisaoMetros: Math.max(0, Math.round(posicao.coords.accuracy ?? 0)),
            };
        } catch {
            // Sem sinal nesta tentativa, tenta de novo até o limite.
        }
    }

    return { motivo: 'sinal' };
}
