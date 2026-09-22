import { Router } from 'express';
import { criarControladoresFuncionarios } from '../controladores/funcionarios.js';

export function criarRotaFuncionarios(deps) {
    const rota = Router();
    const c = criarControladoresFuncionarios(deps);
    const { autenticar, exigirMestre } = deps;

    rota.get('/', autenticar, exigirMestre, c.listar);
    rota.post('/', autenticar, exigirMestre, c.criar);
    rota.put('/:id', autenticar, exigirMestre, c.atualizar);
    rota.delete('/:id', autenticar, exigirMestre, c.apagar);

    return rota;
}