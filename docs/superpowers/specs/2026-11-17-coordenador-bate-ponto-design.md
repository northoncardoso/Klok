# Coordenador com funcionário vinculado: design

Data: 2026-11-17

## Intenção

O app oferece "Bater o ponto" para qualquer sessão, mas o backend recusa
coordenador com 400 "Usuário sem funcionário vinculado". A causa é que
`criarCoordenador` grava o coordenador em `usuarios` com `funcionarioId` nulo,
enquanto a batida de ponto exige um registro em `funcionarios`. Na prática o
coordenador é uma pessoa da empresa que também bate ponto, então o certo é ele
ter funcionário vinculado desde a criação.

## Objetivos

- Coordenador criado a partir de agora nasce com um registro em `funcionarios`
  e com `usuarios.funcionarioId` apontando para ele.
- Coordenador que já existe ganha o registro por migração, sem perder pontos,
  senha ou histórico.
- Coordenador consegue bater ponto pelo app e pelo painel sem nenhuma mudança
  no aplicativo.
- Excluir funcionário deixa de ser um caminho para apagar a conta de
  coordenador por acidente.

## Não objetivos

- Não separar "funcionário" de "pessoa" em duas tabelas.
- Não mudar o login, o token, a sessão nem as telas de coordenadores.
- Não permitir apagar coordenador pelo painel, que continua fora do escopo.

## Anti objetivos

- Coordenador aparecer duplicado na lista de funcionários com dados
  divergentes dos da aba Coordenadores.
- Migração que trave banco antigo que tenha coordenador com email repetido ou
  nome vazio.

## Restrições

- Node 22, `node:sqlite`, migração versionada pelo `PRAGMA user_version`, um
  banco por empresa.
- Teste antes do código, conforme `AGENTS.md`.
- Sem hífen nem travessão em texto gerado.

## Abordagens consideradas

1. Coordenador com funcionário vinculado, gravado na criação e corrigido por
   migração. Escolhida pelo usuário. É o modelo que reflete a realidade, mantém
   uma tabela só de pessoas e faz o ponto funcionar sem exceção de papel.
2. Esconder "Bater o ponto" para coordenador no app. Menor esforço, mas
   cristaliza a regra errada: coordenador nunca bate ponto.
3. Deixar o coordenador bater ponto sem registro em `funcionarios`, gravando
   ponto com `funcionarioId` nulo. Quebra a chave estrangeira, o relatório e o
   join do painel. Descartada.

## Como foi decidido

O usuário escolheu a abordagem 1 na conversa de 2026-11-17.

## Decisões de projeto

- `criarCoordenador` passa a rodar em transação: insere em `funcionarios`,
  insere em `usuarios` com o `funcionarioId` novo e confirma. Se o usuário já
  existe, o rollback deixa o banco como estava, sem funcionário órfão.
- Migração 9 preenche `funcionarios` para todo coordenador com
  `funcionarioId` nulo, copiando nome, número e email de `usuarios`.
- O coordenador aparece na lista de funcionários, porque é uma pessoa da
  empresa. Para não abrir caminho para apagar a própria conta, `apagarFuncionario`
  recusa, respondendo 409, quando o usuário vinculado é coordenador.
- O painel mostra a mensagem do 409 na exclusão de funcionário, em vez de
  tratar como erro genérico.
- O seed passa a criar coordenador com funcionário automaticamente, porque usa
  `criarCoordenador`. Os bancos de exemplo precisam de `npm run semear --
  --recriar` para refletir o novo formato, ou da migração, se não forem
  recriados.

## O que fica com quem implementa

Os nomes dos testes e a redação das mensagens de erro.

## Nota de sequência

Este trabalho sai da `main`, então o PR #40 e o PR #41, que são de comentários,
devem entrar antes para não empilhar uma terceira branch.
