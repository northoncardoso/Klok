import { createHash, randomBytes } from 'node:crypto';
import {
    emailNormalizado,
    emailOpcionalValido,
    emailValido,
    semCaractereDeControle,
    senha as senhaDe,
    texto,
} from '../validacao.js';
import { MINIMO_SENHA } from './coordenadores.js';
import { avisarCoordenadores } from '../avisos.js';

const TOKEN_HEX = /^[0-9a-f]{64}$/;

function smtpCompleto() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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

export function criarControladoresAuth({ gerarTokenEmpresa, googleClient, enviarEmail }) {
    async function registrar(req, res) {
        const banco = req.banco;
        const usuario = texto(req.body?.usuario, 'usuario');
        const senhaLimpa = senhaDe(req.body?.senha);
        const nome = texto(req.body?.nome, 'nome') || usuario;
        const email = emailNormalizado(req.body?.email);

        if (!usuario || !semCaractereDeControle(usuario)) {
            return res.status(400).json({ erro: 'Informe um nome de usuário válido' });
        }
        if (senhaLimpa.length < MINIMO_SENHA) {
            return res.status(400).json({ erro: `A senha deve ter ao menos ${MINIMO_SENHA} caracteres` });
        }
        if (!emailValido(email)) {
            return res.status(400).json({ erro: 'Informe um email válido' });
        }
        if (banco.buscarUsuarioPorLogin(usuario) || banco.buscarSolicitacaoPorUsuario(usuario)) {
            return res.status(409).json({ erro: 'Este nome de usuário já está em uso' });
        }

        const criada = banco.criarSolicitacao({
            usuario,
            senhaHash: banco.criarHashSenha(senhaLimpa),
            nome,
            email,
            numero: '',
            googleId: null,
        });
        if (criada.erro) return res.status(criada.status).json({ erro: criada.erro });

        await avisarCoordenadores({
            banco,
            enviarEmail,
            empresa: req.empresa,
            nome,
            identificacao: usuario,
            email,
        });
        res.status(201).json({
            sucesso: true,
            mensagem: 'Seu cadastro foi enviado. Aguarde a aprovação de um coordenador da sua empresa.',
        });
    }

    async function login(req, res) {
        const banco = req.banco;
        const usuarioLimpo = texto(req.body?.usuario, 'usuario');
        const senhaLimpa = senhaDe(req.body?.senha);
        if (!usuarioLimpo || !senhaLimpa) {
            return res.status(400).json({ erro: 'Informe usuário e senha' });
        }
        const encontrado = banco.validarSenha(usuarioLimpo, senhaLimpa);
        if (encontrado) {
            const token = await gerarTokenEmpresa(encontrado, req.empresa);
            return res.json({ token, tipo: encontrado.tipo, nome: encontrado.usuario, id: encontrado.id });
        }

        const pedido = banco.validarSenhaSolicitacao(usuarioLimpo, senhaLimpa);
        if (pedido) {
            const mensagem =
                pedido.status === 'pendente'
                    ? 'Seu cadastro está aguardando aprovação de um coordenador da sua empresa.'
                    : 'Seu pedido de cadastro foi recusado. Fale com um coordenador da sua empresa.';
            return res.status(403).json({ erro: mensagem });
        }

        return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
    }

    async function loginGoogle(req, res) {
        const banco = req.banco;
        const idToken = texto(req.body?.idToken, 'token');
        if (!idToken) return res.status(400).json({ erro: 'Token do Google ausente' });
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
            });
            const payload = ticket.getPayload();
            const sub = texto(payload?.sub, 'usuario');
            const nomeGoogle = texto(payload?.name, 'nome');
            const email = emailNormalizado(payload?.email);
            if (!sub) return res.status(401).json({ erro: 'Falha na autenticação com Google' });
            if (!emailValido(email)) {
                return res.status(400).json({ erro: 'Sua conta Google não devolveu um email válido' });
            }

            const usuario = banco.buscarUsuarioPorGoogleId(sub);
            if (usuario) {
                const token = await gerarTokenEmpresa(usuario, req.empresa);
                return res.json({ token, tipo: usuario.tipo, nome: nomeGoogle, id: usuario.id });
            }

            const pedido = banco.buscarSolicitacaoPorGoogleId(sub);
            if (pedido?.status === 'pendente') {
                return res.status(403).json({
                    erro: 'Seu cadastro está aguardando aprovação de um coordenador da sua empresa.',
                });
            }
            if (pedido?.status === 'recusado') {
                return res.status(403).json({
                    erro: 'Seu pedido de cadastro foi recusado. Fale com um coordenador da sua empresa.',
                });
            }

            const criada = banco.criarSolicitacao({
                usuario: null,
                senhaHash: null,
                nome: nomeGoogle,
                email,
                numero: '',
                googleId: sub,
            });
            if (criada.erro) return res.status(criada.status).json({ erro: criada.erro });

            await avisarCoordenadores({
                banco,
                enviarEmail,
                empresa: req.empresa,
                nome: nomeGoogle,
                identificacao: `conta Google ${email}`,
                email,
            });
            return res.status(403).json({
                erro: 'Seu cadastro está aguardando aprovação de um coordenador da sua empresa.',
            });
        } catch {
            res.status(401).json({ erro: 'Falha na autenticação com Google' });
        }
    }

    function dadosDeUsuario(banco, usuario) {
        const funcionario =
            usuario.funcionarioId != null ? banco.buscarFuncionario(usuario.funcionarioId) : null;
        return {
            id: usuario.id,
            usuario: usuario.usuario,
            tipo: usuario.tipo,
            empresa: usuario.empresa,
            funcionarioId: usuario.funcionarioId ?? null,
            hasSenha: !!usuario.senhaHash,
            nome: funcionario?.nome ?? (usuario.nome || usuario.usuario),
            numero: funcionario?.numero ?? (usuario.numero || ''),
            email: funcionario?.email ?? (usuario.email || ''),
        };
    }

    function eu(req, res) {
        res.json(dadosDeUsuario(req.banco, req.usuario));
    }

    function atualizarDados(req, res) {
        const banco = req.banco;
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
        res.json(dadosDeUsuario(banco, banco.buscarUsuarioPorId(req.usuario.id)));
    }

    function alterarSenha(req, res) {
        const banco = req.banco;
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
        const banco = req.banco;
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
        const url = `${base}/redefinir-senha/${req.empresa}/${token}`;
        const urlApp = `klok://redefinir-senha?empresa=${req.empresa}&token=${token}`;
        const assunto = 'Klok: Redefinição de senha';
        const corpo = [
            'Recebemos um pedido para redefinir sua senha no app Klok.',
            'Abra o link abaixo para confirmar que é você e definir uma nova senha:',
            '',
            url,
            urlApp,
            '',
            'Este link é válido por 30 minutos. Se você não pediu, ignore este email.',
        ].join('\n');
        await enviarEmail({ para: email, assunto, texto: corpo });

        if (ehProducao() || smtpCompleto()) {
            return res.json(MENSAGEM_GENERICA);
        }
        return res.json({ ...MENSAGEM_GENERICA, linkRedefinicao: urlApp, linkPagina: url });
    }

    function paginaRedefinicao(req, res) {
        const banco = req.banco;
        const token = texto(req.params.token, 'token');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const registro = banco.buscarRecuperacaoPorToken(tokenHash);
        const valido =
            !!registro && !registro.usado && new Date(registro.expiraEm).getTime() >= Date.now();

        const estilo = '<style>body{font-family:Arial,sans-serif;background:#f4f6f8;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}main{background:#fff;max-width:420px;width:90%;padding:28px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.08);text-align:center}h1{font-size:22px;color:#1f2937;margin:0 0 12px}p{color:#4b5563;line-height:1.5}a.botao{display:inline-block;background:#dc2626;color:#fff;border-radius:8px;padding:14px 20px;font-size:16px;font-weight:bold;text-decoration:none;cursor:pointer;margin-top:8px}.dica{font-size:13px;color:#9ca3af;margin-top:16px}</style>';

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
            `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Redefinir senha no Klok</title>${estilo}</head><body><main><h1>Redefinir sua senha Klok</h1><p>Confirmamos que é você. Toque no botão para abrir o app Klok e definir a nova senha.</p><a class="botao" href="klok://redefinir-senha?empresa=${escaparHtml(req.empresa)}&token=${tokenSeguro}">Abrir o app Klok</a><p class="dica">Se nada acontecer, confirme que o app Klok está instalado e toque no link novamente.</p></main></body></html>`
        );
    }

    function redefinirSenha(req, res) {
        const banco = req.banco;
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

    return { registrar, login, loginGoogle, eu, atualizarDados, alterarSenha, esqueciSenha, paginaRedefinicao, redefinirSenha };
}
