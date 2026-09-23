import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';

type FormularioRecuperarSenhaProps = {
    onVoltar: () => void;
    onEnviado?: () => void;
};

export default function FormularioRecuperarSenha({ onVoltar, onEnviado }: FormularioRecuperarSenhaProps) {
    const [email, setEmail] = useState('');
    const [enviando, setEnviando] = useState(false);

    const enviar = async () => {
        if (!email.trim()) {
            Alert.alert('Atenção', 'Informe seu email.');
            return;
        }
        setEnviando(true);
        try {
            await api.esqueciSenha(email.trim());
            Alert.alert(
                'Email enviado',
                'Se este email estiver cadastrado, você receberá um link para redefinir a senha.'
            );
            if (onEnviado) onEnviado();
            else onVoltar();
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setEnviando(false);
        }
    };

    return (
        <View>
            <TextInput
                placeholder="Email cadastrado"
                placeholderTextColor="gray"
                value={email}
                onChangeText={setEmail}
                style={[estilos.usuarioInput, { width: '85%', alignSelf: 'center' }]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
            />
            <TouchableOpacity
                style={[estilos.usuarioBotaoSalvar, { width: '85%', alignSelf: 'center', marginTop: 8 }]}
                onPress={enviar}
                disabled={enviando}
            >
                <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                    {enviando ? 'Enviando...' : 'Enviar link de recuperação'}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onVoltar}>
                <Text style={{ color: 'dodgerblue', textAlign: 'center', marginTop: 16, fontSize: 14 }}>
                    Voltar
                </Text>
            </TouchableOpacity>
        </View>
    );
}