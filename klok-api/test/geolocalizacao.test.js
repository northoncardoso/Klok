import { test } from 'node:test';
import assert from 'node:assert/strict';

import { apurarPerimetro, distanciaEmMetros, lerCoordenada, RAIO_MAXIMO, RAIO_MINIMO } from '../geolocalizacao.js';

const SAO_PAULO = { latitude: -23.5505, longitude: -46.6333 };
const RIO = { latitude: -22.9068, longitude: -43.1729 };

test('distância entre São Paulo e Rio fica próxima de 360 km', () => {
    const metros = distanciaEmMetros(SAO_PAULO, RIO);
    assert.ok(metros > 350000 && metros < 365000, `recebido ${metros}`);
});

test('distância de um ponto a ele mesmo é zero', () => {
    assert.equal(distanciaEmMetros(SAO_PAULO, SAO_PAULO), 0);
});

test('apuração na borda respeita a margem de precisão', () => {
    const local = { id: 1, ...SAO_PAULO, raioMetros: 150 };
    const deslocado = { latitude: -23.5505 + 0.0013, longitude: -46.6333, precisaoMetros: 20 };

    const resultado = apurarPerimetro([local], deslocado);

    assert.equal(resultado.dentroPerimetro, null, 'a borda deve ficar indeterminada');
    assert.equal(resultado.localId, 1);
    assert.ok(resultado.distanciaMetros > 100 && resultado.distanciaMetros < 200);
    assert.equal(resultado.precisaoMetros, 20);
});

test('apuração escolhe o local com resultado dentro', () => {
    const longe = { id: 1, latitude: -23.6, longitude: -46.7, raioMetros: 100 };
    const perto = { id: 2, ...SAO_PAULO, raioMetros: 150 };

    const resultado = apurarPerimetro([longe, perto], { ...SAO_PAULO, precisaoMetros: 5 });

    assert.equal(resultado.localId, 2);
    assert.equal(resultado.dentroPerimetro, 1);
    assert.equal(resultado.distanciaMetros, 0);
});

test('apuração prefere indeterminado a fora quando não há dentro', () => {
    const fora = { id: 1, latitude: -23.6, longitude: -46.7, raioMetros: 100 };
    const borda = { id: 2, ...SAO_PAULO, raioMetros: 150 };

    const resultado = apurarPerimetro([fora, borda], {
        latitude: -23.5505 + 0.0013,
        longitude: -46.6333,
        precisaoMetros: 20,
    });

    assert.equal(resultado.localId, 2);
    assert.equal(resultado.dentroPerimetro, null);
});

test('apuração devolve fora quando todos os locais ficam distantes', () => {
    const local = { id: 7, ...SAO_PAULO, raioMetros: 150 };

    const resultado = apurarPerimetro([local], { ...RIO, precisaoMetros: 5 });

    assert.equal(resultado.dentroPerimetro, 0);
    assert.equal(resultado.localId, 7);
    assert.ok(resultado.distanciaMetros > 350000);
});

test('precisão negativa não transforma batida distante em dentro', () => {
    const local = { id: 1, ...SAO_PAULO, raioMetros: 150 };

    const resultado = apurarPerimetro([local], {
        latitude: -23.5505 + 0.002,
        longitude: -46.6333,
        precisaoMetros: -500,
    });

    assert.equal(resultado.precisaoMetros, 0, 'precisão negativa vira zero');
    assert.equal(resultado.dentroPerimetro, 0, '222 metros de deslocamento com raio 150 fica fora sem margem');
});

test('apuração sem locais devolve nulo', () => {
    assert.equal(apurarPerimetro([], { ...SAO_PAULO, precisaoMetros: 5 }), null);
});

test('apuração com coordenada inválida devolve nulo', () => {
    const local = { id: 1, ...SAO_PAULO, raioMetros: 150 };
    assert.equal(apurarPerimetro([local], { latitude: null, longitude: -46.6 }), null);
    assert.equal(apurarPerimetro([local], { latitude: 120, longitude: -46.6 }), null);
    assert.equal(apurarPerimetro([local], null), null);
});

test('lerCoordenada aceita ausência total e normaliza a precisão', () => {
    assert.deepEqual(lerCoordenada({}), { coordenada: null });
    assert.deepEqual(lerCoordenada({ latitude: null, longitude: null }), { coordenada: null });

    const { coordenada } = lerCoordenada({ latitude: -23.5, longitude: -46.6 });
    assert.equal(coordenada.precisaoMetros, 0);

    const negativa = lerCoordenada({ latitude: -23.5, longitude: -46.6, precisaoMetros: -10 });
    assert.equal(negativa.coordenada.precisaoMetros, 0, 'precisão negativa vira zero');
});

test('lerCoordenada recusa coordenada incompleta, fora da faixa ou textual', () => {
    assert.ok(lerCoordenada({ latitude: -23.5 }).erro);
    assert.ok(lerCoordenada({ longitude: -46.6 }).erro);
    assert.ok(lerCoordenada({ latitude: 200, longitude: -46.6 }).erro);
    assert.ok(lerCoordenada({ latitude: -23.5, longitude: 200 }).erro);
    assert.ok(lerCoordenada({ latitude: 'abc', longitude: -46.6 }).erro);
    assert.ok(lerCoordenada({ latitude: -23.5, longitude: -46.6, precisaoMetros: 'x' }).erro);
});

test('faixa de raio vai de 100 a 150 metros', () => {
    assert.equal(RAIO_MINIMO, 100);
    assert.equal(RAIO_MAXIMO, 150);
});
