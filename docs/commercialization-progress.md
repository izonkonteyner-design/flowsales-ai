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
9. [ ] Roles and permissions expansion
10. [ ] Onboarding and CSV import
11. [ ] Trial and plan limits
12. [ ] Billing and webhooks
13. [ ] AI usage and cost measurement
14. [ ] Notifications
15. [ ] Landing, pricing and upgrade flows
16. [ ] Legal, security and account lifecycle
17. [ ] E2E, production and security verification
18. [ ] Pilot customer validation

## Completed task notes

### Task 1 — Supabase migration and RLS code

- Persistent AI runs, approvals, events, entitlements, usage and notifications tables.
- Workspace membership and reviewer RLS policies.
- Demo read-only database checks.
- Optimistic approval decisions with row locking and version checks.
- Repository migrations are not considered applied to production until deployment is separately verified.

### Task 2 — Supabase repository adapters

- Approval repository, reviewer authorization and audit adapters.
- Workspace-scoped reads and atomic RPC-backed create/decision operations.

### Task 3 — Approval Queue UI and server actions

- Authenticated `/approvals` queue page.
- Workspace resolution through organization membership.
- Reviewer-only pending queue.
- Approve and reject server actions with Zod validation.
- Optimistic version handling and service-layer authorization.
- Demo approval button disabled while database and service checks remain authoritative.
- Duplicate audit insertion avoided for atomic RPC transitions.

### Task 4 — AI History and timeline

- Authenticated `/ai-history` page.
- Workspace-scoped AI run and approval-event repository.
- Capability, run status and lead filters.
- Provider, model, token, cost, decision and failure metadata.
- Chronological timeline combining AI runs with approval events.
- Source-level tests for authentication, workspace scoping and bounded queries.

### Task 5 — Lead detail AI panel

- Authenticated `/leads/[leadId]/ai` panel.
- Workspace-scoped lead resolution and recent AI history.
- Lead Scoring, Next Best Action, Follow-up Draft, Product Recommendation and Quote Recommendation controls.
- Structured summaries, confidence, actions, decisions and provider metadata displayed per run.
- Demo Safe Mode messaging and server-side enforcement.

### Task 6 — Follow-up Draft

- Provider-neutral follow-up capability service.
- Capability-specific prompt prohibits invented agreements, prices, dates and product details.
- Draft creation remains advisory; sending is never automatic.
- Protected send actions flow through execution policy and Approval Queue.

### Task 7 — Product Recommendation

- Product recommendation capability implemented in the shared service and orchestration path.
- Context is restricted to active products in the current workspace.
- Trusted catalog IDs are required for monetary claims.
- Recommendations are persisted in AI history and remain advisory.

### Task 8 — Quote Recommendation

- Quote recommendation capability implemented with deterministic temperature.
- Quote recommendations always require human approval.
- Prices must originate from trusted catalog or workspace-rule records.
- Demo workspace mutations remain blocked.
- Approval Queue receives protected quote actions before any future execution handler can run.

## Next task

Task 9 — Roles and permissions expansion.
