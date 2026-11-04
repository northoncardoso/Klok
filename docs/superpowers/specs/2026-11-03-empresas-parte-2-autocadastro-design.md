# Autocadastro com pedido e aprovação por empresa (parte 2)

Data: 2026-11-03
Issue: #31
Spec maior: `docs/superpowers/specs/2026-11-02-admin-empresas-design.md`
Design anterior adaptado: `docs/superpowers/specs/2026-10-13-pedido-funcionario-aprovacao-design.md`

## Intenção

Na parte 1 o autocadastro ficou fechado: `POST /api/auth/registrar` responde 403 e
só o coordenador cria funcionário. Isso resolve o cadastro aberto, mas deixa o
funcionário dependente do coordenador para o primeiro acesso.

Esta parte reabre o autocadastro sem devolver o problema: o cadastro vira um
pedido pendente no banco daquela empresa, e só um coordenador da mesma empresa
aprova. O pedido não recebe token, não bate ponto e não entra no app antes da
decisão. O coordenador é avisado por email e por um contador no menu, e o
candidato é avisado por email quando for aprovado.

## Objetivos

- migração 8 com a tabela `solicitacoes` no banco de cada empresa
- cadastro local cria pedido pendente, com email obrigatório, e não cria usuário
- login Google cria pedido pendente quando ainda não existe usuário
- login local de pedido pendente ou recusado é bloqueado com mensagem clara
- coordenador lista, aprova e recusa pedidos da própria empresa
- aprovação cria funcionário e usuário juntos, em transação, com a empresa do banco
- email para os coordenadores na entrada do pedido e para o candidato na aprovação
- app com campo de email no cadastro, aviso de pedido enviado, tela de Solicitações
  com contador no menu, aprovar, recusar e atualizar
- contador buscado sob demanda, ao abrir o app e ao entrar na tela, sem polling

## Não objetivos

- push, que continua sem credencial FCM
- aviso de recusa ao candidato
- aprovação pelo painel do admin, que só lista os pedidos na parte 3
- link de aprovação no email, porque a decisão é sempre dentro do app
- reenvio manual do email de aviso
- prazo de validade do pedido

## Anti objetivos

- pedido pendente conseguir token, bater ponto ou aparecer como funcionário
- coordenador de uma empresa listar ou aprovar pedido de outra
- `senhaHash` sair em qualquer resposta
- nome de usuário recusado voltar a ficar livre
- email de aviso derrubar o cadastro ou a aprovação

## Restrições

- Node 22.5 ou mais novo, por causa do `node:sqlite`
- cada empresa tem o próprio banco, então todo o fluxo roda em `req.banco`
- textos e comentários em PT-BR, sem hífen nem travessão
- o app é React Native com Expo e não ganha biblioteca nova para esta parte

## Abordagens consideradas

### Onde guardar o pedido

1. Tabela `solicitacoes` no banco da empresa, escolhida.
   O pedido nasce no mesmo banco em que será aprovado, então a aprovação nunca
   atravessa empresa e o isolamento é físico, igual ao resto da parte 1. Custa
   uma tabela e funções novas no `db.js`.
2. Tabela `usuarios` com status `pendente`, descartada.
   O usuário pendente passaria a existir na mesma tabela dos ativos. Bastaria uma
   consulta esquecer o filtro de status para liberar acesso, e o login teria de
   filtrar em todo lugar. O risco não compensa a economia de uma tabela.
3. Catálogo central, descartada.
   O catálogo é da KLOK e não tem os dados da empresa. Aprovar a partir dele
   exigiria abrir o banco da empresa no meio do fluxo, e o pedido ficaria fora do
   lugar onde será usado.

### Como avisar o coordenador

1. Email mais tela com contador, escolhida.
   O email alcança quem está fora do app, e a tela resolve quem está dentro. O
   contador mostra o que ainda está pendente.
2. Só email, descartada.
   Quem está com o app aberto não vê nada até abrir a caixa de email.
3. Só tela, descartada.
   O coordenador só descobre o pedido se abrir o app por conta própria.

### Como atualizar o contador

1. Sob demanda, escolhida.
   Busca ao abrir o app e ao entrar na tela, com botão de atualizar. É a opção
   mais leve: nenhuma consulta em segundo plano, nenhuma rede ou bateria gasta com
   o app parado.
2. Consulta a cada 30 segundos com a tela aberta, descartada.
   Atualiza sozinho, mas gasta rede e bateria e exige parar a consulta ao sair da
   tela. O ganho não paga o custo para um pedido que não é urgente.

## Desenho escolhido

### Migração 8

```sql
CREATE TABLE IF NOT EXISTS solicitacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    senhaHash TEXT,
    nome TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    numero TEXT NOT NULL DEFAULT '',
    googleId TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    criadoEm TEXT NOT NULL,
    decididoEm TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitacoes_usuario
    ON solicitacoes(usuario) WHERE usuario IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitacoes_google
    ON solicitacoes(googleId) WHERE googleId IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes(status);
```

Os índices parciais em `usuario` e `googleId` valem para qualquer status, de
propósito: o nome de um pedido recusado continua reservado. O índice de status é
uma adição do plano ao design anterior, para a listagem e a contagem não varrerem
a tabela inteira.

### Funções novas em `db.js`

- `criarSolicitacao({ usuario, senhaHash, nome, email, numero, googleId })`
  devolve a solicitação criada ou `{ erro, status }`. Exige `usuario` ou
  `googleId`. Converte violação de unicidade em 409.
- `listarSolicitacoes(status = 'pendente')` ordena por `criadoEm`.
- `buscarSolicitacaoPorId(id)`
- `buscarSolicitacaoPorUsuario(usuario)`
- `buscarSolicitacaoPorGoogleId(googleId)`
- `contarSolicitacoesPendentes()`
- `validarSenhaSolicitacao(usuario, senha)` devolve a solicitação quando a senha
  confere, qualquer que seja o status. Quem decide a mensagem é o controlador.
- `aprovarSolicitacao(id)` roda em transação. Recusa pedido inexistente com 404,
  pedido já decidido com 409 e nome ou `googleId` já usados com 409. Em sucesso,
  cria funcionário e usuário com a empresa do banco, copia o `googleId` quando
  houver e marca o pedido como aprovado.
- `recusarSolicitacao(id)` recusa pedido inexistente com 404 e já decidido com
  409. Em sucesso, marca como recusado e grava `decididoEm`.

Toda função que devolve solicitação remove `senhaHash` do resultado. A remoção
fica no `db.js`, não no controlador, para nenhuma rota esquecer.

### Cadastro local

`POST /api/auth/registrar` continua passando pelo `resolverEmpresa` e pelo
limitador de cadastro. Passa a exigir email válido, além de usuário e senha.

- nome vazio usa o próprio usuário
- número é opcional e fica vazio, porque o app não pede no cadastro
- usuário já existente em `usuarios` ou em `solicitacoes`, de qualquer status,
  responde 409
- email inválido responde 400
- senha abaixo do mínimo continua respondendo 400
- cria o pedido com `senhaHash` e status pendente
- avisa todos os coordenadores da empresa por email
- responde 201 com mensagem de aguardando aprovação

Falha no envio de email não desfaz o pedido: o erro vai para o log e a resposta
continua 201.

### Login local

A ordem importa para a rota não virar oráculo:

1. tenta `banco.validarSenha(usuario, senha)`, como hoje
2. se não achou usuário, tenta `validarSenhaSolicitacao(usuario, senha)`
3. senha errada, ou nenhum pedido, responde 401 genérico
4. senha certa em pedido pendente responde 403 com
   `Seu cadastro está aguardando aprovação de um coordenador da sua empresa.`
5. senha certa em pedido recusado responde 403 com
   `Seu pedido de cadastro foi recusado. Fale com um coordenador da sua empresa.`

O 403 só aparece depois de a senha conferir contra o hash do pedido. Quem não
sabe a senha continua recebendo o mesmo 401 de usuário inexistente.

### Login Google

`POST /api/auth/google` continua validando o ID token como hoje.

- se já existe usuário com aquele `googleId`, entra
- se existe pedido pendente com aquele `googleId`, não cria outro e responde 403
- se existe pedido recusado, responde 403 com a mensagem de recusa
- se não existe nada, cria pedido pendente com `usuario` nulo, `senhaHash` nulo,
  nome, email e `googleId`, avisa os coordenadores e responde 403
- se o Google não devolver email, responde 400 e não cria pedido, porque o
  candidato não teria como ser avisado da aprovação

Repetir o login Google não duplica o pedido, porque o índice parcial em `googleId`
barra e o fluxo procura antes de inserir.

### Rotas do coordenador

Todas com `autenticar` e `exigirCoordenador`, montadas em `/api/solicitacoes`:

| Método | Rota | Para que serve |
|---|---|---|
| GET | `/api/solicitacoes?status=pendente` | lista pedidos, padrão pendente |
| GET | `/api/solicitacoes/contagem` | devolve `{ pendentes }` para o menu |
| POST | `/api/solicitacoes/:id/aprovar` | aprova e cria o funcionário |
| POST | `/api/solicitacoes/:id/recusar` | recusa e mantém no histórico |

`status` aceita `pendente`, `aprovado` e `recusado`. Outro valor responde 400.
Aprovar responde 201 com o funcionário criado. Recusar responde 200.
As duas decisões recusam pedido de outra empresa porque o `req.banco` já é o
banco da empresa do token.

### Emails

`criarEnviarEmail` passa a devolver uma função única
`enviarEmail({ para, assunto, texto })`.

- sem SMTP em desenvolvimento: registra no console com `[klok] email simulado`,
  destinatário, assunto e texto
- sem SMTP em produção: lança, como hoje
- a redefinição de senha passa a montar assunto e texto com esse formato
- novo pedido: assunto `Klok: novo pedido de cadastro em <CODIGO>`, texto com nome,
  usuário ou conta Google, email e o pedido para abrir o app e decidir
- aprovação: assunto `Klok: seu cadastro foi aprovado`, texto com a empresa e a
  instrução de entrar com o usuário e a senha cadastrados
- o envio para vários coordenadores é um a um, e a falha de um não impede os outros
- nenhum envio de aviso pode derrubar a requisição que o disparou

### App

- `types.ts`: tipo `Solicitacao` com id, usuario, nome, email, numero e criadoEm
- `api.ts`: `registrar` ganha email; entram `listarSolicitacoes`,
  `contarSolicitacoes`, `aprovarSolicitacao` e `recusarSolicitacao`
- `HomeScreen`: campo de email no cadastro, obrigatório, mensagem de pedido
  enviado e exibição da mensagem real quando o Google responde 403
- `App.tsx`: tela `Solicitacoes`, estado do contador, busca ao carregar a sessão de
  coordenador e ao entrar na tela, item de menu só para coordenador com
  `Solicitações (n)`
- `screens/SolicitacoesScreen.tsx`: lista de pendentes, aprovar, recusar, botão
  atualizar, estado vazio, carregando e erro

O coordenador que aprova ou recusa atualiza o contador na hora. Funcionário não vê
o item de menu e não acessa a tela.

## Segurança

- pedido pendente não recebe token, não bate ponto e não entra no app
- `senhaHash` nunca sai do `db.js`
- listar e decidir usam `req.banco`, então o isolamento é o mesmo da parte 1
- email passa por `destinatarioValido` antes do envio
- o nome de usuário fica reservado pelo índice único, mesmo recusado
- aprovação é transação: não existe funcionário sem usuário nem usuário sem
  funcionário
- o 403 de pendente só aparece com senha correta
- o limitador de cadastro já existe e continua valendo para o pedido

## Testes

Backend:

- migração 8 cria a tabela e os índices, em banco novo e em banco na versão 7
- cadastro cria pedido pendente, não cria usuário e não devolve token
- login de pendente com senha certa responde 403 com a mensagem
- login de pendente com senha errada responde 401 genérico
- email inválido responde 400
- usuário já existente responde 409
- usuário já pedido, mesmo recusado, responde 409
- coordenador lista só os pendentes da própria empresa
- coordenador de outra empresa não vê nem decide o pedido
- aprovar cria funcionário e usuário com a empresa, e o login passa a funcionar
- aprovar duas vezes responde 409
- nome tomado entre o pedido e a aprovação responde 409 e o pedido continua pendente
- recusar bloqueia o login e mantém o pedido no histórico
- Google cria pedido pendente, repete sem duplicar e aprova com `googleId`
- Google sem email responde 400
- email ao coordenador na entrada e ao candidato na aprovação
- falha de email não derruba cadastro nem aprovação
- `npm test` verde

App:

- `npm run typecheck` sem erro
- verificação manual do cadastro, do contador, da aprovação e da recusa

## O que fica para o plano

- ordem das tarefas e divisão em commits
- nomes exatos dos controladores e das rotas
- textos finais dos emails e das mensagens
- se a contagem entra na mesma tarefa da listagem ou em uma separada
