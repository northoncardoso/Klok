# Klok

Aplicativo React Native / Expo de gestão de funcionários com **batida de ponto**.

- Login por **usuário/senha** (local) ou **Entrar com Google** (OAuth2).
- Perfil **mestre** controla os funcionários (cadastra, edita, exclui e vê os pontos de todos).
- Funcionário **bate o ponto** e vê o próprio histórico.
- Todo dado fica centralizado em um **backend Node.js/Express** com SQLite (nativo do Node, sem dependência extra).

> Removido o Keycloak. O único provedor de login social é o **Google OAuth2**.
> O slug do EAS segue `myreactjobs` por ser o identificador do projeto EAS que
> concentra as credenciais e o keystore; o nome do app e o pacote Android já são
> **Klok** (`com.northoncardoso.klok`).

---

## Arquitetura

```
App React Native (Expo)
        │  HTTPS/JSON (JWT Bearer)
        ▼
Backend Node.js/Express (klok-api/)
        │
        ▼
SQLite (nativo node:sqlite)  →  funcionarios | usuarios | pontos
```

- **App**: Expo SDK 57, `@react-native-google-signin/google-signin`, `expo-secure-store` (sessão persistida de forma segura).
- **Backend**: Express, JWT assinado com `jose`, verificação do ID token do Google com `google-auth-library`, banco com `node:sqlite` (zero migração nativa).

---

## Como rodar

### 1. Backend

```bash
cd klok-api
cp .env.example .env      # ajuste o JWT_SECRET se quiser
npm install
npm start                 # sobe na porta 3000
```

Na primeira execução é criado o usuário **mestre** com login `mestre` / senha `1234`.

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

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| POST | `/api/auth/registrar` | público | Cadastra funcionário local |
| POST | `/api/auth/login` | público | Login local → JWT |
| POST | `/api/auth/google` | público | Login Google (envia `idToken`) → JWT |
| GET | `/api/auth/eu` | logado | Dados do usuário |
| GET | `/api/funcionarios` | mestre | Lista funcionários |
| POST | `/api/funcionarios` | mestre | Cria funcionário |
| PUT | `/api/funcionarios/:id` | mestre | Edita funcionário |
| DELETE | `/api/funcionarios/:id` | mestre | Exclui funcionário |
| POST | `/api/pontos` | logado | Bate o ponto |
| GET | `/api/pontos/meus` | logado | Meu histórico |
| GET | `/api/pontos` | mestre | Pontos de todos |

Autenticação: header `Authorization: Bearer <token>`.

---

## Variáveis de ambiente

Raiz (app):
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB` — Client ID web do Google (obrigatório p/ idToken)
- `EXPO_PUBLIC_API_URL` — URL do backend

`klok-api/.env`:
- `PORT`
- `JWT_SECRET` — segredo para assinar os tokens
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB` — mesma audience usada para validar o token
