import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_URL =
    process.env.EXPO_PUBLIC_API_URL ||
    (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

const TOKEN_KEY = 'klok_token';
const SESSION_KEY = 'klok_session';

export async function salvarSessao(dados) {
    await SecureStore.setItemAsync(TOKEN_KEY, dados.token);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({
        tipo: dados.tipo,
        nome: dados.nome,
        id: dados.id,
    }));
}

export async function lerSessao() {
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

export async function limparSessao() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(SESSION_KEY);
}

async function requisicao(caminho, metodo = 'GET', corpo = null, token = null) {
    const t = token || (await SecureStore.getItemAsync(TOKEN_KEY));
    const headers = { 'Content-Type': 'application/json' };
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`${API_URL}${caminho}`, {
        method: metodo,
        headers,
        body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const texto = await res.text();
    const dados = texto ? JSON.parse(texto) : null;
    if (!res.ok) {
        throw new Error(dados?.erro || `Erro ${res.status}`);
    }
    return dados;
}

export const api = {
    login: (usuario, senha) =>
        requisicao('/api/auth/login', 'POST', { usuario, senha }),
    registrar: (usuario, senha, nome) =>
        requisicao('/api/auth/registrar', 'POST', { usuario, senha, nome }),
    loginGoogle: (idToken) =>
        requisicao('/api/auth/google', 'POST', { idToken }),
    me: (token) => requisicao('/api/auth/eu', 'GET', null, token),
    listarFuncionarios: (token) =>
        requisicao('/api/funcionarios', 'GET', null, token),
    criarFuncionario: (dados, token) =>
        requisicao('/api/funcionarios', 'POST', dados, token),
    atualizarFuncionario: (id, dados, token) =>
        requisicao(`/api/funcionarios/${id}`, 'PUT', dados, token),
    deletarFuncionario: (id, token) =>
        requisicao(`/api/funcionarios/${id}`, 'DELETE', null, token),
    baterPonto: (tipo, token) =>
        requisicao('/api/pontos', 'POST', { tipo }, token),
    meusPontos: (token) => requisicao('/api/pontos/meus', 'GET', null, token),
    todosPontos: (token) => requisicao('/api/pontos', 'GET', null, token),
};
