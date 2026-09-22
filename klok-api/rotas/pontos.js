import { Router } from 'express';
import { criarControladoresPontos } from '../controladores/pontos.js';

export function criarRotaPontos(deps) {
    const rota = Router();
    const c = criarControladoresPontos(deps);
    const { autenticar, exigirMestre } = deps;

    rota.post('/', autenticar, c.bater);
    rota.get('/meus', autenticar, c.meus);
    rota.get('/', autenticar, exigirMestre, c.todos);

    return rota;
}