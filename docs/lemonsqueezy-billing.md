# Lemon Squeezy billing activation

FlowSales AI uses Lemon Squeezy hosted checkout, signed customer portal URLs and signed webhooks. The application never handles card details.

## Required environment variables

- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_STARTER_VARIANT_ID`
- `LEMONSQUEEZY_GROWTH_VARIANT_ID`
- `LEMONSQUEEZY_PRO_VARIANT_ID`
- `BILLING_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SITE_URL`

All values are server-side except `NEXT_PUBLIC_SITE_URL`. Do not commit API keys, variant IDs tied to private test stores, or webhook secrets.

## Lemon Squeezy dashboard setup

1. Create Starter, Growth and Pro subscription variants.
2. Copy each numeric variant ID into the matching environment variable.
3. Create a webhook pointing to `https://<production-host>/api/billing/webhook`.
4. Use the same value as `BILLING_WEBHOOK_SECRET` for the webhook signing secret.
5. Enable only the required subscription events: created, updated, cancelled, resumed, expired and paused.
6. Configure the customer portal Back URL to the production application.
7. Complete all flows in Lemon Squeezy test mode before switching production credentials.

## Application behavior

- Only workspace owners and admins can start checkout or open the portal.
- Demo workspaces are blocked.
- Checkout custom data includes `organization_id` and `plan_key`.
- The webhook verifies the raw request body against the `X-Signature` HMAC SHA-256 header.
- Subscription events are normalized into the existing entitlement service.
- Duplicate events are ignored using the billing event ID.
- The portal URL is requested server-side using the stored billing subscription ID.

## Verification checklist

1. `/api/health/deployment` reports `billing-lemonsqueezy.configured=true`.
2. Starter, Growth and Pro each open the expected test checkout.
3. A completed test checkout redirects to `/upgrade?checkout=success`.
4. The signed webhook creates a processed `billing_events` row.
5. `organization_entitlements` contains the provider customer/subscription IDs and expected plan limits.
6. A repeated webhook is treated as a duplicate.
7. Cancel, resume, pause, past-due and expire simulations update access correctly.
8. Customer portal opens with a signed URL and returns to FlowSales AI.
9. Invalid signatures return HTTP 401 and malformed payloads do not change entitlements.

Repository implementation is not evidence that production billing is active. The launch gate closes only after real test-mode evidence and production environment configuration are recorded.
