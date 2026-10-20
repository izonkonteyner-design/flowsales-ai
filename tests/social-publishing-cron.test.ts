import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = dirname(fileURLToPath(import.meta.url));
const cronRoutePath = join(testsDir, "..", "app", "api", "cron", "social-publishing", "route.ts");
const cronRouteSource = readFileSync(cronRoutePath, "utf8");

test("social publishing cron route checks authorization secret and updates post status", () => {
  assert.match(cronRouteSource, /import "server-only";/);
  assert.match(cronRouteSource, /CRON_SECRET/);
  assert.match(cronRouteSource, /social_publishing_queue/);
  assert.match(cronRouteSource, /social_posts/);
  assert.match(cronRouteSource, /status:\s*"completed"/);
  assert.match(cronRouteSource, /published_at/);
});
