import express from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';
import {
    criarUsuarioMestre,
    validarSenha,
    criarUsuarioLocal,
    criarOuBuscarUsuarioGoogle,
    buscarUsuarioPorId,
    listarFuncionarios,
    buscarFuncionario,
    criarFuncionario,
    atualizarFuncionario,
    apagarFuncionario,
    baterPonto,
    listarPontos,
    listarTodosPontos,
} from './db.js';

dotenv.config();

export const app = express();
app.use(express.json());

criarUsuarioMestre();

const SECRETO = new TextEncoder().encode(process.env.JWT_SECRET || 'klok-segredo-dev');
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

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
        const usuario = buscarUsuarioPorId(Number(payload.sub));
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

app.post('/api/auth/registrar', (req, res) => {
    const { usuario, senha, nome } = req.body;
    if (!usuario?.trim() || !senha) {
        return res.status(400).json({ erro: 'Informe usuário e senha' });
    }
    try {
        const novo = criarUsuarioLocal(usuario.trim(), senha, nome?.trim());
        res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado' });
    } catch (e) {
        res.status(409).json({ erro: 'Usuário já existe ou dados inválidos' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { usuario, senha } = req.body;
    const encontrado = validarSenha(usuario?.trim(), senha);
    if (!encontrado) {
        return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
    }
    const token = await gerarToken(encontrado);
    res.json({ token, tipo: encontrado.tipo, nome: encontrado.usuario, id: encontrado.id });
});

app.post('/api/auth/google', async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ erro: 'Token do Google ausente' });
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const usuario = criarOuBuscarUsuarioGoogle(
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
    res.json(listarFuncionarios());
});

app.post('/api/funcionarios', autenticar, exigirMestre, (req, res) => {
    const { nome, numero, email } = req.body;
    if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });
    const id = criarFuncionario(nome.trim(), numero, email);
    res.status(201).json(buscarFuncionario(id));
});

app.put('/api/funcionarios/:id', autenticar, exigirMestre, (req, res) => {
    const { nome, numero, email } = req.body;
    atualizarFuncionario(Number(req.params.id), nome?.trim(), numero, email);
    res.json(buscarFuncionario(Number(req.params.id)));
});

app.delete('/api/funcionarios/:id', autenticar, exigirMestre, (req, res) => {
    apagarFuncionario(Number(req.params.id));
    res.status(204).end();
});

// ---------- Pontos ----------

app.post('/api/pontos', autenticar, (req, res) => {
    const { tipo } = req.body;
    if (req.usuario.funcionarioId == null) {
        return res.status(400).json({ erro: 'Usuário sem funcionário vinculado' });
    }
    const ponto = baterPonto(req.usuario.funcionarioId, tipo || 'batida');
    res.status(201).json(ponto);
});

app.get('/api/pontos/meus', autenticar, (req, res) => {
    if (req.usuario.funcionarioId == null) {
        return res.json([]);
    }
    res.json(listarPontos(req.usuario.funcionarioId));
});

app.get('/api/pontos', autenticar, exigirMestre, (req, res) => {
    res.json(listarTodosPontos());
});