import crypto from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const REQUIRED_ROLES = ["owner", "admin", "manager", "sales_rep", "viewer"];
const PERMISSIONS = [
  "manage_members",
  "manage_billing",
  "manage_workspace",
  "review_ai",
  "manage_pipeline",
  "run_ai",
  "import_data",
  "edit_crm",
  "view_crm",
];

const EXPECTED = {
  owner: new Set(PERMISSIONS),
  admin: new Set(PERMISSIONS),
  manager: new Set(["review_ai", "manage_pipeline", "run_ai", "import_data", "edit_crm", "view_crm"]),
  sales_rep: new Set(["run_ai", "import_data", "edit_crm", "view_crm"]),
  viewer: new Set(["view_crm"]),
};

function fail(message, details) {
  const error = new Error(message);
  if (details !== undefined) error.details = details;
  throw error;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

function parseMatrix() {
  let parsed;
  try {
    parsed = JSON.parse(requiredEnv("RLS_TEST_MATRIX_JSON"));
  } catch (error) {
    fail("RLS_TEST_MATRIX_JSON must be valid JSON", error instanceof Error ? error.message : error);
  }

  if (!Array.isArray(parsed)) fail("RLS_TEST_MATRIX_JSON must be an array");

  const entries = parsed.map((entry, index) => {
    const role = String(entry?.role ?? "");
    const email = String(entry?.email ?? "");
    const password = String(entry?.password ?? "");
    const organizationId = String(entry?.organizationId ?? "");
    if (!REQUIRED_ROLES.includes(role) || !email || !password || !organizationId) {
      fail(`Invalid RLS matrix entry at index ${index}`);
    }
    return { role, email, password, organizationId };
  });

  for (const role of REQUIRED_ROLES) {
    if (!entries.some((entry) => entry.role === role)) fail(`RLS matrix is missing role: ${role}`);
  }

  if (new Set(entries.map((entry) => entry.organizationId)).size < 2) {
    fail("RLS matrix must cover at least two independent workspaces");
  }

  return entries;
}

function clientFor(url, anonKey) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signIn(url, anonKey, entry) {
  const client = clientFor(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: entry.email,
    password: entry.password,
  });
  if (error || !data.user) fail(`Unable to sign in RLS test user for role ${entry.role}`, error?.message);
  return { ...entry, client, userId: data.user.id };
}

async function assertPermission(subject, permission, expected) {
  const { data, error } = await subject.client.rpc("has_org_permission", {
    p_organization_id: subject.organizationId,
    p_permission: permission,
  });
  if (error) fail(`Permission RPC failed for ${subject.role}:${permission}`, error.message);
  if (data !== expected) {
    fail(`Unexpected permission for ${subject.role}:${permission}`, { expected, actual: data });
  }
}

async function assertCrossWorkspaceReadDenied(subject, foreignOrganizationId, table) {
  const { data, error } = await subject.client
    .from(table)
    .select("id")
    .eq("organization_id", foreignOrganizationId)
    .limit(1);
  if (error) fail(`Cross-workspace read query failed unexpectedly for ${subject.role} on ${table}`, error.message);
  if ((data ?? []).length !== 0) {
    fail(`Cross-workspace data exposure detected for ${subject.role} on ${table}`);
  }
}

async function assertOwnWorkspaceQueryAllowed(subject, table) {
  const { error } = await subject.client
    .from(table)
    .select("id")
    .eq("organization_id", subject.organizationId)
    .limit(1);
  if (error) fail(`Own-workspace read denied for ${subject.role} on ${table}`, error.message);
}

async function assertImportWrite(subject, admin, shouldAllow) {
  const id = crypto.randomUUID();
  const payload = {
    id,
    organization_id: subject.organizationId,
    actor_id: subject.userId,
    entity_type: "leads",
    status: "pending",
    total_rows: 0,
    imported_rows: 0,
    rejected_rows: 0,
    error_report: [],
  };

  const { error } = await subject.client.from("import_jobs").insert(payload);
  if (shouldAllow && error) fail(`Expected import write to succeed for ${subject.role}`, error.message);
  if (!shouldAllow && !error) fail(`Viewer import write unexpectedly succeeded`);

  await admin.from("import_jobs").delete().eq("id", id);
}

async function assertCrossWorkspaceWriteDenied(subject, admin, foreignOrganizationId) {
  const id = crypto.randomUUID();
  const { error } = await subject.client.from("import_jobs").insert({
    id,
    organization_id: foreignOrganizationId,
    actor_id: subject.userId,
    entity_type: "leads",
    status: "pending",
    total_rows: 0,
    imported_rows: 0,
    rejected_rows: 0,
    error_report: [],
  });
  await admin.from("import_jobs").delete().eq("id", id);
  if (!error) fail(`Cross-workspace import write unexpectedly succeeded for ${subject.role}`);
}

async function main() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const matrix = parseMatrix();
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const subjects = [];
  for (const entry of matrix) subjects.push(await signIn(url, anonKey, entry));

  for (const subject of subjects) {
    for (const permission of PERMISSIONS) {
      await assertPermission(subject, permission, EXPECTED[subject.role].has(permission));
    }

    for (const table of ["ai_runs", "ai_approval_requests", "import_jobs", "notifications"]) {
      await assertOwnWorkspaceQueryAllowed(subject, table);
    }

    const foreignOrganizationId = matrix.find(
      (entry) => entry.organizationId !== subject.organizationId,
    )?.organizationId;
    if (!foreignOrganizationId) fail("Unable to resolve foreign workspace");

    for (const table of ["ai_runs", "ai_approval_requests", "import_jobs", "notifications"]) {
      await assertCrossWorkspaceReadDenied(subject, foreignOrganizationId, table);
    }

    await assertCrossWorkspaceWriteDenied(subject, admin, foreignOrganizationId);
    await assertImportWrite(subject, admin, subject.role !== "viewer");
  }

  console.log(JSON.stringify({
    status: "ok",
    workspaces: new Set(matrix.map((entry) => entry.organizationId)).size,
    roles: REQUIRED_ROLES,
    permissionsChecked: PERMISSIONS.length,
    crossWorkspaceTables: ["ai_runs", "ai_approval_requests", "import_jobs", "notifications"],
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "error",
    message: error instanceof Error ? error.message : "Unknown error",
    details: error?.details ?? null,
  }));
  process.exitCode = 1;
});
