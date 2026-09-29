import { emailNormalizado, emailValido, semCaractereDeControle, texto } from '../validacao.js';

export function criarControladoresFuncionarios({ banco }) {
    function listar(req, res) {
        res.json(banco.listarFuncionarios());
    }

    function preparar(body) {
        const nome = texto(body?.nome, 'nome');
        const numero = texto(body?.numero, 'numero');
        const email = emailNormalizado(body?.email);

        if (!nome) return { erro: 'Nome é obrigatório', status: 400 };
        if (!semCaractereDeControle(nome) || !semCaractereDeControle(numero)) {
            return { erro: 'Dados do funcionário inválidos', status: 400 };
        }
        if (email && !emailValido(email)) return { erro: 'Informe um email válido', status: 400 };
        return { nome, numero, email };
    }

    function criar(req, res) {
        const dados = preparar(req.body);
        if (dados.erro) return res.status(dados.status).json({ erro: dados.erro });
        const id = banco.criarFuncionario(dados.nome, dados.numero, dados.email);
        res.status(201).json(banco.buscarFuncionario(id));
    }

    function atualizar(req, res) {
        const id = Number(req.params.id);
        if (!banco.buscarFuncionario(id)) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        const dados = preparar(req.body);
        if (dados.erro) return res.status(dados.status).json({ erro: dados.erro });
        banco.atualizarFuncionario(id, dados.nome, dados.numero, dados.email);
        res.json(banco.buscarFuncionario(id));
    }

    function apagar(req, res) {
        const apagou = banco.apagarFuncionario(Number(req.params.id));
        if (!apagou) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        res.status(204).end();
    }

    return { listar, criar, atualizar, apagar };
}
