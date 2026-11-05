# Email Integration Setup (Gmail & Microsoft 365 / Outlook)

This document describes how to configure Gmail and Microsoft 365 (Outlook) OAuth so
that `Settings > Integrations > E-posta` can connect real mailboxes. Until the
credentials below are set, `isEmailProviderConfigured()` in
`server/services/integrations/email-service.ts` reports the provider as not
configured and the UI shows a setup notice instead of a connect button — this is
expected, not a bug: the app cannot connect a provider it has no OAuth app
registered for.

---

## 1. Shared prerequisites (both providers)

- `NEXT_PUBLIC_SITE_URL` (or `NEXT_PUBLIC_APP_URL`) must be set to the exact
  public origin of the deployment, with no trailing slash (e.g.
  `https://flowsales-ai-six.vercel.app`). Both providers' redirect URIs are
  derived from this value.
- `TOKEN_ENCRYPTION_KEY` must be set to a 32-byte key, either as 64 hex
  characters or as base64. This encrypts stored access/refresh tokens
  (`server/services/integrations/encryption.ts`). Generate one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 2. Microsoft 365 / Outlook (Azure AD / Entra ID)

1. Sign in to the [Azure Portal](https://portal.azure.com/) and open
   **Microsoft Entra ID > App registrations > New registration**.
2. Name it `FlowSales AI Email`. Under **Supported account types**, choose
   **Accounts in any organizational directory and personal Microsoft accounts**
   (required for both work/school Outlook and personal outlook.com/hotmail
   addresses — the app authorizes through the `common` tenant endpoint).
3. Under **Redirect URI**, add a **Web** platform redirect URI matching your
   site exactly:
   `<NEXT_PUBLIC_SITE_URL>/api/integrations/email/microsoft/callback`
4. After creation, go to **Certificates & secrets > New client secret** and
   note the secret **value** (not the secret ID) — it is shown once.
5. Go to **API permissions > Add a permission > Microsoft Graph > Delegated
   permissions** and add:
   - `User.Read`
   - `Mail.Read`
   - `Mail.Send`
   - `offline_access`
   - `openid`, `profile`, `email` (usually present by default)
   Grant admin consent if your tenant requires it for these scopes.
6. Set the environment variables:
   - `MICROSOFT_EMAIL_CLIENT_ID` — the app registration's **Application
     (client) ID**.
   - `MICROSOFT_EMAIL_CLIENT_SECRET` — the client secret **value** from step 4.
7. Redeploy so the new environment variables take effect, then open
   `Settings > Integrations > E-posta` and click **Hesabı bağla** under
   Microsoft 365 / Outlook.

If the connect button redirects to Microsoft and then back with an error, check:
- The redirect URI registered in Azure matches `NEXT_PUBLIC_SITE_URL` byte-for-byte
  (including `https://` and no trailing slash).
- The client secret has not expired (Azure secrets expire; check **Certificates &
  secrets**).
- The signed-in Microsoft account type is allowed by the app registration's
  **Supported account types** setting from step 2.

## 3. Gmail / Google Workspace

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or
   select a project, then go to **APIs & Services > OAuth consent screen** and
   configure it (External or Internal, per your Workspace policy).
2. Enable the **Gmail API** under **APIs & Services > Library**.
3. Go to **APIs & Services > Credentials > Create Credentials > OAuth client
   ID**, type **Web application**.
4. Add an **Authorized redirect URI**:
   `<NEXT_PUBLIC_SITE_URL>/api/integrations/email/gmail/callback`
5. Under **OAuth consent screen > Scopes**, add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `openid`, `email`, `profile`
6. Set the environment variables:
   - `GOOGLE_EMAIL_CLIENT_ID`
   - `GOOGLE_EMAIL_CLIENT_SECRET`
7. Redeploy, then connect the account from `Settings > Integrations > E-posta`.

## 4. Where this is implemented

- `server/services/integrations/email-service.ts` — OAuth URL construction,
  token exchange, profile lookup, inbox sync (`syncEmailConnection`), and send
  (`sendEmail`) for both providers.
- `app/api/integrations/email/[provider]/connect/route.ts` and
  `.../callback/route.ts` — the OAuth redirect and callback handlers.
- `components/email/email-connections.tsx` — the connect/disconnect UI; shows
  this document's path when a provider's keys are missing.
- `server/services/deployment-readiness.ts` — tracks `email-microsoft` and
  `email-gmail` as readiness features so missing keys show up in deployment
  checks, not just silently in the UI.
