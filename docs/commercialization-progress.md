# FlowSales AI Commercialization Progress

This file is the repository source of truth for the ordered commercialization program.
A task is marked complete only when its implementation is committed and its verification boundary is documented.

## Ordered tasks

1. [x] Supabase migration and RLS code
2. [x] Supabase repository adapters
3. [x] Approval Queue UI and server actions
4. [x] AI History and timeline
5. [x] Lead detail AI panel
6. [x] Follow-up Draft
7. [x] Product Recommendation
8. [x] Quote Recommendation
9. [x] Roles and permissions expansion
10. [x] Onboarding and CSV import
11. [x] Trial and plan limits
12. [x] Billing and webhooks
13. [ ] AI usage and cost measurement
14. [ ] Notifications
15. [ ] Landing, pricing and upgrade flows
16. [ ] Legal, security and account lifecycle
17. [ ] E2E, production and security verification
18. [ ] Pilot customer validation

## Completed task notes

### Tasks 1–8

AI agent, approval, history, lead panel and commercial recommendation capabilities are implemented as documented in the preceding commits.

### Task 9 — Roles and permissions expansion

- Canonical owner, admin, manager, sales manager, sales rep, member and viewer roles.
- Shared permission matrix for member management, billing, workspace administration, AI review, pipeline management, AI execution, imports and CRM access.
- Database `has_org_permission` and `current_org_role` functions.
- Invitation table and RLS restricted to owners/admins.

### Task 10 — Onboarding and CSV import

- Existing owner-only onboarding retained and extended with `/onboarding/import`.
- Workspace-scoped lead CSV import action.
- Required/optional column validation, quoted-value parsing, row and cell limits and rejected-row reporting.
- Persistent import jobs with completion/failure state.
- Permission and demo read-only checks before writes.

### Task 11 — Trial and plan limits

- Workspace entitlement policy for subscription state, trial expiry, seat limits and monthly AI run limits.
- Database `check_workspace_entitlement` and `initialize_workspace_trial` functions.
- Starter, Growth, Pro and Enterprise limit mapping in the billing adapter.
- Limits fail closed for inactive, expired or exhausted workspaces.

### Task 12 — Billing and webhooks

- Provider-neutral billing event contract.
- HMAC SHA-256 signature verification with timing-safe comparison.
- Idempotent billing event ledger.
- Service-role-only billing event storage.
- Signed `/api/billing/webhook` route.
- Subscription events update organization entitlements without trusting browser input.
- External provider account, checkout products, production webhook secret and webhook registration must still be configured and verified separately before live charging.

## Next task

Task 13 — AI usage and cost measurement.
