import { texto } from '../validacao.js';
import { lerCoordenada, raioValido } from '../geolocalizacao.js';

const TIPOS_PEDIDO = ['criar', 'editar', 'excluir'];

/**
 * Montar os controladores de perímetros da empresa.
 * @returns {object} Controladores listar e pedir.
 */
export function criarControladoresLocais() {
    /**
     * Listar os perímetros ativos e os pedidos pendentes da empresa.
     * Responde 200 com `locais` e `pendentes`. Exige coordenador, a checagem
     * fica na rota.
     */
    function listar(req, res) {
        res.json({
            locais: req.banco.listarLocais(),
            pendentes: req.banco.listarPedidosLocal('pendente'),
        });
    }

    /**
     * Registrar um pedido de criação, edição ou exclusão de perímetro.
     * Responde 201 com o pedido pendente, 400 em dado inválido, 404 quando o
     * local a editar ou excluir não existe e 409 quando já há pedido pendente
     * para o mesmo local ou um pedido de criação pendente. O perímetro vigente
     * não muda até a aprovação do administrador. Exige coordenador, a checagem
     * fica na rota.
     */
    function pedir(req, res) {
        const banco = req.banco;
        const tipo = texto(req.body?.tipo, 'tipo');
        if (!TIPOS_PEDIDO.includes(tipo)) {
            return res.status(400).json({ erro: 'Tipo de pedido inválido' });
        }

        const nome = texto(req.body?.nome);
        if (!nome) {
            return res.status(400).json({ erro: 'Nome do local é obrigatório' });
        }

        const leitura = lerCoordenada(req.body);
        if (leitura.erro) {
            return res.status(400).json({ erro: leitura.erro });
        }
        if (!leitura.coordenada) {
            return res.status(400).json({ erro: 'Coordenada é obrigatória' });
        }

        const raioMetros = Number(req.body?.raioMetros);
        if (!raioValido(raioMetros)) {
            return res.status(400).json({ erro: 'Raio precisa ficar entre 100 e 150 metros' });
        }

        let localId = null;
        if (tipo === 'criar') {
            if (banco.existePedidoCriacaoPendente()) {
                return res.status(409).json({ erro: 'Já existe pedido de criação pendente' });
            }
        } else {
            localId = Number(req.body?.localId);
            if (!Number.isInteger(localId) || localId <= 0) {
                return res.status(400).json({ erro: 'Local inválido' });
            }
            const local = banco.buscarLocal(localId);
            if (!local || local.removidoEm) {
                return res.status(404).json({ erro: 'Local não encontrado' });
            }
            if (banco.existePedidoPendenteParaLocal(localId)) {
                return res.status(409).json({ erro: 'Já existe pedido pendente para este local' });
            }
        }

        const pedido = banco.criarPedidoLocal({
            tipo,
            localId,
            nome,
            latitude: leitura.coordenada.latitude,
            longitude: leitura.coordenada.longitude,
            raioMetros,
            solicitadoPor: req.usuario.id,
        });
        res.status(201).json(pedido);
    }

    return { listar, pedir };
}
