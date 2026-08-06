import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    Animated,
    Dimensions
} from 'react-native';

import estilos from './estilos';
import HomeScreen from './screens/HomeScreen';
import FuncionariosScreen from './screens/FuncionariosScreen';
import PontoScreen from './screens/PontoScreen';

type Tela = "Home" | "Funcionarios" | "Bater o ponto";

const LARGURA_MENU = Dimensions.get('window').width * 0.7;

export default function App() {
    const [telaAtual, setTelaAtual] = useState<Tela>("Home");
    const [menuVisivel, setMenuVisivel] = useState(false);
    const [tipoUsuario, setTipoUsuario] = useState<string | null>(null);

    const posicaoMenu = useRef(new Animated.Value(-LARGURA_MENU)).current;
    const opacidadeOverlay = useRef(new Animated.Value(0)).current;

    const [modalSairVisivel, setModalSairVisivel] = useState(false);

    const abrirMenu = () => {
        setMenuVisivel(true);
        Animated.parallel([
            Animated.timing(posicaoMenu, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(opacidadeOverlay, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const confirmarSaida = () => {
        setModalSairVisivel(false);
        setTipoUsuario(null);
        setTelaAtual("Home");
        fecharMenu();
    };
    const fecharMenu = () => {
        Animated.parallel([
            Animated.timing(posicaoMenu, {
                toValue: -LARGURA_MENU,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(opacidadeOverlay, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => setMenuVisivel(false));
    };

    const irPara = (tela: Tela) => {
        setTelaAtual(tela);
        fecharMenu();
    };

    const renderizarTela = () => {
        switch (telaAtual) {
            case "Home":
                return (
                    <HomeScreen
                        aoEntrar={(tipo) => {
                            setTipoUsuario(tipo);
                            setTelaAtual("Bater o ponto");
                        }}
                    />
                );
            case "Funcionarios":
                return tipoUsuario ==="mestre" ?<FuncionariosScreen /> : null;
            case "Bater o ponto":
                return <PontoScreen />;
            default:
                return null;
        }
    };

    return (
        <View style={{ flex: 1 }}>

            {/* Barra superior */}
            <View style={estilos.estilosMenuBarraSuperior}>
                <TouchableOpacity onPress={abrirMenu} hitSlop={{ top: 10, bottom: 30, left: 10, right: 10 }}>
                    <Text style={estilos.estilosMenuIconeMenu}>☰</Text>
                </TouchableOpacity>
                <Text style={estilos.estilosMenuTituloBarra}>Menu</Text>
            </View>

            {/* Conteúdo da tela atual */}
            <View style={{ flex: 1}}>
                {renderizarTela()}
            </View>

            {/* Menu lateral animado */}
            {menuVisivel && (
                <View style={estilos.estilosMenuOverlayContainer}>
                    <Animated.View
                        style={[
                            estilos.estilosMenuOverlayFundo,
                            { opacity: opacidadeOverlay }
                        ]}
                    >
                        <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={fecharMenu}
                            activeOpacity={1}
                        />
                    </Animated.View>

                    <Animated.View
                        style={[
                            estilos.estilosMenuLateral,
                            { transform: [{ translateX: posicaoMenu }] }
                        ]}
                    >
                        <Text style={estilos.estilosMenuTituloMenu}>Menu</Text>

                        <TouchableOpacity
                            style={estilos.estilosMenuItemMenu}
                            onPress={() => irPara("Home")}
                        >
                            <Text style={estilos.estilosMenuTextoItemMenu}>Início</Text>
                        </TouchableOpacity>

                        {tipoUsuario === "mestre" && (
                            <TouchableOpacity
                                style={estilos.estilosMenuItemMenu}
                                onPress={() => irPara("Funcionarios")}
                            >
                                <Text style={estilos.estilosMenuTextoItemMenu}>Funcionários</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={estilos.estilosMenuItemMenu}
                            onPress={() => irPara("Bater o ponto")}
                        >
                            <Text style={estilos.estilosMenuTextoItemMenu}>Bater o ponto</Text>
                        </TouchableOpacity>
                        {tipoUsuario !== null && (
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
                                    <Text style={estilos.estilosModalSairTextoBotaoSair}>
                                        Sim, sair
                                    </Text>
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