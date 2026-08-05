import * as crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { logger } from "@/lib/logger";

export class DistributedRateLimitUnavailableError extends Error {
  readonly code = "rate_limit_unavailable";
  constructor(message = "Request protection is temporarily unavailable.") {
    super(message);
    this.name = "DistributedRateLimitUnavailableError";
  }
}

interface RateLimitRecord {
  timestamps: number[];
}

const inMemoryStore = new Map<string, RateLimitRecord>();

function getRateLimitHashSecret(): string {
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new DistributedRateLimitUnavailableError("RATE_LIMIT_HASH_SECRET is missing.");
  }

  return "dev_rate_limit_hash_secret_key_32bytes_min";
}

/**
 * Computes an HMAC-SHA256 hash of an IP address and action string using RATE_LIMIT_HASH_SECRET.
 * Raw IP addresses are never logged or stored in database or memory.
 */
export function hashIp(ip: string, action = "general"): string {
  const secret = getRateLimitHashSecret();
  return crypto.createHmac("sha256", secret).update(`${ip.trim()}_${action}`).digest("hex");
}

/**
 * Distributed Serverless Rate Limiter backed by PostgreSQL RPC `check_distributed_rate_limit`.
 * Fail-closed in production: throws DistributedRateLimitUnavailableError if RPC fails.
 * In development/testing (NODE_ENV !== "production"), falls back to in-memory sliding window.
 */
export async function checkRateLimit(
  rawIpOrKey: string,
  action: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const isProd = process.env.NODE_ENV === "production";
  const keyHash = hashIp(rawIpOrKey, action);
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (err) {
    logger.error("rate_limiter.admin_client_failed", err, { action });
    if (isProd) {
      throw new DistributedRateLimitUnavailableError("Rate limit service unavailable.");
    }
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc("check_distributed_rate_limit", {
        p_key_hash: keyHash,
        p_action: action,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      });

      if (error) {
        logger.error("rate_limiter.rpc_error", error, { action });
        if (isProd) {
          throw new DistributedRateLimitUnavailableError("Rate limit service error.");
        }
      } else if (Array.isArray(data) && data.length > 0) {
        const row = data[0];
        return {
          allowed: Boolean(row.allowed),
          remaining: Number(row.remaining ?? 0),
          resetMs: Number(row.reset_ms ?? windowMs),
        };
      } else {
        logger.error("rate_limiter.invalid_rpc_response", undefined, { action });
        if (isProd) {
          throw new DistributedRateLimitUnavailableError("Rate limit service invalid response.");
        }
      }
    } catch (err) {
      if (err instanceof DistributedRateLimitUnavailableError) {
        throw err;
      }
      logger.error("rate_limiter.rpc_exception", err, { action });
      if (isProd) {
        throw new DistributedRateLimitUnavailableError("Rate limit service exception.");
      }
    }
  }

  // Development/Test fallback only
  logger.info("rate_limiter.dev_inmemory_fallback", { action });
  return checkInMemoryRateLimit(keyHash, maxRequests, windowMs);
}

function checkInMemoryRateLimit(
  keyHash: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let record = inMemoryStore.get(keyHash);
  if (!record) {
    record = { timestamps: [] };
    inMemoryStore.set(keyHash, record);
  }

  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0] || now;
    const resetMs = Math.max(0, oldest + windowMs - now);
    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - record.timestamps.length,
    resetMs: windowMs,
  };
}

export function resetRateLimitStore(): void {
  inMemoryStore.clear();
}
