# Comentários profissionais no Klok: plano de implementação

> **Para quem executa:** usar `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` e seguir tarefa a tarefa. Os passos têm caixa de
> seleção (`- [ ]`) para acompanhamento.

**Objetivo:** documentar cada função do app e da API do Klok com JSDoc em
português, sem alterar uma linha de código.

**Arquitetura:** os arquivos são independentes entre si, então o trabalho é
dividido em oito lotes por assunto (núcleo da API, banco, controladores e rotas,
admin, painel, scripts, app e telas). Cada lote recebe o mesmo guia de estilo.

**Stack:** Node.js 22 com `node:sqlite` e Express no backend, React Native com
Expo e TypeScript no app.

**Spec:** `docs/superpowers/specs/2026-11-15-comentarios-design.md`

## Restrições globais

- Só comentário. Nenhuma mudança de código, de string, de import, de
  indentação, de quebra de linha ou de nome.
- Os comentários existentes ficam; novos comentários se somam a eles.
- Português, tom direto, sem hífen nem travessão. Vírgula, dois pontos ou frase
  curta no lugar.
- Fora do escopo: `klok-api/test/`, `android/`, `docs/`, `node_modules/`.
- Working tree já tem mudanças não commitadas de antes (`api.ts`,
  `klok-api/controladores/auth.js`, `klok-api/test/auth.test.js`,
  `klok-api/test/solicitacoes.test.js`, `package.json`, `AGENTS.md`). Não
  reverter, não commitar junto.
- Ao terminar cada lote, rodar `cd klok-api && npm test` e, para lotes do app,
  `npm run typecheck` na raiz.

## Guia de estilo dos comentários

Formato, com bloco JSDoc acima da função e indentação igual à da função:

```js
/**
 * Valida usuário e senha e devolve o token da empresa.
 *
 * A senha é conferida antes de qualquer checagem de pedido pendente, para não
 * revelar se o usuário existe.
 *
 * @param {object} banco Banco da empresa aberto pela requisição.
 * @param {string} usuario Usuário digitado, já normalizado.
 * @param {string} senha Senha em texto puro.
 * @returns {Promise<string>} Token JWT válido por 12 horas.
 */
```

Regras:

1. Primeira linha: o que a função faz, no infinitivo, sem "esta função" e sem
   repetir o nome.
2. Depois, se preciso, um parágrafo curto com a regra de negócio, o efeito
   colateral (email, auditoria, escrita no banco, código HTTP) ou o motivo de
   uma escolha estranha. Pular quando a linha 1 já diz tudo.
3. `@param` só nos parâmetros cujo significado ou formato não é óbvio.
4. `@returns` quando o retorno não é óbvio, incluindo `null`, `undefined` e
   códigos de erro.
5. Tipo em JS puro: usar `{object}`, `{string}`, `{number}`, `{boolean}`,
   `{string[]}` e `{Promise<...>}`, nunca tipo de TypeScript.
6. Função interna trivial (soma, formatação, comparação) fica com uma linha só,
   sem `@param` nem `@returns`.
7. Controlador e rota: citar o código HTTP de sucesso e de falha principal, e
   se exige coordenador.
8. Componente React: descrever o que a tela resolve e o papel das props.
9. Nunca escrever "TODO" nem "FIXME", o escopo não inclui resolver pendências.

## Review Focus

- Comentário que promete o que o código não faz: `aprovar` diz enviar email,
  mas o envio é condicional ao endereço existir.
- Código alterado por acidente ao inserir comentário, o que a comparação com o
  git pega.
- Hífen ou travessão escapando no texto, o que viola a convenção do repo.
- JSDoc com tipo de TypeScript em arquivo `.js`.
- Arquivo listado no lote que ficou sem comentário por ter sido esquecido.

---

### Tarefa 1: núcleo da API

**Arquivos:** `klok-api/app.js`, `klok-api/server.js`, `klok-api/senha.js`,
`klok-api/validacao.js`, `klok-api/middlewares.js`, `klok-api/constantes.js`,
`klok-api/avisos.js`, `klok-api/email.js`, `klok-api/servicos/solicitacoes.js`

**Interfaces:** nenhuma alteração de assinatura.

- [ ] Comentar todas as funções dos nove arquivos seguindo o guia de estilo.
- [ ] Conferir que só houve inserção: `git diff --stat` mostra apenas adições
  nesses arquivos.
- [ ] Rodar `cd klok-api && npm test`, suíte verde.

### Tarefa 2: banco e migrações

**Arquivos:** `klok-api/db.js`

**Interfaces:** nenhuma alteração de assinatura. Cada migração de `MIGRACOES`
já tem nome descritivo, então o JSDoc fica nas funções.

- [ ] Comentar todas as funções, citando a tabela tocada e, quando houver, a
  versão da migração e o motivo do `PRAGMA user_version` ou `schema_migrations`.
- [ ] Rodar `cd klok-api && npm test`, suíte verde.

### Tarefa 3: controladores e rotas

**Arquivos:** `klok-api/controladores/auth.js`,
`klok-api/controladores/coordenadores.js`,
`klok-api/controladores/funcionarios.js`,
`klok-api/controladores/pontos.js`,
`klok-api/controladores/solicitacoes.js`, `klok-api/rotas/auth.js`,
`klok-api/rotas/coordenadores.js`, `klok-api/rotas/funcionarios.js`,
`klok-api/rotas/pontos.js`, `klok-api/rotas/solicitacoes.js`

**Interfaces:** nenhuma alteração de assinatura.

- [ ] Comentar todas as funções, citando código HTTP de sucesso e de falha e se
  a rota exige coordenador.
- [ ] Rodar `cd klok-api && npm test`, suíte verde.

### Tarefa 4: admin do catálogo

**Arquivos:** `klok-api/admin/catalogo.js`, `klok-api/admin/consultas.js`,
`klok-api/admin/escritas.js`, `klok-api/admin/exportacoes.js`,
`klok-api/admin/gerenciador-bancos.js`, `klok-api/admin/sessao.js`,
`klok-api/admin/validacao-painel.js`, `klok-api/admin/controladores.js`,
`klok-api/admin/rotas.js`, `klok-api/admin/criar-admin.js`

**Interfaces:** nenhuma alteração de assinatura.

- [ ] Comentar todas as funções, deixando claro quando a função só libera
  empresa ativa e quando abre empresa desativada de propósito.
- [ ] Rodar `cd klok-api && npm test`, suíte verde.

### Tarefa 5: painel

**Arquivos:** `klok-api/admin/painel/admin.js`

**Interfaces:** nenhuma alteração de assinatura.

- [ ] Comentar todas as funções, separando as que renderizam HTML das que
  respondem JSON, e citando o CSRF e a auditoria onde aparecem.
- [ ] Rodar `cd klok-api && npm test`, suíte verde.

### Tarefa 6: scripts

**Arquivos:** `klok-api/scripts/semear-dados.js`, `klok-api/scripts/sql.js`,
`klok-api/scripts/criar-admin.js`

**Interfaces:** nenhuma alteração de assinatura.

- [ ] Comentar todas as funções, deixando claro o que cada script cria e o que
  ele apaga.
- [ ] Rodar `cd klok-api && npm test`, suíte verde.

### Tarefa 7: app, base

**Arquivos:** `api.ts`, `App.tsx`, `types.ts`, `estilos.ts`,
`InputSenha.tsx`, `CardFuncionario.tsx`

**Interfaces:** nenhuma alteração de assinatura nem de tipo.

- [ ] Comentar todas as funções e componentes. Em `api.ts`, citar o endpoint e
  o que a função grava no `SecureStore`. Em `types.ts` e `estilos.ts`, só
  comentar o que existir de função.
- [ ] Rodar `npm run typecheck` na raiz, limpo.

### Tarefa 8: telas

**Arquivos:** `screens/CoordenadoresScreen.tsx`,
`screens/FormularioRecuperarSenha.tsx`, `screens/FuncionariosScreen.tsx`,
`screens/HomeScreen.tsx`, `screens/PontoScreen.tsx`,
`screens/RedefinirSenhaScreen.tsx`, `screens/SolicitacoesScreen.tsx`,
`screens/UsuarioScreen.tsx`

**Interfaces:** nenhuma alteração de assinatura nem de tipo.

- [ ] Comentar o componente e os handlers com efeito colateral, citando o que
  cada ação faz na API e o que aparece para o usuário quando falha.
- [ ] Rodar `npm run typecheck` na raiz, limpo.

### Tarefa 9: verificação final

- [ ] `cd klok-api && npm test` verde.
- [ ] `npm run typecheck` limpo.
- [ ] Script de comparação mostra que o código sem comentários é idêntico ao do
  `HEAD` em todos os arquivos tocados.
- [ ] `grep` por hífen e travessão nos comentários novos retorna vazio.
- [ ] `git diff --stat` só tem os arquivos do escopo, mais os docs do plano e do
  design.
