import express from 'express';
import { SignJWT } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import { criarAutenticar, criarExigirMestre } from './middlewares.js';
import { criarRotaAuth } from './rotas/auth.js';
import { criarRotaFuncionarios } from './rotas/funcionarios.js';
import { criarRotaPontos } from './rotas/pontos.js';

export function criarApp({ banco, clienteGoogle }) {
    const segredo = process.env.JWT_SECRET;
    if (!segredo) {
        throw new Error('JWT_SECRET não definido. Configure a variável de ambiente antes de subir a API.');
    }
    const SECRETO = new TextEncoder().encode(segredo);
    const googleClient = clienteGoogle ?? new OAuth2Client(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB);

    function criarRateLimit({ janelaMs = 15 * 60 * 1000, max = 20, mensagem }) {
        const porIp = new Map();
        return (req, res, next) => {
            const agora = Date.now();
            const registro = porIp.get(req.ip);
            if (!registro || agora > registro.ate) {
                porIp.set(req.ip, { cont: 1, ate: agora + janelaMs });
                if (porIp.size >= 10000) {
                    for (const [chave, valor] of porIp) {
                        if (agora > valor.ate) porIp.delete(chave);
                    }
                }
                return next();
            }
            if (registro.cont > max) {
                return res.status(429).json({ erro: mensagem });
            }
            registro.cont += 1;
            next();
        };
    }

    const limitadorAuth = criarRateLimit({
        max: 20,
        mensagem: 'Muitas tentativas de autenticação. Aguarde alguns minutos e tente de novo.',
    });

    async function gerarToken(usuario) {
        return new SignJWT({ sub: String(usuario.id), tipo: usuario.tipo })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('12h')
            .sign(SECRETO);
    }

    const autenticar = criarAutenticar({ banco, segredo: SECRETO });
    const exigirMestre = criarExigirMestre();

    const app = express();
    app.use(express.json());

    const deps = {
        banco,
        googleClient,
        gerarToken,
        limitadorAuth,
        autenticar,
        exigirMestre,
    };

    app.use('/api/auth', criarRotaAuth(deps));
    app.use('/api/funcionarios', criarRotaFuncionarios(deps));
    app.use('/api/pontos', criarRotaPontos(deps));

    return app;
}