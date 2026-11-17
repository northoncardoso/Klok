import { Router } from 'express';
import { criarControladoresSolicitacoes } from '../controladores/solicitacoes.js';
import { asyncHandler } from '../middlewares.js';

/**
 * Montar as rotas de solicitações em /api/solicitacoes.
 * O use aplica autenticar e exigirCoordenador a todas as rotas do router, então
 * nenhuma delas aceita funcionário. Não há rate limit próprio aqui.
 * @param {object} deps Dependências do app, com autenticar, exigirCoordenador e enviarEmail.
 * @returns {object} Router do Express.
 */
export function criarRotaSolicitacoes(deps) {
    const rota = Router();
    const c = criarControladoresSolicitacoes(deps);
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    // Todas as rotas abaixo herdam Bearer e papel de coordenador deste use.
    rota.use(autenticar, exigirCoordenador);
    // GET /api/solicitacoes: lista pedidos pelo status da query, pendente por padrão.
    rota.get('/', seguro(c.listar));
    // GET /api/solicitacoes/contagem: conta os pedidos pendentes para o menu do app.
    rota.get('/contagem', seguro(c.contagem));
    // POST /api/solicitacoes/:id/aprovar: aprova o pedido e cria o funcionário.
    rota.post('/:id/aprovar', seguro(c.aprovar));
    // POST /api/solicitacoes/:id/recusar: recusa o pedido e mantém o histórico.
    rota.post('/:id/recusar', seguro(c.recusar));

    return rota;
}
