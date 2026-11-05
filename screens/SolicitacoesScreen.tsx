import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';
import type { Solicitacao } from '../types';

type Props = {
    token: string;
    aoAtualizarContagem: () => Promise<void>;
};

export default function SolicitacoesScreen({ token, aoAtualizarContagem }: Props) {
    const [lista, setLista] = useState<Solicitacao[]>([]);
    const [carregando, setCarregando] = useState(false);

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

    const agir = async (id: number, acao: 'aprovar' | 'recusar') => {
        try {
            if (acao === 'aprovar') await api.aprovarSolicitacao(id, token);
            else await api.recusarSolicitacao(id, token);
            await carregar();
            await aoAtualizarContagem();
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        }
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

            {lista.map((pedido) => (
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
                            style={{ flex: 1, backgroundColor: '#2e7d32', padding: 10, borderRadius: 8 }}
                            onPress={() => agir(pedido.id, 'aprovar')}
                        >
                            <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                                Aprovar
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ flex: 1, backgroundColor: '#c62828', padding: 10, borderRadius: 8 }}
                            onPress={() => agir(pedido.id, 'recusar')}
                        >
                            <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                                Recusar
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}
