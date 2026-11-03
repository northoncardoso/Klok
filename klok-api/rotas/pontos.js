import { Router } from 'express';
import { criarControladoresPontos } from '../controladores/pontos.js';
import { asyncHandler } from '../middlewares.js';

export function criarRotaPontos(deps) {
    const rota = Router();
    const c = criarControladoresPontos();
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    rota.post('/', autenticar, seguro(c.bater));
    rota.get('/meus', autenticar, seguro(c.meus));
    rota.get('/', autenticar, exigirCoordenador, seguro(c.todos));

    return rota;
}
