import { Router } from 'express';
import { criarControladoresPontos } from '../controladores/pontos.js';
import { asyncHandler } from '../middlewares.js';

/**
 * Montar as rotas de ponto em /api/pontos.
 * Todas exigem Bearer pelo autenticar. Só a listagem geral exige papel de
 * coordenador, bater e meus valem para qualquer funcionário autenticado.
 * @param {object} deps Dependências do app, com autenticar e exigirCoordenador.
 * @returns {object} Router do Express.
 */
export function criarRotaPontos(deps) {
    const rota = Router();
    const c = criarControladoresPontos();
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    // POST /api/pontos: exige Bearer, registra a batida do próprio funcionário.
    rota.post('/', autenticar, seguro(c.bater));
    // GET /api/pontos/meus: exige Bearer, lista só os pontos do próprio funcionário.
    rota.get('/meus', autenticar, seguro(c.meus));
    // GET /api/pontos: exige Bearer e papel de coordenador, lista os pontos de todos.
    rota.get('/', autenticar, exigirCoordenador, seguro(c.todos));

    return rota;
}
