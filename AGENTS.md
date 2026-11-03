# Klok: regras do projeto

## Contexto

App React Native / Expo de gestão de funcionários com batida de ponto.
Backend Node.js / Express com SQLite em `klok-api/`.
Repo: https://github.com/northoncardoso/Klok

## Skills de processo (superpowers)

Instaladas em `~/.agents/skills`, carregadas automaticamente pelo opencode.
Para trabalho no Klok, seguir este fluxo:

1. `brainstorming`: antes de criar qualquer feature ou mudar comportamento. Ela
   classifica o trabalho (spike, bounded ou arquitetural), faz as perguntas e
   fecha o design.
2. `writing-plans`: depois do design aprovado, gerar o plano de implementação.
3. `executing-plans` ou `subagent-driven-development`: para executar o plano.
4. `test-driven-development`: ao implementar, teste primeiro.
5. `systematic-debugging`: para qualquer bug, antes de tentar consertar.
6. `verification-before-completion`: antes de dizer que terminou.
7. `using-git-worktrees`: para isolar mudanças grandes.

Documento de design em `docs/superpowers/specs/`.
Plano de implementação em `docs/superpowers/plans/`.

## Como rodar e testar

- Backend: `cd klok-api` e `npm test`. Hoje são 99 testes. Exige Node 22.5 ou mais
  novo por causa do `node:sqlite`. Se o Node do sistema for antigo, use
  `mise use node@22` antes.
- App: `npm run typecheck`. Rodar com `npx expo start` ou `npx expo run:android`.
- Depois de mudar o backend, reiniciar o processo da API.

## Convenções

- Responder em português (PT-BR), tom direto.
- Em texto gerado (comentários, docs, mensagens de commit), não usar hífen nem
  travessão. Preferir vírgulas, dois pontos ou frases curtas.
- Antes de usar qualquer biblioteca ou recurso, conferir se está atual e não foi
  descontinuado.

## Pendências conhecidas (issues abertas)

- #8: prints do app no README.
- #31: multiempresa parte 2, autocadastro com pedido, aprovação e aviso.
- #32: multiempresa parte 3, suporte e resumo no painel.
- #20: limpeza menor (console.log, engines, .nvmrc, arquivos .db fora do git).

## Programa de trabalho em andamento

Ordem aprovada, cada bloco com seu design e seu plano.

- A. Rate limit por endpoint (#14). Feito no PR #21, issue fechada.
- B. Dependências e headers (#15). Feito no PR #22, issue fechada.
- C. Multiempresa parte 1: catálogo, banco por empresa, admin e painel básico
  (#30). Implementada na branch `feat/empresas-parte-1`, com o plano em
  `docs/superpowers/plans/2026-11-02-empresas-parte-1.md` e o PR #34 aberto com
  a CI verde. O login por empresa entrou no app e o autocadastro ficou fechado (403).
- D. Multiempresa parte 2: pedido de funcionário com aprovação, aviso no app e
  email (#19, reaberta como #31). Design original em
  `docs/superpowers/specs/2026-10-13-pedido-funcionario-aprovacao-design.md`,
  adaptado ao banco por empresa.
- E. Multiempresa parte 3: suporte e resumo no painel (#32), com funcionários,
  coordenadores, pontos, pedidos e backup.
- F. Screenshots e README (#8).
- G. Limpeza menor (console.log, engines, .nvmrc, arquivos .db fora do git) (#20).
