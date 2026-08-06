const express = require('express');
const app = express();
app.use(express.json());

let funcionarios = [
    { id: 1, nome: "João", numero: "11999998888", email: "joao@email.com" }
];

app.get('/funcionarios', (req, res) => {
    res.json(funcionarios);
});

app.post('/funcionarios', (req, res) => {
    const novoFuncionario = { id: Date.now(), ...req.body };
    funcionarios.push(novoFuncionario);
    res.status(201).json(novoFuncionario);
});

app.listen(3000, '0.0.0.0', () => {
    console.log('Servidor rodando na porta 3000');
});
