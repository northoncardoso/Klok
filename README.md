# Klok

Aplicativo React Native / Expo de gestão de funcionários com **batida de ponto**.

- Login por **empresa, usuário e senha** (local) ou **Entrar com Google** (OAuth2).
- Cada **empresa tem o próprio banco SQLite**, com coordenadores, funcionários e pontos isolados. Um catálogo central guarda quais empresas existem e quem é admin.
- O **admin da KLOK** cria a empresa e o primeiro coordenador dela pelo painel web em `/admin`.
- Perfil **coordenador** controla os funcionários (cadastra, edita, exclui e vê os
  pontos de todos) e pode criar outros coordenadores na tela de Coordenadores.
- Funcionário **bate o ponto** e vê o próprio histórico.
- Todo dado fica em um **backend Node.js/Express** com SQLite (nativo do Node, sem dependência extra).

> Nesta entrega o **autocadastro de funcionário está fechado**: é o coordenador
> quem cria o acesso. O pedido com aprovação e aviso ao coordenador entra na
> parte 2, junto com o código da empresa.

> Removido o Keycloak. O único provedor de login social é o **Google OAuth2**.
> O slug do EAS segue `myreactjobs` por ser o identificador do projeto EAS que
> concentra as credenciais e o keystore; o nome do app e o pacote Android já são
> **Klok** (`com.northoncardoso.klok`).

---

## Arquitetura

```
App React Native (Expo)                 Painel web do admin (/admin)
        │  HTTPS/JSON (JWT Bearer)              │
        ▼                                       ▼
Backend Node.js/Express (klok-api/)
        │
        ├── catalogo.db  →  empresas | admins
        │
        └── dados/ACME.db, dados/KLOK.db, ...
                →  usuarios | funcionarios | pontos
```

- **App**: Expo SDK 57, `@react-native-google-signin/google-signin`, `expo-secure-store` (sessão persistida de forma segura).
- **Backend**: Express, JWT assinado com `jose` (audience separada para empresa e admin), verificação do ID token do Google com `google-auth-library`, banco com `node:sqlite` (zero migração nativa).
- **Painel**: HTML, CSS e JS puros em `klok-api/admin/painel/`, sem build e sem framework.

---

## Como rodar

### 1. Backend

```bash
cd klok-api
cp .env.example .env      # ajuste o JWT_SECRET
npm install
npm run admin:criar       # cria o admin da KLOK, com usuário e senha
npm start                 # sobe na porta 3000
```

O boot exige apenas o `JWT_SECRET`. Os dados ficam em `klok-api/dados/` (ou no
caminho de `DADOS_DIR`), com um `catalogo.db` para as empresas e os admins e um
`CODIGO.db` por empresa. Os bancos nascem vazios: não existe coordenador semeado
nem senha em `.env`.

Para trocar a senha de um admin existente:

```bash
npm run admin:criar -- --redefinir
```

O painel fica em `http://localhost:3000/admin`.

> Antes era usada a variável `SENHA_MESTRE`, que semeava um usuário `mestre` com
> senha conhecida no `.env`. Isso foi removido: agora o acesso é criado por
> comando ou pelo painel, e a senha nunca passa por arquivo de configuração.

### 2. App (Expo)

```bash
npm install
npx expo start
```

> Requer **development build** (Expo Go não suporta Google Sign-In). Se usar
> emulador Android, rode `npx expo run:android`.

O app aponta para o backend via `EXPO_PUBLIC_API_URL` (padrão `http://10.0.2.2:3000`
no emulador Android). Confira o `.env` da raiz.

---

## Login com Google (configuração no Google Cloud)

O botão "Entrar com Google" usa o `@react-native-google-signin/google-signin`.
O app é identificado pelo pacote Android `com.northoncardoso.klok`, e o Google
valida cada build pelo SHA-1 do certificado de assinatura. Como o console só
aceita um SHA-1 por client, cria-se um client Android por keystore.

SHA-1 de cada keystore deste projeto:

| Keystore | Uso | SHA-1 |
|----------|-----|-------|
| EAS (build para celular) | `eas build` | `F7:05:C8:15:46:8C:DF:72:8F:8F:0F:FE:91:BF:42:C9:7A:53:57:4D` |
| Debug (emulador / `expo run:android`) | `~/.android/debug.keystore` | `B8:4A:77:3A:53:EE:7C:19:CA:E6:E8:5B:6E:03:71:A1:93:88:1C:F9` |

Passos no Console do Google (https://console.cloud.google.com):
1. Abra seu projeto (`818387140252`).
2. Vá em **APIs e serviços → Credenciais → ID do cliente OAuth 2.0**.
3. Client **Web** (`818387140252-0drv1qdg8pjpqnts804604iv1alh56bk`): não mexa.
   É ele que gera o token (webClientId) e serve de audience no backend.
4. Crie um client **Android** com pacote `com.northoncardoso.klok` e o SHA-1
   `F7:05:C8:...` da tabela acima. É o client dos builds gerados por `eas build`.
5. Se quiser login Google também no emulador, crie um segundo client **Android**
   com o mesmo pacote `com.northoncardoso.klok` e o SHA-1 `B8:4A:...`.
6. Salve. Os client IDs Android gerados não precisam ir para o código: a
   biblioteca usa apenas o webClientId.

Para conferir o SHA-1 do keystore do EAS a qualquer momento:
```bash
npx eas-cli credentials -p android
```

Para o keystore local de debug:
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```

> Se você já instalou uma versão com o pacote antigo
> `com.northoncardoso.myReactJobs`, desinstale antes de instalar o novo build.
> Para build de produção (APK/AAB via EAS), o SHA-1 é o do keystore de
> produção, que você deve registrar em um client Android próprio.

---

## API

Todas as rotas de empresa recebem `empresa` no corpo ou na query, menos as que
usam o token, que já carrega a empresa. O token de empresa (`aud: klok-empresa`)
não abre rota de admin, e o de admin (`aud: klok-admin`) não abre rota de empresa.

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| POST | `/api/admin/login` | público | Login do admin → JWT de admin |
| GET | `/api/admin/empresas` | admin | Lista empresas |
| POST | `/api/admin/empresas` | admin | Cria empresa e o banco dela |
| PATCH | `/api/admin/empresas/:codigo` | admin | Renomeia, ativa ou desativa |
| POST | `/api/admin/empresas/:codigo/coordenador` | admin | Cria o primeiro coordenador |
| POST | `/api/auth/login` | público | Login local na empresa → JWT |
| POST | `/api/auth/google` | público | Login Google na empresa → JWT |
| POST | `/api/auth/registrar` | público | Fechado nesta entrega, responde 403 |
| GET | `/api/auth/eu` | logado | Dados do usuário |
| PUT | `/api/auth/eu` | logado | Atualiza os próprios dados |
| PUT | `/api/auth/senha` | logado | Troca a senha |
| POST | `/api/auth/esqueci-senha` | público | Envia o link de recuperação |
| POST | `/api/auth/redefinir-senha` | público | Define a nova senha |
| GET | `/api/coordenadores` | coordenador | Lista os coordenadores |
| POST | `/api/coordenadores` | coordenador | Cadastra outro coordenador |
| GET | `/api/funcionarios` | coordenador | Lista funcionários |
| POST | `/api/funcionarios` | coordenador | Cria funcionário |
| PUT | `/api/funcionarios/:id` | coordenador | Edita funcionário |
| DELETE | `/api/funcionarios/:id` | coordenador | Exclui funcionário |
| POST | `/api/pontos` | logado | Bate o ponto |
| GET | `/api/pontos/meus` | logado | Meu histórico |
| GET | `/api/pontos` | coordenador | Pontos de todos |

Autenticação: header `Authorization: Bearer <token>`.

---

## Variáveis de ambiente

Raiz (app):
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB` — Client ID web do Google (obrigatório p/ idToken)
- `EXPO_PUBLIC_API_URL` — URL do backend

`klok-api/.env`:
- `PORT`
- `JWT_SECRET`: segredo para assinar os tokens (obrigatório, sem fallback)
- `DADOS_DIR`: pasta dos bancos, padrão `dados`
- `NODE_ENV`: deixe vazio em desenvolvimento; use `production` ao publicar
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`: mesma audience usada para validar o token
- `URL_BASE`: base pública usada no link de recuperação por email
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_REMETENTE`: envio do email de recuperação

Não existe mais `SENHA_MESTRE`: o admin é criado por `npm run admin:criar`, e o
coordenador, pelo painel do admin. Nenhuma senha fica em arquivo de configuração.

### Segurança

A auditoria do backend, com os problemas encontrados, o que foi corrigido e o que
continua em aberto, está em [`docs/SEGURANCA.md`](docs/SEGURANCA.md). A suíte
`klok-api/test/ataques.test.js` cobre cada correção, então rodar `npm test` no
backend verifica que nada regrediu.

Duas coisas obrigatórias antes de expor a API fora da sua rede local:

1. `NODE_ENV=production`. Com isso o link de recuperação de senha deixa de ser
   devolvido na resposta da API e o boot avisa se faltar SMTP. Sem isso, uma
   configuração de SMTP esquecida expõe a redefinição de senha de qualquer conta.
2. HTTPS na frente da API. O token trafega em claro no HTTP puro.

---

## Primeiro acesso: empresa, coordenador e funcionário

1. Crie o admin com `npm run admin:criar`.
2. Abra `http://localhost:3000/admin` e entre.
3. Em **Nova empresa**, informe o código e o nome. O código tem de 2 a 20 letras
   maiúsculas ou números, começando por letra. A empresa nasce com o banco próprio.
4. Na **etapa 2**, crie o usuário coordenador com senha, nome, email e número.
   Se essa etapa falhar, a empresa continua criada e o painel deixa cadastrar o
   coordenador depois.
5. No app, informe o código da empresa, o usuário e a senha.

O código da empresa não diferencia maiúsculas e minúsculas: `acme` vira `ACME`
antes de sair do app. Empresa desativada não deixa ninguém entrar, mesmo que o
banco dela já esteja aberto em cache.

O funcionário é criado pelo coordenador na tela de Funcionários. O autocadastro
está fechado nesta entrega. Na parte 2 ele passa a ser um pedido pendente, com o
código da empresa e a aprovação de um coordenador.
