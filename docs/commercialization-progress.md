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
17. [ ] E2E, production and security verification — CI remediation in progress
18. [ ] Pilot customer validation — real customer evidence required
19. [x] Launch readiness gate definition

## Task 17 — Current verification state

- Latest completed CI before remediation: lint passed; typecheck failed; tests/build were skipped.
- Approval action nullability, approval queue typing and Supabase relation typing were corrected.
- A new CI run was triggered and must pass lint, typecheck, tests and build before Task 17 can be marked complete.
- Production E2E, deployed migration checks, RLS isolation, backup/restore and dependency vulnerability review remain required.

## Task 18 — Pilot validation

- Measurable cohort, scenarios, success gates, evidence and stop conditions are defined in `docs/pilot-customer-validation.md`.
- Task 18 remains open until real companies complete the pilot and the evidence satisfies those gates.

## Task 19 — Launch readiness gate

- Blocking code, database, billing, product, legal, operational and pilot requirements are defined in `docs/launch-readiness-gate.md`.
- A commercial GO decision is prohibited while any blocking gate lacks dated evidence and an accountable owner.
