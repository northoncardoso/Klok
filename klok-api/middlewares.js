import { jwtVerify } from 'jose';
import { PAPEL_MESTRE } from './constantes.js';

function tokenAnteriorATrocaDeSenha(payload, usuario) {
    const versaoDoToken = Number(payload.v) || 0;
    const versaoAtual = Number(usuario.senhaVersao) || 0;
    return versaoDoToken !== versaoAtual;
}

export function criarAutenticar({ banco, segredo }) {
    return async function autenticar(req, res, next) {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) {
            return res.status(401).json({ erro: 'Token não informado' });
        }
        try {
            const { payload } = await jwtVerify(header.slice(7), segredo, { algorithms: ['HS256'] });
            const usuario = banco.buscarUsuarioPorId(Number(payload.sub));
            if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado' });
            if (tokenAnteriorATrocaDeSenha(payload, usuario)) {
                return res.status(401).json({ erro: 'Sessão expirada, entre com a senha nova' });
            }
            req.usuario = usuario;
            next();
        } catch {
            return res.status(401).json({ erro: 'Token inválido ou expirado' });
        }
    };
}

export function criarExigirMestre() {
    return function exigirMestre(req, res, next) {
        if (req.usuario.tipo !== PAPEL_MESTRE) {
            return res.status(403).json({ erro: 'Acesso restrito ao mestre' });
        }
        next();
    };
}

export function asyncHandler(handler) {
    return function tratar(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

const MENSAGENS_DE_CLIENTE = {
    400: 'Requisição inválida',
    413: 'Conteúdo enviado é grande demais',
    415: 'Formato de conteúdo não suportado',
};

export function criarTratadorDeErros({ registrar = console.error } = {}) {
    return function tratarErros(erro, req, res, next) {
        if (res.headersSent) return next(erro);

        const bruto = Number(erro?.status ?? erro?.statusCode);
        const status = bruto >= 400 && bruto < 500 ? bruto : 500;

        if (status >= 500) {
            registrar(`[klok] erro em ${req.method} ${req.originalUrl}:`, erro);
        }

        res.status(status).json({
            erro: MENSAGENS_DE_CLIENTE[status] ?? 'Erro interno no servidor',
        });
    };
}
