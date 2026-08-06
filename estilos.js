import { StyleSheet } from 'react-native';

    const estilos = StyleSheet.create({

        // Estilos tela de funcionários
        containerAbsolutoFuncionario: {
            backgroundColor: "white",
            width: "90%",
            padding: 10,
            margin: 20,
            borderRadius: 15,
            elevation: 2 //sombra (porém o botão recebe uma elevação referente aos demais elementos, podendo ficar acima da animação do menu)
        },
        containerCriarNovoFuncionario: {
            alignSelf: "center",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "white",
            width: 150,
            height: 150,
            margin: 50,
            borderRadius: 15,
            elevation: 2,
        },
        containerCima: {
            flexGrow: 1,
            flexDirection: "row",
            justifyContent: "space-around"
        },
        containerImg: {
            marginLeft: 10,
            justifyContent: "center",
        },
        containerTexto: {
            flex: 5,
            justifyContent: "flex-end",
        },
        containerBaixo: {
            flex: 3,
            borderTopColor: "gray",
            borderColor: "gray",
            flexDirection: "row",
            justifyContent: "space-around",
        },
        img: {
            borderColor: "black",
            borderRadius: 10,
            width: 15,
            height: 15,
            backgroundColor: "black",
            alignSelf: "center",
            justifyContent: "center"
        },
        corpoImg: {
            borderColor: "black",
            borderRadius: 10,
            width: 28,
            height: 12,
            backgroundColor: "black",
            borderBottomLeftRadius: 2,
            borderBottomRightRadius: 2,
            alignSelf: "center",
            justifyContent: "center",
            top: 2
        },
        circuloImg: {
            margin: 5,
            width: 70,
            height: 70,
            borderRadius: 50,
            borderWidth: 2,
            backgroundColor: 'gainsboro',
            justifyContent: "center"
        },
        textoColumn: {
            margin: 7,
            flexDirection: "column",
            justifyContent: "center"
        },
        textoBold: {
            fontWeight: "bold",
            fontSize: 18
        },
        linhaDivisao: {
            marginHorizontal: 10,
            marginVertical: 5,
            borderBottomColor: "gainsboro",
            borderBottomWidth: StyleSheet.hairlineWidth //menor linha "pixivel" (possivel em pixel)
        },
        botaoLixeira: {
            padding: 4,
            borderRadius: 8,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
        },
        lixeira: {
            alignItems: 'center',
        },
        tampa: {
            width: 16,
            height: 4,
            backgroundColor: 'red',
            borderTopLeftRadius: 2,
            borderTopRightRadius: 2,
        },
        cabo: {
            width: 6,
            height: 3,
            backgroundColor: 'red',
            marginBottom: 1,
            marginTop: -2,
            borderRadius: 1,
        },
        corpoLixera: {
            width: 12,
            height: 14,
            backgroundColor: 'red',
            borderBottomLeftRadius: 2,
            borderBottomRightRadius: 2,
        },
        botaoEdit: {
            width: 18,
            height: 18,
            backgroundColor: "blue"
        },
        botaoLink: {
            width: 18,
            height: 18,
            backgroundColor: "blue"
        },
        input: {
            borderColor: 'gray',
            borderWidth: 1,
            marginBottom: 10,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 5,
            width: 200
        },
        botaoModalSalvar: {
            backgroundColor: 'dodgerblue',
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 8,
            marginTop: 10,
            alignItems: 'center'
        },
        botaoModalFechar: {
            backgroundColor: 'gainsboro',
            paddingVertical: 10,
            paddingHorizontal: 10,
            borderRadius: 8,
            marginTop: 10,
            alignItems: 'center',
        },
        botaoModalTexto: {
            color: 'red',
            fontWeight: 'bold',
            fontSize: 16,
        },
        botaoModalDeletar: {
            backgroundColor: 'indianred',
            paddingVertical: 10,
            paddingHorizontal: 10,
            borderRadius: 8,
            marginTop: 10,
            alignItems: 'center',
        },
        inputBusca: {
            borderColor: 'gray',
            borderWidth: 1,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 5,
            width: "80%",
            alignSelf: "center",
            marginVertical: 10,
            justifyContent: "space-around"
        },

        // Estilos tela bater o ponto
        estilosPontoContainer: {
            flex: 1,
            justifyContent: 'center',
            alignSelf: 'center',
            padding: 20,
        },
        estilosPontoDataTexto: {
            fontSize: 18,
            color: 'gray',
            marginBottom: 5,
        },
        estilosPontoRelogioTexto: {
            fontSize: 56,
            fontWeight: 'bold',
            marginBottom: 40,
            fontVariant: ['tabular-nums'],
        },
        estilosPontoBotaoBaterPonto: {
            backgroundColor: 'dodgerblue',
            paddingVertical: 16,
            paddingHorizontal: 40,
            borderRadius: 10,
        },
        estilosPontoTextoBotao: {
            color: 'white',
            fontSize: 18,
            fontWeight: 'bold',
        },
        // Estilos tela de login
        estilosLoginContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        },
        estilosLoginTitulo: {
            fontSize: 28,
            fontWeight: 'bold',
            marginBottom: 5,
        },
        estilosLoginSubtitulo: {
            fontSize: 14,
            color: 'gray',
            marginBottom: 30,
        },
        estilosLoginInput: {
            borderColor: 'gray',
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 15,
            paddingVertical: 12,
            width: "85%",
            marginBottom: 15,
        },
        estilosLoginBotaoEntrar: {
            backgroundColor: 'dodgerblue',
            paddingVertical: 14,
            paddingHorizontal: 50,
            borderRadius: 8,
            marginTop: 10
        },
        estilosLoginTextoBotao: {
            color: 'white',
            fontSize: 16,
            fontWeight: 'bold',
        },
        estilosLoginLinkAlternar: {
        marginTop: 20,
        color: 'dodgerblue',
        fontSize: 14,
        },
        // Estilos do menu lateral (App.tsx)
        estilosMenuBarraSuperior: {
            height: 60,
            backgroundColor: 'dodgerblue',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 15,
            paddingTop: 10,
        },
        estilosMenuIconeMenu: {
            fontSize: 26,
            color: 'white',
            marginRight: 15,
        },
        estilosMenuTituloBarra: {
            fontSize: 18,
            fontWeight: 'bold',
            color: 'white',
        },
        estilosMenuOverlayContainer: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: 'row',
        },
        estilosMenuOverlayFundo: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
        },
        estilosMenuLateral: {
            width: "70%",
            backgroundColor: 'white',
            paddingTop: 60,
            paddingHorizontal: 20,
            height: '100%',
        },
        estilosMenuTituloMenu: {
            fontSize: 20,
            fontWeight: 'bold',
            marginBottom: 20,
        },
        estilosMenuItemMenu: {
            paddingVertical: 15,
            borderBottomWidth: 1,
            borderBottomColor: '#eee',
        },
        estilosMenuTextoItemMenu: {
            fontSize: 16,
        },
        // Estilos do modal de sair (App.tsx)
        estilosModalSairOverlay: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        estilosModalSairCaixa: {
            backgroundColor: 'white',
            padding: 20,
            borderRadius: 10,
            width: "90%",
        },
        estilosModalSairTextoPergunta: {
            fontSize: 16,
            marginBottom: 15,
            textAlign: 'center',
        },
        estilosModalSairTextoBotaoSair: {
            color: 'white',
            fontWeight: 'bold',
            textAlign: 'center',
        },
        estilosModalSairTextoBotaoCancelar: {
            textAlign: 'center',
        },
    }
);

    export default estilos;