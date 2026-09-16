import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type {
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

export async function salvarSessao(dados: Sessao): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, dados.token);
    await SecureStore.setItemAsync(
        SESSION_KEY,
        JSON.stringify({
            tipo: dados.tipo,
            nome: dados.nome,
            id: dados.id,
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
    return { token, ...(dados || {}) };
}

export async function limparSessao(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(SESSION_KEY);
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
    login: (usuario: string, senha: string): Promise<Sessao> =>
        requisicao<Sessao>('/api/auth/login', 'POST', { usuario, senha }),
    registrar: (usuario: string, senha: string, nome: string): Promise<RegistroUsuario> =>
        requisicao<RegistroUsuario>('/api/auth/registrar', 'POST', { usuario, senha, nome }),
    loginGoogle: (idToken: string): Promise<Sessao> =>
        requisicao<Sessao>('/api/auth/google', 'POST', { idToken }),
    me: (token: string): Promise<UsuarioInfo> =>
        requisicao<UsuarioInfo>('/api/auth/eu', 'GET', null, token),
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