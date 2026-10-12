import express from 'express';
import helmet from 'helmet';
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

    // Cada rota tem o próprio balde. Assim um cadastro em excesso não tranca o
    // login, e uma tentativa de força bruta não gasta a cota de outra rota.
    function criarLimitador({ janelaMs = 15 * 60 * 1000, max = 20, mensagem, chave = (req) => req.ip }) {
        const registros = new Map();
        return (req, res, next) => {
            const agora = Date.now();
            const identificador = chave(req);
            let registro = registros.get(identificador);
            if (!registro || agora > registro.ate) {
                registro = { cont: 1, ate: agora + janelaMs };
                registros.set(identificador, registro);
                if (registros.size >= 10000) {
                    for (const [chaveAntiga, valor] of registros) {
                        if (agora > valor.ate) registros.delete(chaveAntiga);
                    }
                }
                return next();
            }
            if (registro.cont >= max) {
                const faltam = Math.max(1, Math.ceil((registro.ate - agora) / 1000));
                res.setHeader('Retry-After', String(faltam));
                return res.status(429).json({
                    erro: mensagem,
                    tentarEmSegundos: faltam,
                });
            }
            registro.cont += 1;
            next();
        };
    }

    function chaveLogin(req) {
        const usuario =
            req.body && typeof req.body.usuario === 'string' ? req.body.usuario.trim().toLowerCase() : '';
        return `${req.ip}|${usuario}`;
    }

    const MENSAGEM_LOGIN = 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.';
    const MENSAGEM_CADASTRO = 'Muitos cadastros deste endereço. Aguarde um pouco e tente de novo.';
    const MENSAGEM_GENERICA = 'Muitas requisições. Aguarde alguns minutos e tente de novo.';

    const limitadores = {
        login: criarLimitador({ max: limiteAuth ?? 10, janelaMs: 15 * 60 * 1000, mensagem: MENSAGEM_LOGIN, chave: chaveLogin }),
        loginIp: criarLimitador({ max: 60, janelaMs: 15 * 60 * 1000, mensagem: MENSAGEM_LOGIN }),
        registrar: criarLimitador({ max: 10, janelaMs: 60 * 60 * 1000, mensagem: MENSAGEM_CADASTRO }),
        mestre: criarLimitador({ max: 10, janelaMs: 60 * 60 * 1000, mensagem: MENSAGEM_CADASTRO }),
        google: criarLimitador({ max: 20, janelaMs: 15 * 60 * 1000, mensagem: MENSAGEM_GENERICA }),
        esqueci: criarLimitador({ max: 5, janelaMs: 60 * 60 * 1000, mensagem: MENSAGEM_GENERICA }),
        redefinir: criarLimitador({ max: 20, janelaMs: 15 * 60 * 1000, mensagem: MENSAGEM_GENERICA }),
        paginaRedefinicao: criarLimitador({ max: 30, janelaMs: 15 * 60 * 1000, mensagem: MENSAGEM_GENERICA }),
    };

    async function gerarToken(usuario) {
        // A versão da senha viaja no token para que a troca de senha possa
        // revogar as sessões anteriores, sem precisar de lista de revogação.
        return new SignJWT({
            sub: String(usuario.id),
            tipo: usuario.tipo,
            v: Number(usuario.senhaVersao) || 0,
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('12h')
            .sign(SECRETO);
    }

    const autenticar = criarAutenticar({ banco, segredo: SECRETO });
    const exigirMestre = criarExigirMestre();
    const enviarEmailFinal =
        enviarEmail ?? criarEnviarEmail();

    const ehProducao = () => process.env.NODE_ENV === 'production';

    const app = express();
    app.disable('x-powered-by');
    // O helmet cobre os headers de seguranca e a CSP. O HSTS fica so em producao,
    // porque em desenvolvimento a API roda em HTTP e o header nao faz sentido.
    app.use(
        helmet({
            frameguard: { action: 'deny' },
            hsts: ehProducao() ? undefined : false,
        })
    );
    app.use(express.json({ limit: '32kb' }));
    app.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
    });

    const deps = {
        banco,
        googleClient,
        gerarToken,
        limitadores,
        autenticar,
        exigirMestre,
        enviarEmail: enviarEmailFinal,
    };

    app.use('/api/auth', criarRotaAuth(deps));
    app.use('/api/funcionarios', criarRotaFuncionarios(deps));
    app.use('/api/pontos', criarRotaPontos(deps));
    app.get(
        '/redefinir-senha/:token',
        limitadores.paginaRedefinicao,
        criarControladoresAuth(deps).paginaRedefinicao
    );

    app.use('/api', (req, res) => {
        res.status(404).json({ erro: 'Rota não encontrada' });
    });

    app.use(criarTratadorDeErros());

    return app;
}