import { Router } from 'express';
import { criarControladoresCoordenadores } from '../controladores/coordenadores.js';
import { asyncHandler } from '../middlewares.js';

/**
 * Montar as rotas de coordenadores em /api/coordenadores.
 * As duas rotas exigem Bearer pelo autenticar e papel de coordenador pelo
 * exigirCoordenador, que responde 403 para funcionário.
 * @param {object} deps Dependências do app, com autenticar e exigirCoordenador.
 * @returns {object} Router do Express.
 */
export function criarRotaCoordenadores(deps) {
    const rota = Router();
    const c = criarControladoresCoordenadores();
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    // GET /api/coordenadores: exige Bearer e papel de coordenador, lista os coordenadores da empresa.
    rota.get('/', autenticar, exigirCoordenador, seguro(c.listar));
    // POST /api/coordenadores: exige Bearer e papel de coordenador, cria coordenador novo.
    rota.post('/', autenticar, exigirCoordenador, seguro(c.criar));

    return rota;
}
