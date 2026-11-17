import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';

import { api, mensagemDeErro } from '../api';
import estilos from '../estilos';

type FormularioRecuperarSenhaProps = {
    empresa: string;
    onVoltar: () => void;
    onEnviado?: () => void;
};

/**
 * Pedir o email do usuário e solicitar o link de recuperação de senha.
 * Recebe empresa, o código usado na chamada; onVoltar, chamado para fechar o formulário;
 * e onEnviado, opcional, executado quando o pedido é aceito, com queda para onVoltar.
 */
export default function FormularioRecuperarSenha({
    empresa,
    onVoltar,
    onEnviado,
}: FormularioRecuperarSenhaProps) {
    const [email, setEmail] = useState('');
    const [enviando, setEnviando] = useState(false);

    /**
     * Conferir email e empresa e chamar a rota de esqueci senha em POST.
     * Enquanto envia, o botão fica desabilitado com o texto "Enviando...", barrando toque duplo.
     * Ao dar certo, um Alert avisa que o link foi enviado e a tela é fechada. Se falhar, o Alert
     * traz a mensagem do servidor e o formulário continua preenchido.
     */
    const enviar = async () => {
        if (!email.trim()) {
            Alert.alert('Atenção', 'Informe seu email.');
            return;
        }
        if (!empresa) {
            Alert.alert('Atenção', 'Volte e informe o código da empresa.');
            return;
        }
        setEnviando(true);
        try {
            await api.esqueciSenha(empresa, email.trim());
            Alert.alert(
                'Email enviado',
                'Se este email estiver cadastrado, você receberá um link para redefinir a senha.'
            );
            if (onEnviado) onEnviado();
            else onVoltar();
        } catch (e) {
            Alert.alert('Erro', mensagemDeErro(e));
        } finally {
            setEnviando(false);
        }
    };

    return (
        <View>
            <TextInput
                placeholder="Email cadastrado"
                placeholderTextColor="gray"
                value={email}
                onChangeText={setEmail}
                style={[estilos.usuarioInput, { width: '85%', alignSelf: 'center' }]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
            />
            <TouchableOpacity
                style={[estilos.usuarioBotaoSalvar, { width: '85%', alignSelf: 'center', marginTop: 8 }]}
                onPress={enviar}
                disabled={enviando}
            >
                <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                    {enviando ? 'Enviando...' : 'Enviar link de recuperação'}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onVoltar}>
                <Text style={{ color: 'dodgerblue', textAlign: 'center', marginTop: 16, fontSize: 14 }}>
                    Voltar
                </Text>
            </TouchableOpacity>
        </View>
    );
}