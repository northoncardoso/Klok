import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type {
    Coordenador,
    CoordenadorCriar,
    Funcionario,
    FuncionarioCriar,
    Ponto,
    RegistroUsuario,
    Sessao,
    UsuarioInfo,
} from './types';

const API_URL =
    process.env.EXPO_PUBLIC_API_URL ||
    (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

const TOKEN_KEY = 'klok_token';
const SESSION_KEY = 'klok_session';
const EMPRESA_KEY = 'klok_empresa';

export async function lerEmpresa(): Promise<string> {
    return (await SecureStore.getItemAsync(EMPRESA_KEY)) || '';
}

export async function salvarEmpresa(codigo: string): Promise<void> {
    const limpo = codigo.trim().toUpperCase();
    if (limpo) await SecureStore.setItemAsync(EMPRESA_KEY, limpo);
}

export async function salvarSessao(dados: Sessao): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, dados.token);
    await salvarEmpresa(dados.empresa);
    await SecureStore.setItemAsync(
        SESSION_KEY,
        JSON.stringify({
            tipo: dados.tipo,
            nome: dados.nome,
            id: dados.id,
            empresa: dados.empresa,
        })
    );
}

export async function lerSessao(): Promise<Sessao | null> {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return null;
    const session = await SecureStore.getItemAsync(SESSION_KEY);
    let dados = null;
    try {
        dados = JSON.parse(session || 'null');
    } catch {
        dados = null;
    }
    if (!dados || typeof dados !== 'object') return null;

    // Sessão gravada antes do banco por empresa não tem empresa e não pode
    // escolher o banco certo: é melhor pedir login de novo.
    const empresa = typeof dados.empresa === 'string' ? dados.empresa.trim().toUpperCase() : '';
    const tipo = dados.tipo === 'mestre' ? 'coordenador' : dados.tipo;
    if (!empresa || (tipo !== 'coordenador' && tipo !== 'funcionario')) return null;

    return { token, tipo, nome: dados.nome, id: dados.id, empresa };
}

export async function limparSessao(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function mensagemDeErro(e: unknown): string {
    if (e instanceof Error && e.message) return e.message;
    return 'Erro inesperado. Tente novamente.';
}

async function requisicao<T>(caminho: string, metodo = 'GET', corpo: unknown = null, token?: string): Promise<T> {
    const t = token || (await SecureStore.getItemAsync(TOKEN_KEY));
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`${API_URL}${caminho}`, {
        method: metodo,
        headers,
        body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const texto = await res.text();
    const dados: unknown = texto ? JSON.parse(texto) : null;
    if (!res.ok) {
        const erro = (dados as { erro?: string } | null)?.erro;
        throw new Error(erro || `Erro ${res.status}`);
    }
    return dados as T;
}

export const api = {
    listarCoordenadores: (token: string): Promise<Coordenador[]> =>
        requisicao<Coordenador[]>('/api/coordenadores', 'GET', null, token),
    criarCoordenador: (dados: CoordenadorCriar, token: string): Promise<Coordenador> =>
        requisicao<Coordenador>('/api/coordenadores', 'POST', dados, token),
    login: (empresa: string, usuario: string, senha: string): Promise<Sessao> =>
        requisicao<Sessao>('/api/auth/login', 'POST', { empresa, usuario, senha }),
    registrar: (empresa: string, usuario: string, senha: string, nome: string): Promise<RegistroUsuario> =>
        requisicao<RegistroUsuario>('/api/auth/registrar', 'POST', { empresa, usuario, senha, nome }),
    loginGoogle: (empresa: string, idToken: string): Promise<Sessao> =>
        requisicao<Sessao>('/api/auth/google', 'POST', { empresa, idToken }),
    me: (token: string): Promise<UsuarioInfo> =>
        requisicao<UsuarioInfo>('/api/auth/eu', 'GET', null, token),
    atualizarEu: (dados: FuncionarioCriar, token: string): Promise<UsuarioInfo> =>
        requisicao<UsuarioInfo>('/api/auth/eu', 'PUT', dados, token),
    alterarSenha: (senhaAtual: string, senhaNova: string, token: string): Promise<{ sucesso: boolean; mensagem: string }> =>
        requisicao<{ sucesso: boolean; mensagem: string }>('/api/auth/senha', 'PUT', { senhaAtual, senhaNova }, token),
    esqueciSenha: (empresa: string, email: string): Promise<{ sucesso: boolean; mensagem: string; linkRedefinicao?: string }> =>
        requisicao<{ sucesso: boolean; mensagem: string; linkRedefinicao?: string }>('/api/auth/esqueci-senha', 'POST', { empresa, email }),
    redefinirSenha: (empresa: string, token: string, novaSenha: string): Promise<{ sucesso: boolean; mensagem: string }> =>
        requisicao<{ sucesso: boolean; mensagem: string }>('/api/auth/redefinir-senha', 'POST', { empresa, token, novaSenha }),
    listarFuncionarios: (token: string): Promise<Funcionario[]> =>
        requisicao<Funcionario[]>('/api/funcionarios', 'GET', null, token),
    criarFuncionario: (dados: FuncionarioCriar, token: string): Promise<Funcionario> =>
        requisicao<Funcionario>('/api/funcionarios', 'POST', dados, token),
    atualizarFuncionario: (id: number, dados: FuncionarioCriar, token: string): Promise<Funcionario> =>
        requisicao<Funcionario>(`/api/funcionarios/${id}`, 'PUT', dados, token),
    deletarFuncionario: (id: number, token: string): Promise<null> =>
        requisicao<null>(`/api/funcionarios/${id}`, 'DELETE', null, token),
    baterPonto: (tipo: string, token: string): Promise<Ponto> =>
        requisicao<Ponto>('/api/pontos', 'POST', { tipo }, token),
    meusPontos: (token: string): Promise<Ponto[]> =>
        requisicao<Ponto[]>('/api/pontos/meus', 'GET', null, token),
    todosPontos: (token: string): Promise<Ponto[]> =>
        requisicao<Ponto[]>('/api/pontos', 'GET', null, token),
};