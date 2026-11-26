import { TIPOS_PONTO } from '../constantes.js';
import { texto } from '../validacao.js';
import { apurarPerimetro, lerCoordenada } from '../geolocalizacao.js';

/**
 * Devolver apenas os campos que o funcionário pode ver da própria batida.
 *
 * @param {object} ponto Linha completa da tabela pontos.
 * @returns {{ id: number, funcionarioId: number, dataHora: string, tipo: string }}
 */
function pontoDoFuncionario(ponto) {
    return {
        id: ponto.id,
        funcionarioId: ponto.funcionarioId,
        dataHora: ponto.dataHora,
        tipo: ponto.tipo,
    };
}

/**
 * Montar os controladores de ponto.
 * @returns {object} Controladores bater, meus e todos.
 */
export function criarControladoresPontos() {
    /**
     * Registrar uma batida de ponto do próprio funcionário.
     * Responde 201 com o ponto gravado e 400 quando o usuário não tem
     * funcionário vinculado, quando o funcionário sumiu, quando o tipo é
     * inválido ou quando a coordenada é inválida. Responde 409 quando a empresa
     * não tem perímetro aprovado. Não exige coordenador. Sem tipo informado usa
     * o primeiro da lista de tipos.
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

        const leitura = lerCoordenada(req.body);
        if (leitura.erro) {
            return res.status(400).json({ erro: leitura.erro });
        }

        const locais = banco.listarLocais();
        if (locais.length === 0) {
            return res.status(409).json({ erro: 'Empresa sem perímetro aprovado' });
        }

        const apuracao = apurarPerimetro(locais, leitura.coordenada);
        const ponto = banco.baterPonto(req.usuario.funcionarioId, tipo || TIPOS_PONTO[0], apuracao);
        res.status(201).json(pontoDoFuncionario(ponto));
    }

    /**
     * Listar os pontos do próprio funcionário, sem nenhum campo do cálculo.
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
     * Listar os pontos de todos os funcionários da empresa, com o local e a
     * situação da verificação. Exige coordenador, a checagem fica na rota.
     */
    function todos(req, res) {
        res.json(req.banco.listarTodosPontos());
    }

    return { bater, meus, todos };
}
