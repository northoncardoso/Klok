import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

// Necessário para o fluxo de autenticação via navegador funcionar corretamente
// e fechar automaticamente ao retornar para o app.
WebBrowser.maybeCompleteAuthSession();

const KEYCLOAK_URL = process.env.EXPO_PUBLIC_KEYCLOAK_URL;
const KEYCLOAK_REALM = process.env.EXPO_PUBLIC_KEYCLOAK_REALM;
const KEYCLOAK_CLIENT_ID = process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID;

export const discovery = {
    authorizationEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`,
    tokenEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
    revocationEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/revoke`,
    userInfoEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
    endSessionEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`,
};

export const clientId = KEYCLOAK_CLIENT_ID;

// O redirectUri respeita o "scheme" definido em app.json ("myreactjobs").
// Esse mesmo valor precisa estar cadastrado em "Valid redirect URIs" no client do Keycloak.
export const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'myreactjobs',
});