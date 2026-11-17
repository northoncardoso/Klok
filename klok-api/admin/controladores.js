import { validarNovoCoordenador } from '../controladores/coordenadores.js';
import { codigoEmpresa, senha as senhaDe, texto } from '../validacao.js';
import { criarConsultasAdmin } from './consultas.js';
import { criarEscritasAdmin } from './escritas.js';
import { criarExportacoesAdmin } from './exportacoes.js';
import { criarValorCsrf, definirCookiesSessao, limparCookiesSessao } from './sessao.js';

/**
 * Montar os controladores do painel de suporte, juntando catálogo, escritas,
 * consultas e exportações.
 * @param {object} deps catálogo, gerenciador, geradores de token, envio de email e log
 * @returns {object} todos os controladores expostos pelas rotas do painel
 */
export function criarControladoresAdmin({
    catalogo,
    gerenciador,
    gerarTokenAdmin,
    gerarTokenEmpresa,
    enviarEmail,
    registrar,
}) {
    /** Indicar se a API roda em produção, onde o cookie da sessão ganha Secure. */
    // Secure só em produção para o painel local seguir funcionando em http.
    const producao = () => process.env.NODE_ENV === 'production';

    /** Conferir a senha do admin do catálogo, gravar a sessão em cookie httpOnly com CSRF e devolver o token no corpo para CLI e testes. */
    async function login(req, res) {
        const usuario = texto(req.body?.usuario, 'usuario');
        const senha = senhaDe(req.body?.senha);
        if (!usuario || !senha) {
            return res.status(400).json({ erro: 'Informe usuário e senha' });
        }
        const admin = catalogo.verificarSenhaAdmin(usuario, senha);
        if (!admin) {
            return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
        }
        const token = await gerarTokenAdmin(admin);
        const csrf = criarValorCsrf();
        definirCookiesSessao(res, { token, csrf, producao: producao() });
        // O token continua no corpo para o CLI e os testes que usam Bearer.
        res.json({ token, tipo: 'admin', nome: admin.usuario, id: admin.id });
    }

    /** Encerrar a sessão do painel apagando os cookies. */
    function logout(req, res) {
        limparCookiesSessao(res, { producao: producao() });
        res.status(204).end();
    }

    /** Listar todas as empresas do catálogo, ativas e desativadas. */
    function listarEmpresas(req, res) {
        res.json(gerenciador.listar());
    }

    /** Criar a empresa no catálogo junto do banco dela, já migrado. */
    function criarEmpresa(req, res) {
        const codigo = codigoEmpresa(req.body?.codigo);
        const resultado = gerenciador.criarEmpresa({ codigo, nome: req.body?.nome });
        if (resultado.erro) {
            return res.status(resultado.status).json({ erro: resultado.erro });
        }
        res.status(201).json(resultado);
    }

    /** Renomear a empresa e desativar ou reativar pelo catálogo. */
    function atualizarEmpresa(req, res) {
        const codigo = codigoEmpresa(req.params.codigo);
        const { nome, ativa } = req.body ?? {};
        const resultado = gerenciador.atualizar(codigo, { nome, ativa });
        if (resultado.erro) {
            return res.status(resultado.status).json({ erro: resultado.erro });
        }
        res.json(resultado);
    }

    /** Criar um coordenador direto no banco da empresa, pela validação usada no app. */
    function criarCoordenador(req, res) {
        const codigo = codigoEmpresa(req.params.codigo);
        const aberta = gerenciador.abrir(codigo);
        if (aberta.erro) {
            return res.status(aberta.status).json({ erro: aberta.erro });
        }

        const validado = validarNovoCoordenador(aberta.banco, req.body);
        if (validado.erro) {
            return res.status(validado.status).json({ erro: validado.erro });
        }

        const { usuario, senha, nome, email, numero } = validado.dados;
        const criado = aberta.banco.criarCoordenador(usuario, senha, nome, email, numero);
        res.status(201).json({
            id: criado.id,
            usuario: criado.usuario,
            tipo: criado.tipo,
            empresa: criado.empresa,
        });
    }

    return {
        login,
        logout,
        listarEmpresas,
        criarEmpresa,
        atualizarEmpresa,
        criarCoordenador,
        ...criarConsultasAdmin({ gerenciador }),
        ...criarEscritasAdmin({ gerenciador, gerarTokenEmpresa, enviarEmail, registrar }),
        ...criarExportacoesAdmin({ gerenciador }),
    };
}
