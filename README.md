# Klok

Aplicativo React Native / Expo de gestão de funcionários com **batida de ponto**.

- Login por **usuário/senha** (local) ou **Entrar com Google** (OAuth2).
- Perfil **mestre** controla os funcionários (cadastra, edita, exclui e vê os pontos de todos).
- Funcionário **bate o ponto** e vê o próprio histórico.
- Todo dado fica centralizado em um **backend Node.js/Express** com SQLite (nativo do Node, sem dependência extra).

> Removido o Keycloak. O único provedor de login social é o **Google OAuth2**.

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
Para funcionar, o **SHA-1** do certificado de assinatura precisa estar registrado
no client **Android** do seu projeto no Google Cloud Console.

Certificado de debug (emulador/build local):
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```

O SHA-1 do seu debug keystore é:

```
B8:4A:77:3A:53:EE:7C:19:CA:E6:E8:5B:6E:03:71:A1:93:88:1C:F9
```

Passos no Console do Google (https://console.cloud.google.com):
1. Abra seu projeto (`818387140252`).
2. **APIs e serviços → Credenciais → OAuth 2.0 Client IDs**.
3. No client **Android** (`818387140252-tp0tep6oit9dei5444cf5prjgaopgv3m`),
   edite e adicione o **SHA-1** acima.
4. Salve. O login com Google passa a funcionar nos builds de desenvolvimento.

> Para build de produção (APK/AAB via EAS), o SHA-1 é o do **keystore de
> produção**, que você deve adicionar também.

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
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS`
- `EXPO_PUBLIC_API_URL` — URL do backend

`klok-api/.env`:
- `PORT`
- `JWT_SECRET` — segredo para assinar os tokens
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB` — mesma audience usada para validar o token
