# ADR 0001: Registrar as decisões de arquitetura em ADRs

Status: aceito
Data: 2026-11-02

## Contexto

O Klok já tomou várias decisões estruturais sem registro: autenticação local com
SQLite, login Google, recuperação de senha, rate limit por endpoint e, agora,
empresas com banco próprio. Sem registro, o motivo de cada escolha se perde e a
mesma discussão volta.

## Decisão

Registrar cada decisão estrutural em um ADR (Architecture Decision Record), no
formato enxuto de Michael Nygard: título, status, contexto, decisão e
consequências. Os arquivos ficam em `docs/adr/`, numerados em ordem.

Um ADR aceito não é reescrito. Quando a decisão muda, cria-se um novo ADR que
substitui o anterior, e o status do antigo vira "substituído pelo ADR N".

## Consequências

- O racional fica visível para quem chega depois, incluindo o próprio autor.
- Exige disciplina de escrever um ADR a cada decisão relevante.
- Serve como material de estudo e de portfólio.
