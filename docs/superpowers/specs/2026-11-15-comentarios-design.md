# Comentários profissionais no Klok: design

Data: 2026-11-15

## Intenção

O código do Klok tem cerca de 250 funções e quase nenhum comentário. Quem abre
`klok-api/admin/painel/admin.js` ou `klok-api/db.js` pela primeira vez não
descobre pelo código o que cada função faz, quais efeitos colaterais dispara e
qual regra de negócio ela protege. O objetivo é documentar cada função com
JSDoc em português, sem mudar comportamento.

## Objetivos

- Toda função, componente, handler e controlador com bloco JSDoc em PT-BR.
- Explicar o contrato (parâmetros e retorno) quando ele não é evidente.
- Explicar o efeito colateral e a regra de negócio: email enviado, auditoria,
  escrita no banco, código HTTP, isolamento por empresa.
- Manter os comentários de "por quê" que já existem.

## Não objetivos

- Não refatorar, não renomear, não mover código.
- Não comentar arquivos de teste (`klok-api/test/`), `android/` e `docs/`.
- Não trocar `console.log` nem tocar nas pendências da issue #20.
- Não comentar campo por campo de `estilos.ts` nem de `types.ts`, que são dados
  e não funções.

## Anti objetivos

- Comentário que repete o nome da função ("função que carrega os pontos").
- Comentário desatualizado em relação ao código, que é pior que ausência.

## Restrições

- Nada além de comentário pode mudar. A prova é a suíte do backend e o
  `typecheck` do app, mais uma comparação do código com os comentários
  removidos contra o git.
- Português, tom direto, sem hífen nem travessão, conforme `AGENTS.md`.
- O working tree do repo já tem alterações não commitadas de trabalho anterior
  (`api.ts`, `klok-api/controladores/auth.js`, dois testes, `package.json` e
  `AGENTS.md`). Elas são preservadas.

## Abordagens consideradas

1. JSDoc em todas as funções, em PT-BR. Escolhida. É o que se espera de
   "comentar de forma profissional", fica uniforme e permite conferir por
   arquivo. Custo: algum ruído em funções triviais.
2. Comentar só o que não é óbvio, em comentário de uma linha. Menos ruído, mas
   não uniforme e difícil de conferir.
3. Documento separado descrevendo a API interna. Não atende o pedido, que fala
   em comentar o código.

## Como foi decidido

O usuário escolheu a abordagem 1 e pediu os dois lados, app e API.

## O que fica com quem implementa

A escolha das palavras de cada comentário, dentro do guia de estilo do plano.
