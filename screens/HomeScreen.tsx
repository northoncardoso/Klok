import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import estilos from '../estilos';
import { discovery, clientId, redirectUri } from '../keycloak';

import {
    criarTabelaUsuarios,
    criarUsuarioMestrePadrao,
    cadastrarUsuario,
    validarUsuario,
    buscarOuCriarUsuarioKeycloak
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

export default function HomeScreen({ aoEntrar }: HomeScreenProps) {

    const [usuario, setUsuario] = useState("");
    const [senha, setSenha] = useState("");
    const [modoCadastro, setModoCadastro] = useState(false);

    useEffect(() => {
        criarTabelaUsuarios();
        criarUsuarioMestrePadrao();
    }, []);

    const [request, response, promptAsync] = AuthSession.useAuthRequest(
        {
            clientId,
            redirectUri,
            scopes: ['openid', 'profile', 'email'],
            usePKCE: true, // obrigatório: o client no Keycloak é público (sem client secret)
        },
        discovery
    );

    useEffect(() => {
        if (response?.type === 'success') {
            const { code } = response.params;
            trocarCodePorToken(code);
        } else if (response?.type === 'error') {
            Alert.alert("Erro", "Falha ao autenticar com Keycloak.");
        }
    }, [response]);

    const trocarCodePorToken = async (code: string) => {
        try {
            const tokenResult = await AuthSession.exchangeCodeAsync(
                {
                    clientId,
                    code,
                    redirectUri,
                    extraParams: {
                        code_verifier: request?.codeVerifier ?? '',
                    },
                },
                discovery
            );

            const userInfoResponse = await fetch(discovery.userInfoEndpoint, {
                headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
            });
            const userInfo = await userInfoResponse.json();

            const keycloakId = userInfo.sub;
            const nome = userInfo.name ?? userInfo.preferred_username ?? "Usuário Keycloak";

            if (!keycloakId) {
                Alert.alert("Erro", "Não foi possível obter os dados do Keycloak.");
                return;
            }

            buscarOuCriarUsuarioKeycloak(keycloakId, nome, (resultado: ResultadoLogin) => {
                if (resultado.sucesso) {
                    aoEntrar(resultado.tipo ?? "funcionario", resultado.id!);
                } else {
                    Alert.alert("Erro", "Não foi possível entrar com Keycloak.");
                }
            });
        } catch (erro: any) {
            console.log("Erro ao trocar code por token:", erro.message ?? erro);
            Alert.alert("Erro", "Falha na autenticação.");
        }
    };

    const entrarComKeycloak = () => {
        promptAsync();
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
                placeholderTextColor = "gray"
            />

            <TextInput
                placeholder="Senha"
                value={senha}
                onChangeText={setSenha}
                style={estilos.estilosLoginInput}
                secureTextEntry
                placeholderTextColor = "gray"
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

            <TouchableOpacity style={estilos.estilosLoginBotaoGoogle} onPress={entrarComKeycloak} disabled={!request}>
                <Text style={estilos.estilosPontoTextoBotao}>Entrar com Keycloak</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModoCadastro(!modoCadastro)}>
                <Text style={estilos.estilosLoginLinkAlternar}>
                    {modoCadastro ? "Já tem conta? Fazer login" : "Não tem conta? Cadastre-se"}
                </Text>
            </TouchableOpacity>
        </View>
    );
}