# WhatsApp Business Integration & Meta Embedded Signup Guide

This document describes how to set up, configure, and manage WhatsApp Business integration for FlowSales AI via Meta Embedded Signup.

---

## 1. Meta Developer Application Setup

1. Log in to [Meta for Developers Console](https://developers.facebook.com/).
2. Click **Create App** and choose **Business** type.
3. Name your app `FlowSales AI` and link your Meta Business Portfolio.
4. Add the **WhatsApp** product to your app.
5. Add **Facebook Login for Business** product to your app.

---

## 2. Meta Embedded Signup Configuration

1. In the Meta App Dashboard, navigate to **WhatsApp** > **Embedded Signup**.
2. Click **Create Configuration**.
3. Configure the following settings:
   - **Configuration Name**: `FlowSales AI Production Onboarding`
   - **Permissions Requested**:
     - `whatsapp_business_management`
     - `whatsapp_business_messaging`
   - **Features**: WABA creation, phone number selection/registration, system user access token generation.
4. Save the configuration and note down the generated **Embedded Signup Config ID** (`META_EMBEDDED_SIGNUP_CONFIG_ID`).

---

## 3. Allowed Domains & Facebook Login Settings

1. In **Facebook Login for Business** > **Settings**:
   - Set **Valid OAuth Redirect URIs**:
     - `https://flowsales-ai-six.vercel.app/api/integrations/meta/callback`
     - `http://localhost:3000/api/integrations/meta/callback` (development)
   - In **Allowed Domains for JavaScript SDK**:
     - `flowsales-ai-six.vercel.app`
     - `localhost:3000`
2. Save changes.

---

## 4. Webhook Callback URL & Verify Token Setup

1. In **WhatsApp** > **Configuration**:
   - **Callback URL**: `https://flowsales-ai-six.vercel.app/api/webhooks/meta`
   - **Verify Token**: Define a strong random string (e.g. 32+ random characters) and set as `META_WEBHOOK_VERIFY_TOKEN`.
2. Click **Verify and Save**. Meta will send a `GET` request to your callback URL with `hub.mode=subscribe` and `hub.verify_token`.
3. Under **Webhook fields**, subscribe to:
   - `messages`
   - `account_update`

---

## 5. Webhook Ingestion & Workspace Isolation

- When Meta sends a webhook event to `POST /api/webhooks/meta`:
  1. The server verifies the `X-Hub-Signature-256` HMAC-SHA256 signature using `META_APP_SECRET`.
  2. The server extracts the `waba_id` or `phone_number_id` from the payload metadata.
  3. The server queries `channel_connections` for an active (`status = 'connected'`) WhatsApp connection matching that WABA or phone number.
  4. If an active connection is found, the event is saved to `webhook_events` associated with that specific workspace (`organization_id`).
  5. If **no active connection** is found, the server returns HTTP 422 (`unknown_connection`) with message `"No active WhatsApp connection found for this account or phone number."`. The event is **not** marked as processed, and no dummy or random organization records are created.

---

## 6. Required Environment Variables

Set the following environment variables in your server / Vercel dashboard:

```env
# Meta Application Credentials
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_EMBEDDED_SIGNUP_CONFIG_ID=your_config_id
META_GRAPH_API_VERSION=v21.0
META_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token

# Client-facing Meta Public Variables
NEXT_PUBLIC_META_APP_ID=your_meta_app_id
NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID=your_config_id
NEXT_PUBLIC_SITE_URL=https://flowsales-ai-six.vercel.app

# AES-256-GCM Encryption Key (64 hex characters or 32-byte base64 string)
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

> [!CAUTION]
> Never commit real values of `META_APP_SECRET` or `TOKEN_ENCRYPTION_KEY` into source control.

---

## 7. Permissions & Scope Model

- `whatsapp_business_management`: Allows managing WABA settings, phone numbers, and webhooks.
- `whatsapp_business_messaging`: Allows sending and receiving WhatsApp messages.

---

## 8. App Review & Business Verification

- **Development Mode**: Testing is limited to App Admins, Developers, and Testers, using Meta WhatsApp Test Numbers.
- **Production Mode**: Requires Meta **Business Verification** and **App Review** for `whatsapp_business_management` and `whatsapp_business_messaging`.

---

## 9. Disconnect & Credential Rotation

### Disconnect Procedure
1. In FlowSales AI, navigate to `/settings/integrations`.
2. On the **WhatsApp Business** card, click **Disconnect**.
3. FlowSales AI will:
   - Soft-revoke the connection (`status = 'revoked'`).
   - Unsubscribe the WABA from app webhooks.
   - Clear encrypted token blobs from `integration_tokens`.

---

## 10. Production Activation Checklist

- [ ] Meta Developer App switched to Live Mode.
- [ ] App Review approved for `whatsapp_business_messaging` and `whatsapp_business_management`.
- [ ] Production webhook URL verified (`https://flowsales-ai-six.vercel.app/api/webhooks/meta`).
- [ ] All environment variables configured in Vercel Production environment.
- [ ] Database migrations `0029_whatsapp_business_connection.sql` and `0030_whatsapp_code_idempotency.sql` applied to production database.
