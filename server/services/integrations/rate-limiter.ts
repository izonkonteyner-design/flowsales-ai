import * as crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { logger } from "@/lib/logger";

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
    throw new Error("RATE_LIMIT_HASH_SECRET is required in production environment.");
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
 * Fallback to in-memory sliding window for unit testing and local development.
 */
export async function checkRateLimit(
  rawIpOrKey: string,
  action: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const keyHash = hashIp(rawIpOrKey, action);
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("check_distributed_rate_limit", {
      p_key_hash: keyHash,
      p_action: action,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0];
      return {
        allowed: Boolean(row.allowed),
        remaining: Number(row.remaining ?? 0),
        resetMs: Number(row.reset_ms ?? windowMs),
      };
    }
  } catch (err) {
    logger.warn("rate_limiter.distributed_check_fallback", { action, error: err instanceof Error ? err.message : String(err) });
  }

  // Fallback to in-memory sliding window
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
