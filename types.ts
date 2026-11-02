export type Papel = 'coordenador' | 'funcionario';

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

export type StatusCoordenador = {
    cadastrado: boolean;
};

export type CoordenadorCriar = {
    usuario: string;
    senha: string;
    nome?: string;
    email: string;
    numero: string;
};

export type Coordenador = {
    id: number;
    usuario: string;
    nome: string;
    numero: string;
    email: string;
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