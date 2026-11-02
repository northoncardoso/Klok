-- Consultas de exemplo sobre a tabela pontos.
-- Rode tudo com: npm run sql -- sql/consultas.sql
-- Ou copie uma consulta por vez no modo interativo (npm run sql).
--
-- Duas coisas específicas deste banco:
-- 1. dataHora é gravado em UTC (new Date().toISOString()), então o horário de
--    Brasília aparece com o modificador '-3 hours'.
-- 2. O nome da coluna é funcionarioId, camelCase. No SQLite isso funciona sem
--    aspas. No Postgres precisaria de "funcionarioId", porque lá o nome sem
--    aspas vira minúsculo.

-- 1. Tudo que existe na tabela.
--    SELECT * é bom para espiar, ruim para código de produção: traz colunas
--    que você não precisa e quebra quando o esquema muda.
SELECT * FROM pontos;

-- 2. Batidas de hoje no horário de Brasília.
--    date() corta a parte do horário, então a comparação é por dia.
SELECT *
FROM pontos
WHERE date(dataHora, '-3 hours') = date('now', '-3 hours')
ORDER BY dataHora DESC;

-- 3. Nome do funcionário junto com cada batida (JOIN).
--    JOIN liga duas tabelas pela chave estrangeira pontos.funcionarioId.
SELECT f.nome AS funcionario,
       strftime('%d/%m/%Y %H:%M', p.dataHora, '-3 hours') AS quando
FROM pontos p
JOIN funcionarios f ON f.id = p.funcionarioId
ORDER BY p.dataHora DESC;

-- 4. Quantas batidas cada funcionário tem (GROUP BY + COUNT).
--    GROUP BY junta as linhas por funcionário; COUNT conta as linhas de cada
--    grupo. Toda coluna do SELECT precisa estar no GROUP BY ou dentro de uma
--    função de agregação, como COUNT, MIN, MAX, SUM.
SELECT f.nome AS funcionario,
       COUNT(*) AS batidas
FROM pontos p
JOIN funcionarios f ON f.id = p.funcionarioId
GROUP BY f.id, f.nome
ORDER BY batidas DESC;

-- 5. Primeira e última batida de cada dia (MIN e MAX).
--    MIN e MAX aqui são de texto, e isso funciona porque o ISO 8601
--    (2026-11-02T14:30:00.000Z) ordena igual ao tempo quando é texto.
SELECT f.nome AS funcionario,
       date(p.dataHora, '-3 hours') AS dia,
       strftime('%H:%M', MIN(p.dataHora), '-3 hours') AS entrada,
       strftime('%H:%M', MAX(p.dataHora), '-3 hours') AS saida
FROM pontos p
JOIN funcionarios f ON f.id = p.funcionarioId
GROUP BY f.id, f.nome, dia
ORDER BY dia DESC, f.nome;

-- 6. Jornada em horas, do primeiro ao último registro do dia.
--    julianday transforma o texto em número de dias, por isso multiplicamos
--    por 24 para ter horas. ROUND(..., 2) deixa duas casas decimais.
SELECT f.nome AS funcionario,
       date(p.dataHora, '-3 hours') AS dia,
       ROUND((julianday(MAX(p.dataHora)) - julianday(MIN(p.dataHora))) * 24, 2) AS horas
FROM pontos p
JOIN funcionarios f ON f.id = p.funcionarioId
GROUP BY f.id, f.nome, dia
ORDER BY dia DESC, f.nome;

-- 7. Funcionários que não bateram ponto hoje (LEFT JOIN).
--    LEFT JOIN mantém todos os funcionários, mesmo sem ponto. A condição do
--    dia fica no ON, não no WHERE: no WHERE, ela derrubaria as linhas sem
--    correspondência e o resultado viraria um JOIN comum.
SELECT f.id, f.nome
FROM funcionarios f
LEFT JOIN pontos p
       ON p.funcionarioId = f.id
      AND date(p.dataHora, '-3 hours') = date('now', '-3 hours')
WHERE p.id IS NULL
ORDER BY f.nome;

-- 8. Total de batidas por tipo.
SELECT tipo, COUNT(*) AS total
FROM pontos
GROUP BY tipo
ORDER BY total DESC;

-- 9. Últimos 7 dias, contando por dia.
SELECT date(dataHora, '-3 hours') AS dia,
       COUNT(*) AS batidas
FROM pontos
WHERE date(dataHora, '-3 hours') >= date('now', '-7 days')
GROUP BY dia
ORDER BY dia DESC;

-- 10. Batidas repetidas no mesmo minuto, para achar clique duplo.
--     HAVING filtra depois de agrupar, WHERE filtra antes.
SELECT funcionarioId,
       strftime('%Y-%m-%d %H:%M', dataHora, '-3 hours') AS minuto,
       COUNT(*) AS vezes
FROM pontos
GROUP BY funcionarioId, minuto
HAVING COUNT(*) > 1
ORDER BY minuto DESC;

-- 11. O que existe no banco: tabelas, índices e o SQL de criação.
SELECT type, name
FROM sqlite_master
WHERE type IN ('table', 'index')
ORDER BY type, name;

-- 12. Como o SQLite pretende executar a consulta do item 2.
--     É assim que se descobre se falta um índice.
EXPLAIN QUERY PLAN
SELECT * FROM pontos
WHERE date(dataHora, '-3 hours') = date('now', '-3 hours');
