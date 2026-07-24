type LoggerContext = Record<string, unknown>;

const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passcode",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "secret",
  "apikey",
  "servicerolekey",
  "demouserpassword",
  "credential",
];

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function shouldRedactKey(key: string) {
  const normalizedKey = normalizeKey(key);
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalizedKey.includes(pattern) || pattern.includes(normalizedKey));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const type = typeof value;

  if (type === "string" || type === "number" || type === "boolean") {
    return value;
  }

  if (type === "bigint") {
    return value.toString();
  }

  if (type === "symbol" || type === "function") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (value instanceof Error) {
    const errorContext: LoggerContext = {
      name: value.name,
      message: value.message,
    };

    if (value.stack) {
      errorContext.stack = value.stack;
    }

    const cause = (value as Error & { cause?: unknown }).cause;
    if (cause !== undefined) {
      errorContext.cause = redactValue(cause, seen);
    }

    return errorContext;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[CIRCULAR]";
    }

    seen.add(value);
    return value.map((item) => redactValue(item, seen));
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return "[CIRCULAR]";
  }

  seen.add(value);

  const redacted: LoggerContext = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    redacted[key] = shouldRedactKey(key) ? "[REDACTED]" : redactValue(nestedValue, seen);
  }

  return redacted;
}

export function redactData(value: unknown) {
  return redactValue(value, new WeakSet<object>());
}

function serializeLogEntry(level: "info" | "warn" | "error", event: string, payload?: LoggerContext) {
  return JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...(payload ? { data: redactData(payload) } : {}),
  });
}

export const logger = {
  info(event: string, data?: LoggerContext) {
    console.log(serializeLogEntry("info", event, data));
  },
  warn(event: string, data?: LoggerContext) {
    console.warn(serializeLogEntry("warn", event, data));
  },
  error(event: string, error?: unknown, data?: LoggerContext) {
    console.error(
      JSON.stringify({
        level: "error",
        event,
        timestamp: new Date().toISOString(),
        ...(error !== undefined ? { error: redactData(error) } : {}),
        ...(data ? { data: redactData(data) } : {}),
      }),
    );
  },
};
