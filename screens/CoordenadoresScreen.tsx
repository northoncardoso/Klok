import React, { useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';
import InputSenha from '../InputSenha';
import type { Coordenador } from '../types';

type CoordenadoresScreenProps = {
    token: string;
};

export default function CoordenadoresScreen({ token }: CoordenadoresScreenProps) {
    const [lista, setLista] = useState<Coordenador[]>([]);
    const [modalVisivel, setModalVisivel] = useState(false);
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [numero, setNumero] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        carregar();
    }, [token]);

    const carregar = async () => {
        try {
            setLista(await api.listarCoordenadores(token));
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        }
    };

    const limparFormulario = () => {
        setUsuario('');
        setSenha('');
        setNome('');
        setEmail('');
        setNumero('');
    };

    const criar = async () => {
        if (!usuario.trim() || !senha || !email.trim() || !numero.trim()) {
            Alert.alert('Atenção', 'Preencha usuário, senha, email e número.');
            return;
        }
        setSalvando(true);
        try {
            await api.criarCoordenador(
                {
                    usuario: usuario.trim(),
                    senha,
                    nome: nome.trim(),
                    email: email.trim(),
                    numero: numero.trim(),
                },
                token
            );
            await carregar();
            setModalVisivel(false);
            limparFormulario();
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setSalvando(false);
        }
    };

    return (
        <ScrollView>
            <TouchableOpacity
                style={estilos.containerCriarNovoFuncionario}
                onPress={() => setModalVisivel(true)}
            >
                <View style={estilos.circuloImg}>
                    <View style={estilos.img} />
                    <View style={estilos.corpoImg} />
                </View>
                <Text style={{ textAlign: 'center', color: 'black', fontSize: 18, fontWeight: 'bold' }}>
                    Criar Novo Coordenador
                </Text>
            </TouchableOpacity>

            {lista.map((coordenador) => (
                <View
                    key={coordenador.id}
                    style={{
                        backgroundColor: 'white',
                        marginHorizontal: 12,
                        marginTop: 10,
                        padding: 14,
                        borderRadius: 10,
                    }}
                >
                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{coordenador.nome}</Text>
                    <Text style={{ color: 'gray' }}>@{coordenador.usuario}</Text>
                    {!!coordenador.email && <Text style={{ color: 'gray' }}>{coordenador.email}</Text>}
                    {!!coordenador.numero && <Text style={{ color: 'gray' }}>{coordenador.numero}</Text>}
                </View>
            ))}

            <Modal visible={modalVisivel} transparent={true} animationType="slide">
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 10, width: '90%' }}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
                            Novo Coordenador
                        </Text>

                        <TextInput
                            placeholder="Usuário"
                            value={usuario}
                            onChangeText={setUsuario}
                            style={estilos.input}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <InputSenha
                            placeholder="Senha"
                            value={senha}
                            onChangeText={setSenha}
                            style={estilos.input}
                        />
                        <TextInput
                            placeholder="Nome"
                            value={nome}
                            onChangeText={setNome}
                            style={estilos.input}
                        />
                        <TextInput
                            placeholder="Email"
                            value={email}
                            onChangeText={setEmail}
                            style={estilos.input}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                        <TextInput
                            placeholder="Número"
                            value={numero}
                            onChangeText={setNumero}
                            style={estilos.input}
                            keyboardType="phone-pad"
                        />

                        <TouchableOpacity
                            style={estilos.botaoModalSalvar}
                            onPress={criar}
                            disabled={salvando}
                        >
                            <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                                {salvando ? 'Salvando...' : 'Salvar'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={estilos.botaoModalFechar}
                            onPress={() => setModalVisivel(false)}
                        >
                            <Text style={{ textAlign: 'center' }}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}
