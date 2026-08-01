# Operator Dashboard and Operational Alerts

Route: `/operations`

Access is limited to live-workspace owners and administrators. The page reads redacted alert summaries through `get_operational_alerts`; it does not expose direct client access to service-role-only billing events.

## Alert sources

- Failed AI runs from the last 30 days
- Failed CSV imports from the last 30 days
- Failed billing webhook events from the last 30 days
- Pending or failed account lifecycle requests
- AI approvals waiting longer than 24 hours
- Subscription and entitlement mismatches

## Severity

- Critical: billing failures and entitlement mismatches
- High: AI failures and lifecycle requests older than three days
- Medium: import failures, recent lifecycle requests and stale approvals

## Resolution workflow

An owner or administrator opens the source record, performs the operational work, optionally adds a note, and marks the alert resolved. Resolution is stored by workspace, alert key, actor and timestamp. A recurring source problem creates a new alert when its source identifier changes; resolving one alert does not suppress unrelated future failures.

## Safety boundaries

- Demo workspace resolution is blocked.
- Viewer, sales and manager roles are redirected away from the dashboard.
- RPC functions verify `manage_workspace` permission.
- Billing error text is truncated and raw webhook payloads are never returned.
- Alert links are validated as internal paths.
- The dashboard is an operational triage surface; it does not automatically retry billing, delete data or execute AI mutations.

## Production activation

Apply migration `0023_operator_dashboard_alerts.sql`, run the deployment readiness probe, sign in as an owner/admin, verify `/operations`, create safe staging failures for each source category and confirm resolution audit records.
