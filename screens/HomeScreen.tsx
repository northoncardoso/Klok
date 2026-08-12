import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import estilos from '../estilos';

import {
    criarTabelaUsuarios,
    criarUsuarioMestrePadrao,
    cadastrarUsuario,
    validarUsuario,
    buscarOuCriarUsuarioGoogle
} from '../database';

type HomeScreenProps = {
    aoEntrar: (tipo: string, id: number) => void;
};

type ResultadoLogin = {
    sucesso: boolean;
    erro?: string;
    tipo?: string;
    id?: number;
};

GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB, // Client ID tipo "Web", não o Android
});

export default function HomeScreen({ aoEntrar }: HomeScreenProps) {

    const [usuario, setUsuario] = useState("");
    const [senha, setSenha] = useState("");
    const [modoCadastro, setModoCadastro] = useState(false);

    useEffect(() => {
        criarTabelaUsuarios();
        criarUsuarioMestrePadrao();
    }, []);

    const entrarComGoogle = async () => {
        try {
            await GoogleSignin.hasPlayServices();
            const resposta = await GoogleSignin.signIn();

            const googleId = resposta.data?.user.id;
            const nome = resposta.data?.user.name ?? "Usuário Google";

            if (!googleId) {
                Alert.alert("Erro", "Não foi possível obter os dados do Google.");
                return;
            }

            buscarOuCriarUsuarioGoogle(googleId, nome, (resultado: ResultadoLogin) => {
                if (resultado.sucesso) {
                    aoEntrar(resultado.tipo ?? "funcionario", resultado.id!);
                } else {
                    Alert.alert("Erro", "Não foi possível entrar com Google.");
                }
            });
        } catch (erro: any) {
            if (erro.code === statusCodes.SIGN_IN_CANCELLED) {
                // usuário cancelou, não faz nada
            } else {
                Alert.alert("Erro", "Falha ao entrar com Google.");
            }
        }
    };

    const entrar = () => {
        if (!usuario.trim() || !senha.trim()) {
            Alert.alert("Atenção", "Preencha usuário e senha.");
            return;
        }

        validarUsuario(usuario.trim(), senha, (resultado: ResultadoLogin) => {
            if (resultado.sucesso) {
                aoEntrar(resultado.tipo ?? "funcionario", resultado.id!);
            } else {
                Alert.alert("Erro", resultado.erro);
            }
        });
    };

    const cadastrar = () => {
        if (!usuario.trim() || !senha.trim()) {
            Alert.alert("Atenção", "Preencha usuário e senha.");
            return;
        }

        cadastrarUsuario(usuario.trim(), senha, (resultado: ResultadoLogin) => {
            if (resultado.sucesso) {
                Alert.alert("Sucesso", "Usuário cadastrado! Agora faça login.");
                setModoCadastro(false);
                setSenha("");
            } else {
                Alert.alert("Erro", resultado.erro);
            }
        });
    };

    return (
        <View style={estilos.estilosLoginContainer}>
            <Text style={estilos.estilosLoginTitulo}>MyReactJobs</Text>
            <Text style={estilos.estilosLoginSubtitulo}>
                {modoCadastro ? "Crie sua conta" : "Faça login para continuar"}
            </Text>

            <TextInput
                placeholder="Usuário"
                value={usuario}
                onChangeText={setUsuario}
                style={estilos.estilosLoginInput}
                autoCapitalize="none"
            />

            <TextInput
                placeholder="Senha"
                value={senha}
                onChangeText={setSenha}
                style={estilos.estilosLoginInput}
                secureTextEntry
            />

            {modoCadastro ? (
                <TouchableOpacity style={estilos.estilosLoginBotaoEntrar} onPress={cadastrar}>
                    <Text style={estilos.estilosPontoTextoBotao}>Cadastrar</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity style={estilos.estilosLoginBotaoEntrar} onPress={entrar}>
                    <Text style={estilos.estilosPontoTextoBotao}>Entrar</Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity style={estilos.estilosLoginBotaoGoogle} onPress={entrarComGoogle}>
                <Text style={estilos.estilosPontoTextoBotao}>Entrar com Google</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModoCadastro(!modoCadastro)}>
                <Text style={estilos.estilosLoginLinkAlternar}>
                    {modoCadastro ? "Já tem conta? Fazer login" : "Não tem conta? Cadastre-se"}
                </Text>
            </TouchableOpacity>
        </View>
    );
}