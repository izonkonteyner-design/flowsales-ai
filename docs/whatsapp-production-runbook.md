# WhatsApp Production Runbook

## Safety invariant

Automated, diagnostic and verification outbound messages must only target the configured allowlisted test recipient. Never select a customer conversation as a fallback test target. Human-initiated Inbox replies remain normal product traffic and are not automated tests.

## Connection recovery

1. Open Settings → Integrations → WhatsApp.
2. Run Health Check.
3. If the token is expired/revoked, use Reconnect/Renew through Meta Embedded Signup. Never paste access tokens into chat, logs or browser-visible fields.
4. If token access is healthy but webhook subscription is missing, Health Check attempts subscription repair.
5. If repair remains degraded, do not mark the connection healthy; inspect Meta app/WABA permissions and connection metadata.

## Template delivery

- Sync the live Meta template catalog before sending.
- Only `APPROVED` templates may be sent.
- Free-form messages remain blocked outside the 24-hour customer service window.
- Controlled production verification must validate the allowlisted test recipient before any send.
- Store the returned `wamid` and let webhook status events advance sent → delivered → read or failed.

## Webhook security

- POST requests require `x-hub-signature-256` HMAC-SHA256 verification using the Meta app secret.
- Invalid signatures are rate limited and rejected.
- Provider event IDs are idempotent.
- Failed events have a maximum of five processing attempts.
- After the retry limit they are dead-lettered and Meta receives a terminal 200 response to prevent retry storms.
- Owner/admin users may explicitly reprocess a failed event. Manual reprocessing is organization scoped and auditable.

## Failed outbound messages

- Never blind-retry messages automatically to customers.
- Inbox exposes an explicit retry control only for failed outbound text messages.
- Retry revalidates workspace access, the 24-hour window, connection health and outbound rate limits.
- A retry creates a new outbound message with a new idempotency key and records `message_retry_requested` in audit history.

## CRM workflow

From a WhatsApp conversation authorized users can:
- add a Lead/Customer note,
- create a follow-up task,
- convert a linked Lead to a Customer,
- open the quote creation flow pre-scoped to the linked Lead.

All actions are organization scoped and written to WhatsApp audit history.

## AI reply workflow

AI suggestions are draft-only. Generation does not call outbound send APIs. Copying a suggestion for review is separately audited. The user must still deliberately send the final text through the standard composer.

## Release verification

Before calling WhatsApp v1 production-ready:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. production Playwright smoke tests
6. production migration is at least `0040`
7. AI evaluation release evidence is persisted
8. template finalization result is recorded as VERIFIED, BLOCKED or FAILED
