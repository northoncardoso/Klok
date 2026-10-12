import { Router } from 'express';
import { criarControladoresAuth } from '../controladores/auth.js';
import { asyncHandler } from '../middlewares.js';

export function criarRotaAuth(deps) {
    const rota = Router();
    const c = criarControladoresAuth(deps);
    const { limitadores, autenticar } = deps;
    const seguro = asyncHandler;

    rota.get('/mestre', seguro(c.statusMestre));
    rota.post('/mestre', limitadores.mestre, seguro(c.criarMestre));
    rota.post('/registrar', limitadores.registrar, seguro(c.registrar));
    rota.post('/login', limitadores.loginIp, limitadores.login, seguro(c.login));
    rota.post('/google', limitadores.google, seguro(c.loginGoogle));
    rota.get('/eu', autenticar, seguro(c.eu));
    rota.put('/eu', autenticar, seguro(c.atualizarDados));
    rota.put('/senha', autenticar, seguro(c.alterarSenha));
    rota.post('/esqueci-senha', limitadores.esqueci, seguro(c.esqueciSenha));
    rota.post('/redefinir-senha', limitadores.redefinir, seguro(c.redefinirSenha));

    return rota;
}
