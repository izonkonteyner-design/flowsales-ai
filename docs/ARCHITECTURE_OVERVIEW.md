# FlowSales AI — Technical Architecture Overview

**Version:** 1.0
**Last Updated:** March 2025

---

## 1. System Architecture Blueprint

FlowSales AI is built on Next.js 16 (App Router) and Supabase (PostgreSQL with RLS), designed around a modular domain-driven architecture.

```
                  +-----------------------------------+
                  |         Next.js App Router        |
                  |  (React 19, Server Components)    |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            |                       |                       |
  +---------v---------+   +---------v---------+   +---------v---------+
  |    (marketing)    |   |      (auth)       |   |       (app)       |
  | Public Landing    |   | Login/Signup/Reset|   | Protected Shell   |
  +-------------------+   +-------------------+   +---------+---------+
                                                            |
                                                  +---------v---------+
                                                  |  Server Services  |
                                                  | (`server/services`|
                                                  +---------+---------+
                                                            |
            +-----------------------+-----------------------+
            |                       |                       |
  +---------v---------+   +---------v---------+   +---------v---------+
  |   Supabase RLS    |   |   @google/genai   |   | Omnichannel / Voice|
  | PostgreSQL DB     |   | Gemini Intelligence|   | (Meta, WhatsApp)  |
  +-------------------+   +-------------------+   +-------------------+
```

---

## 2. Directory Structure & Key Responsibilities

- **`app/`**: Next.js App Router routes.
  - **`(app)`**: Protected core application routes (`/dashboard`, `/leads`, `/inbox`, `/quotes`, `/sales-cockpit`, `/voice`, `/growth-control`, `/settings`).
  - **`(marketing)`**: Public landing, pricing, privacy, and terms pages.
  - **`(auth)`**: Authentication screens (login, signup, password reset).
  - **`api/`**: Next.js API routes, webhooks (`/api/webhooks/meta`, `/api/webhooks/voice`), and integration endpoints.
- **`components/`**: Modular UI components.
  - **`components/layout`**: App shell, desktop sidebar, mobile header, dark mode toggle.
  - **`components/shared`**: Reusable cards, badges, modal dialogs, and table components.
- **`lib/`**: Common utilities and configurations.
  - **`lib/supabase`**: SSR helpers, client builders, and tenant boundaries.
  - **`lib/validations`**: Zod validation schemas for forms and API requests.
- **`server/`**: Server-side business domain logic.
  - **`server/services`**: Core business domain services (`crm-data.ts`, `quote-domain.ts`, `lead-domain.ts`, `omnichannel-inbox.ts`, `ai.ts`).
  - **`server/services/ai-sales-agent/`**: AI agent orchestration and tool execution.
  - **`server/services/integrations/`**: Meta, WhatsApp, Email, OAuth, and channel encryption logic.
  - **`server/services/voice-sales/`**: Voice session management and provider adapters (Twilio, Telnyx).
- **`supabase/migrations/`**: 54 cumulative SQL migration files handling schema definitions, RLS policies, and RPC functions.

---

## 3. Database Schema & RLS Security Model

### Tenant Isolation via `workspace_id`
All core business tables include a `workspace_id` UUID column that maps to `public.workspaces`. Access is enforced through Row Level Security (RLS) policies using the `auth.uid()` function linked to `workspace_members`.

### Schema Highlights
1. **Workspace & Identity:** `workspaces`, `workspace_members`, `workspace_invitations`, `workspace_api_keys`.
2. **CRM & Quoting:** `leads`, `customers`, `products`, `quotes`, `quote_items`, `quote_versions`.
3. **Omnichannel Messaging:** `channel_connections`, `inbox_conversations`, `inbox_messages`, `whatsapp_templates`, `whatsapp_outbound_idempotency`.
4. **Sales Operations & Voice:** `callback_queue`, `sales_sequences`, `sequence_enrollments`, `voice_call_sessions`, `voice_call_events`.
5. **AI Quality & Governance:** `ai_usage_logs`, `ai_approval_requests`, `ai_quality_evaluations`.

---

## 4. AI & Agent Architecture

FlowSales AI uses a **grounded AI architecture** with strict human-in-the-loop safeguards.

- **Primary Engine:** Google Gemini API (`@google/genai`).
- **Grounded Sales Intelligence:** Contextual product catalogs, lead attributes, and conversation histories are formatted into structured prompts.
- **Approval Boundaries:** AI outputs (such as suggested reply drafts or automated quote creation) are recorded as pending approvals in `ai_approval_requests`. Messages are **never** dispatched to end-customers automatically without explicit human confirmation.
- **AI Evaluation Pipeline:** Built-in evaluation framework (`scripts/evaluate-ai-fixtures.ts`) evaluates models against standard fixtures to monitor quality, hallucination rate, and Turkish language alignment.

---

## 5. Omnichannel & Voice Messaging Contracts

- **WhatsApp Business (WABA):** Webhook handling in `app/api/webhooks/meta` with HMAC verification, 24-hour window enforcement, and idempotency tracking in `whatsapp_outbound_idempotency`.
- **Meta (Instagram / Messenger):** Webhook routing and page-token decryption via AES-256-GCM.
- **Voice Sales Subsystem:** Provider-neutral abstractions (`server/services/voice-sales/`) with adapters for Twilio and Telnyx, managing call lifecycle, webhooks, and transcript analysis.
