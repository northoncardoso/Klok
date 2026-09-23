import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Modal,
    Alert,
    ActivityIndicator,
} from 'react-native';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';
import InputSenha from '../InputSenha';
import FormularioRecuperarSenha from './FormularioRecuperarSenha';
import type { UsuarioInfo } from '../types';

type UsuarioScreenProps = {
    token: string;
    aoAtualizarNome?: (nome: string) => void;
};

export default function UsuarioScreen({ token, aoAtualizarNome }: UsuarioScreenProps) {
    const [dados, setDados] = useState<UsuarioInfo | null>(null);
    const [carregando, setCarregando] = useState(true);

    const [nome, setNome] = useState('');
    const [numero, setNumero] = useState('');
    const [email, setEmail] = useState('');
    const [salvandoDados, setSalvandoDados] = useState(false);

    const [modalSenhaVisivel, setModalSenhaVisivel] = useState(false);
    const [mostrandoEsqueciSenha, setMostrandoEsqueciSenha] = useState(false);
    const [senhaAtual, setSenhaAtual] = useState('');
    const [senhaNova, setSenhaNova] = useState('');
    const [senhaConfirmar, setSenhaConfirmar] = useState('');
    const [salvandoSenha, setSalvandoSenha] = useState(false);

    const carregar = async () => {
        setCarregando(true);
        try {
            const u = await api.me(token);
            setDados(u);
            setNome(u.nome);
            setNumero(u.numero);
            setEmail(u.email);
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        carregar();
    }, [token]);

    const salvarDados = async () => {
        if (!nome.trim()) {
            Alert.alert('Atenção', 'Informe o nome.');
            return;
        }
        setSalvandoDados(true);
        try {
            const u = await api.atualizarEu({ nome: nome.trim(), numero: numero.trim(), email: email.trim() }, token);
            setDados(u);
            if (aoAtualizarNome) aoAtualizarNome(u.nome);
            Alert.alert('Sucesso', 'Dados atualizados.');
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setSalvandoDados(false);
        }
    };

    const fecharModalSenha = () => {
        setModalSenhaVisivel(false);
        setMostrandoEsqueciSenha(false);
        setSenhaAtual('');
        setSenhaNova('');
        setSenhaConfirmar('');
    };

    const salvarSenha = async () => {
        if (!senhaAtual || !senhaNova || !senhaConfirmar) {
            Alert.alert('Atenção', 'Preencha todos os campos.');
            return;
        }
        if (senhaNova !== senhaConfirmar) {
            Alert.alert('Erro', 'As novas senhas não coincidem.');
            return;
        }
        if (senhaNova === senhaAtual) {
            Alert.alert('Erro', 'A nova senha deve ser diferente da senha atual.');
            return;
        }
        setSalvandoSenha(true);
        try {
            await api.alterarSenha(senhaAtual, senhaNova, token);
            fecharModalSenha();
            Alert.alert('Sucesso', 'Senha alterada.');
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setSalvandoSenha(false);
        }
    };

    if (carregando) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#4285F4" />
            </View>
        );
    }

    return (
        <ScrollView style={estilos.containerUsuario}>
            <Text style={estilos.usuarioTitulo}>{dados?.nome}</Text>
            <Text style={estilos.usuarioSubtitulo}>
                @{dados?.usuario} {dados?.tipo === 'mestre' ? '• Mestre' : '• Funcionário'}
            </Text>

            <View style={estilos.usuarioCartao}>
                <Text style={estilos.usuarioSecaoTitulo}>Meus dados</Text>
                <TextInput
                    placeholder="Nome"
                    placeholderTextColor="gray"
                    value={nome}
                    onChangeText={setNome}
                    style={estilos.usuarioInput}
                />
                <TextInput
                    placeholder="Número"
                    placeholderTextColor="gray"
                    value={numero}
                    onChangeText={setNumero}
                    style={estilos.usuarioInput}
                    keyboardType="phone-pad"
                />
                <TextInput
                    placeholder="Email"
                    placeholderTextColor="gray"
                    value={email}
                    onChangeText={setEmail}
                    style={estilos.usuarioInput}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
                <TouchableOpacity
                    style={estilos.usuarioBotaoSalvar}
                    onPress={salvarDados}
                    disabled={salvandoDados}
                >
                    <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                        {salvandoDados ? 'Salvando...' : 'Salvar dados'}
                    </Text>
                </TouchableOpacity>
            </View>

            {dados?.hasSenha && (
                <View style={estilos.usuarioCartao}>
                    <Text style={estilos.usuarioSecaoTitulo}>Segurança</Text>
                    <TouchableOpacity
                        style={estilos.usuarioBotaoSalvar}
                        onPress={() => setModalSenhaVisivel(true)}
                    >
                        <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                            Trocar senha
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            <Modal visible={modalSenhaVisivel} transparent={true} animationType="slide">
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={estilos.usuarioModalCaixa}>
                        {mostrandoEsqueciSenha ? (
                            <>
                                <Text style={estilos.usuarioSecaoTitulo}>Recuperar senha</Text>
                                <FormularioRecuperarSenha
                                    onVoltar={() => setMostrandoEsqueciSenha(false)}
                                    onEnviado={fecharModalSenha}
                                />
                            </>
                        ) : (
                            <>
                                <Text style={estilos.usuarioSecaoTitulo}>Trocar senha</Text>

                                <InputSenha
                                    placeholder="Senha atual"
                                    value={senhaAtual}
                                    onChangeText={setSenhaAtual}
                                    style={{ marginBottom: 12 }}
                                />
                                <InputSenha
                                    placeholder="Nova senha"
                                    value={senhaNova}
                                    onChangeText={setSenhaNova}
                                    style={{ marginBottom: 12 }}
                                />
                                <InputSenha
                                    placeholder="Confirmar nova senha"
                                    value={senhaConfirmar}
                                    onChangeText={setSenhaConfirmar}
                                    style={{ marginBottom: 12 }}
                                />

                                <TouchableOpacity
                                    style={estilos.usuarioBotaoSalvar}
                                    onPress={salvarSenha}
                                    disabled={salvandoSenha}
                                >
                                    <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                                        {salvandoSenha ? 'Salvando...' : 'Confirmar'}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={estilos.botaoModalDeletar} onPress={fecharModalSenha}>
                                    <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                                        Cancelar
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity onPress={() => setMostrandoEsqueciSenha(true)}>
                                    <Text
                                        style={{
                                            color: 'red',
                                            fontWeight: 'bold',
                                            textAlign: 'center',
                                            marginTop: 14,
                                        }}
                                    >
                                        Esqueci minha senha
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}