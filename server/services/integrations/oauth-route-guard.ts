import "server-only";

import type { NextRequest } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  OAuthConfigurationRequiredError,
  OAuthTokenEncryptionNotConfiguredError,
  OAuthOpenRedirectError,
  type ChannelProvider,
} from "@/server/services/integrations/provider-adapter";
import { isOAuthStateError } from "@/server/services/integrations/oauth-state";
import { logger } from "@/lib/logger";

// ============================================================================
// OAuth Route Guard
//
// Shared security checks for all integration connect/callback routes:
//   1. Authentication — user must be logged in
//   2. Workspace — must have a live org
//   3. Role — must be owner or admin
//   4. Demo block — demo org cannot initiate real connections
//
// Returns either a typed error response or the validated context.
// ============================================================================

export type OAuthGuardContext = {
  userId: string;
  organizationId: string;
  role: "owner" | "admin";
};

export type OAuthGuardResult =
  | { ok: true; ctx: OAuthGuardContext }
  | { ok: false; response: Response };

export async function runOAuthGuard(
  request: NextRequest,
): Promise<OAuthGuardResult> {
  void request; // Request is received but workspace context uses cookies; kept for future use
  // 1. Auth check
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      response: jsonError(503, "service_unavailable", "Supabase is not configured."),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: jsonError(401, "unauthenticated", "You must be signed in."),
    };
  }

  // 2. Workspace check
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo" || !workspace.userId) {
    return {
      ok: false,
      response: jsonError(
        403,
        "demo_blocked",
        "Integration connections are not available in the demo workspace.",
      ),
    };
  }

  // 3. Role check
  if (workspace.role !== "owner" && workspace.role !== "admin") {
    return {
      ok: false,
      response: jsonError(
        403,
        "permission_denied",
        "Owner or Admin role is required to manage integrations.",
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      organizationId: workspace.organization.id,
      role: workspace.role as "owner" | "admin",
    },
  };
}

// ============================================================================
// Error response helpers
// ============================================================================

export function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  // Never include raw provider errors or token values in the response.
  return Response.json({ error: code, message }, { status });
}

export function jsonOk(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * Translate known OAuth errors to safe JSON responses.
 * Raw provider errors are swallowed — only typed errors are passed through.
 */
export function handleOAuthRouteError(
  error: unknown,
  context: { provider: ChannelProvider; route: string },
): Response {
  logger.error("oauth.route_error", error, { provider: context.provider, route: context.route });

  if (error instanceof OAuthConfigurationRequiredError) {
    return jsonError(
      503,
      "configuration_required",
      `Provider credentials for ${error.provider} are not configured.`,
    );
  }

  if (error instanceof OAuthTokenEncryptionNotConfiguredError) {
    return jsonError(
      503,
      "token_encryption_not_configured",
      "Token encryption is not configured. Contact your administrator.",
    );
  }

  if (error instanceof OAuthOpenRedirectError) {
    return jsonError(400, "open_redirect_blocked", "Return URL is not allowed.");
  }

  if (isOAuthStateError(error)) {
    return jsonError(400, (error as { code: string }).code, error instanceof Error ? error.message : "State error.");
  }

  if (error instanceof Error && (error.name === "DistributedRateLimitUnavailableError" || (error as { code?: string }).code === "rate_limit_unavailable")) {
    return jsonError(503, "rate_limit_unavailable", "Request protection is temporarily unavailable.");
  }

  // Generic — do not expose raw provider errors
  return jsonError(500, "integration_error", "An error occurred. Please try again.");
}
