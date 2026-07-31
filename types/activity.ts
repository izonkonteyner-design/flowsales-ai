import type { Activity } from "@/types/crm";

export type ActivityEntityType =
  | "lead"
  | "customer"
  | "quote"
  | "ai_run"
  | "approval"
  | "system";

export type ActivityType =
  | "created"
  | "updated"
  | "stage_changed"
  | "status_changed"
  | "note_added"
  | "contact_attempted"
  | "next_action_created"
  | "quote_created"
  | "quote_status_changed"
  | "ai_analysis_completed"
  | "ai_analysis_failed"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "approval_executed"
  | "approval_failed"
  | "system";

export type ActivityActorType = "user" | "ai" | "system";

export type ActivityMetadata = {
  /** Free-form key-value pairs, sanitized by the app layer before insert. */
  [key: string]: unknown;
  from?: string;
  to?: string;
  aiRunId?: string;
  approvalId?: string;
  quoteId?: string;
  customerId?: string;
};

/**
 * Enriched activity shape used by the timeline. The legacy `Activity` type
 * stays as the database-row representation; `ActivityEntry` is the typed view
 * the UI consumes after the service layer backfills entity_type/actor_type.
 */
export type ActivityEntry = Activity & {
  entity_type: ActivityEntityType | null;
  entity_id: string | null;
  activity_type: ActivityType | null;
  actor_type: ActivityActorType | null;
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
};

/** Small typed helper: build a 活动 row from typed inputs (server-side only). */
export type ActivityInsertInput = {
  organization_id: string;
  entity_type: ActivityEntityType;
  entity_id: string;
  /** Optional parallel FK for cascade deletes; can be null for ai_run/approval. */
  lead_id?: string | null;
  quote_id?: string | null;
  activity_type: ActivityType;
  /** Optional free-text legacy `type` for back-compat with loader code. */
  legacy_type?: string;
  title: string;
  detail: string;
  actor_type: ActivityActorType;
  actor_id?: string | null;
  metadata?: Record<string, unknown>;
};
