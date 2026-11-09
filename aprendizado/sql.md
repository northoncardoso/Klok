# SQL no Klok

Guia curto para praticar SQL usando os dados reais do app.

## Abrir o banco

```bash
cd ~/dev/projetos/klok/klok-api
npm run semear
KLOK_DB=dados/ACME.db npm run sql
```

Isso abre o `sqlite3` no banco da empresa ACME com cabeçalho e tabelas desenhadas.
Para rodar uma consulta só e voltar:

```bash
KLOK_DB=dados/ACME.db npm run sql -- "SELECT COUNT(*) FROM pontos;"
KLOK_DB=dados/ACME.db npm run sql -- ~/dev/estudos/sql-klok/exercicios/pratica-multiempresa.sql
```

Para abrir o catálogo de empresas, troque o caminho para `dados/catalogo.db`.

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

Depois do multiempresa, o Klok não usa mais um banco único. Os arquivos ficam em
`klok-api/dados/`:

- `catalogo.db`: lista de empresas e admins da KLOK.
- `ACME.db`, `GLOBEX.db`, `INITECH.db`, `UMBRELLA.db`: um banco por empresa.

Os arquivos `klok-api/klok.db` e `klok.db` na raiz são do modelo antigo, de uma
empresa só. Servem para consultar o passado, não para a prática nova.

Rode `npm run semear` uma vez para criar os dados de exemplo. A senha de todos os
usuários é `senha123`, e o admin do painel é `admin` com senha `admin12345`.
Cada empresa tem coordenadores, funcionários, pontos de 25 dias úteis e
solicitações pendentes, aprovadas e recusadas.

O banco está em modo WAL. Ler com a API rodando não tem problema. Escrever
pode dar `database is locked`, então pare a API antes de alterar dados.

## Praticar sem medo

Copie o banco e aponte o script para a cópia:

```bash
cd klok-api
sqlite3 dados/ACME.db ".backup /tmp/pratica.db"
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

Os 30 exercícios estão em `~/dev/estudos/sql-klok/exercicios/pratica-multiempresa.sql`,
com dicas, e o gabarito comentado está em
`~/dev/estudos/sql-klok/exercicios/pratica-gabarito.sql`. Comece pelo nível 1 e
avance sem olhar a resposta. A lição em HTML fica em
`~/dev/estudos/sql-klok/lessons/0001-dez-consultas-sql.html`.

Para treinar com os dados antigos, ainda existe `sql/consultas.sql`, que usa o
`klok-api/klok.db`.

## Depois dos 30 exercícios

1. Mude a consulta 4 do gabarito para trazer também o email do funcionário.
2. Faça uma consulta que traga só as batidas de um funcionário pelo nome.
3. Crie uma `VIEW` chamada `batidas_do_dia` e consulte ela depois.
4. Crie o índice `idx_pontos_funcionario_data` em `(funcionarioId, dataHora)` e
   rode o `EXPLAIN QUERY PLAN` de novo para ver a diferença.
5. Escreva um `BEGIN` com dois `INSERT` e um `ROLLBACK`, depois repita com
   `COMMIT`, lendo entre um passo e outro. Transação é o que o `apagarFuncionario`
   usa em `db.js`.
