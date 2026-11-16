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

/**
 * Mostrar o cartão de um funcionário com os três modais de deletar, editar e links.
 *
 * As props com sufixo Inicial alimentam os campos de edição, e `aoEditar` e
 * `aoDeletar` avisam a tela de Funcionários para que ela fale com a API. O restante,
 * aberto e fechado de modal, fica todo dentro do componente. O modal de links ainda
 * é local, com os campos de LinkedIn, GitHub e portfólio só na memória da tela.
 *
 * @param {CardFuncionarioProps} props Identificador, dados iniciais e callbacks de edição e exclusão.
 * @returns {JSX.Element} Cartão do funcionário com modal e ações.
 */
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

    /** Abrir o modal já no tipo pedido. */
    const abrirModal = (tipoDoModal: TipoModal) => {
        setModalVisivel(true);
        setTipoModal(tipoDoModal);
    };

    /** Fechar o modal e limpar o tipo e o modo de edição de links. */
    const fecharModal = () => {
        setModalVisivel(false);
        setTipoModal("");
        setEditandoLinks(false);
    };

    /** Repassar a exclusão para o pai e fechar o modal. */
    const deletarFuncionario = () => {
        aoDeletar();
        fecharModal();
    };

    /** Enviar a edição com campos vazios caindo no valor inicial e fechar o modal. */
    const salvarEdicao = () => {
        const nome = nomeFuncionario.trim() || nomeInicial;
        const numeroFinal = numero.trim() || numeroInicial;
        const email = emailFuncionario.trim() || emailInicial;

        aoEditar(nome, numeroFinal, email);
        fecharModal();
    };

    /** Montar o conteúdo do modal conforme o tipo aberto, devolvendo null quando não há tipo. */
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