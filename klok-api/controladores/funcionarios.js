import { emailNormalizado, emailValido, semCaractereDeControle, texto } from '../validacao.js';

/**
 * Validar e normalizar os dados de um funcionário.
 * Devolve os campos limpos ou o erro com o status HTTP a usar.
 * @param {object} body Corpo da requisição com nome, numero e email opcional.
 * @returns {object} Objeto com nome, numero e email quando passa, ou com erro e status.
 */
// Validação compartilhada entre o app e o painel de suporte.
export function prepararDadosFuncionario(body) {
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

/**
 * Montar os controladores de funcionários.
 * @returns {object} Controladores listar, criar, atualizar e apagar.
 */
export function criarControladoresFuncionarios() {
    /**
     * Listar os funcionários da empresa.
     * Responde 200 com a lista. Exige coordenador, a checagem fica na rota.
     */
    function listar(req, res) {
        res.json(req.banco.listarFuncionarios());
    }

    /**
     * Cadastrar um funcionário na empresa.
     * Responde 201 com o funcionário criado e 400 em dados inválidos. Exige
     * coordenador, a checagem fica na rota.
     */
    function criar(req, res) {
        const banco = req.banco;
        const dados = prepararDadosFuncionario(req.body);
        if (dados.erro) return res.status(dados.status).json({ erro: dados.erro });
        const id = banco.criarFuncionario(dados.nome, dados.numero, dados.email);
        res.status(201).json(banco.buscarFuncionario(id));
    }

    /**
     * Atualizar um funcionário pelo id.
     * Responde 200 com o funcionário atualizado, 404 quando o id não existe e
     * 400 em dados inválidos. Exige coordenador, a checagem fica na rota.
     */
    function atualizar(req, res) {
        const banco = req.banco;
        const id = Number(req.params.id);
        if (!banco.buscarFuncionario(id)) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        const dados = prepararDadosFuncionario(req.body);
        if (dados.erro) return res.status(dados.status).json({ erro: dados.erro });
        banco.atualizarFuncionario(id, dados.nome, dados.numero, dados.email);
        res.json(banco.buscarFuncionario(id));
    }

    /**
     * Apagar um funcionário pelo id.
     * Responde 204 sem corpo em sucesso, 404 quando o id não existe e 409 quando
     * o funcionário é um coordenador, porque a conta dele não se apaga por aqui.
     * Exige coordenador, a checagem fica na rota.
     */
    function apagar(req, res) {
        const resultado = req.banco.apagarFuncionario(Number(req.params.id));
        if (resultado.motivo === 'coordenador') {
            return res.status(409).json({ erro: 'Coordenador não pode ser apagado como funcionário' });
        }
        if (!resultado.apagou) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        res.status(204).end();
    }

    return { listar, criar, atualizar, apagar };
}
