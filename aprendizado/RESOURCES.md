# Recursos: recuperação de senha e autenticação no Klok

## Knowledge

- [OWASP: Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
  Guia oficial do padrão: token único, expiração, uso único e não revelar se a conta existe. Use para validar cada decisão do Klok.
- [OWASP: Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
  Por que senha guardada com salt e hash, e nunca em texto puro.
- [Expo: Linking e deep links](https://docs.expo.dev/linking/into-your-app/)
  Documentação oficial de scheme customizado e abre o app. Use para revisar o klok://.
- [MDN: Custom scheme handling](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/registerProtocolHandler)
  Contexto de por que navegador exige gesto do usuário para schemes customizados.

Fontes primárias (o próprio código do Klok, revisar direto no repo):
- `klok-api/db.js` (migração v3 e funções de recuperação)
- `klok-api/controladores/auth.js` (esqueciSenha, redefinirSenha, paginaRedefinicao, alterarSenha)
- `klok-api/email.js` (nodemailer e fallback de dev)
- `App.tsx` (deep link e deslogamento)
- `screens/RedefinirSenhaScreen.tsx`, `screens/FormularioRecuperarSenha.tsx`, `screens/UsuarioScreen.tsx`

## Wisdom (Comunidades)

- [r/reactnative](https://reddit.com/r/reactnative): problemas reais de deep links e App Links no Android/iOS
- [r/node](https://reddit.com/r/node): debate de autenticação e padrões de backend
- Nota: o usuário prefere não entrar em comunidades por enquanto. Revisitar depois.

## Gaps
- Nada ainda sobre App Links (https) com domínio próprio, que é o caminho de produção