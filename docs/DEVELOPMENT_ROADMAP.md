# FlowSales AI — Prioritized Development Roadmap

**Version:** 1.0
**Date:** March 2025
**Author:** Lead Software Architect & Senior Full-Stack Engineer

---

## Executive Summary: Top 10 Development Priorities

1. **Meta App Review & Production Messaging Readiness (P0):** Complete Meta Business Verification, submit app review for WhatsApp/Instagram permissions, and finalize live end-to-end webhook delivery testing.
2. **Local AI Inference Engine via Ollama (P2):** Implement a provider-agnostic LLM interface in `server/services/ai.ts` supporting local Ollama models (e.g., Llama 3 / Mistral) as a zero-API-cost option for self-hosted/privacy-sensitive deployments.
3. **Google Services Integration (P1):** Complete the stubbed Google OAuth integration to support bi-directional Google Calendar sync for sales callbacks and basic Google Lead Form / Ads lead ingestion.
4. **Social Media Publishing & Scheduling (P2):** Build post creation, scheduling, and multi-channel publishing to Instagram and Facebook pages.
5. **Database Migration Consolidation & Squashing (P1):** Squash the 54 cumulative SQL migration files into an updated baseline schema (`0001_baseline_v1.sql`) to streamline local onboarding and Supabase deployments.
6. **Voice Sales Live Carrier Verification (P1):** Complete live Twilio/Telnyx end-to-end voice call verification, IVR flow validation, and real-time audio transcription handling.
7. **Production Observability & Operational Alerts (P1):** Wire automated Sentry alert thresholds and operational health notifications for webhook failures, delivery retries, and dead-letter queue growth.
8. **Automated Customer Sequence Safeguards (P2):** Enhance the daily sales automation runner (`sales-automation-runner-v5.ts`) with smart workload throttling and explicit opt-out validation.
9. **UI & Mobile Responsiveness Refinement (P3):** Fine-tune mobile drawer navigation, dense data table scrollability, and touch targets across all `/app` screens.
10. **Expanded AI Evaluation Fixtures (P3):** Expand the AI evaluation benchmark suite with additional Turkish sales scenario edge cases, objection handling evaluations, and quote negotiation fixtures.

---

## Prioritized Roadmap Matrix

```
  +-------------------------------------------------------------------------+
  |  P0: CRITICAL BUGS, SECURITY & PRODUCTION READINESS                     |
  |  - Meta App Review & Live WhatsApp/Instagram Verification               |
  |  - Security & Secrets Audit                                             |
  +-------------------------------------------------------------------------+
                                      |
  +-------------------------------------------------------------------------+
  |  P1: CORE BUSINESS FEATURES & STABILITY                                 |
  |  - Migration Consolidation (54 -> Baseline)                             |
  |  - Google Calendar & Contact Sync                                       |
  |  - Voice Sales Live Routing & Webhooks                                  |
  |  - Sentry & Operational Alerting                                        |
  +-------------------------------------------------------------------------+
                                      |
  +-------------------------------------------------------------------------+
  |  P2: AUTOMATION, LOCAL AI & EXTERNAL INTEGRATIONS                       |
  |  - Local AI Integration via Ollama                                      |
  |  - Social Media Scheduling & Content Publishing                         |
  |  - Automated Sequence Throttling & Follow-Up Engine                     |
  +-------------------------------------------------------------------------+
                                      |
  +-------------------------------------------------------------------------+
  |  P3: ADVANCED FEATURES, OPTIMIZATIONS & E2E COVERAGE                    |
  |  - UI Polish & Mobile Touch Optimization                                |
  |  - Expanded AI Benchmarks & Turkish Dialect Fixtures                    |
  |  - Performance & Asset Optimization                                     |
  +-------------------------------------------------------------------------+
```

---

## Detailed Item Breakdown

### Priority 0 (P0) — Critical Bugs, Security & Production Readiness

#### P0.1: Meta App Review & Live Messaging Activation
- **Description:** Complete Meta App Review submission for WhatsApp Business API, Instagram Direct Messaging, and Facebook Messenger access. Ensure webhooks and token encryption pass live compliance checks.
- **Relevant Files:** `server/services/integrations/meta-messaging.ts`, `app/api/webhooks/meta/route.ts`, `docs/META_APP_REVIEW.md`
- **Dependencies:** Active Meta Developer Account & Business Manager Verification
- **Complexity:** Medium (Operational / Infrastructure)
- **Acceptance Criteria:** Live Meta App Review approval for `whatsapp_business_messaging`, `instagram_basic`, and `pages_messaging`. Successful end-to-end receipt and reply of live Instagram and WhatsApp messages.

---

### Priority 1 (P1) — Core Business Features Required for Production

#### P1.1: Database Migration Squashing & Bootstrapping
- **Description:** Consolidate 54 cumulative migration SQL files into a clean baseline schema (`0001_baseline_v1.sql`) alongside seed updates.
- **Relevant Files:** `supabase/migrations/*`, `scripts/verify-rls-two-workspaces.mjs`
- **Dependencies:** Supabase CLI
- **Complexity:** Medium
- **Acceptance Criteria:** New environments can be bootstrapped from clean migrations without execution order conflicts. RLS verification tests pass on the consolidated schema.

#### P1.2: Google Calendar & Services Sync
- **Description:** Implement bi-directional Google Calendar sync for callbacks, task deadlines, and sales appointments using the existing Google OAuth stubs.
- **Relevant Files:** `app/api/integrations/google/*`, `server/services/integrations/google-calendar.ts` (new)
- **Dependencies:** Google Cloud Console OAuth App configuration
- **Complexity:** Medium
- **Acceptance Criteria:** Scheduled sales tasks/callbacks automatically create events on connected Google Calendars with deep links back to the lead record.

---

### Priority 2 (P2) — Automation, AI Agents & External Integrations

#### P2.1: Local AI Engine Integration via Ollama
- **Description:** Add an open-source, local AI provider adapter for Ollama (`http://localhost:11434` or self-hosted endpoint) in `server/services/ai.ts`. Allow operators to select between Gemini (cloud) and Ollama (local open-source models like Llama 3 / Mistral) without changing application UI contracts.
- **Relevant Files:** `server/services/ai.ts`, `lib/validations/ai.ts`, `app/(app)/settings/page.tsx`
- **Dependencies:** Ollama API client / fetch interface
- **Complexity:** Medium
- **Acceptance Criteria:** Workspace admins can configure an Ollama base URL and model name in settings. Grounded reply suggestions, lead scoring, and quote summaries function seamlessly using local Ollama models with zero paid API calls.

#### P2.2: Social Media Publishing & Post Scheduling
- **Description:** Add social media post creation, media upload, and multi-channel scheduling to Facebook Pages and Instagram Business accounts.
- **Relevant Files:** `app/(app)/social/*` (new), `server/services/integrations/social-publisher.ts` (new)
- **Dependencies:** Meta Graph API Content Publishing permissions (`instagram_content_publish`, `pages_manage_posts`)
- **Complexity:** High
- **Acceptance Criteria:** Users can draft posts with images/text, pick scheduled publish times, and automatically publish to connected Instagram and Facebook accounts.

---

### Priority 3 (P3) — Advanced Features & Performance Optimization

#### P3.1: Mobile Responsiveness & Touch Optimization
- **Description:** Audit and refine touch targets, drawer menus, and table overflow across mobile breakpoints (`sm`, `md`) for sales representatives in the field.
- **Relevant Files:** `components/layout/sidebar.tsx`, `components/shared/*`, `app/(app)/inbox/page.tsx`
- **Dependencies:** Tailwind CSS v4 breakpoint utilities
- **Complexity:** Low-Medium
- **Acceptance Criteria:** Zero horizontal page scrolling on mobile viewports (375px+). All interactive buttons maintain minimum 44x44px touch targets.

#### P3.2: AI Fixture & Objection Evaluation Expansion
- **Description:** Expand `scripts/evaluate-ai-fixtures.ts` with 25+ new real-world Turkish sales conversation scenarios, including price objections, competitor comparisons, and customized product catalog inquiries.
- **Relevant Files:** `evals/fixtures/*`, `scripts/evaluate-ai-fixtures.ts`
- **Dependencies:** `@google/genai`
- **Complexity:** Low
- **Acceptance Criteria:** Evaluation suite runs with `npm run eval:ai`, producing structured accuracy, grounds-alignment, and response latency metrics.
