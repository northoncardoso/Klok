import { test } from 'node:test';
import assert from 'node:assert/strict';

import { campoCsv, dataIso, inteiroPositivo, paginacao } from '../admin/validacao-painel.js';

test('valida inteiro, data e paginação', () => {
    assert.equal(inteiroPositivo('7', 1), 7);
    assert.equal(inteiroPositivo('abc', 1), null);
    assert.equal(inteiroPositivo('0', 1), null);
    assert.equal(dataIso('2026-11-09'), '2026-11-09');
    assert.equal(dataIso('09/11/2026'), null);
    assert.equal(dataIso('2026-02-31'), null, 'dia inexistente não pode virar 3 de março');
    assert.equal(dataIso('2026-02-29'), null, '2026 não é bissexto');
    assert.equal(dataIso('2024-02-29'), '2024-02-29');
    assert.equal(dataIso('2026-13-01'), null);
    assert.deepEqual(paginacao({}), { limite: 200, pagina: 1 });
    assert.deepEqual(paginacao({ limite: '10', pagina: '2' }), { limite: 10, pagina: 2 });
    assert.equal(paginacao({ limite: '201' }).erro, 'Limite deve estar entre 1 e 200');
});

test('escapa campo de CSV', () => {
    assert.equal(campoCsv('Ana'), 'Ana');
    assert.equal(campoCsv('Ana;Lima'), '"Ana;Lima"');
    assert.equal(campoCsv('diz "oi"'), '"diz ""oi"""');
    assert.equal(campoCsv('linha\nquebrada'), '"linha\nquebrada"');
});
