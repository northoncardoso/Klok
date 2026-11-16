import { Router } from 'express';
import { criarControladoresAuth } from '../controladores/auth.js';
import { asyncHandler } from '../middlewares.js';

/**
 * Montar as rotas de autenticação em /api/auth.
 * As rotas públicas passam pelo rate limit próprio antes do resolverEmpresa,
 * que abre o banco pelo código da empresa. /eu e /senha usam autenticar com
 * Bearer e nenhuma exige papel de coordenador.
 * @param {object} deps Dependências do app, com limitadores, autenticar, resolverEmpresa e os serviços de auth.
 * @returns {object} Router do Express pronto para o app montar.
 */
export function criarRotaAuth(deps) {
    const rota = Router();
    const c = criarControladoresAuth(deps);
    const { limitadores, autenticar, resolverEmpresa } = deps;
    const seguro = asyncHandler;

    // POST /api/auth/registrar: rate limit registrar, checagem de empresa, pedido pendente.
    rota.post('/registrar', limitadores.registrar, resolverEmpresa, seguro(c.registrar));
    // POST /api/auth/login: rate limit por IP e por conta, checagem de empresa, devolve token JWT.
    rota.post('/login', limitadores.loginIp, limitadores.login, resolverEmpresa, seguro(c.login));
    // POST /api/auth/google: rate limit google, checagem de empresa, login por ID token do Google.
    rota.post('/google', limitadores.google, resolverEmpresa, seguro(c.loginGoogle));
    // GET /api/auth/eu: exige Bearer, devolve o perfil do usuário autenticado.
    rota.get('/eu', autenticar, seguro(c.eu));
    // PUT /api/auth/eu: exige Bearer, atualiza nome, número e email do próprio usuário.
    rota.put('/eu', autenticar, seguro(c.atualizarDados));
    // PUT /api/auth/senha: exige Bearer, troca a senha e invalida os tokens antigos.
    rota.put('/senha', autenticar, seguro(c.alterarSenha));
    // POST /api/auth/esqueci-senha: rate limit esqueci, checagem de empresa, envia link por email.
    rota.post('/esqueci-senha', limitadores.esqueci, resolverEmpresa, seguro(c.esqueciSenha));
    // POST /api/auth/redefinir-senha: rate limit redefinir, checagem de empresa, grava a senha nova.
    rota.post('/redefinir-senha', limitadores.redefinir, resolverEmpresa, seguro(c.redefinirSenha));

    return rota;
}
