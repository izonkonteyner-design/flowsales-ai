import "server-only";

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

export type AiRateLimitAction =
  | "new_conversation"
  | "message_generation"
  | "action_proposal"
  | "action_approval"
  | "handoff";

const ACTION_LIMITS: Record<AiRateLimitAction, { limit: number; windowSeconds: number }> = {
  new_conversation: { limit: 10, windowSeconds: 3600 },
  message_generation: { limit: 50, windowSeconds: 3600 },
  action_proposal: { limit: 20, windowSeconds: 3600 },
  action_approval: { limit: 50, windowSeconds: 3600 },
  handoff: { limit: 5, windowSeconds: 3600 },
};

function hashIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex");
}

export async function checkAiRateLimit(
  workspaceId: string,
  action: AiRateLimitAction
): Promise<boolean> {
  const env = getSupabaseEnv();

  if (!env.url || !env.serviceRoleKey) {
    return true;
  }

  if (process.env.E2E_RATE_LIMIT_BYPASS_SECRET) {
    return true;
  }

  const adminClient: SupabaseClient = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { limit, windowSeconds } = ACTION_LIMITS[action];
  const identifier = hashIdentifier(`${workspaceId}-${action}`);

  const { data, error } = await adminClient.rpc("check_ai_rate_limit", {
    p_identifier: identifier,
    p_action_type: action,
    p_limit: limit,
    p_window: `${windowSeconds} seconds`,
  });

  if (error) {
    console.error("[ai-rate-limit] Failed to check rate limit", error);
    return false; // Fail secure: deny on indeterminate state
  }

  return data ?? false;
}
