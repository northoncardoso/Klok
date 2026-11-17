import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { criarBanco } from '../db.js';
import { codigoValido } from './catalogo.js';

const ARQUIVOS_AUXILIARES = ['', '-wal', '-shm'];

/**
 * Montar o gerenciador que resolve um banco por empresa em cima do catálogo,
 * mantendo as conexões abertas em cache.
 * @param {object} deps catalogo, que diz se a empresa existe e está ativa, e dadosDir
 * @returns {object} abrir, criarEmpresa, listar, atualizar, apagar, caminhoDe, fecharBanco e fechar
 */
export function criarGerenciador({ catalogo, dadosDir }) {
    const abertos = new Map();

    /** Resolver o caminho do arquivo do banco da empresa, ou null se o código for inválido. */
    function caminhoDe(codigo) {
        if (!codigoValido(codigo)) return null;
        return join(dadosDir, `${codigo}.db`);
    }

    /** Apagar o arquivo do banco junto dos auxiliares do WAL. */
    function apagarArquivos(caminho) {
        if (!caminho) return;
        for (const sufixo of ARQUIVOS_AUXILIARES) rmSync(caminho + sufixo, { force: true });
    }

    /**
     * Abrir o banco de uma empresa, consultando o catálogo a cada chamada para a
     * desativação valer mesmo com a conexão em cache.
     * @param {string} codigo código da empresa no catálogo
     * @param {object} opcoes permitirDesativada libera empresa desligada, uso do painel de suporte; criarSeFaltar false devolve 404 quando o arquivo não existe
     * @returns {object} banco e empresa, ou objeto com erro e status
     */
    function abrir(codigo, { permitirDesativada = false, criarSeFaltar = true } = {}) {
        if (!codigoValido(codigo)) {
            return { erro: 'Código de empresa inválido', status: 400 };
        }
        const empresa = catalogo.buscarEmpresa(codigo);
        if (!empresa) return { erro: 'Empresa não encontrada', status: 404 };
        if (empresa.desativadaEm && !permitirDesativada) {
            return { erro: 'Empresa desativada', status: 403 };
        }

        // A consulta ao catálogo acontece em toda abertura de propósito: assim
        // desativar uma empresa vale mesmo que a conexão já esteja no cache.
        let banco = abertos.get(codigo);
        if (!banco) {
            if (!criarSeFaltar && !existsSync(caminhoDe(codigo))) {
                return { erro: 'Banco da empresa não encontrado no disco', status: 404 };
            }
            banco = criarBanco(caminhoDe(codigo), { empresa: codigo });
            abertos.set(codigo, banco);
        }
        return { banco, empresa };
    }

    /**
     * Criar a empresa no catálogo e o banco dela já migrado.
     * @param {object} dados campo codigo e nome da empresa
     * @returns {object} empresa criada, ou objeto com erro e status
     */
    function criarEmpresa({ codigo, nome } = {}) {
        if (!codigoValido(codigo)) {
            return {
                erro: 'Código de empresa inválido. Use de 2 a 20 letras maiúsculas ou números, começando por letra',
                status: 400,
            };
        }
        if (catalogo.buscarEmpresa(codigo)) {
            return { erro: 'Já existe uma empresa com este código', status: 409 };
        }

        const caminho = caminhoDe(codigo);
        if (existsSync(caminho)) {
            return {
                erro: 'Já existe um arquivo de banco com este código. Verifique antes de reaproveitar',
                status: 409,
            };
        }

        let banco;
        try {
            banco = criarBanco(caminho, { empresa: codigo });
        } catch (e) {
            apagarArquivos(caminho);
            throw e;
        }
        banco.db.close();

        const criada = catalogo.criarEmpresa({ codigo, nome });
        if (criada.erro) {
            apagarArquivos(caminho);
            return criada;
        }
        return criada;
    }

    /** Listar as empresas do catálogo, ativas e desativadas. */
    function listar() {
        return catalogo.listarEmpresas();
    }

    /** Repassar a atualização de nome e de ativa para o catálogo. */
    function atualizar(codigo, dados) {
        return catalogo.atualizarEmpresa(codigo, dados);
    }

    // Fecha só a conexão em cache de uma empresa. É o que a restauração de
    // backup precisa antes de trocar o arquivo no disco, sem derrubar as outras.
    /** Fechar só a conexão em cache de uma empresa, sem derrubar as outras. */
    function fecharBanco(codigo) {
        const aberto = abertos.get(codigo);
        if (!aberto) return;
        aberto.db.close();
        abertos.delete(codigo);
    }

    /** Apagar a empresa do catálogo, fechar a conexão e remover os arquivos do banco dela. */
    function apagar(codigo) {
        if (!codigoValido(codigo)) {
            return { erro: 'Código de empresa inválido', status: 400 };
        }
        if (!catalogo.buscarEmpresa(codigo)) {
            return { erro: 'Empresa não encontrada', status: 404 };
        }
        fecharBanco(codigo);
        if (!catalogo.apagarEmpresa(codigo)) {
            return { erro: 'Empresa não encontrada', status: 404 };
        }
        apagarArquivos(caminhoDe(codigo));
        return { ok: true };
    }

    // Fecha todas as conexões em cache, usado no encerramento do processo.
    /** Fechar todas as conexões em cache no encerramento do processo. */
    function fechar() {
        for (const banco of abertos.values()) banco.db.close();
        abertos.clear();
    }

    return { abrir, criarEmpresa, listar, atualizar, apagar, caminhoDe, fecharBanco, fechar };
}
