# ADR 0004: Tokens separados por audience, para admin e empresa

Status: aceito
Data: 2026-11-02

## Contexto

O mesmo `JWT_SECRET` assina o token do app. Com o painel de admin, passam a
existir dois tipos de sessão: uma de empresa, que só alcança o banco daquela
empresa, e uma de admin, que alcança o catálogo e qualquer banco.

Se as duas usassem o mesmo formato, um token de empresa poderia ser apresentado
em rota de admin e vice-versa, dependendo só da checagem de middleware.

## Decisão

Os dois tokens usam o mesmo segredo, mas `audience` diferente:

- empresa: `aud: 'klok-empresa'`, com `empresa` no payload
- admin: `aud: 'klok-admin'`, sem `empresa`

`criarAutenticar` exige a audience de empresa e confere o código contra a linha
do usuário. `criarAutenticarAdmin` exige a audience de admin e procura o admin no
catálogo.

## Consequências

- Um token de admin não vale em rota de empresa, e o contrário também não.
- A checagem fica no middleware, antes de qualquer controlador.
- Um segredo vazado ainda compromete os dois mundos. Rotacionar o segredo revoga
  todas as sessões de uma vez.
- Se um dia os dois públicos precisarem de segredos diferentes, a troca é local,
  no ponto que assina e no que verifica.
