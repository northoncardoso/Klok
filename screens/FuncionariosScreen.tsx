import React, { useState, useEffect } from 'react';
import {
    TouchableOpacity,
    View,
    Text,
    Modal,
    TextInput,
    ScrollView,
    Alert,
} from 'react-native';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';
import CardFuncionario from '../CardFuncionario';
import type { Funcionario } from '../types';

type FuncionariosScreenProps = {
    token: string;
};

/**
 * Exibir a lista de funcionários com busca por nome, número ou email, mais o modal de cadastro.
 * Recebe a prop token, usada como credencial em todas as chamadas à API.
 */
export default function FuncionariosScreen({ token }: FuncionariosScreenProps) {
    const [modalVisivel, setModalVisivel] = useState(false);
    const [nomeNovo, setNomeNovo] = useState('');
    const [numeroNovo, setNumeroNovo] = useState('');
    const [emailNovo, setEmailNovo] = useState('');
    const [textoBusca, setTextoBusca] = useState('');
    const [listaFuncionarios, setListaFuncionarios] = useState<Funcionario[]>([]);

    useEffect(() => {
        carregarFuncionarios();
    }, [token]);

    /**
     * Buscar em GET /api/funcionarios a lista completa e guardar no estado.
     * Se falhar, mostra um Alert com a mensagem do servidor e mantém a lista anterior.
     */
    const carregarFuncionarios = async () => {
        try {
            const lista = await api.listarFuncionarios(token);
            setListaFuncionarios(lista);
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        }
    };

    /**
     * Enviar POST /api/funcionarios com nome, número e email, usando um nome padrão quando o campo vem vazio.
     * Ao concluir, recarrega a lista, fecha o modal e limpa os campos. Se der erro, o Alert mostra a mensagem
     * do servidor e o modal continua aberto. O botão não tem estado de carregando, então não bloqueia toque duplo.
     */
    const confirmarNovoFuncionario = async () => {
        const nome = nomeNovo.trim() || 'Nome do funcionario';
        const numero = numeroNovo.trim();
        const email = emailNovo.trim();
        try {
            await api.criarFuncionario({ nome, numero, email }, token);
            await carregarFuncionarios();
            setModalVisivel(false);
            setNomeNovo('');
            setNumeroNovo('');
            setEmailNovo('');
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        }
    };

    /**
     * Apagar o funcionário pelo id com DELETE em /api/funcionarios/{id} e recarregar a lista.
     * Se falhar, mostra um Alert com a mensagem do servidor e a lista segue como estava.
     */
    const deletarFuncionario = async (id: number) => {
        try {
            await api.deletarFuncionario(id, token);
            await carregarFuncionarios();
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        }
    };

    /**
     * Salvar as alterações do funcionário com PUT em /api/funcionarios/{id} e recarregar a lista.
     * Se falhar, mostra um Alert com a mensagem do servidor e o cartão volta ao valor anterior.
     */
    const editarFuncionario = async (id: number, nome: string, numero: string, email: string) => {
        try {
            await api.atualizarFuncionario(id, { nome, numero, email }, token);
            await carregarFuncionarios();
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        }
    };

    const listaFiltrada = listaFuncionarios.filter((f) =>
        f.nome.toLowerCase().includes(textoBusca.toLowerCase()) ||
        f.numero.toLowerCase().includes(textoBusca.toLowerCase()) ||
        f.email.toLowerCase().includes(textoBusca.toLowerCase())
    );

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
                    Criar Novo Funcionario
                </Text>
            </TouchableOpacity>

            <TextInput
                placeholder="Buscar funcionário..."
                placeholderTextColor="gray"
                value={textoBusca}
                onChangeText={setTextoBusca}
                style={estilos.inputBusca}
            />

            <Modal visible={modalVisivel} transparent={true} animationType="slide">
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 10, width: '90%' }}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
                            Novo Funcionário
                        </Text>

                        <TextInput
                            placeholder="Nome"
                            value={nomeNovo}
                            onChangeText={setNomeNovo}
                            style={estilos.input}
                        />
                        <TextInput
                            placeholder="Número"
                            value={numeroNovo}
                            onChangeText={setNumeroNovo}
                            style={estilos.input}
                            keyboardType="phone-pad"
                        />
                        <TextInput
                            placeholder="Email"
                            value={emailNovo}
                            onChangeText={setEmailNovo}
                            style={estilos.input}
                            keyboardType="email-address"
                        />

                        <TouchableOpacity style={estilos.botaoModalSalvar} onPress={confirmarNovoFuncionario}>
                            <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>Salvar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={estilos.botaoModalFechar} onPress={() => setModalVisivel(false)}>
                            <Text style={{ textAlign: 'center' }}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {listaFiltrada.map(({ id, nome, numero, email }) => (
                <CardFuncionario
                    key={id}
                    id={id}
                    nomeInicial={nome}
                    numeroInicial={numero}
                    emailInicial={email}
                    aoDeletar={() => deletarFuncionario(id)}
                    aoEditar={(novoNome, novoNumero, novoEmail) =>
                        editarFuncionario(id, novoNome, novoNumero, novoEmail)
                    }
                />
            ))}
        </ScrollView>
    );
}
