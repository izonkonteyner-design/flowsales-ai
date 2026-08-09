# Meta App Review Evidence

Production Privacy Policy URL: `https://flowsales-ai-six.vercel.app/privacy`.

Planned Meta Data Deletion Callback URL (configure only after this change is deployed): `https://flowsales-ai-six.vercel.app/api/webhooks/meta-data-deletion`.

## Permission audit

| Permission | Requested in code | Endpoint/feature | Review guidance |
| --- | --- | --- | --- |
| `instagram_business_basic` | `app/api/integrations/meta/connect/route.ts` | Instagram account discovery | Request review/access as required by Meta |
| `instagram_business_manage_messages` | Same Instagram OAuth route | read-only `/CONNECTION_ID/conversations?platform=instagram&limit=1` probe; inbound DMs and replies | Submit for App Review; Meta requires its successful API test call |
| `instagram_business_manage_comments` | No | Comments are not implemented | Do not request |
| `pages_show_list` | Facebook OAuth route | lists Pages for account selection | Request review/access as required by Meta |
| `pages_read_engagement` | Facebook OAuth route | Page/conversation context | Request review/access as required by Meta |
| `pages_manage_metadata` | Facebook OAuth route | Page webhook subscription | Request review/access as required by Meta |
| `pages_messaging` | Facebook OAuth route | Messenger webhook events and replies | Advanced Access/App Review required for production users |
| `business_management` | No | Not used | Do not request |

## Safe Instagram API test call

Call `GET /api/integrations/meta/permission-probe?provider=instagram` as an authorized owner/admin of a connected workspace. It decrypts the server-side token and calls `GET /{instagram-account-id}/conversations?platform=instagram&limit=1`, which is read-only and uses `instagram_business_manage_messages`. The response contains only status/health metadata, not a token, sender, or message text. A successful `messaging.status: 200` is evidence; Meta alone determines whether its dashboard increments the test-call counter.

## Data handling

FlowSales stores sender platform ID, generic display name, message ID/text/type/timestamp/status, attachment URL, connected account ID, and operational webhook/audit metadata. The relevant tables are `channel_contacts`, `conversations`, `messages`, `message_attachments`, `webhook_events`, and `omnichannel_audit_events`. `webhook_events` retains received event payloads for deduplication/troubleshooting and can contain message data.

OAuth tokens are encrypted before storage in `integration_tokens`, only server-side service-role code reads them, and the Meta routes do not log token values or raw payloads. Disconnect deletes the token before revoking the connection. There is no automatic retention-period job in this repository.

Configure Meta Data Deletion Callback as `https://flowsales-ai-six.vercel.app/api/webhooks/meta-data-deletion`. The route verifies Meta's signed request, deletes matching Instagram/Messenger contacts, conversations, messages, and attachments, then returns a confirmation URL/code. It cannot delete data that cannot be associated with the signed Meta subject ID; users can also request deletion via Account → Data or `support@flowsales.ai`.

## App Review submission: instagram_business_manage_messages

**Why permission is required**

FlowSales AI is a CRM and omnichannel inbox for businesses. A business connects only its own Instagram Professional Account. This permission is required to receive customer DMs for that account, display conversations to authorized business users, and send replies they write in FlowSales AI.

**Reproduction steps**

1. Sign in with the reviewer test account and open Settings → Integrations.
2. Select Instagram, complete authorization, and choose the reviewer Instagram Professional Account.
3. Open Inbox. From a separate Instagram account, send a DM to the connected account.
4. Open the conversation in FlowSales AI Inbox and send a reviewer-written reply.
5. Confirm the reply in the second Instagram account.

**Data accessed, use, and least privilege**

We access the connected account ID and the minimum Inbox data: sender ID, message ID/text/type/timestamp/status, and attachment URL. It is shown only to authorized members of the business that connected the account, to receive, organize, and reply to customer messages. We do not sell Meta data or use it for advertising. We request only `instagram_business_basic` and `instagram_business_manage_messages`; comment management and Business Manager permissions are not requested.

## App Review submission: pages_messaging

**Why permission is required**

FlowSales AI lets a business connect only its own Facebook Page to its Inbox. `pages_messaging` is needed to receive Messenger events for the selected Page, show inbound customer messages to authorized business users, and send replies that those users compose in FlowSales AI.

**Facebook Messenger reproduction steps**

1. Sign in to FlowSales AI with the reviewer test account and open Settings → Integrations.
2. Select Facebook/Messenger, authorize the reviewer Page, and select the Page to connect.
3. From a separate Facebook account, send a Page Messenger message to that Page.
4. Open Inbox in FlowSales AI and show the corresponding Messenger conversation.
5. Send a reviewer-written reply from FlowSales AI and verify it in Messenger.

**Data accessed and use**

We access the selected Page identifier, sender identifier, message identifier/text/type/timestamp/status, and attachment URL only to operate the business Inbox. Page-selection and webhook setup use `pages_show_list`, `pages_read_engagement`, and `pages_manage_metadata`; the application does not request `business_management`.

## Review video checklist

1. Show `/privacy`, including Meta data/deletion terms.
2. Show a non-demo owner/admin login and Settings → Integrations.
3. Start Instagram authorization and show only the requested permission consent.
4. Select the Professional Account and show connected status.
5. Show the safe permission-probe success without showing secrets or token values.
6. Send a DM from a second account; show it in Inbox.
7. Send a reply from FlowSales AI; show it on the second account.
8. Repeat the Page Messenger connection, inbound message, and reply flow with a separate Facebook sender.
9. Show integration disconnect and explain that the encrypted token is deleted.

## Manual Meta panel actions

- Complete Business Verification with the business's documents.
- Set the app's appropriate live/published state; submit App Review and obtain Advanced Access where Meta requires it.
- Configure the production Privacy Policy URL and data-deletion callback URL.
- Run the Instagram probe with a live reviewer/admin connection and confirm the Meta dashboard records its API test call.
- Give reviewers a non-demo test user, a test Professional Account/Page, and a separate sender account. Demo workspaces and viewer users are intentionally read-only.
