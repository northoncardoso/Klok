import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import estilos from '../estilos';

import {
    criarTabelaUsuarios,
    criarUsuarioMestrePadrao,
    cadastrarUsuario,
    validarUsuario
} from '../database';

type HomeScreenProps = {
    aoEntrar: (tipo: string) => void;
};

type ResultadoLogin = {
    sucesso: boolean;
    erro?: string;
    tipo?: string;
};

export default function HomeScreen({ aoEntrar }: HomeScreenProps) {

    const [usuario, setUsuario] = useState("");
    const [senha, setSenha] = useState("");
    const [modoCadastro, setModoCadastro] = useState(false);

    useEffect(() => {
        criarTabelaUsuarios();
        criarUsuarioMestrePadrao();
    }, []);

    const entrar = () => {
        if (!usuario.trim() || !senha.trim()) {
            Alert.alert("Atenção", "Preencha usuário e senha.");
            return;
        }

        validarUsuario(usuario.trim(), senha, (resultado: ResultadoLogin) => {
            if (resultado.sucesso) {
                aoEntrar(resultado.tipo ?? "funcionario");
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

            <TouchableOpacity onPress={() => setModoCadastro(!modoCadastro)}>
                <Text style={estilos.estilosLoginLinkAlternar}>
                    {modoCadastro
                        ? "Já tem conta? Fazer login"
                        : "Não tem conta? Cadastre-se"}
                </Text>
            </TouchableOpacity>
        </View>
    );
}