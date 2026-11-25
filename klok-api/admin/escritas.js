import { MINIMO_SENHA } from '../controladores/coordenadores.js';
import { prepararDadosFuncionario } from '../controladores/funcionarios.js';
import { PAPEL_COORDENADOR } from '../constantes.js';
import { raioValido } from '../geolocalizacao.js';
import { aprovarPedido, recusarPedido } from '../servicos/solicitacoes.js';
import { codigoEmpresa, senha as senhaDe } from '../validacao.js';

// Escritas do painel de suporte. Como as consultas, elas abrem a empresa
// permitindo desativada e nunca criam banco ausente.
/**
 * Montar os controladores de escrita do painel de suporte.
 * @param {object} deps gerenciador, gerador de token de empresa, envio de email e log do painel
 * @returns {object} controladores de senha, impersonação, funcionário, pedido e empresa
 */
export function criarEscritasAdmin({ gerenciador, gerarTokenEmpresa, enviarEmail, registrar = console.log }) {
    /** Abrir o banco da empresa permitindo desativada e nunca criando banco ausente. */
    function abrirParaAdmin(codigo) {
        return gerenciador.abrir(codigoEmpresa(codigo), {
            permitirDesativada: true,
            criarSeFaltar: false,
        });
    }

    /** Responder o erro da abertura e devolver false para o controlador parar. */
    function responderAbertura(res, aberta) {
        if (aberta.erro) {
            res.status(aberta.status).json({ erro: aberta.erro });
            return false;
        }
        return true;
    }

    // Só coordenador pode ser alvo: o painel nunca impersona funcionário, e
    // responder 404 evita confirmar que o id existe com outro papel.
    /** Buscar o usuário do banco da empresa e devolver apenas se ele for coordenador. */
    function coordenadorDaEmpresa(banco, id) {
        const usuario = banco.buscarUsuarioPorId(Number(id));
        return usuario && usuario.tipo === PAPEL_COORDENADOR ? usuario : null;
    }

    /** Redefinir a senha de um coordenador da empresa, inclusive se ela estiver desativada. */
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

    /** Gerar um token de empresa para o coordenador alvo e registrar a impersonação na auditoria. */
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
    /** Editar os dados do funcionário nas tabelas funcionarios e usuarios. */
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

    /**
     * Apagar o funcionário com os pontos e o usuário dele na mesma transação.
     * Responde 409 quando o funcionário é um coordenador, porque a conta dele
     * não se apaga pela lista de funcionários.
     */
    function apagarFuncionario(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        // apagarFuncionario do banco remove pontos e usuário na mesma transação.
        const resultado = aberta.banco.apagarFuncionario(Number(req.params.id));
        if (resultado.motivo === 'coordenador') {
            return res.status(409).json({ erro: 'Coordenador não pode ser apagado como funcionário' });
        }
        if (!resultado.apagou) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        res.status(204).end();
    }

    // A decisão do pedido passa pelo serviço compartilhado com o app, então a
    // regra de aprovação e o aviso por email ficam em um lugar só.
    /** Aprovar o pedido de cadastro pelo serviço compartilhado com o app, que também avisa por email. */
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

    /** Recusar o pedido de cadastro pelo serviço compartilhado com o app. */
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

    /**
     * Buscar o pedido pendente e validar o raio antes de qualquer alteração.
     * Devolve o pedido ou escreve a resposta de erro.
     *
     * @param {object} res Resposta HTTP.
     * @param {object} banco Banco da empresa.
     * @param {string|number} id Identificador do pedido.
     * @returns {object|null} O pedido pendente, ou nulo quando a resposta já foi enviada.
     */
    function pedidoPendente(res, banco, id) {
        const numero = Number(id);
        if (!Number.isInteger(numero) || numero <= 0) {
            res.status(404).json({ erro: 'Pedido não encontrado' });
            return null;
        }
        const pedido = banco.buscarPedidoLocal(numero);
        if (!pedido) {
            res.status(404).json({ erro: 'Pedido não encontrado' });
            return null;
        }
        if (pedido.status !== 'pendente') {
            res.status(409).json({ erro: 'Pedido já foi decidido' });
            return null;
        }
        if (!raioValido(pedido.raioMetros)) {
            res.status(400).json({ erro: 'Raio precisa ficar entre 100 e 150 metros' });
            return null;
        }
        return pedido;
    }

    /** Indicar se o erro do SQLite é violação de índice único. */
    function ehConflitoDeUnicidade(erro) {
        return erro?.errcode === 2067;
    }

    /**
     * Aplicar o pedido de perímetro e decidir o pedido na mesma transação.
     * Responde 200 com o local resultante, 400 em dado inválido, 404 quando o
     * local alvo não existe, 409 no pedido já decidido, na exclusão do último
     * perímetro ativo e no nome repetido.
     */
    function aprovarPedidoLocal(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const banco = aberta.banco;
        const pedido = pedidoPendente(res, banco, req.params.id);
        if (!pedido) return;

        const dados = {
            nome: pedido.nome,
            latitude: pedido.latitude,
            longitude: pedido.longitude,
            raioMetros: pedido.raioMetros,
        };

        let local = null;
        if (pedido.tipo !== 'criar') {
            const alvo = banco.buscarLocal(pedido.localId);
            if (!alvo || alvo.removidoEm) {
                return res.status(404).json({ erro: 'Local não encontrado' });
            }
            if (pedido.tipo === 'excluir' && banco.contarLocaisAtivos() <= 1) {
                return res.status(409).json({ erro: 'Não é possível excluir o último perímetro ativo' });
            }
        }

        try {
            banco.emTransacao(() => {
                if (pedido.tipo === 'criar') {
                    local = banco.criarLocal(dados);
                } else if (pedido.tipo === 'editar') {
                    local = banco.atualizarLocal(pedido.localId, dados);
                } else {
                    local = banco.removerLocal(pedido.localId);
                }
                banco.decidirPedidoLocal(pedido.id, {
                    status: 'aprovado',
                    decididoPor: req.admin?.usuario ?? 'admin',
                });
            });
        } catch (erro) {
            if (ehConflitoDeUnicidade(erro)) {
                return res.status(409).json({ erro: 'Já existe perímetro ativo com esse nome' });
            }
            throw erro;
        }

        res.json({ sucesso: true, local });
    }

    /**
     * Recusar o pedido de perímetro, guardando o motivo opcional.
     * Responde 200 em sucesso, 404 no pedido inexistente e 409 no pedido já
     * decidido. O perímetro vigente não muda.
     */
    function recusarPedidoLocal(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const banco = aberta.banco;
        const pedido = pedidoPendente(res, banco, req.params.id);
        if (!pedido) return;

        const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim().slice(0, 500) : null;
        banco.decidirPedidoLocal(pedido.id, {
            status: 'recusado',
            decididoPor: req.admin?.usuario ?? 'admin',
            motivoRecusa: motivo || null,
        });
        res.json({ sucesso: true });
    }

    // Apagar empresa é irreversível, então o cabeçalho obriga o operador a
    // digitar o código e evita derrubar a empresa errada.
    /** Apagar a empresa do catálogo e os arquivos do banco dela, exigindo o código repetido no cabeçalho de confirmação. */
    function apagarEmpresa(req, res) {
        const codigo = codigoEmpresa(req.params.codigo);
        if (codigoEmpresa(req.get('x-confirmar-codigo')) !== codigo) {
            return res.status(400).json({ erro: 'Confirmação do código da empresa não confere' });
        }
        const resultado = gerenciador.apagar(codigo);
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
        res.status(204).end();
    }

    return {
        redefinirSenhaCoordenador,
        impersonarCoordenador,
        atualizarFuncionario,
        apagarFuncionario,
        aprovarSolicitacao,
        recusarSolicitacao,
        aprovarPedidoLocal,
        recusarPedidoLocal,
        apagarEmpresa,
    };
}
