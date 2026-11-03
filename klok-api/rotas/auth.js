import { Router } from 'express';
import { criarControladoresAuth } from '../controladores/auth.js';
import { asyncHandler } from '../middlewares.js';

export function criarRotaAuth(deps) {
    const rota = Router();
    const c = criarControladoresAuth(deps);
    const { limitadores, autenticar, resolverEmpresa } = deps;
    const seguro = asyncHandler;

    rota.post('/registrar', limitadores.registrar, resolverEmpresa, seguro(c.registrar));
    rota.post('/login', limitadores.loginIp, limitadores.login, resolverEmpresa, seguro(c.login));
    rota.post('/google', limitadores.google, resolverEmpresa, seguro(c.loginGoogle));
    rota.get('/eu', autenticar, seguro(c.eu));
    rota.put('/eu', autenticar, seguro(c.atualizarDados));
    rota.put('/senha', autenticar, seguro(c.alterarSenha));
    rota.post('/esqueci-senha', limitadores.esqueci, resolverEmpresa, seguro(c.esqueciSenha));
    rota.post('/redefinir-senha', limitadores.redefinir, resolverEmpresa, seguro(c.redefinirSenha));

    return rota;
}
