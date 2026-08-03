import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import estilos from "../estilos";
export default function PontoScreen() {

    const [horaAtual, setHoraAtual] = useState(new Date());

    useEffect(() => {
        const intervalo = setInterval(() => {
            setHoraAtual(new Date());
        }, 1000);

        return () => clearInterval(intervalo);
    }, []);

    const formatarHora = (data: Date) => {
        const horas = String(data.getHours()).padStart(2, '0');
        const minutos = String(data.getMinutes()).padStart(2, '0');
        const segundos = String(data.getSeconds()).padStart(2, '0');
        return `${horas}:${minutos}:${segundos}`;
    };

    const formatarData = (data: Date) => {
        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        return `${dia}/${mes}/${ano}`;
    };

    const baterPonto = () => {
        const registrado = new Date();
        Alert.alert(
            "Ponto Registrado",
            `Ponto batido às ${formatarHora(registrado)} de ${formatarData(registrado)}`
        );
        // Próximo passo: salvar esse registro no banco de dados (tabela de pontos)
    };

    return (
        <View style={estilos.estilosPontoContainer}>
            <Text style={estilos.estilosPontoDataTexto}>{formatarData(horaAtual)}</Text>
            <Text style={estilos.estilosPontoRelogioTexto}>{formatarHora(horaAtual)}</Text>

            <TouchableOpacity style={estilos.estilosPontoBotaoBaterPonto} onPress={baterPonto}>
                <Text style={estilos.estilosPontoTextoBotao}>Bater o Ponto</Text>
            </TouchableOpacity>
        </View>
    );
}
