import { Router } from 'express';
import { criarControladoresLocais } from '../controladores/locais.js';
import { asyncHandler } from '../middlewares.js';

/**
 * Montar as rotas de perímetros em /api/locais.
 * O use aplica autenticar e exigirCoordenador a todas as rotas do router, então
 * nenhuma delas aceita funcionário.
 * @param {object} deps Dependências do app, com autenticar e exigirCoordenador.
 * @returns {object} Router do Express.
 */
export function criarRotaLocais(deps) {
    const rota = Router();
    const c = criarControladoresLocais();
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    rota.use(autenticar, exigirCoordenador);
    // GET /api/locais: lista os perímetros ativos e os pedidos pendentes.
    rota.get('/', seguro(c.listar));
    // POST /api/locais/pedidos: registra pedido de criação, edição ou exclusão.
    rota.post('/pedidos', seguro(c.pedir));

    return rota;
}
