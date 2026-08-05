import * as crypto from "node:crypto";

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Hashes an IP address using SHA-256 so raw IP addresses are never stored in memory or logs.
 */
export function hashIp(ip: string): string {
  const salt = process.env.TOKEN_ENCRYPTION_KEY || "rate_limit_salt";
  return crypto.createHash("sha256").update(`${ip}_${salt}`).digest("hex");
}

/**
 * In-memory sliding window rate limiter.
 *
 * @param rawKey Unhashed key or client identifier
 * @param maxRequests Maximum allowed requests in window
 * @param windowMs Window duration in milliseconds
 */
export function checkRateLimit(
  rawKey: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetMs: number } {
  const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");
  const now = Date.now();
  const windowStart = now - windowMs;

  let record = rateLimitStore.get(hashedKey);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(hashedKey, record);
  }

  // Prune timestamps older than window
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

/**
 * Resets rate limit store (for unit tests).
 */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}
