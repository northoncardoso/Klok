import express from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';

export function criarApp({ banco, clienteGoogle }) {
    const app = express();
    app.use(express.json());

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

    async function autenticar(req, res, next) {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) {
            return res.status(401).json({ erro: 'Token não informado' });
        }
        try {
            const { payload } = await jwtVerify(header.slice(7), SECRETO, { algorithms: ['HS256'] });
            const usuario = banco.buscarUsuarioPorId(Number(payload.sub));
            if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado' });
            req.usuario = usuario;
            next();
        } catch {
            return res.status(401).json({ erro: 'Token inválido ou expirado' });
        }
    }

    function exigirMestre(req, res, next) {
        if (req.usuario.tipo !== 'mestre') {
            return res.status(403).json({ erro: 'Acesso restrito ao mestre' });
        }
        next();
    }

    // ---------- Autenticação ----------

    app.post('/api/auth/registrar', limitadorAuth, (req, res) => {
        const { usuario, senha, nome } = req.body;
        if (!usuario?.trim() || !senha) {
            return res.status(400).json({ erro: 'Informe usuário e senha' });
        }
        if (banco.buscarUsuarioPorLogin(usuario.trim())) {
            return res.status(409).json({ erro: 'Usuário já existe' });
        }
        try {
            const novo = banco.criarUsuarioLocal(usuario.trim(), senha, nome?.trim());
            res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado' });
        } catch (e) {
            res.status(409).json({ erro: 'Usuário já existe ou dados inválidos' });
        }
    });

    app.post('/api/auth/login', limitadorAuth, async (req, res) => {
        const { usuario, senha } = req.body;
        const encontrado = banco.validarSenha(usuario?.trim(), senha);
        if (!encontrado) {
            return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
        }
        const token = await gerarToken(encontrado);
        res.json({ token, tipo: encontrado.tipo, nome: encontrado.usuario, id: encontrado.id });
    });

    app.post('/api/auth/google', limitadorAuth, async (req, res) => {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ erro: 'Token do Google ausente' });
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
            });
            const payload = ticket.getPayload();
            const usuario = banco.criarOuBuscarUsuarioGoogle(
                payload.sub,
                payload.name,
                payload.email
            );
            const token = await gerarToken(usuario);
            res.json({ token, tipo: usuario.tipo, nome: payload.name, id: usuario.id });
        } catch (e) {
            console.error('Falha ao verificar token do Google:', e);
            res.status(401).json({ erro: 'Falha na autenticação com Google' });
        }
    });

    app.get('/api/auth/eu', autenticar, (req, res) => {
        res.json({
            id: req.usuario.id,
            usuario: req.usuario.usuario,
            tipo: req.usuario.tipo,
        });
    });

    // ---------- Funcionários (somente mestre) ----------

    app.get('/api/funcionarios', autenticar, exigirMestre, (req, res) => {
        res.json(banco.listarFuncionarios());
    });

    app.post('/api/funcionarios', autenticar, exigirMestre, (req, res) => {
        const { nome, numero, email } = req.body;
        if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });
        const id = banco.criarFuncionario(nome.trim(), numero, email);
        res.status(201).json(banco.buscarFuncionario(id));
    });

    app.put('/api/funcionarios/:id', autenticar, exigirMestre, (req, res) => {
        const id = Number(req.params.id);
        if (!banco.buscarFuncionario(id)) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        const { nome, numero, email } = req.body;
        banco.atualizarFuncionario(id, nome?.trim(), numero, email);
        res.json(banco.buscarFuncionario(id));
    });

    app.delete('/api/funcionarios/:id', autenticar, exigirMestre, (req, res) => {
        const apagou = banco.apagarFuncionario(Number(req.params.id));
        if (!apagou) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        res.status(204).end();
    });

    // ---------- Pontos ----------

    app.post('/api/pontos', autenticar, (req, res) => {
        const { tipo } = req.body;
        if (req.usuario.funcionarioId == null) {
            return res.status(400).json({ erro: 'Usuário sem funcionário vinculado' });
        }
        if (tipo && tipo !== 'batida') {
            return res.status(400).json({ erro: 'Tipo de ponto inválido' });
        }
        if (!banco.buscarFuncionario(req.usuario.funcionarioId)) {
            return res.status(400).json({ erro: 'Funcionário não encontrado' });
        }
        const ponto = banco.baterPonto(req.usuario.funcionarioId, tipo || 'batida');
        res.status(201).json(ponto);
    });

    app.get('/api/pontos/meus', autenticar, (req, res) => {
        if (req.usuario.funcionarioId == null) {
            return res.json([]);
        }
        res.json(banco.listarPontos(req.usuario.funcionarioId));
    });

    app.get('/api/pontos', autenticar, exigirMestre, (req, res) => {
        res.json(banco.listarTodosPontos());
    });

    return app;
}