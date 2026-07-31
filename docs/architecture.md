# Architecture

FlowSales AI is organized around route groups and a shared shell:

- `app/(marketing)` for public marketing content
- `app/(auth)` for authentication screens
- `app/(app)` for the protected product experience
- `components/layout` for navigation and shell layout
- `components/shared` for cards, headers, badges, and state surfaces
- `lib/supabase` for SSR-friendly Supabase wrappers
- `lib/validations` for Zod schemas
- `server/services` for demo data, business logic, and calculations

The app currently uses demo-backed services when live Supabase data is not configured. The same service layer is intended to be swapped to real data access without changing the route UI contracts.

## Security model

- Browser code only uses the publishable Supabase key
- Server routes and middleware/proxy use the SSR helper
- Tenant membership is enforced by row level security
- Workspace roles are `owner`, `admin`, `sales`, and `viewer`

## Demo and viewer permission boundaries

The app distinguishes two independent security axes:

1. **Workspace `mode`** — `"live"` when Supabase is configured and the user is a member of a real organization; `"demo"` for the no-config preview session and for the static demo fixture data.
2. **Workspace `role`** — `owner`, `admin`, `sales`, `viewer`. The seeded demo workspace (`slug = flowsales-demo`) always assigns the `viewer` role (see `0017_demo_mode.sql`), so a "Start Demo" signup is also a `viewer` over a live organization.

A mutation is allowed only when BOTH axes permit it. Each domain exposes a pair of pure predicates in `server/services/<domain>-domain.ts`:

- `canManageLeads(role)` — true for `owner | admin | sales` only
- `canMutateLeadRecord(mode, role) === mode === "live" && canManageLeads(role)`

The pattern is mirrored for quotes, products, workspace members, and settings. The predicates are unit-tested in `tests/lead-domain.test.ts` and `tests/quote-domain.test.ts`, and the lead-create boundary is locked by `tests/lead-create-permissions.test.ts`.

### Layers enforced for every create/mutation surface

| Layer | Enforcement |
| --- | --- |
| Navigation | The "New X" CTA is conditional on `context.mode === "live" && canManageX(context.role)` |
| Route | The `/X/new` server component renders read-only `EmptyState` (with `getLeadRecordRestrictionMessage`) when the predicate is false |
| Form | The form is replaced by `EmptyState` rather than merely `disabled`, so there is no editable control to submit |
| Server action | The action calls `ensureCanManage` (which throws on a viewer) and `getMutationContext` (which returns `null` when `mode === "demo"`) before persisting |
| Database / RLS | `for all` policies scope INSERT/UPDATE/DELETE to `has_org_role(org_id, array['owner','admin','sales'])` — `viewer` is excluded from `WITH CHECK` |

The defense-in-depth guarantee: even if a viewer reaches the server action by crafting a direct request, neither the application layer (`ensureCanManage`) nor the database layer (RLS `WITH CHECK`) will persist the row. A direct `POST /leads/new` from a demo session fails at the Server Action hydration step (Next.js rejects the call as an unknown action), and even a successful hydration would be denied by the action body and RLS.

## UI model

- The shell is responsive with a desktop sidebar and mobile drawer
- Shared cards, badges, headers, and form controls keep the system consistent
- Dark mode is persisted locally and toggled from the app bar
