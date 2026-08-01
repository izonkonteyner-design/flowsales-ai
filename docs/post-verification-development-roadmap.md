# FlowSales AI Post-Verification Development Roadmap

Status date: 2026-08-01

## Product decision

Task 18, real pilot customer validation, is intentionally paused. The product must not represent pilot validation as complete until real customer evidence satisfies `docs/pilot-customer-validation.md`.

The repository has passed lint, typecheck, 187 automated tests, production build and public production Playwright smoke. The next development phase should prioritize launch-risk reduction and activation quality instead of adding broad new AI capabilities.

## Priority 0 — Production foundations

These are blocking before a controlled external pilot or paid launch.

1. Apply migrations 0018 and later to the intended production Supabase project with a recorded migration manifest.
2. Verify RLS using at least two independent workspaces and multiple roles, including negative cross-workspace access attempts.
3. Run a backup and restore drill and record recovery time, recovery point and responsible owner.
4. Review the dependency audit findings and close or explicitly accept all critical/high-severity risks with evidence.
5. Configure dedicated authenticated production E2E credentials and verify demo, account lock, approval and quote read-only scenarios.
6. Add deployment verification that confirms database schema version, required RPC functions and required environment variables.

## Priority 1 — Billing and commercial operations

1. Select and configure the production billing provider.
2. Create production products and price identifiers.
3. Implement hosted checkout and customer portal sessions.
4. Register the production webhook secret and validate duplicate, delayed, invalid-signature and out-of-order events.
5. Verify failed payment, cancellation, downgrade, trial expiry and entitlement recovery behavior.
6. Add an internal billing reconciliation view for subscription state versus workspace entitlement state.

## Priority 1 — Activation and onboarding

1. Add a guided first-run checklist for workspace setup, CSV import, first lead and first AI result.
2. Add CSV column mapping instead of requiring only canonical headers.
3. Provide downloadable rejected-row reports with actionable correction messages.
4. Add sample data and a reversible onboarding sandbox for non-demo workspaces.
5. Instrument time-to-first-value, onboarding abandonment and first successful AI capability.
6. Add contextual help for Approval Queue, AI History and plan limits.

## Priority 1 — Operational readiness

1. Name owners for security incidents, support, data export and deletion requests.
2. Define service-level targets for support and security incidents.
3. Add an operator dashboard for failed AI runs, failed imports, webhook failures and pending lifecycle requests.
4. Add alerting for authentication spikes, repeated webhook failures, AI error-rate thresholds and entitlement inconsistencies.
5. Document data retention, deletion execution timelines and escalation paths.
6. Publish support and security contact channels.

## Priority 2 — AI quality and explainability

1. Add prompt and model version identifiers to every AI run.
2. Add user feedback controls for useful, inaccurate and unsafe recommendations.
3. Track acceptance, rejection and edit distance for follow-up drafts and recommendations.
4. Add deterministic fallback behavior when structured AI output repeatedly fails.
5. Add capability-specific evaluation datasets and regression tests.
6. Add configurable organization-level AI policies, tone and forbidden claims.

## Priority 2 — CRM workflow depth

1. Add lead activity creation from approved follow-up drafts without automatic external sending.
2. Add task and reminder scheduling tied to Next Best Action.
3. Add pipeline-stage automation rules with explicit human approval boundaries.
4. Add saved filters, views and bulk actions with role checks.
5. Add duplicate detection and merge workflows for leads and customers.
6. Add product and quote versioning where commercial history must remain immutable.

## Priority 2 — Reporting and administration

1. Add activation, adoption, retention and AI-value dashboards.
2. Add workspace-level audit-log search and export.
3. Add plan usage forecasts and pre-limit warnings.
4. Add organization member invitation completion and seat-utilization reporting.
5. Add administrator controls for suspending compromised users or workspaces.
6. Add configurable notification preferences and delivery channels.

## Recommended execution order

1. Production migration manifest and deployment probe.
2. Two-workspace RLS and role verification suite.
3. Dependency vulnerability remediation.
4. Backup and restore drill documentation.
5. Billing provider integration and reconciliation.
6. Guided onboarding, CSV mapping and activation analytics.
7. Operator dashboard and alerting.
8. AI feedback, evaluation and prompt/model versioning.
9. CRM workflow extensions.
10. Resume Task 18 only after the blocking Priority 0 items are evidenced.

## Explicit non-priorities

Until pilot evidence exists, do not prioritize:

- Additional broad AI capabilities without a measured customer problem.
- Autonomous external message sending.
- Autonomous quote creation or commercial commitment.
- Large visual redesigns that do not improve activation or trust.
- Premature enterprise integrations before core onboarding and retention are validated.

## Decision rule

Development may continue while Task 18 is paused, but commercial GO remains prohibited until the launch-readiness gates and real pilot evidence are complete.
