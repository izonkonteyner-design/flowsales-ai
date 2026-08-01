# Two-Workspace RLS and Role Verification

This runbook verifies tenant isolation and the commercial permission matrix with real authenticated Supabase users.

## Scope

The runner verifies:

- At least two independent organizations are represented.
- Roles `owner`, `admin`, `manager`, `sales_rep`, and `viewer` are represented.
- `has_org_permission` matches the expected permission matrix.
- Each user can query permitted tables in their own organization.
- Cross-organization reads return zero rows for `ai_runs`, `ai_approval_requests`, `import_jobs`, and `notifications`.
- Cross-organization import writes are rejected.
- Owner, admin, manager, and sales rep can create an own-workspace import job.
- Viewer import writes are rejected.
- Temporary import rows are removed with the service-role client.

## Required environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RLS_TEST_MATRIX_JSON`

`RLS_TEST_MATRIX_JSON` is an array of test identities:

```json
[
  {
    "role": "owner",
    "email": "owner-a@example.test",
    "password": "replace-me",
    "organizationId": "00000000-0000-0000-0000-000000000001"
  },
  {
    "role": "admin",
    "email": "admin-a@example.test",
    "password": "replace-me",
    "organizationId": "00000000-0000-0000-0000-000000000001"
  },
  {
    "role": "manager",
    "email": "manager-b@example.test",
    "password": "replace-me",
    "organizationId": "00000000-0000-0000-0000-000000000002"
  },
  {
    "role": "sales_rep",
    "email": "rep-b@example.test",
    "password": "replace-me",
    "organizationId": "00000000-0000-0000-0000-000000000002"
  },
  {
    "role": "viewer",
    "email": "viewer-b@example.test",
    "password": "replace-me",
    "organizationId": "00000000-0000-0000-0000-000000000002"
  }
]
```

Use dedicated non-human test accounts. Never place passwords or service-role keys in repository files, screenshots, logs, or PR comments.

## Run

```bash
npm run verify:rls
```

A passing run returns one JSON line with `status: "ok"`, the number of workspaces, roles, permissions checked, and isolated tables.

Any unexpected permission, visible foreign row, successful cross-workspace write, or viewer write causes a non-zero exit code.

## Evidence

Record:

- Date and environment
- Supabase project reference, without secret values
- Application commit SHA
- Migration reported by `/api/health/deployment`
- Redacted runner output
- Test workspace IDs
- Test user IDs and roles
- Responsible reviewer

## Completion boundary

Repository implementation and CI source tests prove that the verification runner is present and internally consistent. The launch gate is satisfied only after the runner is executed against the intended staging or production Supabase project with real authenticated fixture accounts and the dated evidence is retained.
