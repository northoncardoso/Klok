import { texto } from '../validacao.js';

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
