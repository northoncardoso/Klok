import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    Animated,
    Dimensions,
    ActivityIndicator,
    Linking,
} from 'react-native';

import estilos from './estilos';
import HomeScreen from './screens/HomeScreen';
import FuncionariosScreen from './screens/FuncionariosScreen';
import CoordenadoresScreen from './screens/CoordenadoresScreen';
import SolicitacoesScreen from './screens/SolicitacoesScreen';
import PontoScreen from './screens/PontoScreen';
import RedefinirSenhaScreen from './screens/RedefinirSenhaScreen';
import UsuarioScreen from './screens/UsuarioScreen';
import { api, lerSessao, limparSessao, mensagemDeErro, salvarEmpresa, salvarSessao } from './api';
import type { Sessao } from './types';

type Tela = 'Home' | 'Funcionarios' | 'Coordenadores' | 'Solicitacoes' | 'Bater o ponto' | 'Usuario';
type Portao =
    | { estado: 'carregando' }
    | { estado: 'pronto' }
    | { estado: 'erro'; mensagem: string };
type Redefinicao = { empresa: string; token: string };

const LARGURA_MENU = Dimensions.get('window').width * 0.7;

/**
 * Extrair empresa e token de redefinição da URL que abriu o app.
 *
 * @param {string} url URL recebida pelo deep link.
 * @returns {Redefinicao | null} Dados do link ou null quando falta o token.
 */
function parametrosDoLink(url: string): Redefinicao | null {
    const query = url.split('?')[1];
    if (!query) return null;

    const valores: Record<string, string> = {};
    for (const par of query.split('&')) {
        if (!par) continue;
        const [chave, valor = ''] = par.split('=');
        try {
            valores[decodeURIComponent(chave)] = decodeURIComponent(valor);
        } catch {
            valores[chave] = valor;
        }
    }

    if (!valores.token) return null;
    return { empresa: (valores.empresa || '').trim().toUpperCase(), token: valores.token };
}

/**
 * Resolver a raiz do app: portão de carga da sessão, login, menu lateral e troca de telas.
 *
 * Enquanto a sessão gravada é lida, mostra o indicador de carga ou a tela de erro com
 * botão de tentar novamente. Sem sessão, entrega a HomeScreen; com sessão, libera o menu
 * lateral e as telas de ponto, funcionários, coordenadores, solicitações e usuário. O menu
 * de coordenador mostra o contador de pedidos pendentes, e o estado da sessão é mantido
 * aqui e regravado no SecureStore quando o nome muda.
 *
 * @returns {JSX.Element} Árvore da tela atual ou do portão.
 */
export default function App() {
    const [telaAtual, setTelaAtual] = useState<Tela>('Home');
    const [menuVisivel, setMenuVisivel] = useState(false);
    const [sessao, setSessao] = useState<Sessao | null>(null);
    const [modalSairVisivel, setModalSairVisivel] = useState(false);
    const [redefinicao, setRedefinicao] = useState<Redefinicao | null>(null);
    const [portao, setPortao] = useState<Portao>({ estado: 'carregando' });
    const [pendentes, setPendentes] = useState(0);

    const posicaoMenu = useRef(new Animated.Value(-LARGURA_MENU)).current;
    const opacidadeOverlay = useRef(new Animated.Value(0)).current;

    /** Ler a sessão gravada e abrir direto no ponto, ou marcar o portão como pronto ou com erro. */
    const carregarSessao = async () => {
        setPortao({ estado: 'carregando' });
        try {
            const s = await lerSessao();
            if (s) {
                setSessao(s);
                setTelaAtual('Bater o ponto');
            }
            setPortao({ estado: 'pronto' });
        } catch (e) {
            setPortao({ estado: 'erro', mensagem: mensagemDeErro(e) });
        }
    };

    useEffect(() => {
        /** Aplicar a URL recebida: gravar a empresa e abrir a tela de redefinição. */
        const aplicarLink = (url?: string | null) => {
            if (!url) return;
            const dados = parametrosDoLink(url);
            if (!dados) return;
            if (dados.empresa) salvarEmpresa(dados.empresa);
            setRedefinicao(dados);
        };
        Linking.getInitialURL().then(aplicarLink);
        const sub = Linking.addEventListener('url', ({ url }) => aplicarLink(url));
        return () => sub.remove();
    }, []);

    useEffect(() => {
        carregarSessao();
    }, []);

    /** Buscar o total de solicitações pendentes, zerando para funcionário ou em caso de falha. */
    const atualizarContagemSolicitacoes = async () => {
        if (!sessao || sessao.tipo !== 'coordenador') {
            setPendentes(0);
            return;
        }
        try {
            setPendentes((await api.contarSolicitacoes(sessao.token)).pendentes);
        } catch {
            setPendentes(0);
        }
    };

    useEffect(() => {
        void atualizarContagemSolicitacoes();
    }, [sessao?.token, sessao?.tipo]);

    /** Recarregar a sessão depois da falha no portão. */
    const tentarNovamente = () => {
        carregarSessao();
    };

    /** Atualizar a contagem e animar a entrada do menu lateral com o fundo escurecido. */
    const abrirMenu = () => {
        void atualizarContagemSolicitacoes();
        setMenuVisivel(true);
        Animated.parallel([
            Animated.timing(posicaoMenu, { toValue: 0, duration: 250, useNativeDriver: true }),
            Animated.timing(opacidadeOverlay, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
    };

    /** Animar a saída do menu e só desmontar quando a animação termina. */
    const fecharMenu = () => {
        Animated.parallel([
            Animated.timing(posicaoMenu, { toValue: -LARGURA_MENU, duration: 200, useNativeDriver: true }),
            Animated.timing(opacidadeOverlay, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => setMenuVisivel(false));
    };

    /** Apagar a sessão do SecureStore e voltar para a HomeScreen deslogada. */
    const confirmarSaida = async () => {
        setModalSairVisivel(false);
        await limparSessao();
        setSessao(null);
        setTelaAtual('Home');
        fecharMenu();
    };

    /** Trocar a tela atual, recarregar o contador ao entrar em Solicitações e fechar o menu. */
    const irPara = (tela: Tela) => {
        if (tela === 'Solicitacoes') void atualizarContagemSolicitacoes();
        setTelaAtual(tela);
        fecharMenu();
    };

    /** Trocar o nome na sessão em memória e regravar a sessão no SecureStore. */
    const atualizarNomeSessao = (nome: string) => {
        setSessao((atual) => {
            if (!atual) return atual;
            const nova = { ...atual, nome };
            salvarSessao(nova);
            return nova;
        });
    };

    /** Limpar o link de redefinição e a sessão, voltando para a HomeScreen. */
    const aoConcluirRedefinicao = async () => {
        setRedefinicao(null);
        await limparSessao();
        setSessao(null);
        setTelaAtual('Home');
    };

    /** Guardar a sessão devolvida pelo login e abrir a tela de ponto. */
    const entrarComSessao = (dados: Sessao) => {
        setSessao(dados);
        setTelaAtual('Bater o ponto');
    };

    /** Escolher o que renderizar: redefinição de senha, login sem sessão ou a tela do menu. */
    const renderizarTela = () => {
        if (redefinicao) {
            return (
                <RedefinirSenhaScreen
                    empresa={redefinicao.empresa}
                    token={redefinicao.token}
                    aoConcluir={aoConcluirRedefinicao}
                />
            );
        }

        if (!sessao) {
            return <HomeScreen aoEntrar={entrarComSessao} />;
        }

        switch (telaAtual) {
            case 'Home':
                return (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold' }}>
                            Bem-vindo(a), {sessao.nome}
                        </Text>
                        <Text style={{ color: 'gray', marginTop: 8 }}>
                            Use o menu para navegar.
                        </Text>
                    </View>
                );
            case 'Funcionarios':
                return sessao.tipo === 'coordenador' ? (
                    <FuncionariosScreen token={sessao.token} />
                ) : null;
            case 'Coordenadores':
                return sessao.tipo === 'coordenador' ? (
                    <CoordenadoresScreen token={sessao.token} />
                ) : null;
            case 'Solicitacoes':
                return sessao.tipo === 'coordenador' ? (
                    <SolicitacoesScreen
                        token={sessao.token}
                        aoAtualizarContagem={atualizarContagemSolicitacoes}
                    />
                ) : null;
            case 'Bater o ponto':
                return <PontoScreen token={sessao.token} />;
            case 'Usuario':
                return <UsuarioScreen token={sessao.token} aoAtualizarNome={atualizarNomeSessao} />;
            default:
                return null;
        }
    };

    if (portao.estado === 'carregando') {
        return (
            <View style={{ flex: 1, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#4285F4" />
            </View>
        );
    }

    if (portao.estado === 'erro') {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: '#f0f0f0',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                }}
            >
                <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>
                    Não foi possível falar com o servidor
                </Text>
                <Text style={{ color: 'gray', textAlign: 'center', marginBottom: 20 }}>
                    {portao.mensagem}
                </Text>
                <TouchableOpacity
                    style={{ backgroundColor: 'dodgerblue', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8 }}
                    onPress={tentarNovamente}
                >
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>Tentar novamente</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#f0f0f0' }}>
            <View style={estilos.estilosMenuBarraSuperior}>
                <TouchableOpacity onPress={abrirMenu} hitSlop={{ top: 10, bottom: 30, left: 10, right: 10 }}>
                    <Text style={estilos.estilosMenuIconeMenu}>☰</Text>
                </TouchableOpacity>
                <Text style={estilos.estilosMenuTituloBarra}>Klok</Text>
            </View>

            <View style={{ flex: 1, backgroundColor: '#f0f0f0' }}>{renderizarTela()}</View>

            {menuVisivel && (
                <View style={estilos.estilosMenuOverlayContainer}>
                    <Animated.View style={[estilos.estilosMenuOverlayFundo, { opacity: opacidadeOverlay }]}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={fecharMenu} activeOpacity={1} />
                    </Animated.View>

                    <Animated.View
                        style={[estilos.estilosMenuLateral, { transform: [{ translateX: posicaoMenu }] }]}
                    >
                        <Text style={estilos.estilosMenuTituloMenu}>Menu</Text>

                        {sessao && (
                            <Text style={{ color: '#555', marginBottom: 10, paddingHorizontal: 20 }}>
                                {sessao.nome}
                            </Text>
                        )}

                        <TouchableOpacity style={estilos.estilosMenuItemMenu} onPress={() => irPara('Home')}>
                            <Text style={estilos.estilosMenuTextoItemMenu}>Início</Text>
                        </TouchableOpacity>

                        {sessao?.tipo === 'coordenador' && (
                            <TouchableOpacity style={estilos.estilosMenuItemMenu} onPress={() => irPara('Funcionarios')}>
                                <Text style={estilos.estilosMenuTextoItemMenu}>Funcionários</Text>
                            </TouchableOpacity>
                        )}

                        {sessao?.tipo === 'coordenador' && (
                            <TouchableOpacity style={estilos.estilosMenuItemMenu} onPress={() => irPara('Coordenadores')}>
                                <Text style={estilos.estilosMenuTextoItemMenu}>Coordenadores</Text>
                            </TouchableOpacity>
                        )}

                        {sessao?.tipo === 'coordenador' && (
                            <TouchableOpacity style={estilos.estilosMenuItemMenu} onPress={() => irPara('Solicitacoes')}>
                                <Text style={estilos.estilosMenuTextoItemMenu}>
                                    {pendentes > 0 ? `Solicitações (${pendentes})` : 'Solicitações'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {sessao && (
                            <TouchableOpacity style={estilos.estilosMenuItemMenu} onPress={() => irPara('Bater o ponto')}>
                                <Text style={estilos.estilosMenuTextoItemMenu}>Bater o ponto</Text>
                            </TouchableOpacity>
                        )}

                        {sessao && (
                            <TouchableOpacity style={estilos.estilosMenuItemMenu} onPress={() => irPara('Usuario')}>
                                <Text style={estilos.estilosMenuTextoItemMenu}>Usuário</Text>
                            </TouchableOpacity>
                        )}

                        {sessao && (
                            <TouchableOpacity
                                style={estilos.estilosMenuItemMenu}
                                onPress={() => setModalSairVisivel(true)}
                            >
                                <Text style={estilos.estilosMenuTextoItemMenu}>Sair</Text>
                            </TouchableOpacity>
                        )}
                    </Animated.View>
                </View>
            )}

            <Modal visible={modalSairVisivel} transparent={true} animationType="fade">
                <View style={estilos.estilosModalSairOverlay}>
                    <View style={estilos.estilosModalSairCaixa}>
                        <Text style={estilos.estilosModalSairTextoPergunta}>
                            Tem certeza que deseja sair?
                        </Text>

                        <TouchableOpacity style={estilos.botaoModalDeletar} onPress={confirmarSaida}>
                            <Text style={estilos.estilosModalSairTextoBotaoSair}>Sim, sair</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={estilos.botaoModalFechar} onPress={() => setModalSairVisivel(false)}>
                            <Text style={estilos.estilosModalSairTextoBotaoCancelar}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
