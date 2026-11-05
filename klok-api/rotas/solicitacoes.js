import { Router } from 'express';
import { criarControladoresSolicitacoes } from '../controladores/solicitacoes.js';
import { asyncHandler } from '../middlewares.js';

export function criarRotaSolicitacoes(deps) {
    const rota = Router();
    const c = criarControladoresSolicitacoes(deps);
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    rota.use(autenticar, exigirCoordenador);
    rota.get('/', seguro(c.listar));
    rota.get('/contagem', seguro(c.contagem));
    rota.post('/:id/aprovar', seguro(c.aprovar));
    rota.post('/:id/recusar', seguro(c.recusar));

    return rota;
}
