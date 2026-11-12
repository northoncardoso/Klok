import { validarNovoCoordenador } from '../controladores/coordenadores.js';
import { codigoEmpresa, senha as senhaDe, texto } from '../validacao.js';
import { criarConsultasAdmin } from './consultas.js';
import { criarEscritasAdmin } from './escritas.js';
import { criarExportacoesAdmin } from './exportacoes.js';
import { criarValorCsrf, definirCookiesSessao, limparCookiesSessao } from './sessao.js';

export function criarControladoresAdmin({
    catalogo,
    gerenciador,
    gerarTokenAdmin,
    gerarTokenEmpresa,
    enviarEmail,
    registrar,
}) {
    // Secure só em produção para o painel local seguir funcionando em http.
    const producao = () => process.env.NODE_ENV === 'production';

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

    function logout(req, res) {
        limparCookiesSessao(res, { producao: producao() });
        res.status(204).end();
    }

    function listarEmpresas(req, res) {
        res.json(gerenciador.listar());
    }

    function criarEmpresa(req, res) {
        const codigo = codigoEmpresa(req.body?.codigo);
        const resultado = gerenciador.criarEmpresa({ codigo, nome: req.body?.nome });
        if (resultado.erro) {
            return res.status(resultado.status).json({ erro: resultado.erro });
        }
        res.status(201).json(resultado);
    }

    function atualizarEmpresa(req, res) {
        const codigo = codigoEmpresa(req.params.codigo);
        const { nome, ativa } = req.body ?? {};
        const resultado = gerenciador.atualizar(codigo, { nome, ativa });
        if (resultado.erro) {
            return res.status(resultado.status).json({ erro: resultado.erro });
        }
        res.json(resultado);
    }

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
