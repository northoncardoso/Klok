import { texto } from '../validacao.js';

/**
 * Criar ou redefinir o admin do catálogo a partir das respostas do formulário.
 *
 * Devolve erro e código de status em vez de lançar exceção, porque o chamador é
 * o script de terminal e o painel, que precisam mostrar a mensagem.
 *
 * @param {object} opcoes Objeto com catalogo aberto e respostas do formulário.
 * @param {boolean} opcoes.redefinir Quando verdadeiro, troca a senha de um admin existente.
 * @returns {object} O admin gravado ou um par de erro e status.
 */
export function criarAdminComRespostas({ catalogo, respostas = {}, redefinir = false } = {}) {
    const usuario = texto(respostas.usuario, 'usuario');
    if (!usuario) return { erro: 'Informe o nome de usuário do admin', status: 400 };

    if (redefinir) {
        const admin = catalogo.buscarAdminPorLogin(usuario);
        if (!admin) return { erro: 'Admin não encontrado para redefinir a senha', status: 404 };
        const atualizado = catalogo.atualizarSenhaAdmin(admin.id, respostas.senha);
        if (atualizado.erro) return atualizado;
        return { criado: false, atualizado: true, admin: atualizado };
    }

    const criado = catalogo.criarAdmin(respostas);
    if (criado.erro) return criado;
    return { criado: true, admin: criado };
}
