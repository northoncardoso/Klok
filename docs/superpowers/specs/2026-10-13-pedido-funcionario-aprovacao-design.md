# Bloco C: pedido de funcionario com aprovacao do mestre

Data: 2026-10-13
Issue: [#19](https://github.com/northoncardoso/Klok/issues/19)

## Objetivo

O autocadastro deixa de ativar o funcionario direto. Ele vira um pedido
pendente, e so o mestre libera o acesso. O mestre e avisado por email e por uma
lista no app, e o candidato e avisado por email quando for aprovado.

## Decisoes tomadas com o usuario

- O pedido pendente fica sem acesso nenhum ate a aprovacao: nao recebe token, nao
  bate ponto e nao entra no app.
- Login de pendente e bloqueado com uma mensagem clara.
- O mestre ve os pedidos numa tela propria de Solicitacoes, com contador.
- Pedido recusado fica no historico e o nome de usuario nao pode ser reutilizado.
- A pessoa e avisada por email quando o pedido e aprovado, o que torna o email do
  candidato obrigatorio no cadastro.
- O login Google tambem vira pedido pendente, para nao continuar sendo uma porta
  dos fundos.
- O push fica de fora deste bloco, porque nao existe credencial FCM no projeto.
  Vira uma issue separada (dependencia `expo-notifications` mais configuracao no
  EAS).

## Fora de escopo

Push, notificacao de recusa ao candidato, e qualquer mudanca no fluxo do mestre
(que continua sendo criado na primeira tela, sem pedido).

## Modelo de dados

Migracao versao 6, tabela `solicitacoes`:

```
id, usuario, senhaHash, nome, email, numero, googleId,
status (pendente | aprovado | recusado), criadoEm, decididoEm
```

Indices unicos parciais em `usuario` e `googleId`, aplicados so quando o valor
nao e nulo, para barrar pedido duplicado e reuso de nome.

Funcoes novas em `db.js`:

- `criarSolicitacao({ usuario, senhaHash, nome, email, numero, googleId })`
- `listarSolicitacoes(status)`
- `buscarSolicitacaoPorId(id)`
- `buscarSolicitacaoPorUsuario(usuario)`
- `buscarSolicitacaoPorGoogleId(googleId)`
- `contarSolicitacoesPendentes()`
- `validarSenhaSolicitacao(usuario, senha)`
- `aprovarSolicitacao(id)`: em transacao, cria o funcionario e o usuario e marca o
  pedido como aprovado
- `recusarSolicitacao(id)`
- `buscarMestre()`

## Fluxos de backend

### Cadastro local

`POST /api/auth/registrar` passa a exigir email valido e cria um pedido pendente,
sem criar usuario. Resposta 201 com mensagem de aguardando aprovacao. O nome de
usuario precisa estar livre em `usuarios` e em `solicitacoes`. Avisa o mestre por
email.

### Login Google

`POST /api/auth/google`: se ja existe usuario ativo com aquele `googleId`, entra
como hoje. Senao, cria ou reencontra um pedido pendente com o `googleId` e o email
do Google, avisa o mestre e responde 403 com a mensagem de aguardando aprovacao.
Repetir o login Google nao duplica o pedido.

### Login local

Bloqueia pendente e recusado, mas so depois de conferir a senha contra o hash do
pedido, para nao virar oraculo de quais nomes existem. Sem senha valida, continua
o 401 generico.

### Rotas do mestre

Todas com `autenticar` e `exigirMestre`:

- `GET /api/solicitacoes?status=` (padrao pendente)
- `POST /api/solicitacoes/:id/aprovar`
- `POST /api/solicitacoes/:id/recusar`

Aprovar devolve o funcionario criado. Aprovar pedido ja decidido da 409. Se o nome
de usuario foi tomado nesse meio tempo, da 409 e o pedido continua pendente.

## Avisos

`email.js` passa a expor um envio generico `{ para, assunto, texto }`. Tres usos:
redefinicao de senha (refatorada para esse formato), novo pedido para o mestre, e
aprovacao para o candidato. Sem SMTP em desenvolvimento, cai no log como hoje.

## App

- `types.ts`: tipo `Solicitacao`.
- `api.ts`: `listarSolicitacoes`, `aprovarSolicitacao`, `recusarSolicitacao`.
- `HomeScreen`: campo de email no cadastro e aviso de que o pedido foi enviado.
- `App.tsx`: tela e item de menu "Solicitacoes", so para o mestre, com contador.
- `screens/SolicitacoesScreen.tsx`: lista de pendentes, botoes aprovar e recusar,
  e atualizacao.

## Impacto nos testes atuais

Varios testes fazem `registrar` e logo depois `login`, porque hoje o cadastro
ativa na hora. Eles passam a criar a conta ativa por `banco.criarUsuarioLocal`, e
o teste de registro passa a cobrir o fluxo novo.

## Testes novos (TDD)

Backend:

- cadastro vira pendente e nao loga
- login de pendente da 403 com a mensagem
- senha errada de pendente da 401 generico
- mestre lista pendentes
- aprovar cria funcionario e libera o login
- recusar bloqueia e mantem no historico
- aprovar duas vezes da 409
- nome duplicado da 409
- email invalido da 400
- Google vira pendente e nao duplica
- email ao mestre na criacao e ao candidato na aprovacao

App: `typecheck` e verificacao manual.

## Fica de fora deste bloco

Push. Vira issue separada, com `expo-notifications` e credencial FCM no EAS.
