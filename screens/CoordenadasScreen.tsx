import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';
import { obterCoordenada } from '../localizacao';
import type { Local, PedidoLocal, PedidoLocalCriar } from '../types';

type CoordenadasScreenProps = {
    token: string;
};

type Modo = 'criar' | 'editar';

const ROTULO_TIPO: Record<PedidoLocal['tipo'], string> = {
    criar: 'criação',
    editar: 'edição',
    excluir: 'exclusão',
};

/**
 * Traduzir o motivo da falha de localização para o texto do aviso.
 *
 * @param {'servico' | 'permissao' | 'sinal'} motivo Motivo devolvido por obterCoordenada.
 * @returns {string} Frase para o usuário.
 */
function textoDoMotivo(motivo: 'servico' | 'permissao' | 'sinal'): string {
    if (motivo === 'servico') return 'Ative o serviço de localização do aparelho.';
    if (motivo === 'permissao') return 'Permita o acesso à localização do aparelho.';
    return 'Não foi possível ler o sinal do GPS. Tente de novo.';
}

/**
 * Formatar coordenada com cinco casas decimais para a tabela de perímetros.
 *
 * @param {number} valor Latitude ou longitude.
 * @returns {string} Valor formatado.
 */
function formatarCoordenada(valor: number): string {
    return Number(valor).toFixed(5);
}

/**
 * Exibir os perímetros da empresa e enviar pedidos de criação, edição e exclusão.
 *
 * A tela é restrita ao coordenador no menu. Toda ação gera pedido pendente, que
 * só altera o perímetro vigente depois da aprovação do administrador.
 *
 * @param {CoordenadasScreenProps} props Token do coordenador logado.
 * @returns {JSX.Element} Lista de perímetros e modal de criação ou edição.
 */
export default function CoordenadasScreen({ token }: CoordenadasScreenProps) {
    const [locais, setLocais] = useState<Local[]>([]);
    const [pendentes, setPendentes] = useState<PedidoLocal[]>([]);
    const [carregando, setCarregando] = useState(true);

    const [modalVisivel, setModalVisivel] = useState(false);
    const [modo, setModo] = useState<Modo>('criar');
    const [localEditando, setLocalEditando] = useState<Local | null>(null);
    const [nome, setNome] = useState('');
    const [raio, setRaio] = useState('150');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [lendoGps, setLendoGps] = useState(false);
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        carregar();
    }, [token]);

    /**
     * Buscar em GET /api/locais os perímetros ativos e os pedidos pendentes.
     * Se falhar, mostra um Alert e mantém a lista anterior.
     */
    const carregar = async () => {
        setCarregando(true);
        try {
            const dados = await api.listarLocais(token);
            setLocais(Array.isArray(dados?.locais) ? dados.locais : []);
            setPendentes(Array.isArray(dados?.pendentes) ? dados.pendentes : []);
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setCarregando(false);
        }
    };

    /** Limpar os campos e abrir o modal no modo de criação. */
    const abrirCriacao = () => {
        setModo('criar');
        setLocalEditando(null);
        setNome('');
        setRaio('150');
        setLatitude('');
        setLongitude('');
        setModalVisivel(true);
    };

    /**
     * Preencher o modal com os valores do perímetro escolhido e abrir no modo de edição.
     *
     * @param {Local} local Perímetro selecionado.
     */
    const abrirEdicao = (local: Local) => {
        setModo('editar');
        setLocalEditando(local);
        setNome(local.nome);
        setRaio(String(local.raioMetros));
        setLatitude(String(local.latitude));
        setLongitude(String(local.longitude));
        setModalVisivel(true);
    };

    /** Fechar o modal sem enviar pedido. */
    const fecharModal = () => {
        if (enviando) return;
        setModalVisivel(false);
    };

    /**
     * Ler a coordenada atual do aparelho e preencher os campos de latitude e longitude.
     * O coordenador deve estar na sede para o valor sair correto.
     */
    const usarLocalizacaoAtual = async () => {
        setLendoGps(true);
        try {
            const coordenada = await obterCoordenada();
            if ('motivo' in coordenada) {
                Alert.alert('Localização indisponível', textoDoMotivo(coordenada.motivo));
                return;
            }
            setLatitude(String(coordenada.latitude));
            setLongitude(String(coordenada.longitude));
        } finally {
            setLendoGps(false);
        }
    };

    /**
     * Enviar o pedido para a API, recarregar a lista e fechar o modal.
     *
     * @param {PedidoLocalCriar} dados Pedido de criação, edição ou exclusão.
     */
    const salvarPedido = async (dados: PedidoLocalCriar) => {
        setEnviando(true);
        try {
            await api.pedirLocal(dados, token);
            await carregar();
            setModalVisivel(false);
            Alert.alert(
                'Pedido enviado',
                'O pedido aguarda a aprovação do administrador. O perímetro atual continua valendo até lá.'
            );
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setEnviando(false);
        }
    };

    /** Validar o formulário e pedir confirmação antes de enviar o pedido. */
    const confirmarSalvar = () => {
        const nomeLimpo = nome.trim();
        const numeroRaio = Number(raio);
        const lat = Number(latitude.replace(',', '.'));
        const lon = Number(longitude.replace(',', '.'));

        if (!nomeLimpo) {
            Alert.alert('Atenção', 'Informe o nome do perímetro.');
            return;
        }
        if (!Number.isInteger(numeroRaio) || numeroRaio < 100 || numeroRaio > 150) {
            Alert.alert('Atenção', 'O raio precisa ficar entre 100 e 150 metros.');
            return;
        }
        if (
            !latitude.trim() ||
            !longitude.trim() ||
            !Number.isFinite(lat) ||
            lat < -90 ||
            lat > 90 ||
            !Number.isFinite(lon) ||
            lon < -180 ||
            lon > 180
        ) {
            Alert.alert('Atenção', 'Informe latitude e longitude válidas.');
            return;
        }

        const dados: PedidoLocalCriar =
            modo === 'criar'
                ? { tipo: 'criar', nome: nomeLimpo, latitude: lat, longitude: lon, raioMetros: numeroRaio }
                : {
                      tipo: 'editar',
                      localId: localEditando?.id ?? null,
                      nome: nomeLimpo,
                      latitude: lat,
                      longitude: lon,
                      raioMetros: numeroRaio,
                  };

        Alert.alert(
            'Confirmar pedido',
            `Enviar pedido de ${modo === 'criar' ? 'criação' : 'edição'} do perímetro ${nomeLimpo}? A alteração só vale depois da aprovação do administrador.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Enviar', onPress: () => void salvarPedido(dados) },
            ]
        );
    };

    /**
     * Pedir confirmação e enviar o pedido de exclusão do perímetro escolhido.
     *
     * @param {Local} local Perímetro que será removido depois da aprovação.
     */
    const confirmarExclusao = (local: Local) => {
        Alert.alert(
            'Excluir perímetro',
            `Enviar pedido de exclusão do perímetro ${local.nome}? O local continua valendo até a aprovação do administrador.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Enviar pedido',
                    style: 'destructive',
                    onPress: () =>
                        void salvarPedido({
                            tipo: 'excluir',
                            localId: local.id,
                            nome: local.nome,
                            latitude: local.latitude,
                            longitude: local.longitude,
                            raioMetros: local.raioMetros,
                        }),
                },
            ]
        );
    };

    /**
     * Descobrir o pedido pendente de um perímetro, para mostrar a situação no cartão.
     *
     * @param {number} localId Identificador do perímetro.
     * @returns {PedidoLocal | undefined} Pedido pendente do local, quando existir.
     */
    const pedidoDoLocal = (localId: number): PedidoLocal | undefined =>
        pendentes.find((pedido) => pedido.localId === localId);

    const pedidoDeCriacao = pendentes.find((pedido) => pedido.tipo === 'criar');

    if (carregando) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#4285F4" />
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <Text style={{ color: 'gray', fontSize: 14 }}>
                    Os perímetros definem onde a batida de ponto é considerada dentro da empresa. Toda alteração
                    passa pela aprovação do administrador.
                </Text>

                <TouchableOpacity
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 12,
                        paddingVertical: 10,
                        borderRadius: 8,
                        backgroundColor: '#e8f0fe',
                    }}
                    onPress={abrirCriacao}
                >
                    <Ionicons name="add" size={22} color="#4285F4" />
                    <Text style={{ color: '#4285F4', fontWeight: 'bold', marginLeft: 6 }}>Novo perímetro</Text>
                </TouchableOpacity>

                {pedidoDeCriacao && (
                    <View
                        style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 8,
                            backgroundColor: '#fff7e0',
                            borderLeftWidth: 4,
                            borderLeftColor: '#f0a500',
                        }}
                    >
                        <Text style={{ fontWeight: 'bold' }}>Pedido de criação pendente</Text>
                        <Text style={{ color: 'gray' }}>{pedidoDeCriacao.nome}</Text>
                    </View>
                )}
            </View>

            {locais.length === 0 ? (
                <Text style={{ color: 'gray', textAlign: 'center', marginTop: 24 }}>
                    Nenhum perímetro cadastrado.
                </Text>
            ) : (
                locais.map((local) => {
                    const pendente = pedidoDoLocal(local.id);
                    return (
                        <View
                            key={local.id}
                            style={{
                                backgroundColor: 'white',
                                marginHorizontal: 12,
                                marginTop: 10,
                                padding: 14,
                                borderRadius: 10,
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{local.nome}</Text>
                                    <Text style={{ color: 'gray' }}>
                                        {formatarCoordenada(local.latitude)}, {formatarCoordenada(local.longitude)}
                                    </Text>
                                    <Text style={{ color: 'gray' }}>Raio de {local.raioMetros} metros</Text>
                                </View>

                                <TouchableOpacity
                                    onPress={() => abrirEdicao(local)}
                                    style={{ padding: 8 }}
                                    accessibilityLabel={`Editar ${local.nome}`}
                                >
                                    <Ionicons name="pencil" size={22} color="#4285F4" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => confirmarExclusao(local)}
                                    style={{ padding: 8 }}
                                    accessibilityLabel={`Excluir ${local.nome}`}
                                >
                                    <Ionicons name="trash" size={22} color="#d93025" />
                                </TouchableOpacity>
                            </View>

                            {pendente && (
                                <Text style={{ color: '#b06000', marginTop: 8 }}>
                                    Pedido de {ROTULO_TIPO[pendente.tipo]} pendente de aprovação.
                                </Text>
                            )}
                        </View>
                    );
                })
            )}

            <Modal visible={modalVisivel} transparent={true} animationType="slide">
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 10, width: '90%' }}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
                            {modo === 'criar' ? 'Novo Perímetro' : 'Editar Perímetro'}
                        </Text>

                        <TextInput
                            placeholder="Nome do perímetro"
                            value={nome}
                            onChangeText={setNome}
                            style={estilos.input}
                        />
                        <TextInput
                            placeholder="Raio em metros (100 a 150)"
                            value={raio}
                            onChangeText={setRaio}
                            style={estilos.input}
                            keyboardType="number-pad"
                        />

                        <TouchableOpacity
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 10,
                                marginBottom: 8,
                                borderRadius: 8,
                                backgroundColor: '#e8f0fe',
                            }}
                            onPress={usarLocalizacaoAtual}
                            disabled={lendoGps || enviando}
                        >
                            <Ionicons name="locate" size={20} color="#4285F4" />
                            <Text style={{ color: '#4285F4', fontWeight: 'bold', marginLeft: 6 }}>
                                {lendoGps ? 'Lendo localização...' : 'Usar minha localização atual'}
                            </Text>
                        </TouchableOpacity>

                        <TextInput
                            placeholder="Latitude"
                            value={latitude}
                            onChangeText={setLatitude}
                            style={estilos.input}
                            keyboardType="numbers-and-punctuation"
                            autoCapitalize="none"
                        />
                        <TextInput
                            placeholder="Longitude"
                            value={longitude}
                            onChangeText={setLongitude}
                            style={estilos.input}
                            keyboardType="numbers-and-punctuation"
                            autoCapitalize="none"
                        />

                        <TouchableOpacity
                            style={estilos.botaoModalSalvar}
                            onPress={confirmarSalvar}
                            disabled={enviando}
                        >
                            <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                                {enviando ? 'Enviando...' : 'Enviar pedido'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={estilos.botaoModalFechar} onPress={fecharModal}>
                            <Text style={{ textAlign: 'center' }}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}
