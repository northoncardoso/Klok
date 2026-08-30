import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { GoogleSignin, statusCodes, isErrorWithCode } from '@react-native-google-signin/google-signin';
import estilos from '../estilos';
import { api, salvarSessao } from '../api';

type HomeScreenProps = {
    aoEntrar: (dados: { token: string; tipo: string; nome: string; id: number }) => void;
};

GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
    offlineAccess: false,
});

export default function HomeScreen({ aoEntrar }: HomeScreenProps) {
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    const [nome, setNome] = useState('');
    const [modoCadastro, setModoCadastro] = useState(false);
    const [carregando, setCarregando] = useState(false);

    const entrar = async () => {
        if (!usuario.trim() || !senha.trim()) {
            Alert.alert('Atenção', 'Preencha usuário e senha.');
            return;
        }
        setCarregando(true);
        try {
            const dados = await api.login(usuario.trim(), senha);
            await salvarSessao(dados);
            aoEntrar(dados);
        } catch (e: any) {
            Alert.alert('Erro', e.message);
        } finally {
            setCarregando(false);
        }
    };

    const cadastrar = async () => {
        if (!usuario.trim() || !senha.trim()) {
            Alert.alert('Atenção', 'Preencha usuário e senha.');
            return;
        }
        setCarregando(true);
        try {
            await api.registrar(usuario.trim(), senha, nome.trim());
            Alert.alert('Sucesso', 'Usuário cadastrado! Agora faça login.');
            setModoCadastro(false);
            setSenha('');
            setNome('');
        } catch (e: any) {
            Alert.alert('Erro', e.message);
        } finally {
            setCarregando(false);
        }
    };

    const entrarComGoogle = async () => {
        try {
            await GoogleSignin.hasPlayServices();
            const resposta = await GoogleSignin.signIn();
            const idToken = resposta.data?.idToken;

            if (!idToken) {
                Alert.alert('Erro', 'Não foi possível obter o token do Google.');
                return;
            }

            setCarregando(true);
            const dados = await api.loginGoogle(idToken);
            await salvarSessao(dados);
            aoEntrar(dados);
        } catch (e: any) {
            if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
                // usuário cancelou
            } else if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                Alert.alert('Erro', 'Google Play Services não disponível.');
            } else {
                Alert.alert('Erro', 'Falha ao entrar com Google.');
            }
        } finally {
            setCarregando(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={estilos.estilosLoginContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Text style={estilos.estilosLoginTitulo}>Klok</Text>
            <Text style={estilos.estilosLoginSubtitulo}>
                {modoCadastro ? 'Crie sua conta' : 'Faça login para continuar'}
            </Text>

            {modoCadastro && (
                <TextInput
                    placeholder="Nome"
                    value={nome}
                    onChangeText={setNome}
                    style={estilos.estilosLoginInput}
                    placeholderTextColor="gray"
                />
            )}

            <TextInput
                placeholder="Usuário"
                value={usuario}
                onChangeText={setUsuario}
                style={estilos.estilosLoginInput}
                autoCapitalize="none"
                placeholderTextColor="gray"
            />

            <TextInput
                placeholder="Senha"
                value={senha}
                onChangeText={setSenha}
                style={estilos.estilosLoginInput}
                secureTextEntry
                placeholderTextColor="gray"
            />

            {modoCadastro ? (
                <TouchableOpacity
                    style={estilos.estilosLoginBotaoEntrar}
                    onPress={cadastrar}
                    disabled={carregando}
                >
                    <Text style={estilos.estilosPontoTextoBotao}>
                        {carregando ? 'Cadastrando...' : 'Cadastrar'}
                    </Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                    style={estilos.estilosLoginBotaoEntrar}
                    onPress={entrar}
                    disabled={carregando}
                >
                    <Text style={estilos.estilosPontoTextoBotao}>
                        {carregando ? 'Entrando...' : 'Entrar'}
                    </Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity
                style={estilos.estilosLoginBotaoGoogle}
                onPress={entrarComGoogle}
                disabled={carregando}
            >
                <Text style={estilos.estilosPontoTextoBotao}>Entrar com Google</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModoCadastro(!modoCadastro)}>
                <Text style={estilos.estilosLoginLinkAlternar}>
                    {modoCadastro
                        ? 'Já tem conta? Fazer login'
                        : 'Não tem conta? Cadastre-se'}
                </Text>
            </TouchableOpacity>
        </KeyboardAvoidingView>
    );
}
