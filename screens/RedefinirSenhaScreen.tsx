import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';
import InputSenha from '../InputSenha';

type RedefinirSenhaScreenProps = {
    token: string;
    aoConcluir: () => void;
};

export default function RedefinirSenhaScreen({ token, aoConcluir }: RedefinirSenhaScreenProps) {
    const [senhaNova, setSenhaNova] = useState('');
    const [confirmar, setConfirmar] = useState('');
    const [salvando, setSalvando] = useState(false);

    const enviar = async () => {
        if (!senhaNova || !confirmar) {
            Alert.alert('Atenção', 'Preencha os dois campos.');
            return;
        }
        if (senhaNova !== confirmar) {
            Alert.alert('Erro', 'As senhas não coincidem.');
            return;
        }
        setSalvando(true);
        try {
            await api.redefinirSenha(token, senhaNova);
            Alert.alert('Sucesso', 'Senha redefinida. Faça login com a nova senha.');
            aoConcluir();
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setSalvando(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={estilos.estilosLoginContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Text style={estilos.estilosLoginTitulo}>Redefinir senha</Text>
            <Text style={estilos.estilosLoginSubtitulo}>
                Confirme que é você e defina uma nova senha.
            </Text>

            <InputSenha
                placeholder="Nova senha"
                value={senhaNova}
                onChangeText={setSenhaNova}
                style={{ width: '85%', alignSelf: 'center', marginBottom: 15 }}
            />
            <InputSenha
                placeholder="Confirmar nova senha"
                value={confirmar}
                onChangeText={setConfirmar}
                style={{ width: '85%', alignSelf: 'center', marginBottom: 15 }}
            />

            <TouchableOpacity
                style={estilos.estilosLoginBotaoEntrar}
                onPress={enviar}
                disabled={salvando}
            >
                <Text style={estilos.estilosPontoTextoBotao}>
                    {salvando ? 'Salvando...' : 'Salvar nova senha'}
                </Text>
            </TouchableOpacity>
        </KeyboardAvoidingView>
    );
}