import express, { Router } from 'express';

import { asyncHandler } from '../middlewares.js';
import { criarControladoresAdmin } from './controladores.js';

export function criarRotaAdmin(deps) {
    const rota = Router();
    const c = criarControladoresAdmin(deps);
    const { limitadores, autenticarAdmin } = deps;
    const seguro = asyncHandler;

    // O login é a única rota pública. Todas as outras exigem token de admin.
    rota.post('/login', limitadores.adminLogin, seguro(c.login));
    // Logout só limpa cookie, mas passa pela autenticação para o CSRF valer.
    rota.post('/logout', autenticarAdmin, seguro(c.logout));
    rota.get('/empresas', autenticarAdmin, seguro(c.listarEmpresas));
    rota.post('/empresas', autenticarAdmin, seguro(c.criarEmpresa));
    rota.patch('/empresas/:codigo', autenticarAdmin, seguro(c.atualizarEmpresa));
    rota.delete('/empresas/:codigo', autenticarAdmin, seguro(c.apagarEmpresa));
    rota.post('/empresas/:codigo/coordenador', autenticarAdmin, seguro(c.criarCoordenador));
    rota.get('/empresas/:codigo/resumo', autenticarAdmin, seguro(c.resumo));
    rota.get('/empresas/:codigo/coordenadores', autenticarAdmin, seguro(c.listarCoordenadores));
    rota.get('/empresas/:codigo/funcionarios', autenticarAdmin, seguro(c.listarFuncionarios));
    rota.get('/empresas/:codigo/funcionarios.csv', autenticarAdmin, seguro(c.exportarFuncionariosCsv));
    rota.patch('/empresas/:codigo/funcionarios/:id', autenticarAdmin, seguro(c.atualizarFuncionario));
    rota.delete('/empresas/:codigo/funcionarios/:id', autenticarAdmin, seguro(c.apagarFuncionario));
    rota.get('/empresas/:codigo/pontos', autenticarAdmin, seguro(c.listarPontos));
    rota.get('/empresas/:codigo/pontos.csv', autenticarAdmin, seguro(c.exportarPontosCsv));
    rota.get('/empresas/:codigo/solicitacoes', autenticarAdmin, seguro(c.listarSolicitacoes));
    rota.post('/empresas/:codigo/solicitacoes/:id/aprovar', autenticarAdmin, seguro(c.aprovarSolicitacao));
    rota.post('/empresas/:codigo/solicitacoes/:id/recusar', autenticarAdmin, seguro(c.recusarSolicitacao));
    rota.get('/empresas/:codigo/banco', autenticarAdmin, seguro(c.infoBanco));
    rota.get('/empresas/:codigo/banco/backup', autenticarAdmin, seguro(c.backup));
    // O express.json global não trata octet-stream, então o corpo binário chega
    // cru aqui. O limite de 64 MB fica só nesta rota.
    rota.post(
        '/empresas/:codigo/banco/restaurar',
        autenticarAdmin,
        express.raw({ type: 'application/octet-stream', limit: '64mb' }),
        seguro(c.restaurarBackup)
    );
    rota.post('/empresas/:codigo/coordenadores/:id/senha', autenticarAdmin, seguro(c.redefinirSenhaCoordenador));
    rota.post('/empresas/:codigo/coordenadores/:id/impersonar', autenticarAdmin, seguro(c.impersonarCoordenador));

    return rota;
}
