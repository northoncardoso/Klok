import { Router } from 'express';
import { criarControladoresCoordenadores } from '../controladores/coordenadores.js';
import { asyncHandler } from '../middlewares.js';

export function criarRotaCoordenadores(deps) {
    const rota = Router();
    const c = criarControladoresCoordenadores(deps);
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    rota.get('/', autenticar, exigirCoordenador, seguro(c.listar));
    rota.post('/', autenticar, exigirCoordenador, seguro(c.criar));

    return rota;
}
