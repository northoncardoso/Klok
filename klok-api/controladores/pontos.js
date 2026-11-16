import { TIPOS_PONTO } from '../constantes.js';
import { texto } from '../validacao.js';

/**
 * Montar os controladores de ponto.
 * @returns {object} Controladores bater, meus e todos.
 */
export function criarControladoresPontos() {
    /**
     * Registrar uma batida de ponto do próprio funcionário.
     * Responde 201 com o ponto gravado e 400 quando o usuário não tem
     * funcionário vinculado, quando o funcionário sumiu ou quando o tipo é
     * inválido. Não exige coordenador. Sem tipo informado usa o primeiro da
     * lista de tipos.
     */
    function bater(req, res) {
        const banco = req.banco;
        const tipo = texto(req.body?.tipo, 'tipo');
        if (req.usuario.funcionarioId == null) {
            return res.status(400).json({ erro: 'Usuário sem funcionário vinculado' });
        }
        if (tipo && !TIPOS_PONTO.includes(tipo)) {
            return res.status(400).json({ erro: 'Tipo de ponto inválido' });
        }
        if (!banco.buscarFuncionario(req.usuario.funcionarioId)) {
            return res.status(400).json({ erro: 'Funcionário não encontrado' });
        }
        const ponto = banco.baterPonto(req.usuario.funcionarioId, tipo || TIPOS_PONTO[0]);
        res.status(201).json(ponto);
    }

    /**
     * Listar os pontos do próprio funcionário.
     * Responde 200 com a lista, vazia quando o usuário não tem funcionário
     * vinculado. Não exige coordenador.
     */
    function meus(req, res) {
        if (req.usuario.funcionarioId == null) {
            return res.json([]);
        }
        res.json(req.banco.listarPontos(req.usuario.funcionarioId));
    }

    /**
     * Listar os pontos de todos os funcionários da empresa.
     * Responde 200 com a lista completa. Exige coordenador, a checagem fica na
     * rota.
     */
    function todos(req, res) {
        res.json(req.banco.listarTodosPontos());
    }

    return { bater, meus, todos };
}