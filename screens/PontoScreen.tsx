import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import estilos from '../estilos';
import { api, mensagemDeErro } from '../api';
import type { Ponto } from '../types';

type PontoScreenProps = {
    token: string;
};

/**
 * Mostrar o relógio em tempo real, o botão de bater ponto e o histórico de batidas do usuário.
 * Recebe a prop token, usada como credencial nas chamadas à API.
 */
export default function PontoScreen({ token }: PontoScreenProps) {
    const [horaAtual, setHoraAtual] = useState(new Date());
    const [pontos, setPontos] = useState<Ponto[]>([]);
    const [carregando, setCarregando] = useState(false);

    useEffect(() => {
        const intervalo = setInterval(() => setHoraAtual(new Date()), 1000);
        carregarPontos();
        return () => clearInterval(intervalo);
    }, [token]);

    /**
     * Buscar em GET /api/pontos/meus o histórico de quem está logado.
     * A falha vai só para o console, sem Alert, porque o histórico é secundário nesta tela.
     */
    const carregarPontos = async () => {
        try {
            const lista = await api.meusPontos(token);
            setPontos(lista);
        } catch (e) {
            console.log('Erro ao carregar pontos:', mensagemDeErro(e));
        }
    };

    /** Formatar a hora no padrão HH:MM:SS. */
    const formatarHora = (data: Date) => {
        const h = String(data.getHours()).padStart(2, '0');
        const m = String(data.getMinutes()).padStart(2, '0');
        const s = String(data.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    /** Formatar a data no padrão DD/MM/AAAA. */
    const formatarData = (data: Date) => {
        const d = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        return `${d}/${mes}/${data.getFullYear()}`;
    };

    /** Converter a data ISO vinda da API em data e hora legíveis. */
    const formatarDataHoraISO = (iso: string) => {
        const data = new Date(iso);
        return `${formatarData(data)}  ${formatarHora(data)}`;
    };

    /**
     * Registrar a batida com POST /api/pontos e recarregar o histórico.
     * Enquanto envia, o botão fica desabilitado com o texto "Registrando...", o que barra toque duplo.
     * Ao dar certo, um Alert confirma o horário registrado. Se falhar, o Alert mostra a mensagem do servidor.
     */
    const baterPonto = async () => {
        setCarregando(true);
        try {
            await api.baterPonto('batida', token);
            Alert.alert('Ponto Registrado', `Ponto batido às ${formatarHora(new Date())}`);
            await carregarPontos();
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setCarregando(false);
        }
    };

    return (
        <ScrollView contentContainerStyle={estilos.estilosPontoContainer}>
            <Text style={estilos.estilosPontoDataTexto}>{formatarData(horaAtual)}</Text>
            <Text style={estilos.estilosPontoRelogioTexto}>{formatarHora(horaAtual)}</Text>

            <TouchableOpacity
                style={estilos.estilosPontoBotaoBaterPonto}
                onPress={baterPonto}
                disabled={carregando}
            >
                <Text style={estilos.estilosPontoTextoBotao}>
                    {carregando ? 'Registrando...' : 'Bater o Ponto'}
                </Text>
            </TouchableOpacity>

            <View style={{ marginTop: 30, width: '100%', paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
                    Histórico de pontos
                </Text>
                {pontos.length === 0 ? (
                    <Text style={{ color: 'gray', fontSize: 15 }}>
                        Nenhum ponto registrado ainda.
                    </Text>
                ) : (
                    pontos.map((p) => (
                        <View
                            key={p.id}
                            style={{
                                padding: 12,
                                marginBottom: 8,
                                backgroundColor: '#fff',
                                borderRadius: 8,
                                borderLeftWidth: 4,
                                borderLeftColor: '#4285F4',
                            }}
                        >
                            <Text style={{ fontSize: 15, fontWeight: '600' }}>
                                {formatarDataHoraISO(p.dataHora)}
                            </Text>
                            <Text style={{ color: 'gray' }}>{p.tipo}</Text>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}
