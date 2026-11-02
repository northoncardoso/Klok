# ADR 0002: Um banco SQLite por empresa, com catálogo central

Status: aceito
Data: 2026-11-02

## Contexto

O Klok nasceu com um único `klok.db`. A issue #26 dividiu o produto por empresa:
cada empresa tem os próprios coordenadores e funcionários, e ninguém de fora
alcança esses dados.

Havia duas saídas. Uma coluna `empresa` em um banco único, com filtro em toda
consulta, ou um arquivo de banco por empresa. A primeira é mais simples, mas o
isolamento passa a depender de nenhuma consulta esquecer o `WHERE`. A segunda
separa fisicamente os dados.

## Decisão

Cada empresa tem o próprio arquivo SQLite em `dados/<CODIGO>.db`. Um banco
pequeno, `dados/catalogo.db`, guarda a lista de empresas e os admins da KLOK.

O servidor resolve o arquivo pelo código da empresa que vem no login, e o token
carrega esse código. O isolamento não depende de filtro em consulta.

## Consequências

- Um erro de consulta não atravessa empresa.
- Backup e restauração são por empresa.
- Cada conexão nova roda as migrações no arquivo daquela empresa.
- Consultas entre empresas, como o resumo do painel, precisam abrir cada banco.
- O número de conexões abertas cresce com o número de empresas. Se passar de
  algumas dezenas, entra um cache com limite.
- O banco central é um ponto único de falha para descoberta de empresa, embora
  os dados de cada empresa continuem em arquivo separado.
