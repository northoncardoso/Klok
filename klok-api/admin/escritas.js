import { MINIMO_SENHA } from '../controladores/coordenadores.js';
import { prepararDadosFuncionario } from '../controladores/funcionarios.js';
import { PAPEL_COORDENADOR } from '../constantes.js';
import { aprovarPedido, recusarPedido } from '../servicos/solicitacoes.js';
import { codigoEmpresa, senha as senhaDe } from '../validacao.js';

// Escritas do painel de suporte. Como as consultas, elas abrem a empresa
// permitindo desativada e nunca criam banco ausente.
export function criarEscritasAdmin({ gerenciador, gerarTokenEmpresa, enviarEmail, registrar = console.log }) {
    function abrirParaAdmin(codigo) {
        return gerenciador.abrir(codigoEmpresa(codigo), {
            permitirDesativada: true,
            criarSeFaltar: false,
        });
    }

    function responderAbertura(res, aberta) {
        if (aberta.erro) {
            res.status(aberta.status).json({ erro: aberta.erro });
            return false;
        }
        return true;
    }

    // Só coordenador pode ser alvo: o painel nunca impersona funcionário, e
    // responder 404 evita confirmar que o id existe com outro papel.
    function coordenadorDaEmpresa(banco, id) {
        const usuario = banco.buscarUsuarioPorId(Number(id));
        return usuario && usuario.tipo === PAPEL_COORDENADOR ? usuario : null;
    }

    function redefinirSenhaCoordenador(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const coordenador = coordenadorDaEmpresa(aberta.banco, req.params.id);
        if (!coordenador) return res.status(404).json({ erro: 'Coordenador não encontrado' });

        const senha = senhaDe(req.body?.senha);
        if (senha.length < MINIMO_SENHA) {
            return res.status(400).json({
                erro: `A senha do coordenador deve ter ao menos ${MINIMO_SENHA} caracteres`,
            });
        }

        // atualizarSenha sobe a senhaVersao, então os tokens antigos do
        // coordenador caem no próximo pedido.
        aberta.banco.atualizarSenha(coordenador.id, aberta.banco.criarHashSenha(senha));
        res.status(204).end();
    }

    async function impersonarCoordenador(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const coordenador = coordenadorDaEmpresa(aberta.banco, req.params.id);
        if (!coordenador) return res.status(404).json({ erro: 'Coordenador não encontrado' });

        const token = await gerarTokenEmpresa(coordenador, aberta.empresa.codigo);
        registrar(
            `[klok] admin ${req.admin?.usuario ?? '?'} impersonou ${coordenador.usuario} na empresa ${aberta.empresa.codigo}`
        );
        res.json({
            token,
            empresa: aberta.empresa.codigo,
            usuario: coordenador.usuario,
            tipo: coordenador.tipo,
            // Mesmo prazo do token de empresa gerado no login.
            expiraEmHoras: 12,
        });
    }

    // A edição mexe nas duas tabelas: a linha de funcionarios e, quando o
    // funcionário tem login, a linha de usuarios ligada a ele.
    function atualizarFuncionario(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const id = Number(req.params.id);
        if (!aberta.banco.buscarFuncionario(id)) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        const dados = prepararDadosFuncionario(req.body);
        if (dados.erro) return res.status(dados.status).json({ erro: dados.erro });

        aberta.banco.atualizarFuncionario(id, dados.nome, dados.numero, dados.email);
        const usuario = aberta.banco.buscarUsuarioPorFuncionarioId(id);
        if (usuario) {
            aberta.banco.atualizarDadosUsuarios(usuario.id, dados.nome, dados.numero, dados.email);
        }
        res.json(aberta.banco.buscarFuncionario(id));
    }

    function apagarFuncionario(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        // apagarFuncionario do banco remove pontos e usuário na mesma transação.
        if (!aberta.banco.apagarFuncionario(Number(req.params.id))) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        res.status(204).end();
    }

    // A decisão do pedido passa pelo serviço compartilhado com o app, então a
    // regra de aprovação e o aviso por email ficam em um lugar só.
    async function aprovarSolicitacao(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(404).json({ erro: 'Pedido não encontrado' });
        }
        const resultado = await aprovarPedido({
            banco: aberta.banco,
            empresa: aberta.empresa.codigo,
            id,
            enviarEmail,
        });
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
        res.status(201).json(resultado.funcionario);
    }

    function recusarSolicitacao(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(404).json({ erro: 'Pedido não encontrado' });
        }
        const resultado = recusarPedido({ banco: aberta.banco, id });
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
        res.json({ sucesso: true });
    }

    return {
        redefinirSenhaCoordenador,
        impersonarCoordenador,
        atualizarFuncionario,
        apagarFuncionario,
        aprovarSolicitacao,
        recusarSolicitacao,
    };
}
