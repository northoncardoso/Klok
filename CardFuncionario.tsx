import React, { useState } from 'react';
import {
    TouchableOpacity,
    View,
    Text,
    Modal,
    TextInput
} from 'react-native';

import estilos from "./estilos";

type CardFuncionarioProps = {
    id: number;
    nomeInicial: string;
    numeroInicial: string;
    emailInicial: string;
    aoDeletar: () => void;
    aoEditar: (nome: string, numero: string, email: string) => void;
};

type TipoModal = "delete" | "editar" | "links";

function CardFuncionario({ id, nomeInicial, numeroInicial, emailInicial, aoDeletar, aoEditar }: CardFuncionarioProps) {

    const [modalVisivel, setModalVisivel] = useState(false);
    const [tipoModal, setTipoModal] = useState<TipoModal | "">("");
    const [nomeFuncionario, setNomeFuncionario] = useState(nomeInicial);
    const [numero, setNumero] = useState(numeroInicial);
    const [emailFuncionario, setEmailFuncionario] = useState(emailInicial);

    const [linkedin, setLinkedin] = useState("");
    const [github, setGitHub] = useState("");
    const [portfolio, setPortfolio] = useState("");

    const [editandoLinks, setEditandoLinks] = useState(false);

    const abrirModal = (tipoDoModal: TipoModal) => {
        setModalVisivel(true);
        setTipoModal(tipoDoModal);
    };

    const fecharModal = () => {
        setModalVisivel(false);
        setTipoModal("");
        setEditandoLinks(false);
    };

    const deletarFuncionario = () => {
        aoDeletar();
        fecharModal();
    };

    const salvarEdicao = () => {
        const nome = nomeFuncionario.trim() || nomeInicial;
        const numeroFinal = numero.trim() || numeroInicial;
        const email = emailFuncionario.trim() || emailInicial;

        aoEditar(nome, numeroFinal, email);
        fecharModal();
    };

    const renderizarTipoModal = () => {
        switch (tipoModal) {

            case "delete":
                return (
                    <View>
                        <Text>Tem certeza que deseja deletar?</Text>
                        <TouchableOpacity style={estilos.botaoModalDeletar} onPress={deletarFuncionario}>
                            <Text style={estilos.botaoModalTexto}>Sim, deletar</Text>
                        </TouchableOpacity>
                    </View>
                );

            case "editar":
                return (
                    <View>
                        <Text>Editar Informacoes</Text>
                        <TextInput
                            placeholder="Nome"
                            value={nomeFuncionario}
                            onChangeText={setNomeFuncionario}
                            style={estilos.input}
                            keyboardType="default"
                        />
                        <TextInput
                            placeholder="Número"
                            value={numero}
                            onChangeText={setNumero}
                            style={estilos.input}
                            keyboardType="phone-pad"
                        />
                        <TextInput
                            placeholder="Email"
                            value={emailFuncionario}
                            onChangeText={setEmailFuncionario}
                            style={estilos.input}
                            keyboardType="email-address"
                        />
                        <TouchableOpacity style={estilos.botaoModalSalvar} onPress={salvarEdicao}>
                            <Text>Salvar</Text>
                        </TouchableOpacity>
                    </View>
                );

            case "links":
                return (
                    <View>
                        <Text>Links relacionados ao funcionario:</Text>

                        {editandoLinks ? (
                            <>
                                <TextInput
                                    placeholder="LinkedIn"
                                    value={linkedin}
                                    onChangeText={setLinkedin}
                                    style={estilos.input}
                                    keyboardType="url"
                                />
                                <TextInput
                                    placeholder="GitHub"
                                    value={github}
                                    onChangeText={setGitHub}
                                    style={estilos.input}
                                    keyboardType="url"
                                />
                                <TextInput
                                    placeholder="Portfolio"
                                    value={portfolio}
                                    onChangeText={setPortfolio}
                                    style={estilos.input}
                                    keyboardType="url"
                                />
                            </>
                        ) : (
                            <>
                                <Text>- LinkedIn: {linkedin || "(nao informado)"}</Text>
                                <Text>- GitHub: {github || "(nao informado)"}</Text>
                                <Text>- Portfolio: {portfolio || "(nao informado)"}</Text>
                            </>
                        )}

                        <TouchableOpacity
                            style={estilos.botaoModalSalvar}
                            onPress={() => setEditandoLinks(!editandoLinks)}
                        >
                            <Text>{editandoLinks ? "Salvar Links" : "Editar Links"}</Text>
                        </TouchableOpacity>
                    </View>
                );

            default:
                return null;
        }
    };

    return (
        <View>
            <Modal visible={modalVisivel} transparent={true} animationType="slide">
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 10, width: "90%" }}>
                        {renderizarTipoModal()}
                        <TouchableOpacity style={estilos.botaoModalFechar} onPress={fecharModal}>
                            <Text>Fechar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <View style={estilos.containerAbsolutoFuncionario}>
                <View style={estilos.containerCima}>
                    <View style={estilos.containerImg}>
                        <View style={estilos.circuloImg}>
                            <View style={estilos.img} />
                            <View style={estilos.corpoImg} />
                        </View>
                    </View>

                    <View style={[estilos.containerTexto, estilos.textoColumn]}>
                        <Text style={estilos.textoBold}>{nomeFuncionario}</Text>
                        <Text style={{ color: "gray" }}>-- {numero}</Text>
                        <Text style={{ color: "gray" }}>-- {emailFuncionario}</Text>
                    </View>

                </View>

                <View style={estilos.linhaDivisao} />

                <View style={estilos.containerBaixo}>
                    <TouchableOpacity style={estilos.botaoLixeira} onPress={() => abrirModal("delete")}>
                        <View style={estilos.lixeira}>
                            <View style={estilos.tampa} />
                            <View style={estilos.cabo} />
                            <View style={estilos.corpoLixera} />
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => abrirModal("editar")}>
                        <Text style={{ color: "dodgerblue", fontSize: 18, fontWeight: "bold" }}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => abrirModal("links")}>
                        <Text style={{ color: "dodgerblue", fontSize: 18, fontWeight: "bold" }}>Link</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

export default CardFuncionario;