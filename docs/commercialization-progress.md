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
13. [x] AI usage and cost measurement
14. [x] Notifications
15. [x] Landing, pricing and upgrade flows
16. [x] Legal, security and account lifecycle
17. [ ] E2E, production and security verification
18. [ ] Pilot customer validation

## Completed task notes

### Tasks 1–12

AI agent, approvals, history, commercial recommendations, access control, onboarding, trial limits and provider-neutral billing foundations are implemented in the preceding commits.

### Task 13 — AI usage and cost measurement

- Monthly capability-level run, token and estimated-cost reporting.
- Authenticated `/usage` dashboard with plan quota consumption.
- Deterministic provider-cost estimation helpers.
- Service-role-only atomic monthly usage aggregation.
- Existing quote-AI reservation safeguards remain intact.

### Task 14 — Notifications

- Authenticated `/notifications` inbox.
- User-scoped unread/read state and mark-all-read action.
- Service-role-only notification creation RPC.
- Recipient workspace-membership validation.
- RLS remains authoritative for browser reads and updates.

### Task 15 — Landing, pricing and upgrade flows

- Existing production marketing entry remains the landing surface.
- Public `/pricing` plan comparison for Starter, Growth and Pro.
- Authenticated `/upgrade` flow with owner/admin billing authorization.
- Plan limits aligned with entitlement definitions.
- Live checkout is explicitly disabled until provider customer creation, price IDs and hosted checkout are configured.

### Task 16 — Legal, security and account lifecycle

- Existing Privacy and Terms routes retained.
- Public `/security` responsible-AI and security control page.
- Auditable `/account/data` export, workspace-deletion and account-deletion request flow.
- Irreversible deletion is not executed directly from a browser request.
- Demo lifecycle changes are blocked.
- Production claims remain conditional on deployed migrations, backups, incident ownership and legal review.

## Next task

Task 17 — E2E, production and security verification.
