# SQL no Klok

Guia curto para praticar SQL usando os dados reais do app.

## Abrir o banco

```bash
cd ~/klok/klok-api
npm run sql
```

Isso abre o `sqlite3` no banco `klok-api/klok.db` com cabeçalho e tabelas desenhadas.
Para rodar uma consulta só e voltar:

```bash
npm run sql -- "SELECT COUNT(*) FROM pontos;"
npm run sql -- sql/consultas.sql
```

## Comandos do modo interativo

| Comando | Para que serve |
| --- | --- |
| `.tables` | lista as tabelas |
| `.schema pontos` | mostra o CREATE TABLE de pontos |
| `.indexes pontos` | lista os índices |
| `.mode box` e `.mode list` | troca o formato do resultado |
| `.headers on` | liga o cabeçalho das colunas |
| `.quit` | sai |

Toda linha que não começa com ponto é SQL. Precisa terminar com `;`.

## O banco certo

Existem dois arquivos `klok.db` no projeto:

- `klok-api/klok.db`: é o que a API usa. É aqui que você trabalha.
- `klok.db` na raiz: cópia antiga, sem a tabela `recuperacao_senha`. Ignore.

O banco está em modo WAL. Ler com a API rodando não tem problema. Escrever
pode dar `database is locked`, então pare a API antes de alterar dados.

## Praticar sem medo

Copie o banco e aponte o script para a cópia:

```bash
sqlite3 klok-api/klok.db ".backup /tmp/pratica.db"
cd klok-api
KLOK_DB=/tmp/pratica.db npm run sql
```

Assim você pode fazer `INSERT`, `UPDATE` e `DELETE` à vontade sem sujar o app.

## Ordem em que o SQLite pensa

Quem escreve lê de cima para baixo, mas o banco executa nesta ordem:

1. `FROM` escolhe as tabelas
2. `JOIN` liga as tabelas
3. `WHERE` filtra as linhas
4. `GROUP BY` junta as linhas em grupos
5. `HAVING` filtra os grupos
6. `SELECT` escolhe as colunas
7. `ORDER BY` ordena
8. `LIMIT` corta a quantidade

Isso explica duas coisas: por que o apelido criado no `SELECT` não funciona no
`WHERE` (ele ainda não existe nessa etapa) e por que filtrar grupo é `HAVING`,
não `WHERE`.

## Detalhes deste projeto

- `pontos.dataHora` está em UTC, gravado por `new Date().toISOString()`. Para ver
  o horário de Brasília, use `dataHora, '-3 hours'`. As consultas prontas em
  `klok-api/sql/consultas.sql` já fazem isso.
- A coluna se chama `funcionarioId`, em camelCase. No SQLite funciona sem aspas.
  No Postgres, nome sem aspas vira minúsculo, então seria `"funcionarioId"`.
- O tipo de ponto hoje é sempre `batida` (`TIPOS_PONTO` em `constantes.js`).
- A tabela `pontos` não tem índice por funcionário ou data. O `EXPLAIN QUERY PLAN`
  da consulta 12 mostra um `SCAN`, ou seja, o banco lê a tabela inteira. Isso é
  bom para treinar índice depois.

## Exercícios na ordem

1. Rode `npm run sql -- sql/consultas.sql` e confira cada resultado.
2. Mude a consulta 3 para trazer também o email do funcionário.
3. Faça uma consulta que traga só as batidas de um funcionário pelo nome.
4. Crie uma `VIEW` chamada `batidas_do_dia` e consulte ela depois.
5. Crie o índice `idx_pontos_funcionario_data` em `(funcionarioId, dataHora)` e
   rode o `EXPLAIN QUERY PLAN` de novo para ver a diferença.
6. Escreva um `BEGIN` com dois `INSERT` e um `ROLLBACK`, depois repita com
   `COMMIT`, lendo entre um passo e outro. Transação é o que o `apagarFuncionario`
   usa em `db.js`.
