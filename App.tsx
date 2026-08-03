import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Dimensions
} from 'react-native';

import HomeScreen from './screens/HomeScreen';
import FuncionariosScreen from './screens/FuncionariosScreen';
import PontoScreen from './screens/PontoScreen';

type Tela = "Home" | "Funcionarios" | "Bater o ponto";

const LARGURA_MENU = Dimensions.get('window').width * 0.7;

export default function App() {
    const [telaAtual, setTelaAtual] = useState<Tela>("Home");
    const [menuVisivel, setMenuVisivel] = useState(false);

    const posicaoMenu = useRef(new Animated.Value(-LARGURA_MENU)).current;
    const opacidadeOverlay = useRef(new Animated.Value(0)).current;

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
                return <HomeScreen aoEntrar={() => {}} />;
            case "Funcionarios":
                return <FuncionariosScreen />;
            case "Bater o ponto":
                return <PontoScreen />;
            default:
                return null;
        }
    };

    return (
        <View style={{ flex: 1 }}>

            {/* Barra superior */}
            <View style={estilosMenu.barraSuperior}>
                <TouchableOpacity onPress={abrirMenu} hitSlop={{ top: 10, bottom: 30, left: 10, right: 10 }}>
                    <Text style={estilosMenu.iconeMenu}>☰</Text>
                </TouchableOpacity>
                <Text style={estilosMenu.tituloBarra}>Menu</Text>
            </View>

            {/* Conteúdo da tela atual */}
            <View style={{ flex: 1}}>
                {renderizarTela()}
            </View>

            {/* Menu lateral animado */}
            {menuVisivel && (
                <View style={estilosMenu.overlayContainer}>
                    <Animated.View
                        style={[
                            estilosMenu.overlayFundo,
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
                            estilosMenu.menuLateral,
                            { transform: [{ translateX: posicaoMenu }] }
                        ]}
                    >
                        <Text style={estilosMenu.tituloMenu}>Menu</Text>

                        <TouchableOpacity
                            style={estilosMenu.itemMenu}
                            onPress={() => irPara("Home")}
                        >
                            <Text style={estilosMenu.textoItemMenu}>Início</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={estilosMenu.itemMenu}
                            onPress={() => irPara("Funcionarios")}
                        >
                            <Text style={estilosMenu.textoItemMenu}>Funcionários</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={estilosMenu.itemMenu}
                            onPress={() => irPara("Bater o ponto")}
                        >
                            <Text style={estilosMenu.textoItemMenu}>Bater o ponto</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            )}
        </View>
    );
}

const estilosMenu = StyleSheet.create({
    barraSuperior: {
        height: 60,
        backgroundColor: 'dodgerblue',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingTop: 10,
    },
    iconeMenu: {
        fontSize: 26,
        color: 'white',
        marginRight: 15,
    },
    tituloBarra: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
    },
    overlayContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
    },
    overlayFundo: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    menuLateral: {
        width: LARGURA_MENU,
        backgroundColor: 'white',
        paddingTop: 60,
        paddingHorizontal: 20,
        height: '100%',
    },
    tituloMenu: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    itemMenu: {
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    textoItemMenu: {
        fontSize: 16,
    },
});