export type Papel = 'mestre' | 'funcionario';

export type Sessao = {
    token: string;
    tipo: Papel;
    nome: string;
    id: number;
};

export type Funcionario = {
    id: number;
    nome: string;
    numero: string;
    email: string;
};

export type FuncionarioCriar = {
    nome: string;
    numero: string;
    email: string;
};

export type Ponto = {
    id: number;
    funcionarioId: number;
    dataHora: string;
    tipo: string;
    funcionarioNome?: string;
};

export type RegistroUsuario = {
    sucesso: boolean;
    mensagem: string;
};

export type UsuarioInfo = {
    id: number;
    usuario: string;
    tipo: Papel;
    funcionarioId: number | null;
    hasSenha: boolean;
    nome: string;
    numero: string;
    email: string;
};