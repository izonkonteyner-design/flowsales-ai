import crypto from "node:crypto";
import { spawn } from "node:child_process";

const ORG_ID = "f11c1551-8b3a-4a18-ad6e-0ab16c061920";
const USER_ID = "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0";
const CONVERSATION_ID = "77777777-7777-4777-a777-777777777777";
const TEMPLATE_NAME = "flowsales_notification";
const TEMPLATE_ID = "1788819732249991";
const TEST_RECIPIENT = "905550743026";
const PRODUCTION_URL = "https://flowsales-ai-six.vercel.app";

function databaseEnv() {
  const raw = process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error("Production PostgreSQL URI is not configured.");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid PostgreSQL URI protocol.");
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
  };
}

async function psql(sql, tuplesOnly = false) {
  return new Promise((resolve, reject) => {
    const args = ["-X", "-v", "ON_ERROR_STOP=1"];
    if (tuplesOnly) args.push("-A", "-t");
    const child = spawn("psql", args, { env: databaseEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { if (stderr.length < 2000) stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `psql exited ${code}`)));
    child.stdin.end(sql);
  });
}

async function createSession() {
  const session = `ingest_session_${crypto.randomBytes(32).toString("hex")}`;
  await psql(`insert into public.oauth_states (organization_id,user_id,provider,state_hash,return_path,expires_at)
    values ('${ORG_ID}'::uuid,'${USER_ID}'::uuid,'whatsapp','${session}','/settings/integrations',now()+interval '10 minutes');`);
  return session;
}

async function callManage(action, body = undefined) {
  const session = await createSession();
  const response = await fetch(`${PRODUCTION_URL}/api/integrations/whatsapp/manage-templates`, {
    method: "POST",
    headers: { "x-ingest-session": session, "x-action": action, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Template management endpoint failed (${response.status}).`);
  return json;
}

function canonicalPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (/^05\d{9}$/.test(digits)) return `90${digits.slice(1)}`;
  if (/^5\d{9}$/.test(digits)) return `90${digits}`;
  return digits;
}

const catalog = await callManage("list");
const templates = Array.isArray(catalog.templates) ? catalog.templates : [];
const template = templates.find((item) => String(item.id) === TEMPLATE_ID || String(item.name) === TEMPLATE_NAME);
if (!template) {
  console.log(JSON.stringify({ decision: "WHATSAPP TEMPLATE DELIVERY BLOCKED", reason: "template_missing_from_live_meta_catalog" }));
  process.exit(0);
}

const status = String(template.status || "UNKNOWN").toUpperCase();
if (status === "REJECTED") {
  console.log(JSON.stringify({ decision: "WHATSAPP TEMPLATE DELIVERY BLOCKED", template: TEMPLATE_NAME, templateId: TEMPLATE_ID, status }));
  process.exit(0);
}
if (status !== "APPROVED") {
  console.log(JSON.stringify({ decision: "WHATSAPP TEMPLATE DELIVERY BLOCKED", template: TEMPLATE_NAME, templateId: TEMPLATE_ID, status }));
  process.exit(0);
}

const recipient = await psql(`select external_id from public.conversations where id='${CONVERSATION_ID}'::uuid and organization_id='${ORG_ID}'::uuid and provider='whatsapp';`, true);
if (canonicalPhone(recipient) !== TEST_RECIPIENT) throw new Error("Safety guard: controlled template conversation is not the allowlisted test recipient.");

const sendResult = await callManage("send", {
  name: TEMPLATE_NAME,
  language: String(template.language || "tr"),
  bodyParameters: ["Cagatay", "FlowSales WhatsApp template delivery verification"],
});
if (!sendResult?.success || !sendResult?.data?.externalId) {
  console.log(JSON.stringify({ decision: "WHATSAPP TEMPLATE DELIVERY FAILED", template: TEMPLATE_NAME, status, errorCode: sendResult?.errorCode || "send_failed" }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    decision: "WHATSAPP TEMPLATE DELIVERY VERIFIED",
    template: TEMPLATE_NAME,
    templateId: TEMPLATE_ID,
    status,
    messageId: sendResult.data.messageId,
    wamid: sendResult.data.externalId,
  }));
}
