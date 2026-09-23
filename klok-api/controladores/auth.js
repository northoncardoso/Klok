import { createHash, randomBytes } from 'node:crypto';

export function criarControladoresAuth({ banco, gerarToken, googleClient, enviarEmail }) {
    function registrar(req, res) {
        const { usuario, senha, nome } = req.body;
        if (!usuario?.trim() || !senha) {
            return res.status(400).json({ erro: 'Informe usuário e senha' });
        }
        if (banco.buscarUsuarioPorLogin(usuario.trim())) {
            return res.status(409).json({ erro: 'Usuário já existe' });
        }
        try {
            banco.criarUsuarioLocal(usuario.trim(), senha, nome?.trim());
            res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado' });
        } catch (e) {
            res.status(409).json({ erro: 'Usuário já existe ou dados inválidos' });
        }
    }

    async function login(req, res) {
        const { usuario, senha } = req.body;
        const encontrado = banco.validarSenha(usuario?.trim(), senha);
        if (!encontrado) {
            return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
        }
        const token = await gerarToken(encontrado);
        res.json({ token, tipo: encontrado.tipo, nome: encontrado.usuario, id: encontrado.id });
    }

    async function loginGoogle(req, res) {
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
        const { nome, numero, email } = req.body;
        const nomeLimpo = nome?.trim() || req.usuario.usuario;
        if (req.usuario.funcionarioId != null) {
            banco.atualizarFuncionario(req.usuario.funcionarioId, nomeLimpo, numero, email);
        } else {
            banco.atualizarDadosUsuarios(req.usuario.id, nomeLimpo, numero, email);
        }
        res.json(dadosDeUsuario(banco.buscarUsuarioPorId(req.usuario.id)));
    }

    function alterarSenha(req, res) {
        const { senhaAtual, senhaNova } = req.body;
        if (!senhaAtual || !senhaNova) {
            return res.status(400).json({ erro: 'Informe a senha atual e a nova senha' });
        }
        if (String(senhaNova).length < 4) {
            return res.status(400).json({ erro: 'A nova senha deve ter ao menos 4 caracteres' });
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
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ erro: 'Informe seu email' });
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

        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
            return res.json({ ...MENSAGEM_GENERICA, linkRedefinicao: urlApp, linkPagina: url });
        }
        return res.json(MENSAGEM_GENERICA);
    }

    function paginaRedefinicao(req, res) {
        const token = String(req.params.token || '');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const registro = banco.buscarRecuperacaoPorToken(tokenHash);
        const valido =
            !!registro && !registro.usado && new Date(registro.expiraEm).getTime() >= Date.now();

        const estilo = '<style>body{font-family:Arial,sans-serif;background:#f4f6f8;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}main{background:#fff;max-width:420px;width:90%;padding:28px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.08);text-align:center}h1{font-size:22px;color:#1f2937;margin:0 0 12px}p{color:#4b5563;line-height:1.5}button{background:#dc2626;color:#fff;border:0;border-radius:8px;padding:14px 20px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:8px}.dica{font-size:13px;color:#9ca3af;margin-top:16px}</style>';

        res.type('html');
        if (!valido) {
            return res.send(
                `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Klok: link inválido</title>${estilo}</head><body><main><h1>Link inválido ou expirado</h1><p>Este link de redefinição não é mais válido. Abra o app Klok e toque em "Esqueci minha senha?" para receber um novo link.</p></main></body></html>`
            );
        }
        return res.send(
            `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Redefinir senha no Klok</title>${estilo}</head><body><main><h1>Redefinir sua senha Klok</h1><p>Confirmamos que é você. Toque no botão para abrir o app Klok e definir a nova senha.</p><button onclick="window.location.href='klok://redefinir-senha?token=${token}'">Abrir o app Klok</button><p class="dica">Se nada acontecer, confirme que o app Klok está instalado e toque no link novamente.</p></main></body></html>`
        );
    }

    function redefinirSenha(req, res) {
        const { token, novaSenha } = req.body;
        if (!token || !novaSenha) {
            return res.status(400).json({ erro: 'Informe o link recebido por email e a nova senha' });
        }
        if (String(novaSenha).length < 4) {
            return res.status(400).json({ erro: 'A nova senha deve ter ao menos 4 caracteres' });
        }
        const tokenHash = createHash('sha256').update(String(token)).digest('hex');
        const registro = banco.buscarRecuperacaoPorToken(tokenHash);
        if (!registro || registro.usado) {
            return res.status(400).json({ erro: 'Link inválido ou já utilizado' });
        }
        if (new Date(registro.expiraEm).getTime() < Date.now()) {
            return res.status(400).json({ erro: 'Link expirado. Solicite um novo.' });
        }
        banco.atualizarSenha(registro.usuarioId, banco.criarHashSenha(novaSenha));
        banco.marcarRecuperacaoUsada(registro.usuarioId);
        res.json({ sucesso: true, mensagem: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
    }

    return { registrar, login, loginGoogle, eu, atualizarDados, alterarSenha, esqueciSenha, paginaRedefinicao, redefinirSenha };
}