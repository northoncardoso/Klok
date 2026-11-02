import { Router } from 'express';
import { criarControladoresFuncionarios } from '../controladores/funcionarios.js';
import { asyncHandler } from '../middlewares.js';

export function criarRotaFuncionarios(deps) {
    const rota = Router();
    const c = criarControladoresFuncionarios(deps);
    const { autenticar, exigirCoordenador } = deps;
    const seguro = asyncHandler;

    rota.get('/', autenticar, exigirCoordenador, seguro(c.listar));
    rota.post('/', autenticar, exigirCoordenador, seguro(c.criar));
    rota.put('/:id', autenticar, exigirCoordenador, seguro(c.atualizar));
    rota.delete('/:id', autenticar, exigirCoordenador, seguro(c.apagar));

    return rota;
}
