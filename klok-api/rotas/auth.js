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

    return rota;
}