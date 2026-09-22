export function criarControladoresFuncionarios({ banco }) {
    function listar(req, res) {
        res.json(banco.listarFuncionarios());
    }

    function criar(req, res) {
        const { nome, numero, email } = req.body;
        if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });
        const id = banco.criarFuncionario(nome.trim(), numero, email);
        res.status(201).json(banco.buscarFuncionario(id));
    }

    function atualizar(req, res) {
        const id = Number(req.params.id);
        if (!banco.buscarFuncionario(id)) {
            return res.status(404).json({ erro: 'Funcionário não encontrado' });
        }
        const { nome, numero, email } = req.body;
        banco.atualizarFuncionario(id, nome?.trim(), numero, email);
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