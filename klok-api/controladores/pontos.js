import { TIPOS_PONTO } from '../constantes.js';

export function criarControladoresPontos({ banco }) {
    function bater(req, res) {
        const { tipo } = req.body;
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

    function meus(req, res) {
        if (req.usuario.funcionarioId == null) {
            return res.json([]);
        }
        res.json(banco.listarPontos(req.usuario.funcionarioId));
    }

    function todos(req, res) {
        res.json(banco.listarTodosPontos());
    }

    return { bater, meus, todos };
}