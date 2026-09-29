import { Router } from 'express';
import { criarControladoresFuncionarios } from '../controladores/funcionarios.js';
import { asyncHandler } from '../middlewares.js';

export function criarRotaFuncionarios(deps) {
    const rota = Router();
    const c = criarControladoresFuncionarios(deps);
    const { autenticar, exigirMestre } = deps;
    const seguro = asyncHandler;

    rota.get('/', autenticar, exigirMestre, seguro(c.listar));
    rota.post('/', autenticar, exigirMestre, seguro(c.criar));
    rota.put('/:id', autenticar, exigirMestre, seguro(c.atualizar));
    rota.delete('/:id', autenticar, exigirMestre, seguro(c.apagar));

    return rota;
}
