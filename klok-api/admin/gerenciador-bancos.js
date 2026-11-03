import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { criarBanco } from '../db.js';
import { codigoValido } from './catalogo.js';

const ARQUIVOS_AUXILIARES = ['', '-wal', '-shm'];

export function criarGerenciador({ catalogo, dadosDir }) {
    const abertos = new Map();

    function caminhoDe(codigo) {
        if (!codigoValido(codigo)) return null;
        return join(dadosDir, `${codigo}.db`);
    }

    function apagarArquivos(caminho) {
        if (!caminho) return;
        for (const sufixo of ARQUIVOS_AUXILIARES) rmSync(caminho + sufixo, { force: true });
    }

    function abrir(codigo) {
        if (!codigoValido(codigo)) {
            return { erro: 'Código de empresa inválido', status: 400 };
        }
        const empresa = catalogo.buscarEmpresa(codigo);
        if (!empresa) return { erro: 'Empresa não encontrada', status: 404 };
        if (empresa.desativadaEm) return { erro: 'Empresa desativada', status: 403 };

        // A consulta ao catálogo acontece em toda abertura de propósito: assim
        // desativar uma empresa vale mesmo que a conexão já esteja no cache.
        let banco = abertos.get(codigo);
        if (!banco) {
            banco = criarBanco(caminhoDe(codigo), { empresa: codigo });
            abertos.set(codigo, banco);
        }
        return { banco, empresa };
    }

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

    function listar() {
        return catalogo.listarEmpresas();
    }

    function atualizar(codigo, dados) {
        return catalogo.atualizarEmpresa(codigo, dados);
    }

    function fechar() {
        for (const banco of abertos.values()) banco.db.close();
        abertos.clear();
    }

    return { abrir, criarEmpresa, listar, atualizar, caminhoDe, fechar };
}
