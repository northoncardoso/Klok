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
import CriarMestreScreen from './screens/CriarMestreScreen';
import FuncionariosScreen from './screens/FuncionariosScreen';
import PontoScreen from './screens/PontoScreen';
import RedefinirSenhaScreen from './screens/RedefinirSenhaScreen';
import UsuarioScreen from './screens/UsuarioScreen';
import { api, lerSessao, limparSessao, mensagemDeErro, salvarSessao } from './api';
import type { Sessao } from './types';

type Tela = 'Home' | 'Funcionarios' | 'Bater o ponto' | 'Usuario';
type Portao =
    | { estado: 'carregando' }
    | { estado: 'mestre-pendente' }
    | { estado: 'pronto' }
    | { estado: 'erro'; mensagem: string };

const LARGURA_MENU = Dimensions.get('window').width * 0.7;

function tokenDeLinkDeRedefinicao(url: string): string | null {
    try {
        const inicio = url.indexOf('token=');
        if (inicio === -1) return null;
        const token = url.slice(inicio + 6);
        return token || null;
    } catch {
        return null;
    }
}

export default function App() {
    const [telaAtual, setTelaAtual] = useState<Tela>('Home');
    const [menuVisivel, setMenuVisivel] = useState(false);
    const [sessao, setSessao] = useState<Sessao | null>(null);
    const [modalSairVisivel, setModalSairVisivel] = useState(false);
    const [tokenRedefinir, setTokenRedefinir] = useState<string | null>(null);
    const [portao, setPortao] = useState<Portao>({ estado: 'carregando' });

    const posicaoMenu = useRef(new Animated.Value(-LARGURA_MENU)).current;
    const opacidadeOverlay = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const aplicarLink = (url?: string | null) => {
            if (!url) return;
            const token = tokenDeLinkDeRedefinicao(url);
            if (token) setTokenRedefinir(token);
        };
        Linking.getInitialURL().then(aplicarLink);
        const sub = Linking.addEventListener('url', ({ url }) => aplicarLink(url));
        return () => sub.remove();
    }, []);

    useEffect(() => {
        (async () => {
            const s = await lerSessao();
            if (s && s.token) {
                setSessao(s);
                setTelaAtual('Bater o ponto');
            }

            if (s && s.token && s.tipo === 'mestre') {
                setPortao({ estado: 'pronto' });
                return;
            }

            try {
                const status = await api.statusMestre();
                if (!status.cadastrado) {
                    setPortao({ estado: 'mestre-pendente' });
                    return;
                }
                setPortao({ estado: 'pronto' });
            } catch (e) {
                setPortao({ estado: 'erro', mensagem: mensagemDeErro(e) });
            }
        })();
    }, []);

    const tentarNovamente = async () => {
        setPortao({ estado: 'carregando' });
        try {
            const status = await api.statusMestre();
            setPortao(
                status.cadastrado ? { estado: 'pronto' } : { estado: 'mestre-pendente' }
            );
        } catch (e) {
            setPortao({ estado: 'erro', mensagem: mensagemDeErro(e) });
        }
    };

    const abrirMenu = () => {
        setMenuVisivel(true);
        Animated.parallel([
            Animated.timing(posicaoMenu, { toValue: 0, duration: 250, useNativeDriver: true }),
            Animated.timing(opacidadeOverlay, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
    };

    const fecharMenu = () => {
        Animated.parallel([
            Animated.timing(posicaoMenu, { toValue: -LARGURA_MENU, duration: 200, useNativeDriver: true }),
            Animated.timing(opacidadeOverlay, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => setMenuVisivel(false));
    };

    const confirmarSaida = async () => {
        setModalSairVisivel(false);
        await limparSessao();
        setSessao(null);
        setTelaAtual('Home');
        fecharMenu();
    };

    const irPara = (tela: Tela) => {
        setTelaAtual(tela);
        fecharMenu();
    };

    const atualizarNomeSessao = (nome: string) => {
        setSessao((atual) => {
            if (!atual) return atual;
            const nova = { ...atual, nome };
            salvarSessao(nova);
            return nova;
        });
    };

    const aoConcluirRedefinicao = async () => {
        setTokenRedefinir(null);
        await limparSessao();
        setSessao(null);
        setTelaAtual('Home');
    };

    const entrarComSessao = (dados: Sessao) => {
        setSessao(dados);
        setTelaAtual('Bater o ponto');
        if (dados.tipo === 'mestre') setPortao({ estado: 'pronto' });
    };

    const renderizarTela = () => {
        if (tokenRedefinir) {
            return (
                <RedefinirSenhaScreen
                    token={tokenRedefinir}
                    aoConcluir={aoConcluirRedefinicao}
                />
            );
        }

        if (portao.estado === 'mestre-pendente' && !sessao) {
            return <CriarMestreScreen aoEntrar={entrarComSessao} />;
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
                return sessao.tipo === 'mestre' ? (
                    <FuncionariosScreen token={sessao.token} />
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

                        {sessao?.tipo === 'mestre' && (
                            <TouchableOpacity style={estilos.estilosMenuItemMenu} onPress={() => irPara('Funcionarios')}>
                                <Text style={estilos.estilosMenuTextoItemMenu}>Funcionários</Text>
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
