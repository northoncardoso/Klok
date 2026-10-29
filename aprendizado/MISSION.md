# Missão: dominar o fluxo de recuperação e autenticação do Klok

## Why
O Devorthon implementou hoje o fluxo de "esqueci minha senha" e o menu Usuário no Klok. Entender essas alterações por dentro permite manter, defender e explicar o próprio código em entrevistas e evoluir o app sem medo. O objetivo maior segue sendo a primeira vaga em React Native.

## Success looks like
- Explicar de memória cada etapa do fluxo (email, token, deep link, deslogamento)
- Justificar cada escolha de segurança (hash, expiração, uso único, resposta genérica)
- Aplicar o mesmo padrão em outro projeto sem copiar o código
- Navegar pelo código do Klok usando os nomes reais de arquivos e funções

## Constraints
- Sessões curtas e práticas, foco em implementação
- Explicações com citações nos arquivos reais do projeto, não teoria solta
- Texto em português, sem hífen nem travessão no conteúdo gerado (preferência do usuário)

## Out of scope
- OAuth do Google em detalhes (fica para outra missão)
- Deploy em produção (Render/Railway)
- React Navigation em profundidade