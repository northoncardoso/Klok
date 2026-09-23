import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';

import estilos from './estilos';

type InputSenhaProps = {
    placeholder?: string;
    value: string;
    onChangeText: (texto: string) => void;
    style?: ViewStyle | ViewStyle[];
};

const COR_ICONE = 'gray';

function OlhoAberto() {
    return (
        <View style={estilosOlho.olho}>
            <View style={estilosOlho.pupila} />
        </View>
    );
}

function OlhoFechado() {
    return (
        <View style={estilosOlho.olho}>
            <View style={estilosOlho.pupila} />
            <View style={estilosOlho.traco} />
        </View>
    );
}

export default function InputSenha({ placeholder, value, onChangeText, style }: InputSenhaProps) {
    const [visivel, setVisivel] = useState(false);

    return (
        <View style={[estilos.campoSenhaGrupo, style]}>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor="gray"
                secureTextEntry={!visivel}
                autoCapitalize="none"
                autoCorrect={false}
                style={estilos.campoSenhaInput}
            />
            <TouchableOpacity
                onPress={() => setVisivel(!visivel)}
                style={estilos.campoSenhaBotao}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={visivel ? 'Ocultar senha' : 'Mostrar senha'}
            >
                {visivel ? <OlhoFechado /> : <OlhoAberto />}
            </TouchableOpacity>
        </View>
    );
}

const estilosOlho = StyleSheet.create({
    olho: {
        width: 22,
        height: 14,
        borderWidth: 1.6,
        borderColor: COR_ICONE,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    pupila: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: COR_ICONE,
    },
    traco: {
        position: 'absolute',
        width: 32,
        height: 1.6,
        backgroundColor: COR_ICONE,
        transform: [{ rotate: '-45deg' }],
    },
});