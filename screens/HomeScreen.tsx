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
import InputSenha from '../InputSenha';
import FormularioRecuperarSenha from './FormularioRecuperarSenha';
import { api, lerEmpresa, salvarEmpresa, salvarSessao, mensagemDeErro } from '../api';
import type { Sessao } from '../types';

type HomeScreenProps = {
    aoEntrar: (dados: Sessao) => void;
};

GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
    offlineAccess: false,
});

function codigoDaEmpresa(valor: string): string {
    return valor.trim().toUpperCase();
}

export default function HomeScreen({ aoEntrar }: HomeScreenProps) {
    const [empresa, setEmpresa] = useState('');
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [modoCadastro, setModoCadastro] = useState(false);
    const [modoRecuperar, setModoRecuperar] = useState(false);
    const [carregando, setCarregando] = useState(false);

    useEffect(() => {
        lerEmpresa().then(setEmpresa).catch(() => setEmpresa(''));
    }, []);

    const empresaPreenchida = (): string | null => {
        const codigo = codigoDaEmpresa(empresa);
        if (!codigo) {
            Alert.alert('Atenção', 'Informe o código da empresa.');
            return null;
        }
        return codigo;
    };

    const entrar = async () => {
        if (!usuario.trim() || !senha.trim()) {
            Alert.alert('Atenção', 'Preencha usuário e senha.');
            return;
        }
        const codigo = empresaPreenchida();
        if (!codigo) return;

        setCarregando(true);
        try {
            const dados = await api.login(codigo, usuario.trim(), senha);
            await salvarSessao(dados);
            aoEntrar(dados);
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setCarregando(false);
        }
    };

    const cadastrar = async () => {
        if (!usuario.trim() || !senha.trim()) {
            Alert.alert('Atenção', 'Preencha usuário e senha.');
            return;
        }
        const codigo = empresaPreenchida();
        if (!codigo) return;
        if (!email.trim()) {
            Alert.alert('Atenção', 'Informe seu email para receber o aviso de aprovação.');
            return;
        }

        setCarregando(true);
        try {
            await salvarEmpresa(codigo);
            await api.registrar(codigo, usuario.trim(), senha, nome.trim(), email.trim());
            Alert.alert(
                'Pedido enviado',
                'Seu cadastro foi enviado. Aguarde a aprovação de um coordenador da empresa.'
            );
            setModoCadastro(false);
            setSenha('');
            setNome('');
            setEmail('');
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setCarregando(false);
        }
    };

    const entrarComGoogle = async () => {
        const codigo = empresaPreenchida();
        if (!codigo) return;

        try {
            await GoogleSignin.hasPlayServices();
            const resposta = await GoogleSignin.signIn();
            const idToken = resposta.data?.idToken;

            if (!idToken) {
                Alert.alert('Erro', 'Não foi possível obter o token do Google.');
                return;
            }

            setCarregando(true);
            await salvarEmpresa(codigo);
            const dados = await api.loginGoogle(codigo, idToken);
            await salvarSessao(dados);
            aoEntrar(dados);
        } catch (e) {
            if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
                // usuário cancelou
            } else if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                Alert.alert('Erro', 'Google Play Services não disponível.');
            } else {
                Alert.alert('Erro', mensagemDeErro(e));
            }
        } finally {
            setCarregando(false);
        }
    };

    const abrirRecuperacao = () => {
        const codigo = empresaPreenchida();
        if (!codigo) return;
        salvarEmpresa(codigo).catch(() => {});
        setModoRecuperar(true);
    };

    return (
        <KeyboardAvoidingView
            style={estilos.estilosLoginContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Text style={estilos.estilosLoginTitulo}>Klok</Text>
            <Text style={estilos.estilosLoginSubtitulo}>
                {modoRecuperar
                    ? 'Recuperar senha'
                    : modoCadastro
                        ? 'Crie sua conta'
                        : 'Faça login para continuar'}
            </Text>

            {modoRecuperar && (
                <FormularioRecuperarSenha
                    empresa={codigoDaEmpresa(empresa)}
                    onVoltar={() => setModoRecuperar(false)}
                    onEnviado={() => setModoRecuperar(false)}
                />
            )}

            {!modoRecuperar && (
                <>
                    <TextInput
                        placeholder="Empresa"
                        value={empresa}
                        onChangeText={setEmpresa}
                        style={estilos.estilosLoginInput}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={20}
                        placeholderTextColor="gray"
                    />

                    {modoCadastro && (
                        <TextInput
                            placeholder="Nome"
                            value={nome}
                            onChangeText={setNome}
                            style={estilos.estilosLoginInput}
                            placeholderTextColor="gray"
                        />
                    )}

                    {modoCadastro && (
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
                    )}

                    <TextInput
                        placeholder="Usuário"
                        value={usuario}
                        onChangeText={setUsuario}
                        style={estilos.estilosLoginInput}
                        autoCapitalize="none"
                        placeholderTextColor="gray"
                    />

                    <InputSenha
                        placeholder="Senha"
                        value={senha}
                        onChangeText={setSenha}
                        style={{ width: '85%', alignSelf: 'center', marginBottom: 15 }}
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

                    {!modoCadastro && (
                        <TouchableOpacity onPress={abrirRecuperacao}>
                            <Text style={{ color: 'dodgerblue', marginTop: 12, fontSize: 14 }}>
                                Esqueci minha senha?
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
                </>
            )}
        </KeyboardAvoidingView>
    );
}
