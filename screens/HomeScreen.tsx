
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
    return (
        <View style={estilosHome.container}>
            <Text style={estilosHome.titulo}>MyReactJobs</Text>
            <Text style={estilosHome.subtitulo}>
                Sistema de gerenciamento de funcionários
            </Text>
            <Text style={estilosHome.texto}>
                Use o menu no canto superior esquerdo para navegar entre as telas.
            </Text>
        </View>
    );
}

const estilosHome = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    titulo: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    subtitulo: {
        fontSize: 16,
        color: 'gray',
        marginBottom: 20,
        textAlign: 'center',
    },
    texto: {
        fontSize: 14,
        color: 'gray',
        textAlign: 'center',
    },
});