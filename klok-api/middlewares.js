import { jwtVerify } from 'jose';
import { PAPEL_MESTRE } from './constantes.js';

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