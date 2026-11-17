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
    Solicitacao,
    UsuarioInfo,
} from './types';

const API_URL =
    process.env.EXPO_PUBLIC_API_URL ||
    (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

const TOKEN_KEY = 'klok_token';
const SESSION_KEY = 'klok_session';
const EMPRESA_KEY = 'klok_empresa';

/**
 * Ler do SecureStore o código de empresa gravado em `klok_empresa`.
 *
 * @returns {Promise<string>} Código em caixa alta, ou string vazia quando não há nada gravado.
 */
export async function lerEmpresa(): Promise<string> {
    return (await SecureStore.getItemAsync(EMPRESA_KEY)) || '';
}

/**
 * Gravar em `klok_empresa` o código de empresa normalizado.
 *
 * @param {string} codigo Código informado pelo usuário, que passa por trim e caixa alta.
 * @returns {Promise<void>} Não grava nada quando o código fica vazio depois da limpeza.
 */
export async function salvarEmpresa(codigo: string): Promise<void> {
    const limpo = (codigo || '').trim().toUpperCase();
    if (limpo) await SecureStore.setItemAsync(EMPRESA_KEY, limpo);
}

/**
 * Gravar a sessão no SecureStore: token em `klok_token`, empresa em `klok_empresa` e o resumo em `klok_session`.
 *
 * @param {Sessao} dados Dados devolvidos pelo login.
 * @returns {Promise<void>} Resolve quando as três gravações terminam.
 */
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

/**
 * Reconstruir a sessão a partir do token em `klok_token` e do resumo em `klok_session`.
 *
 * Devolve null quando falta empresa ou quando o papel não é conhecido, o que força
 * um novo login. O papel antigo `mestre` é lido como `coordenador`.
 *
 * @returns {Promise<Sessao | null>} Sessão pronta para uso ou null.
 */
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

/**
 * Apagar `klok_token` e `klok_session` do SecureStore, mantendo o código da empresa.
 *
 * @returns {Promise<void>} Resolve quando as duas remoções terminam.
 */
export async function limparSessao(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(SESSION_KEY);
}

/**
 * Converter um erro capturado em texto exibível na tela.
 *
 * @param {unknown} e Valor lançado, normalmente um Error.
 * @returns {string} Mensagem do Error ou o texto padrão de falha inesperada.
 */
export function mensagemDeErro(e: unknown): string {
    if (e instanceof Error && e.message) return e.message;
    return 'Erro inesperado. Tente novamente.';
}

/**
 * Executar uma chamada HTTP no backend e devolver o corpo já convertido.
 *
 * Quando nenhum token é passado, lê o token de `klok_token` no SecureStore e monta o
 * header Authorization. Não grava nada no SecureStore. Em resposta com status fora da
 * faixa de sucesso, lança um Error com o campo `erro` do backend, que é o que
 * `mensagemDeErro` transforma em texto para a tela.
 *
 * @param {string} caminho Caminho relativo, por exemplo `/api/funcionarios`.
 * @param {string} metodo Método HTTP, GET por padrão.
 * @param {unknown} corpo Corpo convertido em JSON, ou null quando não há corpo.
 * @param {string} token Token opcional para uso fora da sessão gravada.
 * @returns {Promise<T>} Corpo da resposta tipado pelo chamador.
 */
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
    /**
     * Listar os coordenadores da empresa aberta via GET /api/coordenadores.
     *
     * @param {string} token Token do usuário logado.
     * @returns {Promise<Coordenador[]>} Coordenadores cadastrados.
     */
    listarCoordenadores: (token: string): Promise<Coordenador[]> =>
        requisicao<Coordenador[]>('/api/coordenadores', 'GET', null, token),
    /**
     * Criar um coordenador via POST /api/coordenadores.
     *
     * @param {CoordenadorCriar} dados Nome, usuário e senha do novo coordenador.
     * @param {string} token Token do coordenador que está criando.
     * @returns {Promise<Coordenador>} Coordenador gravado no backend.
     */
    criarCoordenador: (dados: CoordenadorCriar, token: string): Promise<Coordenador> =>
        requisicao<Coordenador>('/api/coordenadores', 'POST', dados, token),
    /**
     * Autenticar na empresa via POST /api/auth/login.
     *
     * @param {string} empresa Código da empresa que escolhe o banco certo.
     * @param {string} usuario Usuário informado.
     * @param {string} senha Senha informada.
     * @returns {Promise<Sessao>} Sessão ainda não gravada no SecureStore.
     */
    login: (empresa: string, usuario: string, senha: string): Promise<Sessao> =>
        requisicao<Sessao>('/api/auth/login', 'POST', { empresa, usuario, senha }),
    /**
     * Enviar pedido de autocadastro via POST /api/auth/registrar, sem abrir sessão.
     *
     * @param {string} empresa Código da empresa escolhida.
     * @param {string} usuario Usuário pretendido.
     * @param {string} senha Senha escolhida.
     * @param {string} nome Nome completo informado.
     * @param {string} email Email para o aviso de aprovação.
     * @returns {Promise<RegistroUsuario>} Resposta de pedido pendente.
     */
    registrar: (
        empresa: string,
        usuario: string,
        senha: string,
        nome: string,
        email: string
    ): Promise<RegistroUsuario> =>
        requisicao<RegistroUsuario>('/api/auth/registrar', 'POST', { empresa, usuario, senha, nome, email }),
    /**
     * Entrar com conta Google via POST /api/auth/google.
     *
     * @param {string} empresa Código da empresa escolhida.
     * @param {string} idToken Token de identidade devolvido pelo Google.
     * @returns {Promise<Sessao>} Sessão quando o pedido já foi aprovado.
     */
    loginGoogle: (empresa: string, idToken: string): Promise<Sessao> =>
        requisicao<Sessao>('/api/auth/google', 'POST', { empresa, idToken }),
    /**
     * Buscar os dados do usuário logado via GET /api/auth/eu.
     *
     * @param {string} token Token do usuário logado.
     * @returns {Promise<UsuarioInfo>} Dados atuais da conta.
     */
    me: (token: string): Promise<UsuarioInfo> =>
        requisicao<UsuarioInfo>('/api/auth/eu', 'GET', null, token),
    /**
     * Atualizar os próprios dados via PUT /api/auth/eu.
     *
     * @param {FuncionarioCriar} dados Campos que podem ser alterados pelo próprio usuário.
     * @param {string} token Token do usuário logado.
     * @returns {Promise<UsuarioInfo>} Dados depois da atualização.
     */
    atualizarEu: (dados: FuncionarioCriar, token: string): Promise<UsuarioInfo> =>
        requisicao<UsuarioInfo>('/api/auth/eu', 'PUT', dados, token),
    /**
     * Trocar a própria senha via PUT /api/auth/senha.
     *
     * @param {string} senhaAtual Senha atual para conferência.
     * @param {string} senhaNova Senha que passa a valer.
     * @param {string} token Token do usuário logado.
     * @returns Promise<{ sucesso: boolean; mensagem: string }> Resultado da troca.
     */
    alterarSenha: (senhaAtual: string, senhaNova: string, token: string): Promise<{ sucesso: boolean; mensagem: string }> =>
        requisicao<{ sucesso: boolean; mensagem: string }>('/api/auth/senha', 'PUT', { senhaAtual, senhaNova }, token),
    /**
     * Pedir link de redefinição via POST /api/auth/esqueci-senha.
     *
     * @param {string} empresa Código da empresa do usuário.
     * @param {string} email Email cadastrado.
     * @returns Promise<{ sucesso: boolean; mensagem: string; linkRedefinicao?: string }> Resposta com o link quando existir.
     */
    esqueciSenha: (empresa: string, email: string): Promise<{ sucesso: boolean; mensagem: string; linkRedefinicao?: string }> =>
        requisicao<{ sucesso: boolean; mensagem: string; linkRedefinicao?: string }>('/api/auth/esqueci-senha', 'POST', { empresa, email }),
    /**
     * Gravar a nova senha a partir do link recebido via POST /api/auth/redefinir-senha.
     *
     * @param {string} empresa Código da empresa do link.
     * @param {string} token Token de redefinição vindo da URL.
     * @param {string} novaSenha Senha que passa a valer.
     * @returns Promise<{ sucesso: boolean; mensagem: string }> Resultado da redefinição.
     */
    redefinirSenha: (empresa: string, token: string, novaSenha: string): Promise<{ sucesso: boolean; mensagem: string }> =>
        requisicao<{ sucesso: boolean; mensagem: string }>('/api/auth/redefinir-senha', 'POST', { empresa, token, novaSenha }),
    /**
     * Listar os funcionários da empresa via GET /api/funcionarios.
     *
     * @param {string} token Token do coordenador.
     * @returns {Promise<Funcionario[]>} Funcionários cadastrados.
     */
    listarFuncionarios: (token: string): Promise<Funcionario[]> =>
        requisicao<Funcionario[]>('/api/funcionarios', 'GET', null, token),
    /**
     * Cadastrar funcionário via POST /api/funcionarios.
     *
     * @param {FuncionarioCriar} dados Nome, número, email e credenciais do funcionário.
     * @param {string} token Token do coordenador.
     * @returns {Promise<Funcionario>} Funcionário gravado.
     */
    criarFuncionario: (dados: FuncionarioCriar, token: string): Promise<Funcionario> =>
        requisicao<Funcionario>('/api/funcionarios', 'POST', dados, token),
    /**
     * Atualizar funcionário via PUT /api/funcionarios/{id}.
     *
     * @param {number} id Identificador do funcionário.
     * @param {FuncionarioCriar} dados Campos enviados na atualização.
     * @param {string} token Token do coordenador.
     * @returns {Promise<Funcionario>} Funcionário depois da atualização.
     */
    atualizarFuncionario: (id: number, dados: FuncionarioCriar, token: string): Promise<Funcionario> =>
        requisicao<Funcionario>(`/api/funcionarios/${id}`, 'PUT', dados, token),
    /**
     * Apagar funcionário via DELETE /api/funcionarios/{id}.
     *
     * @param {number} id Identificador do funcionário.
     * @param {string} token Token do coordenador.
     * @returns {Promise<null>} Sem corpo em caso de sucesso.
     */
    deletarFuncionario: (id: number, token: string): Promise<null> =>
        requisicao<null>(`/api/funcionarios/${id}`, 'DELETE', null, token),
    /**
     * Registrar batida de ponto via POST /api/pontos.
     *
     * @param {string} tipo Tipo da batida, entrada ou saída.
     * @param {string} token Token do funcionário logado.
     * @returns {Promise<Ponto>} Ponto criado pelo backend.
     */
    baterPonto: (tipo: string, token: string): Promise<Ponto> =>
        requisicao<Ponto>('/api/pontos', 'POST', { tipo }, token),
    /**
     * Listar os pontos do próprio usuário via GET /api/pontos/meus.
     *
     * @param {string} token Token do usuário logado.
     * @returns {Promise<Ponto[]>} Pontos do usuário.
     */
    meusPontos: (token: string): Promise<Ponto[]> =>
        requisicao<Ponto[]>('/api/pontos/meus', 'GET', null, token),
    /**
     * Listar os pontos de toda a empresa via GET /api/pontos.
     *
     * @param {string} token Token do coordenador.
     * @returns {Promise<Ponto[]>} Pontos de todos os funcionários.
     */
    todosPontos: (token: string): Promise<Ponto[]> =>
        requisicao<Ponto[]>('/api/pontos', 'GET', null, token),
    /**
     * Listar solicitações filtradas por status via GET /api/solicitacoes.
     *
     * @param {string} status Status desejado, convertido para a query string.
     * @param {string} token Token do coordenador.
     * @returns {Promise<Solicitacao[]>} Solicitações que casam com o filtro.
     */
    listarSolicitacoes: (status: string, token: string): Promise<Solicitacao[]> =>
        requisicao<Solicitacao[]>(
            `/api/solicitacoes?status=${encodeURIComponent(status)}`,
            'GET',
            null,
            token
        ),
    /**
     * Contar solicitações pendentes via GET /api/solicitacoes/contagem, usado no menu.
     *
     * @param {string} token Token do coordenador.
     * @returns Promise<{ pendentes: number }> Total de pedidos aguardando decisão.
     */
    contarSolicitacoes: (token: string): Promise<{ pendentes: number }> =>
        requisicao<{ pendentes: number }>('/api/solicitacoes/contagem', 'GET', null, token),
    /**
     * Aprovar solicitação via POST /api/solicitacoes/{id}/aprovar, criando o funcionário.
     *
     * @param {number} id Identificador da solicitação.
     * @param {string} token Token do coordenador.
     * @returns {Promise<Funcionario>} Funcionário criado pela aprovação.
     */
    aprovarSolicitacao: (id: number, token: string): Promise<Funcionario> =>
        requisicao<Funcionario>(`/api/solicitacoes/${id}/aprovar`, 'POST', null, token),
    /**
     * Recusar solicitação via POST /api/solicitacoes/{id}/recusar, mantendo o histórico.
     *
     * @param {number} id Identificador da solicitação.
     * @param {string} token Token do coordenador.
     * @returns Promise<{ sucesso: boolean }> Confirmação da recusa.
     */
    recusarSolicitacao: (id: number, token: string): Promise<{ sucesso: boolean }> =>
        requisicao<{ sucesso: boolean }>(`/api/solicitacoes/${id}/recusar`, 'POST', null, token),
};