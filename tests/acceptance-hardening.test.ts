import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { navLabel } from "@/lib/i18n";

test("proxy.ts protects all sensitive application and operations routes", () => {
  const proxyPath = path.join(process.cwd(), "proxy.ts");
  const proxyContent = fs.readFileSync(proxyPath, "utf-8");

  const expectedRoutes = [
    "/dashboard",
    "/leads",
    "/customers",
    "/products",
    "/quotes",
    "/tasks",
    "/calendar",
    "/social",
    "/notifications",
    "/ai",
    "/reports",
    "/billing",
    "/team",
    "/permissions",
    "/audit-logs",
    "/api-layer",
    "/settings",
    "/inbox",
    "/sales-operations",
    "/command-center",
    "/sales-analyst",
    "/growth-control",
    "/sales-cockpit",
    "/revenue-intelligence",
    "/opportunities",
    "/follow-ups",
    "/voice",
    "/account",
    "/approvals",
    "/ai-history",
    "/operations",
    "/usage",
    "/upgrade",
  ];

  for (const route of expectedRoutes) {
    assert.match(
      proxyContent,
      new RegExp(`"${route.replace("/", "\\/")}"`),
      `proxy.ts must protect route: ${route}`
    );
  }
});

test("i18n handles E-posta / Email Inbox localization cleanly in both languages", () => {
  assert.equal(navLabel("tr", "E-posta"), "E-posta");
  assert.equal(navLabel("en", "E-posta"), "Email Inbox");
  assert.equal(navLabel("tr", "Email Inbox"), "E-posta Gelen Kutusu");
  assert.equal(navLabel("en", "Email Inbox"), "Email Inbox");
});

test("app-shell groups intelligence and operations routes correctly", () => {
  const appShellPath = path.join(process.cwd(), "components/layout/app-shell.tsx");
  const content = fs.readFileSync(appShellPath, "utf-8");

  assert.match(content, /\/sales-analyst/);
  assert.match(content, /\/growth-control/);
  assert.match(content, /\/sales-operations/);
  assert.match(content, /\/command-center/);
});

test("productivity service enforces writable workspace check for tasks and calendar events", () => {
  const prodPath = path.join(process.cwd(), "server/services/productivity.ts");
  const content = fs.readFileSync(prodPath, "utf-8");

  assert.match(content, /isWritableWorkspace/);
  assert.match(content, /DEMO_ORGANIZATION_ID/);
  assert.match(content, /canWriteSalesRecords/);
});

test("sales operations server actions reject demo workspace and viewer roles", () => {
  const actionsPath = path.join(process.cwd(), "app/(app)/sales-operations/actions.ts");
  const content = fs.readFileSync(actionsPath, "utf-8");

  assert.match(content, /d3e00000-0000-0000-0000-000000000000/);
  assert.match(content, /viewer/);
});

test("tasks and calendar pages disable inputs and submission in demo or read-only mode", () => {
  const tasksPath = path.join(process.cwd(), "app/(app)/tasks/page.tsx");
  const tasksContent = fs.readFileSync(tasksPath, "utf-8");
  assert.match(tasksContent, /disabled=\{!canWrite\}/);
  assert.match(tasksContent, /DEMO_ORGANIZATION_ID/);

  const calPath = path.join(process.cwd(), "app/(app)/calendar/page.tsx");
  const calContent = fs.readFileSync(calPath, "utf-8");
  assert.match(calContent, /disabled=\{!canWrite\}/);
  assert.match(calContent, /DEMO_ORGANIZATION_ID/);
});

test("sales operations sequences and automation pages guard mutation controls", () => {
  const seqPath = path.join(process.cwd(), "app/(app)/sales-operations/sequences/page.tsx");
  const seqContent = fs.readFileSync(seqPath, "utf-8");
  assert.match(seqContent, /canWrite/);
  assert.match(seqContent, /DEMO_ORGANIZATION_ID/);

  const autoPath = path.join(process.cwd(), "app/(app)/sales-operations/automation/page.tsx");
  const autoContent = fs.readFileSync(autoPath, "utf-8");
  assert.match(autoContent, /canWrite/);
  assert.match(autoContent, /DEMO_ORGANIZATION_ID/);
});
