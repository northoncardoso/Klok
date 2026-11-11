import { jwtVerify } from 'jose';
import { csrfValido, tokenDoCookie } from './admin/sessao.js';
import { PAPEL_COORDENADOR } from './constantes.js';
import { codigoEmpresa } from './validacao.js';

const AUD_EMPRESA = 'klok-empresa';
const AUD_ADMIN = 'klok-admin';

function tokenAnteriorATrocaDeSenha(payload, usuario) {
    const versaoDoToken = Number(payload.v) || 0;
    const versaoAtual = Number(usuario.senhaVersao) || 0;
    return versaoDoToken !== versaoAtual;
}

// Resolve o banco da empresa pelo código que vem no corpo, na query ou na rota.
// Código desconhecido e empresa desativada respondem igual, de propósito: a
// resposta não pode servir para descobrir quais códigos existem.
export function criarResolverEmpresa({ gerenciador }) {
    return function resolverEmpresa(req, res, next) {
        const codigo = codigoEmpresa(req.body?.empresa ?? req.query?.empresa ?? req.params?.empresa);
        if (!codigo) return res.status(400).json({ erro: 'Informe o código da empresa' });

        const resultado = gerenciador.abrir(codigo);
        if (resultado.erro) {
            return res.status(401).json({ erro: 'Empresa inválida ou indisponível' });
        }
        req.banco = resultado.banco;
        req.empresa = codigo;
        next();
    };
}

export function criarAutenticar({ gerenciador, segredo }) {
    return async function autenticar(req, res, next) {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) {
            return res.status(401).json({ erro: 'Token não informado' });
        }
        try {
            const { payload } = await jwtVerify(header.slice(7), segredo, {
                algorithms: ['HS256'],
                audience: AUD_EMPRESA,
            });
            const empresa = codigoEmpresa(payload.empresa);
            if (!empresa) return res.status(401).json({ erro: 'Token inválido ou expirado' });

            const resultado = gerenciador.abrir(empresa);
            if (resultado.erro) return res.status(401).json({ erro: 'Token inválido ou expirado' });

            const usuario = resultado.banco.buscarUsuarioPorId(Number(payload.sub));
            if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado' });
            if (usuario.empresa !== empresa) {
                return res.status(401).json({ erro: 'Token inválido ou expirado' });
            }
            if (tokenAnteriorATrocaDeSenha(payload, usuario)) {
                return res.status(401).json({ erro: 'Sessão expirada, entre com a senha nova' });
            }
            req.banco = resultado.banco;
            req.empresa = empresa;
            req.usuario = usuario;
            next();
        } catch {
            return res.status(401).json({ erro: 'Token inválido ou expirado' });
        }
    };
}

export function criarAutenticarAdmin({ catalogo, segredo }) {
    return async function autenticarAdmin(req, res, next) {
        // Duas formas convivem: Bearer para CLI e testes, cookie para o painel.
        const header = req.headers.authorization;
        const porBearer = header?.startsWith('Bearer ') === true;
        const token = porBearer ? header.slice(7) : tokenDoCookie(req);
        if (!token) {
            return res.status(401).json({ erro: 'Token não informado' });
        }
        try {
            const { payload } = await jwtVerify(token, segredo, {
                algorithms: ['HS256'],
                audience: AUD_ADMIN,
            });
            const admin = catalogo.buscarAdminPorId(Number(payload.sub));
            if (!admin) return res.status(401).json({ erro: 'Admin não encontrado' });
            if (tokenAnteriorATrocaDeSenha(payload, admin)) {
                return res.status(401).json({ erro: 'Sessão expirada, entre com a senha nova' });
            }
            // O CSRF só vale para o cookie, porque só ele viaja sozinho no
            // navegador. A checagem vem depois do token para não dar 403 a quem
            // nem está autenticado.
            if (!porBearer && !csrfValido(req)) {
                return res.status(403).json({ erro: 'CSRF inválido' });
            }
            req.admin = admin;
            next();
        } catch {
            return res.status(401).json({ erro: 'Token inválido ou expirado' });
        }
    };
}

export function criarExigirCoordenador() {
    return function exigirCoordenador(req, res, next) {
        if (req.usuario.tipo !== PAPEL_COORDENADOR) {
            return res.status(403).json({ erro: 'Acesso restrito ao coordenador' });
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
