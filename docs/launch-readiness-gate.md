# FlowSales AI Launch Readiness Gate

A commercial launch is permitted only when every blocking item is verified with evidence.

## Code and CI

- Lint passes.
- Typecheck passes.
- Unit tests pass.
- Production build passes.
- Required E2E tests pass against preview and production.
- No unresolved critical or high-severity security finding.

## Database

- Migrations 0018 and later are applied to the intended production Supabase project.
- RLS policies are verified with at least two isolated workspaces.
- Backup and restore procedure is tested.
- Demo workspace remains read-only.

## Billing

- Billing provider account is active.
- Product and price identifiers are production values.
- Checkout and customer portal are configured.
- Webhook endpoint is registered with the production secret.
- Duplicate, delayed and invalid-signature webhook tests pass.
- Failed-payment and cancellation behavior is verified.

## Product

- Onboarding and CSV import complete successfully.
- Lead AI panel, Approval Queue, AI History, usage and notifications work with production data.
- Quote recommendations never execute without approval.
- Account export and deletion requests are operationally owned.

## Legal and operations

- Privacy Policy and Terms are reviewed by qualified counsel.
- Security contact and support contact are published.
- Incident-response owner is named.
- Data-retention and deletion timelines are approved.
- Status communication process is documented.

## Pilot

- The requirements in `docs/pilot-customer-validation.md` are completed with real customer evidence.
- Blocking pilot defects are closed and retested.

## Decision

- `GO`: every blocking item has dated evidence and an accountable owner.
- `NO-GO`: any security, data isolation, billing integrity, backup/restore, legal, or pilot gate is missing.

Repository implementation alone cannot produce a GO decision for external-provider, legal, operational, or real-customer requirements.
