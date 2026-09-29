import { Router } from 'express';
import { criarControladoresAuth } from '../controladores/auth.js';
import { asyncHandler } from '../middlewares.js';

export function criarRotaAuth(deps) {
    const rota = Router();
    const c = criarControladoresAuth(deps);
    const { limitadorAuth, autenticar } = deps;
    const seguro = asyncHandler;

    rota.get('/mestre', seguro(c.statusMestre));
    rota.post('/mestre', limitadorAuth, seguro(c.criarMestre));
    rota.post('/registrar', limitadorAuth, seguro(c.registrar));
    rota.post('/login', limitadorAuth, seguro(c.login));
    rota.post('/google', limitadorAuth, seguro(c.loginGoogle));
    rota.get('/eu', autenticar, seguro(c.eu));
    rota.put('/eu', autenticar, seguro(c.atualizarDados));
    rota.put('/senha', autenticar, seguro(c.alterarSenha));
    rota.post('/esqueci-senha', limitadorAuth, seguro(c.esqueciSenha));
    rota.post('/redefinir-senha', limitadorAuth, seguro(c.redefinirSenha));

    return rota;
}
