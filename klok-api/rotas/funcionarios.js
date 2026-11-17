import { Router } from 'express';
import { criarControladoresFuncionarios } from '../controladores/funcionarios.js';
import { asyncHandler } from '../middlewares.js';

/**
 * Montar as rotas de funcionários em /api/funcionarios.
 * Todas exigem Bearer pelo autenticar e papel de coordenador pelo
 * exigirCoordenador. Não há rate limit próprio aqui.
 * @param {object} deps Dependências do app, com autenticar e exigirCoordenador.
 * @returns {object} Router do Express.
 */
export function criarRotaFuncionarios(deps) {
    const rota = Router();
    const c = criarControladoresFuncionarios();
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    // GET /api/funcionarios: exige Bearer e papel de coordenador, lista os funcionários.
    rota.get('/', autenticar, exigirCoordenador, seguro(c.listar));
    // POST /api/funcionarios: exige Bearer e papel de coordenador, cadastra funcionário.
    rota.post('/', autenticar, exigirCoordenador, seguro(c.criar));
    // PUT /api/funcionarios/:id: exige Bearer e papel de coordenador, atualiza pelo id.
    rota.put('/:id', autenticar, exigirCoordenador, seguro(c.atualizar));
    // DELETE /api/funcionarios/:id: exige Bearer e papel de coordenador, apaga pelo id.
    rota.delete('/:id', autenticar, exigirCoordenador, seguro(c.apagar));

    return rota;
}
