# Geolocalização na batida de ponto: especificação de design

Data: 2026-11-24

## Contexto

A batida de ponto é registrada atualmente sem verificação de proximidade com a
sede da empresa e sem qualquer informação sobre o local da batida. Este
documento especifica a inclusão de perímetros geográficos por empresa e o
registro da situação de cada batida em relação a eles.

## Objetivo geral

Permitir que a empresa verifique se a batida ocorreu dentro de um de seus
perímetros, sem armazenar a localização do funcionário e sem impedir o registro
de batidas realizadas fora.

## Objetivos específicos

- Permitir um ou mais perímetros por empresa, cada um correspondente a uma sede,
  com nome e raio.
- Exigir que o aparelho tenha o serviço de localização ativo e a permissão
  concedida para registrar a batida.
- Registrar, no ponto, apenas o resultado da apuração: dentro, fora,
  indeterminado ou sem coordenada.
- Restringir a visualização do resultado ao coordenador.
- Submeter a criação, a alteração e a exclusão de perímetros à aprovação do
  administrador do Klok.
- Impedir a batida quando a empresa não possuir ao menos um perímetro aprovado.

## Não objetivos

- Armazenar a coordenada do funcionário. A coordenada será utilizada na apuração
  e descartada em seguida.
- Exibir a posição dos funcionários em tempo real. Essa funcionalidade exigiria
  monitoramento contínuo, incompatível com a decisão de não armazenar
  localização, e ampliaria as obrigações de privacidade. O painel apresentará
  apenas a quantidade de batidas realizadas dentro de cada perímetro.
- Implementar mapa na primeira versão. A tela inicial será composta por tabela e
  ícones, sem dependência de chave do Google Maps. O mapa será tratado em issue
  específica.
- Impedir a simulação de localização. Aplicativos de localização simulada no
  Android contornam o bloqueio. A especificação assume uso de boa fé.
- Registrar batidas sem conexão com a internet, com fila offline.

## Anti objetivos

- Permitir a batida quando a permissão de localização estiver negada.
- Permitir que o funcionário obtenha o perímetro por meio do histórico, de
  resposta da API ou de mensagem de erro.
- Permitir a exclusão do último perímetro, invalidando a operação da empresa.

## Restrições

- Node 22, `node:sqlite`, migrações versionadas por `PRAGMA user_version`, um
  banco por empresa.
- `expo-location` para obtenção da posição e `@expo/vector-icons` para os ícones.
- Implementação orientada por testes, conforme `AGENTS.md`.
- Textos sem hífen e sem travessão.

## Alternativas consideradas

1. Apuração no servidor, com descarte da coordenada e gravação de campos
   derivados. Alternativa adotada. Mantém o perímetro fora do alcance do
   aplicativo e permite alterar a regra sem atualizar o aplicativo.
2. Apuração no aplicativo, com envio apenas do resultado. Evita o envio da
   coordenada, porém exige que o aplicativo receba a coordenada da empresa,
   contrariando a restrição de não expor o perímetro ao funcionário.
3. Recusa da batida fora do perímetro. Alternativa mais rígida, porém
   inviabiliza o registro por funcionários com sinal de GPS impreciso e não
   impede fraude.
4. Modelo 1:1, com um perímetro por empresa. Reduz o esforço inicial, porém
   exige intervenção do desenvolvedor para cada nova sede e uma migração
   posterior.

## Decisão

Adotada a alternativa 1. As decisões complementares foram definidas em
2026-11-24: apuração no servidor, coordenada não persistida, visualização
restrita ao coordenador, raio de 100 a 150 metros, bloqueio sem serviço de
localização, tentativas adicionais em caso de ausência de sinal, aprovação de
perímetro pelo administrador e primeira versão sem mapa.

## Modelo de dados

Migração 10 no banco da empresa.

Tabela `locais`:

- `id`, `nome`, `latitude`, `longitude`, `raioMetros`
- `criadoEm`, `atualizadoEm`, `removidoEm`
- A exclusão aprovada será lógica, para preservar a referência no histórico.
- Índice único parcial em `nome` para locais ativos.

Tabela `pedidos_local`:

- `id` e `tipo`, com os valores `criar`, `editar` ou `excluir`
- `localId` nulo quando o tipo for `criar`
- `nome`, `latitude`, `longitude` e `raioMetros` propostos
- `status`, com os valores `pendente`, `aprovado` ou `recusado`
- `solicitadoPor`, `solicitadoEm`, `decididoPor`, `decididoEm` e `motivoRecusa`
- No máximo um pedido pendente por local.

Tabela `pontos`, com as colunas adicionais:

- `localId`, nulo quando não houver perímetro ou coordenada
- `dentroPerimetro`, com 1, 0 ou nulo
- `distanciaMetros`, inteiro arredondado
- `precisaoMetros`, inteiro

O valor nulo em `dentroPerimetro` indica resultado não verificável, seja por
ausência de coordenada, seja por precisão insuficiente do sinal.

## Regra de apuração

Será aplicada a fórmula de Haversine entre a coordenada da batida e cada local
ativo. Será considerado o local mais próximo, cujo identificador será gravado em
`localId`. A precisão informada será utilizada como margem:

- dentro, quando `distancia + precisao <= raio`
- fora, quando `distancia - precisao > raio`
- indeterminado, quando o intervalo cruzar a borda

O raio deverá estar entre 100 e 150 metros, com padrão de 150. A coordenada
recebida no corpo de `POST /api/pontos` será utilizada na apuração e descartada.
Nenhum registro de log deverá conter o corpo da requisição.

## Interface da API

- `POST /api/pontos` receberá `latitude`, `longitude` e `precisaoMetros`.
  Responderá 409 quando a empresa não possuir perímetro aprovado. A resposta
  conterá apenas os campos do ponto, nunca o resultado da apuração.
- `GET /api/pontos/meus` projetará as colunas explicitamente, sem
  `dentroPerimetro`, `distanciaMetros`, `precisaoMetros` nem `localId`.
- `GET /api/pontos`, destinado ao coordenador, incluirá o nome do local e a
  situação.
- `GET /api/locais` listará os locais ativos e os pedidos pendentes.
- `POST /api/locais/pedidos` criará pedido de criação, edição ou exclusão.
- As rotas do painel permitirão listar, aprovar e recusar pedidos por empresa.

A aprovação aplicará o pedido em transação. A aprovação de exclusão do último
local ativo responderá 409. A recusa registrará o motivo. O local vigente
permanecerá válido enquanto o pedido estiver pendente.

## Aplicativo

- `expo-location` com precisão alta e tempo limite de 10 segundos por tentativa.
- Serviço desligado, permissão negada e ausência de sinal terão mensagens
  específicas.
- Em caso de ausência de sinal, serão realizadas mais 3 tentativas. Após o
  insucesso, a batida será registrada e o aplicativo informará "ponto registrado
  sem coordenada verificada".
- O serviço desligado abrirá modal com botão para as configurações do sistema.
- Empresa sem perímetro exibirá a mensagem recebida na resposta 409.
- A tela Configuração de Coordenadas estará disponível apenas ao coordenador e
  apresentará tabela de locais com situação, ícone `+` para criação, lápis para
  edição e lixeira vermelha para exclusão da seleção. A criação e a edição
  utilizarão a localização atual de quem estiver na sede, com ajuste manual das
  coordenadas.
- Toda ação da tela gerará pedido pendente. A tabela exibirá a situação do
  pedido.

## Painel administrativo

- Aprovação e recusa de pedidos de perímetro, com exibição dos valores vigentes
  e propostos, autor e data.
- Coluna de local e situação na lista de pontos e no arquivo CSV.
- Nenhuma coordenada de funcionário será exibida, pois não será armazenada.

## Privacidade e LGPD

- A coordenada do funcionário não será persistida.
- A coordenada trafegará até a API, o que caracteriza tratamento de dado pessoal
  e exige aviso de privacidade e base legal definida pela empresa.
- O corpo da requisição não poderá ser registrado em log.
- O resultado armazenado é derivado e não localiza a pessoa fora do contexto da
  empresa.

## Testes

- Haversine com distâncias conhecidas e borda do raio.
- Precisão que cruza a borda gera resultado indeterminado.
- Empresa sem perímetro responde 409.
- Vários locais escolhem o mais próximo.
- `GET /api/pontos/meus` não devolve nenhum campo da apuração.
- Pedido pendente não altera o perímetro vigente.
- Aprovação aplica o pedido em transação.
- Exclusão do último local é recusada.
- Isolamento entre empresas, incluindo pedidos.

## Itens sob responsabilidade da implementação

Nomes dos testes, redação das mensagens, ordem dos campos na tabela e desenho do
modal de criação.

## Sequência de entrega

Blocos em issues separadas, na seguinte ordem: migração, apuração na batida,
pedidos do coordenador, aprovação no painel, GPS no aplicativo e tela de
configuração. O mapa será tratado posteriormente, em issue própria.
