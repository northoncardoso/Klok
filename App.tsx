import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    Animated,
    Dimensions,
    ActivityIndicator,
} from 'react-native';

import estilos from './estilos';
import HomeScreen from './screens/HomeScreen';
import FuncionariosScreen from './screens/FuncionariosScreen';
import PontoScreen from './screens/PontoScreen';
import { lerSessao, limparSessao } from './api';

type Tela = 'Home' | 'Funcionarios' | 'Bater o ponto';

type Sessao = {
    token: string;
    tipo: string;
    nome: string;
    id: number;
};

const LARGURA_MENU = Dimensions.get('window').width * 0.7;

export default function App() {
    const [telaAtual, setTelaAtual] = useState<Tela>('Home');
    const [menuVisivel, setMenuVisivel] = useState(false);
    const [sessao, setSessao] = useState<Sessao | null>(null);
    const [restaurando, setRestaurando] = useState(true);
    const [modalSairVisivel, setModalSairVisivel] = useState(false);

    const posicaoMenu = useRef(new Animated.Value(-LARGURA_MENU)).current;
    const opacidadeOverlay = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        (async () => {
            const s = await lerSessao();
            if (s && s.token) {
                setSessao(s as Sessao);
                setTelaAtual('Bater o ponto');
            }
            setRestaurando(false);
        })();
    }, []);

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

    const renderizarTela = () => {
        if (!sessao) {
            return (
                <HomeScreen
                    aoEntrar={(dados) => {
                        setSessao(dados);
                        setTelaAtual('Bater o ponto');
                    }}
                />
            );
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
            default:
                return null;
        }
    };

    if (restaurando) {
        return (
            <View style={{ flex: 1, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#4285F4" />
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
