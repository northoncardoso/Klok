import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';
import type { Solicitacao } from '../types';

type Props = {
    token: string;
    aoAtualizarContagem: () => Promise<void>;
};

type Acao = 'aprovar' | 'recusar';

export default function SolicitacoesScreen({ token, aoAtualizarContagem }: Props) {
    const [lista, setLista] = useState<Solicitacao[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [agindo, setAgindo] = useState<number | null>(null);

    const carregar = async () => {
        setCarregando(true);
        try {
            setLista(await api.listarSolicitacoes('pendente', token));
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        carregar();
    }, [token]);

    const atualizarContagem = async () => {
        try {
            await aoAtualizarContagem();
        } catch {
            // A contagem é só um atalho visual: falhar aqui não pode esconder a
            // decisão que já foi feita.
        }
    };

    const agir = async (id: number, acao: Acao) => {
        if (agindo !== null) return;
        setAgindo(id);
        try {
            if (acao === 'aprovar') await api.aprovarSolicitacao(id, token);
            else await api.recusarSolicitacao(id, token);
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setAgindo(null);
            // Recarrega nos dois casos: se outro coordenador já decidiu, a lista
            // precisa refletir o estado real em vez de repetir o botão.
            await carregar();
            await atualizarContagem();
        }
    };

    const confirmar = (pedido: Solicitacao, acao: Acao) => {
        const titulo = acao === 'aprovar' ? 'Aprovar pedido' : 'Recusar pedido';
        const texto =
            acao === 'aprovar'
                ? `Liberar o acesso de ${pedido.nome}?`
                : `Recusar o pedido de ${pedido.nome}? Ele não vai conseguir entrar.`;
        Alert.alert(titulo, texto, [
            { text: 'Cancelar', style: 'cancel' },
            { text: acao === 'aprovar' ? 'Aprovar' : 'Recusar', onPress: () => agir(pedido.id, acao) },
        ]);
    };

    return (
        <ScrollView>
            <TouchableOpacity style={estilos.containerCriarNovoFuncionario} onPress={carregar}>
                <Text style={{ textAlign: 'center', fontSize: 18, fontWeight: 'bold' }}>
                    {carregando ? 'Atualizando...' : 'Atualizar pedidos'}
                </Text>
            </TouchableOpacity>

            {lista.length === 0 && !carregando && (
                <Text style={{ textAlign: 'center', color: 'gray', marginTop: 20 }}>
                    Nenhum pedido pendente.
                </Text>
            )}

            {lista.map((pedido) => {
                const emAndamento = agindo === pedido.id;
                const bloqueado = agindo !== null;
                return (
                    <View
                        key={pedido.id}
                        style={{
                            backgroundColor: 'white',
                            marginHorizontal: 12,
                            marginTop: 10,
                            padding: 14,
                            borderRadius: 10,
                        }}
                    >
                        <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{pedido.nome}</Text>
                        <Text style={{ color: 'gray' }}>
                            {pedido.usuario ? `@${pedido.usuario}` : 'conta Google'}
                        </Text>
                        <Text style={{ color: 'gray' }}>{pedido.email}</Text>
                        {!!pedido.numero && <Text style={{ color: 'gray' }}>{pedido.numero}</Text>}
                        <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }}>
                            <TouchableOpacity
                                style={{
                                    flex: 1,
                                    backgroundColor: bloqueado ? '#9e9e9e' : '#2e7d32',
                                    padding: 10,
                                    borderRadius: 8,
                                }}
                                onPress={() => confirmar(pedido, 'aprovar')}
                                disabled={bloqueado}
                            >
                                <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                                    {emAndamento ? 'Aguarde...' : 'Aprovar'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{
                                    flex: 1,
                                    backgroundColor: bloqueado ? '#9e9e9e' : '#c62828',
                                    padding: 10,
                                    borderRadius: 8,
                                }}
                                onPress={() => confirmar(pedido, 'recusar')}
                                disabled={bloqueado}
                            >
                                <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                                    {emAndamento ? 'Aguarde...' : 'Recusar'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );
            })}
        </ScrollView>
    );
}
