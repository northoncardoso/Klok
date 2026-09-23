import { Router } from 'express';
import { criarControladoresAuth } from '../controladores/auth.js';

export function criarRotaAuth(deps) {
    const rota = Router();
    const c = criarControladoresAuth(deps);
    const { limitadorAuth, autenticar } = deps;

    rota.post('/registrar', limitadorAuth, c.registrar);
    rota.post('/login', limitadorAuth, c.login);
    rota.post('/google', limitadorAuth, c.loginGoogle);
    rota.get('/eu', autenticar, c.eu);
    rota.put('/eu', autenticar, c.atualizarDados);
    rota.put('/senha', autenticar, c.alterarSenha);
    rota.post('/esqueci-senha', limitadorAuth, c.esqueciSenha);
    rota.post('/redefinir-senha', limitadorAuth, c.redefinirSenha);

    return rota;
}