import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';

import estilos from '../estilos';
import InputSenha from '../InputSenha';
import { api, salvarSessao, mensagemDeErro } from '../api';
import type { Sessao } from '../types';

type CriarCoordenadorScreenProps = {
    aoEntrar: (dados: Sessao) => void;
};

export default function CriarCoordenadorScreen({ aoEntrar }: CriarCoordenadorScreenProps) {
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    const [email, setEmail] = useState('');
    const [numero, setNumero] = useState('');
    const [salvando, setSalvando] = useState(false);

    const cadastrar = async () => {
        if (!usuario.trim() || !senha || !email.trim() || !numero.trim()) {
            Alert.alert('Atenção', 'Preencha usuário, senha, email e número de celular.');
            return;
        }
        if (!email.trim().includes('@')) {
            Alert.alert('Atenção', 'Informe um email válido.');
            return;
        }
        if (senha.length < 4) {
            Alert.alert('Atenção', 'A senha deve ter ao menos 4 caracteres.');
            return;
        }

        setSalvando(true);
        try {
            const dados = await api.criarPrimeiroCoordenador({
                usuario: usuario.trim(),
                senha,
                email: email.trim(),
                numero: numero.trim(),
            });
            await salvarSessao(dados);
            aoEntrar(dados);
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
            <ScrollView
                contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Text style={estilos.estilosLoginTitulo}>Klok</Text>
                <Text style={estilos.estilosLoginSubtitulo}>Cadastre o usuário coordenador</Text>

                <View style={estilos.estilosCoordenadorAviso}>
                    <Text style={estilos.estilosCoordenadorAvisoTexto}>
                        Antes de usar o app, cadastre o primeiro coordenador. Depois, outros
                        coordenadores podem ser criados dentro do app, na tela de Coordenadores. Guarde
                        bem o usuário e a senha: eles são a sua chave de acesso.
                    </Text>
                </View>

                <TextInput
                    placeholder="Nome de usuário do coordenador"
                    value={usuario}
                    onChangeText={setUsuario}
                    style={estilos.estilosLoginInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="gray"
                />

                <InputSenha
                    placeholder="Senha"
                    value={senha}
                    onChangeText={setSenha}
                    style={{ width: '85%', alignSelf: 'center', marginBottom: 15 }}
                />

                <TextInput
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    style={estilos.estilosLoginInput}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="gray"
                />

                <TextInput
                    placeholder="Número de celular"
                    value={numero}
                    onChangeText={setNumero}
                    style={estilos.estilosLoginInput}
                    keyboardType="phone-pad"
                    placeholderTextColor="gray"
                />

                <TouchableOpacity
                    style={estilos.estilosCoordenadorBotao}
                    onPress={cadastrar}
                    disabled={salvando}
                >
                    <Text style={estilos.estilosLoginTextoBotao}>
                        {salvando ? 'Cadastrando...' : 'Cadastrar coordenador'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
