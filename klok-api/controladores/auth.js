import { createHash, randomBytes } from 'node:crypto';
import {
    emailNormalizado,
    emailOpcionalValido,
    emailValido,
    semCaractereDeControle,
    senha as senhaDe,
    texto,
} from '../validacao.js';

const MINIMO_SENHA = 4;
const TOKEN_HEX = /^[0-9a-f]{64}$/;

function smtpCompleto() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Distingue "já existe mestre" de qualquer outra falha de banco, para não
// esconder bug real atrás de um 409. O SQLite reporta violação de restrição
// como SQLITE_CONSTRAINT_UNIQUE (2067) ou SQLITE_CONSTRAINT (19).
function jaExisteMestre(erro) {
    const codigo = String(erro?.errcode ?? erro?.code ?? '');
    return (
        codigo.includes('2067') ||
        codigo.includes('CONSTRAINT_UNIQUE') ||
        (codigo.includes('19') && /usuarios_mestre/i.test(String(erro?.message ?? '')))
    );
}

function ehProducao() {
    return process.env.NODE_ENV === 'production';
}

function escaparHtml(valor) {
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function criarControladoresAuth({ banco, gerarToken, googleClient, enviarEmail }) {
    function statusMestre(req, res) {
        res.json({ cadastrado: banco.existeMestre() });
    }

    async function criarMestre(req, res) {
        if (banco.existeMestre()) {
            return res.status(409).json({
                erro: 'O usuário mestre já foi cadastrado. Faça login com ele.',
            });
        }
        const usuarioLimpo = texto(req.body?.usuario, 'usuario');
        const senhaLimpa = senhaDe(req.body?.senha);
        const emailLimpo = emailNormalizado(req.body?.email);
        const numeroLimpo = texto(req.body?.numero, 'numero');

        if (!usuarioLimpo || !semCaractereDeControle(usuarioLimpo)) {
            return res.status(400).json({ erro: 'Informe um nome de usuário válido' });
        }
        if (senhaLimpa.length < MINIMO_SENHA) {
            return res.status(400).json({ erro: `A senha do mestre deve ter ao menos ${MINIMO_SENHA} caracteres` });
        }
        if (!emailValido(emailLimpo)) {
            return res.status(400).json({ erro: 'Informe um email válido para o mestre' });
        }
        if (!numeroLimpo || !semCaractereDeControle(numeroLimpo)) {
            return res.status(400).json({ erro: 'Informe o número de celular do mestre' });
        }
        if (banco.buscarUsuarioPorLogin(usuarioLimpo)) {
            return res.status(409).json({ erro: 'Este nome de usuário já está em uso' });
        }

        let criado;
        try {
            criado = banco.criarMestre(usuarioLimpo, senhaLimpa, usuarioLimpo, emailLimpo, numeroLimpo);
        } catch (erro) {
            // O índice único parcial em usuarios(tipo) é quem garante a
            // unicidade de verdade: a checagem acima pode ser corrida por duas
            // requisições simultâneas, o banco não deixa passar.
            if (jaExisteMestre(erro)) {
                return res.status(409).json({
                    erro: 'O usuário mestre já foi cadastrado. Faça login com ele.',
                });
            }
            throw erro;
        }

        const token = await gerarToken(criado);
        res.status(201).json({ token, tipo: criado.tipo, nome: criado.usuario, id: criado.id });
    }

    function registrar(req, res) {
        const usuarioLimpo = texto(req.body?.usuario, 'usuario');
        const senhaLimpa = senhaDe(req.body?.senha);
        const nomeLimpo = texto(req.body?.nome, 'nome');

        if (!usuarioLimpo || !semCaractereDeControle(usuarioLimpo)) {
            return res.status(400).json({ erro: 'Informe um nome de usuário válido' });
        }
        if (senhaLimpa.length < MINIMO_SENHA) {
            return res.status(400).json({ erro: `A senha deve ter ao menos ${MINIMO_SENHA} caracteres` });
        }
        if (banco.buscarUsuarioPorLogin(usuarioLimpo)) {
            return res.status(409).json({ erro: 'Usuário já existe' });
        }
        try {
            banco.criarUsuarioLocal(usuarioLimpo, senhaLimpa, nomeLimpo || usuarioLimpo);
            res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado' });
        } catch {
            res.status(409).json({ erro: 'Usuário já existe ou dados inválidos' });
        }
    }

    async function login(req, res) {
        const usuarioLimpo = texto(req.body?.usuario, 'usuario');
        const senhaLimpa = senhaDe(req.body?.senha);
        if (!usuarioLimpo || !senhaLimpa) {
            return res.status(400).json({ erro: 'Informe usuário e senha' });
        }
        const encontrado = banco.validarSenha(usuarioLimpo, senhaLimpa);
        if (!encontrado) {
            return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
        }
        const token = await gerarToken(encontrado);
        res.json({ token, tipo: encontrado.tipo, nome: encontrado.usuario, id: encontrado.id });
    }

    async function loginGoogle(req, res) {
        const idToken = texto(req.body?.idToken, 'token');
        if (!idToken) return res.status(400).json({ erro: 'Token do Google ausente' });
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
            });
            const payload = ticket.getPayload();
            const sub = texto(payload?.sub, 'usuario');
            if (!sub) return res.status(401).json({ erro: 'Falha na autenticação com Google' });
            const usuario = banco.criarOuBuscarUsuarioGoogle(
                sub,
                texto(payload?.name, 'nome'),
                emailNormalizado(payload?.email)
            );
            const token = await gerarToken(usuario);
            res.json({ token, tipo: usuario.tipo, nome: texto(payload?.name, 'nome'), id: usuario.id });
        } catch {
            res.status(401).json({ erro: 'Falha na autenticação com Google' });
        }
    }

    function dadosDeUsuario(usuario) {
        const funcionario =
            usuario.funcionarioId != null ? banco.buscarFuncionario(usuario.funcionarioId) : null;
        return {
            id: usuario.id,
            usuario: usuario.usuario,
            tipo: usuario.tipo,
            funcionarioId: usuario.funcionarioId ?? null,
            hasSenha: !!usuario.senhaHash,
            nome: funcionario?.nome ?? (usuario.nome || usuario.usuario),
            numero: funcionario?.numero ?? (usuario.numero || ''),
            email: funcionario?.email ?? (usuario.email || ''),
        };
    }

    function eu(req, res) {
        res.json(dadosDeUsuario(req.usuario));
    }

    function atualizarDados(req, res) {
        const nomeLimpo = texto(req.body?.nome, 'nome') || req.usuario.usuario;
        const numeroLimpo = texto(req.body?.numero, 'numero');
        const emailLimpo = emailNormalizado(req.body?.email);

        if (!semCaractereDeControle(nomeLimpo) || !semCaractereDeControle(numeroLimpo)) {
            return res.status(400).json({ erro: 'Dados do perfil inválidos' });
        }
        if (!emailOpcionalValido(emailLimpo)) {
            return res.status(400).json({ erro: 'Informe um email válido' });
        }

        if (req.usuario.funcionarioId != null) {
            banco.atualizarFuncionario(req.usuario.funcionarioId, nomeLimpo, numeroLimpo, emailLimpo);
        } else {
            banco.atualizarDadosUsuarios(req.usuario.id, nomeLimpo, numeroLimpo, emailLimpo);
        }
        res.json(dadosDeUsuario(banco.buscarUsuarioPorId(req.usuario.id)));
    }

    function alterarSenha(req, res) {
        const senhaAtual = senhaDe(req.body?.senhaAtual);
        const senhaNova = senhaDe(req.body?.senhaNova);
        if (!senhaAtual || !senhaNova) {
            return res.status(400).json({ erro: 'Informe a senha atual e a nova senha' });
        }
        if (senhaNova.length < MINIMO_SENHA) {
            return res.status(400).json({ erro: `A nova senha deve ter ao menos ${MINIMO_SENHA} caracteres` });
        }
        if (senhaNova === senhaAtual) {
            return res.status(400).json({ erro: 'A nova senha deve ser diferente da senha atual' });
        }
        if (!req.usuario.senhaHash) {
            return res.status(400).json({ erro: 'Usuário logado com Google não altera senha pelo app' });
        }
        const conferir = banco.validarSenha(req.usuario.usuario, senhaAtual);
        if (!conferir) {
            return res.status(401).json({ erro: 'Senha atual incorreta' });
        }
        banco.atualizarSenha(req.usuario.id, banco.criarHashSenha(senhaNova));
        res.json({ sucesso: true, mensagem: 'Senha alterada com sucesso' });
    }

    const MENSAGEM_GENERICA = {
        sucesso: true,
        mensagem: 'Se este email estiver cadastrado, você receberá um link para redefinir a senha.',
    };

    async function esqueciSenha(req, res) {
        const email = emailNormalizado(req.body?.email);
        if (!emailValido(email)) {
            return res.status(400).json({ erro: 'Informe um email válido' });
        }
        const usuario = banco.buscarUsuarioPorEmail(email);
        if (!usuario) {
            return res.json(MENSAGEM_GENERICA);
        }
        const token = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const expiraEm = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        banco.criarRecuperacao(usuario.id, tokenHash, expiraEm);
        const base = (process.env.URL_BASE || 'http://localhost:3000').replace(/\/+$/, '');
        const url = `${base}/redefinir-senha/${token}`;
        const urlApp = `klok://redefinir-senha?token=${token}`;
        await enviarEmail({ para: email, url, urlApp });

        if (ehProducao() || smtpCompleto()) {
            return res.json(MENSAGEM_GENERICA);
        }
        return res.json({ ...MENSAGEM_GENERICA, linkRedefinicao: urlApp, linkPagina: url });
    }

    function paginaRedefinicao(req, res) {
        const token = texto(req.params.token, 'token');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const registro = banco.buscarRecuperacaoPorToken(tokenHash);
        const valido =
            !!registro && !registro.usado && new Date(registro.expiraEm).getTime() >= Date.now();

        const estilo = '<style>body{font-family:Arial,sans-serif;background:#f4f6f8;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}main{background:#fff;max-width:420px;width:90%;padding:28px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.08);text-align:center}h1{font-size:22px;color:#1f2937;margin:0 0 12px}p{color:#4b5563;line-height:1.5}button{background:#dc2626;color:#fff;border:0;border-radius:8px;padding:14px 20px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:8px}.dica{font-size:13px;color:#9ca3af;margin-top:16px}</style>';

        res.type('html');
        if (!valido) {
            return res.send(
                `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Klok: link inválido</title>${estilo}</head><body><main><h1>Link inválido ou expirado</h1><p>Este link de redefinição não é mais válido. Abra o app Klok e toque em "Esqueci minha senha?" para receber um novo link.</p></main></body></html>`
            );
        }
        if (!TOKEN_HEX.test(token)) {
            return res.status(400).type('text').send('Link de redefinição inválido.');
        }
        const tokenSeguro = escaparHtml(token);
        return res.send(
            `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Redefinir senha no Klok</title>${estilo}</head><body><main><h1>Redefinir sua senha Klok</h1><p>Confirmamos que é você. Toque no botão para abrir o app Klok e definir a nova senha.</p><button onclick="window.location.href='klok://redefinir-senha?token=${tokenSeguro}'">Abrir o app Klok</button><p class="dica">Se nada acontecer, confirme que o app Klok está instalado e toque no link novamente.</p></main></body></html>`
        );
    }

    function redefinirSenha(req, res) {
        const token = texto(req.body?.token, 'token');
        const novaSenha = senhaDe(req.body?.novaSenha);
        if (!token || !novaSenha) {
            return res.status(400).json({ erro: 'Informe o link recebido por email e a nova senha' });
        }
        if (novaSenha.length < MINIMO_SENHA) {
            return res.status(400).json({ erro: `A nova senha deve ter ao menos ${MINIMO_SENHA} caracteres` });
        }
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const registro = banco.buscarRecuperacaoPorToken(tokenHash);
        if (!registro || registro.usado) {
            return res.status(400).json({ erro: 'Link inválido ou já utilizado' });
        }
        if (new Date(registro.expiraEm).getTime() < Date.now()) {
            return res.status(400).json({ erro: 'Link expirado. Solicite um novo.' });
        }
        banco.atualizarSenha(registro.usuarioId, banco.criarHashSenha(novaSenha));
        banco.marcarRecuperacaoUsada(registro.id);
        res.json({ sucesso: true, mensagem: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
    }

    return { statusMestre, criarMestre, registrar, login, loginGoogle, eu, atualizarDados, alterarSenha, esqueciSenha, paginaRedefinicao, redefinirSenha };
}