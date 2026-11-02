# ADR 0003: Admin da KLOK em painel web, fora do app

Status: aceito
Data: 2026-11-02

## Contexto

Quem cria empresa, cadastra o primeiro coordenador e dá suporte aos bancos é a
KLOK. Essa pessoa precisa de acesso a todas as empresas, o que não pode existir
no app do funcionário.

As opções eram uma tela de admin dentro do app React Native ou um painel web
servido pela própria API.

## Decisão

O admin usa um painel web em `/admin`, com HTML, CSS e JavaScript sem build,
servido pelo Express. O app do funcionário não ganha tela nem login de admin.

O admin tem login próprio, criado por `npm run admin:criar`, e sessão separada da
sessão de empresa.

## Consequências

- O binário do app não carrega código de administração.
- O painel roda no computador, que é onde a operação de suporte acontece.
- Existe uma segunda interface para manter, ainda que pequena.
- Sem framework e sem build, o painel fica simples de subir e de entender, mas
  cresce pior se ganhar muitas telas.
- O token do painel fica em `sessionStorage` nesta primeira versão. Cookie
  `httpOnly` com proteção CSRF é o próximo passo se o painel crescer.
