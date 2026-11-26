export type Papel = 'coordenador' | 'funcionario';

export type Sessao = {
    token: string;
    tipo: Papel;
    nome: string;
    id: number;
    empresa: string;
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

export type Coordenada = {
    latitude: number;
    longitude: number;
    precisaoMetros: number;
};

export type Local = {
    id: number;
    nome: string;
    latitude: number;
    longitude: number;
    raioMetros: number;
};

export type PedidoLocal = {
    id: number;
    tipo: 'criar' | 'editar' | 'excluir';
    localId: number | null;
    nome: string;
    latitude: number;
    longitude: number;
    raioMetros: number;
    status: 'pendente' | 'aprovado' | 'recusado';
    solicitadoEm: string;
};

export type PedidoLocalCriar = {
    tipo: 'criar' | 'editar' | 'excluir';
    localId?: number | null;
    nome: string;
    latitude: number;
    longitude: number;
    raioMetros: number;
};

export type RegistroUsuario = {
    sucesso: boolean;
    mensagem: string;
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

export type Solicitacao = {
    id: number;
    usuario: string | null;
    nome: string;
    email: string;
    numero: string;
    criadoEm: string;
    status: 'pendente' | 'aprovado' | 'recusado';
};

export type UsuarioInfo = {
    id: number;
    usuario: string;
    tipo: Papel;
    empresa: string;
    funcionarioId: number | null;
    hasSenha: boolean;
    nome: string;
    numero: string;
    email: string;
};