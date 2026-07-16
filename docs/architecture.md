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

## UI model

- The shell is responsive with a desktop sidebar and mobile drawer
- Shared cards, badges, headers, and form controls keep the system consistent
- Dark mode is persisted locally and toggled from the app bar
