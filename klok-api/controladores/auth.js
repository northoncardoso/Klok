export function criarControladoresAuth({ banco, gerarToken, googleClient }) {
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

    function eu(req, res) {
        res.json({
            id: req.usuario.id,
            usuario: req.usuario.usuario,
            tipo: req.usuario.tipo,
        });
    }

    return { registrar, login, loginGoogle, eu };
}