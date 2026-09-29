import express from 'express';
import { SignJWT } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import { criarAutenticar, criarExigirMestre, criarTratadorDeErros, asyncHandler } from './middlewares.js';
import { criarRotaAuth } from './rotas/auth.js';
import { criarRotaFuncionarios } from './rotas/funcionarios.js';
import { criarRotaPontos } from './rotas/pontos.js';
import { criarControladoresAuth } from './controladores/auth.js';
import { criarEnviarEmail } from './email.js';

export function criarApp({ banco, clienteGoogle, enviarEmail, limiteAuth }) {
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
        max: limiteAuth ?? 20,
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
    const enviarEmailFinal =
        enviarEmail ?? criarEnviarEmail();

    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '32kb' }));
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Cache-Control', 'no-store');
        next();
    });

    const deps = {
        banco,
        googleClient,
        gerarToken,
        limitadorAuth,
        autenticar,
        exigirMestre,
        enviarEmail: enviarEmailFinal,
    };

    app.use('/api/auth', criarRotaAuth(deps));
    app.use('/api/funcionarios', criarRotaFuncionarios(deps));
    app.use('/api/pontos', criarRotaPontos(deps));
    app.get('/redefinir-senha/:token', criarControladoresAuth(deps).paginaRedefinicao);

    app.use('/api', (req, res) => {
        res.status(404).json({ erro: 'Rota não encontrada' });
    });

    app.use(criarTratadorDeErros());

    return app;
}