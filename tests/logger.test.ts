import test from "node:test";
import assert from "node:assert/strict";

import { logger, redactData } from "@/lib/logger";

test("logger redaction masks nested secret-like keys across naming styles", () => {
  const input = {
    password: "p1",
    passCode: "p2",
    accessToken: "p3",
    refresh_token: "p4",
    Authorization: "Bearer abc",
    cookie: "session=1",
    secret: "s1",
    apiKey: "k1",
    serviceRoleKey: "srk",
    demoUserPassword: "demo-pass",
    credential: "cred",
    profile: {
      nestedToken: "nested",
      items: [
        {
          access_token: "deep",
          label: "keep",
        },
      ],
    },
  };

  const redacted = redactData(input);

  assert.deepEqual(redacted, {
    password: "[REDACTED]",
    passCode: "[REDACTED]",
    accessToken: "[REDACTED]",
    refresh_token: "[REDACTED]",
    Authorization: "[REDACTED]",
    cookie: "[REDACTED]",
    secret: "[REDACTED]",
    apiKey: "[REDACTED]",
    serviceRoleKey: "[REDACTED]",
    demoUserPassword: "[REDACTED]",
    credential: "[REDACTED]",
    profile: {
      nestedToken: "[REDACTED]",
      items: [
        {
          access_token: "[REDACTED]",
          label: "keep",
        },
      ],
    },
  });
});

test("logger redaction handles arrays and circular references safely", () => {
  const input: {
    items: Array<{ name: string; secretValue?: string }>;
    self?: unknown;
  } = {
    items: [
      {
        name: "visible",
        secretValue: "hidden",
      },
    ],
  };

  input.self = input;

  const redacted = redactData(input);

  assert.deepEqual(redacted, {
    items: [
      {
        name: "visible",
        secretValue: "[REDACTED]",
      },
    ],
    self: "[CIRCULAR]",
  });
});

test("logger emits JSON without leaking secret values", () => {
  const originalError = console.error;
  const captured: string[] = [];

  console.error = ((message?: unknown) => {
    captured.push(String(message));
  }) as typeof console.error;

  try {
    logger.error("demo_log", {
      password: "should-not-appear",
      nested: {
        serviceRoleKey: "also-hidden",
      },
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(captured.length, 1);

  const parsed = JSON.parse(captured[0] as string) as {
    level: string;
    event: string;
    error: {
      password: string;
      nested: {
        serviceRoleKey: string;
      };
    };
  };

  assert.equal(parsed.level, "error");
  assert.equal(parsed.event, "demo_log");
  assert.equal(parsed.error.password, "[REDACTED]");
  assert.equal(parsed.error.nested.serviceRoleKey, "[REDACTED]");
  assert.ok(!captured[0].includes("should-not-appear"));
  assert.ok(!captured[0].includes("also-hidden"));
});
