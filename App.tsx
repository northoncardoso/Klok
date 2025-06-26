import React, { useState, useEffect } from 'react';
import {
    TouchableOpacity,
    View,
    Text,
    Modal,
    TextInput,
    ScrollView
} from 'react-native';

import {
    criarTabela,
    carregarFuncionarios,
    inserirFuncionario,
    deletarFuncionario as deletarFuncionarioDB
} from './database';

import estilos from "./estilos";
import CardFuncionario from "./cardFuncionario";

export default function App() {

    const [modalVisivel, setModalVisivel] = useState(false);
    const [nomeNovo, setNomeNovo] = useState("");
    const [numeroNovo, setNumeroNovo] = useState("");
    const [emailNovo, setEmailNovo] = useState("");

    const [listaFuncionarios, setListaFuncionarios] = useState([]);

    useEffect(() => {
        criarTabela();
        carregarFuncionarios(setListaFuncionarios);
    }, []);

    const confirmarNovoFuncionario = () => {
        const nome = nomeNovo.trim() || "Nome do funcionario"; 
        const numero = numeroNovo.trim() || "Numero do funcionario";
        const email = emailNovo.trim() || "Email do funcionario";

        inserirFuncionario(nome, numero, email,  () => {
            carregarFuncionarios(setListaFuncionarios);
            setModalVisivel(false);
            setNomeNovo("");
            setNumeroNovo("");
            setEmailNovo("");
        });
    };

    const deletarFuncionario = (id: any) => {
        deletarFuncionarioDB(id, () => {
            carregarFuncionarios(setListaFuncionarios);
        });
    };

    return (
        <ScrollView>
            
            {/* Botão de criar novo funcionario */}
            <TouchableOpacity
                style={estilos.containerCriarNovoFuncionario}
                onPress={() => setModalVisivel(true)}
            >
                <View style={estilos.circuloImg}>
                    <View style={estilos.img} />
                    <View style={estilos.corpoImg} />
                </View>
                <Text style={{
                    textAlign: "center",
                    color: "black",
                    fontSize: 18,
                    fontWeight: "bold"
                }}>Criar Novo Funcionario</Text>
            </TouchableOpacity>

            {/* Modal de cadastro */}
            <Modal visible={modalVisivel} transparent={true} animationType="slide">
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{
                        backgroundColor: 'white',
                        padding: 20,
                        borderRadius: 10,
                        width: "90%"
                    }}>
                        <Text style={{
                            fontSize: 18,
                            fontWeight: "bold",
                            marginBottom: 10
                        }}>
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
                            <Text style={{ color: "white", fontWeight: "bold", textAlign: "center" }}>Salvar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={estilos.botaoModalFechar} onPress={() => setModalVisivel(false)}>
                            <Text style={{ textAlign: "center" }}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Lista de funcionários renderizada */}
            {listaFuncionarios.map(({ id, nome, numero, email }) => (
                <CardFuncionario
                    key={id}
                    id={id}
                    nomeInicial={nome}
                    numeroInicial={numero}
                    emailInicial={email}
                    aoDeletar={() => deletarFuncionario(id)}
                />
            ))}

        </ScrollView>
    );
}