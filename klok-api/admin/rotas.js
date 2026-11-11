import { Router } from 'express';

import { asyncHandler } from '../middlewares.js';
import { criarControladoresAdmin } from './controladores.js';

export function criarRotaAdmin(deps) {
    const rota = Router();
    const c = criarControladoresAdmin(deps);
    const { limitadores, autenticarAdmin } = deps;
    const seguro = asyncHandler;

    // O login é a única rota pública. Todas as outras exigem token de admin.
    rota.post('/login', limitadores.adminLogin, seguro(c.login));
    rota.get('/empresas', autenticarAdmin, seguro(c.listarEmpresas));
    rota.post('/empresas', autenticarAdmin, seguro(c.criarEmpresa));
    rota.patch('/empresas/:codigo', autenticarAdmin, seguro(c.atualizarEmpresa));
    rota.post('/empresas/:codigo/coordenador', autenticarAdmin, seguro(c.criarCoordenador));
    rota.get('/empresas/:codigo/resumo', autenticarAdmin, seguro(c.resumo));
    rota.get('/empresas/:codigo/coordenadores', autenticarAdmin, seguro(c.listarCoordenadores));
    rota.get('/empresas/:codigo/funcionarios', autenticarAdmin, seguro(c.listarFuncionarios));
    rota.get('/empresas/:codigo/pontos', autenticarAdmin, seguro(c.listarPontos));
    rota.get('/empresas/:codigo/solicitacoes', autenticarAdmin, seguro(c.listarSolicitacoes));
    rota.get('/empresas/:codigo/banco', autenticarAdmin, seguro(c.infoBanco));
    rota.post('/empresas/:codigo/coordenadores/:id/senha', autenticarAdmin, seguro(c.redefinirSenhaCoordenador));
    rota.post('/empresas/:codigo/coordenadores/:id/impersonar', autenticarAdmin, seguro(c.impersonarCoordenador));

    return rota;
}
