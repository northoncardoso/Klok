import { emailNormalizado, emailValido, semCaractereDeControle, senha as senhaDe, texto } from '../validacao.js';

export const MINIMO_SENHA = 4;

// Validação compartilhada pelo primeiro cadastro (rota pública) e pelo cadastro
// feito por um coordenador já autenticado. Devolve { dados } ou { erro, status }.
export function validarNovoCoordenador(banco, body) {
    const usuario = texto(body?.usuario, 'usuario');
    const senha = senhaDe(body?.senha);
    const nome = texto(body?.nome, 'nome') || usuario;
    const email = emailNormalizado(body?.email);
    const numero = texto(body?.numero, 'numero');

    if (!usuario || !semCaractereDeControle(usuario)) {
        return { erro: 'Informe um nome de usuário válido', status: 400 };
    }
    if (senha.length < MINIMO_SENHA) {
        return { erro: `A senha do coordenador deve ter ao menos ${MINIMO_SENHA} caracteres`, status: 400 };
    }
    if (!emailValido(email)) {
        return { erro: 'Informe um email válido para o coordenador', status: 400 };
    }
    if (!numero || !semCaractereDeControle(numero)) {
        return { erro: 'Informe o número de celular do coordenador', status: 400 };
    }
    if (banco.buscarUsuarioPorLogin(usuario)) {
        return { erro: 'Este nome de usuário já está em uso', status: 409 };
    }
    return { dados: { usuario, senha, nome, email, numero } };
}

export function criarControladoresCoordenadores({ banco }) {
    function listar(req, res) {
        res.json(banco.listarCoordenadores());
    }

    function criar(req, res) {
        const resultado = validarNovoCoordenador(banco, req.body);
        if (resultado.erro) {
            return res.status(resultado.status).json({ erro: resultado.erro });
        }
        const { usuario, senha, nome, email, numero } = resultado.dados;
        const criado = banco.criarCoordenador(usuario, senha, nome, email, numero);
        res.status(201).json({
            id: criado.id,
            usuario: criado.usuario,
            nome: criado.nome,
            email: criado.email,
            numero: criado.numero,
            tipo: criado.tipo,
        });
    }

    return { listar, criar };
}
