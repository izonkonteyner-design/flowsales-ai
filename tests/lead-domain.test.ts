import test from "node:test";
import assert from "node:assert/strict";

import { leadFormSchema } from "@/lib/validations/lead";
import type { Activity, Lead, Task } from "@/types/crm";
import {
  buildLeadDashboardMetrics,
  buildLeadStatusActivity,
  canManageLeads,
  canMutateLeadRecord,
  isLeadInOrganization,
} from "@/server/services/lead-domain";
import { leadStatusChangeSchema } from "@/lib/validations/lead";

const baseLead: Lead = {
  id: "lead_1",
  organization_id: "org_1",
  full_name: "Jane Doe",
  company: "Acme",
  email: "jane@example.com",
  phone: "+90 555 111 2233",
  city: "Istanbul",
  source: "Website",
  status: "new",
  estimated_value: 120000,
  currency: "TRY",
  notes: "Interested in a site cabin.",
  assigned_to: "user_1",
  next_follow_up_at: "2026-07-18T10:00:00.000Z",
  created_by: "user_2",
  created_at: "2026-07-10T09:00:00.000Z",
  updated_at: "2026-07-15T09:00:00.000Z",
};

test("lead form validation accepts valid payloads", () => {
  const parsed = leadFormSchema.parse({
    full_name: "Jane Doe",
    company: "Acme",
    email: "jane@example.com",
    phone: "+90 555 111 2233",
    city: "Istanbul",
    source: "Website",
    status: "qualified",
    estimated_value: "125000",
    currency: "TRY",
    notes: "Interested in modular office space.",
    assigned_to: "user_1",
    next_follow_up_at: "2026-07-20",
  });

  assert.equal(parsed.full_name, "Jane Doe");
  assert.equal(parsed.estimated_value, 125000);
});

test("lead form validation rejects empty lead value", () => {
  assert.throws(
    () =>
      leadFormSchema.parse({
        full_name: "Jane Doe",
        company: "",
        email: "",
        phone: "",
        city: "",
        source: "Website",
        status: "new",
        estimated_value: "",
        currency: "TRY",
        notes: "",
        assigned_to: "",
        next_follow_up_at: "",
      }),
    /Estimated value is required|invalid/i,
  );
});

test("lead permissions block viewer actions", () => {
  assert.equal(canManageLeads("owner"), true);
  assert.equal(canManageLeads("admin"), true);
  assert.equal(canManageLeads("sales"), true);
  assert.equal(canManageLeads("viewer"), false);
});

test("demo leads cannot be mutated", () => {
  assert.equal(canMutateLeadRecord("demo", "owner"), false);
  assert.equal(canMutateLeadRecord("demo", "sales"), false);
});

test("live UUID leads can change status", () => {
  assert.equal(canMutateLeadRecord("live", "sales"), true);

  const parsed = leadStatusChangeSchema.parse({
    lead_id: "550e8400-e29b-41d4-a716-446655440000",
    status: "qualified",
  });

  assert.equal(parsed.lead_id, "550e8400-e29b-41d4-a716-446655440000");
});

test("invalid lead ids are rejected", () => {
  assert.equal(
    leadStatusChangeSchema.safeParse({
      lead_id: "lead_004",
      status: "qualified",
    }).success,
    false,
  );
});

test("lead organization isolation is enforced by helper", () => {
  assert.equal(isLeadInOrganization(baseLead, "org_1"), true);
  assert.equal(isLeadInOrganization(baseLead, "org_2"), false);
});

test("status transitions produce the right activity copy", () => {
  const activity = buildLeadStatusActivity("new", "qualified", baseLead.full_name);

  assert.ok(activity);
  assert.equal(activity?.type, "status_changed");
  assert.match(activity?.detail ?? "", /Qualified/i);
});

test("dashboard lead metrics use live lead data", () => {
  const leads: Lead[] = [
    baseLead,
    {
      ...baseLead,
      id: "lead_2",
      status: "won",
      source: "Referral",
      estimated_value: 300000,
      next_follow_up_at: "2026-07-16T12:00:00.000Z",
      created_at: "2026-07-12T09:00:00.000Z",
    },
  ];
  const tasks: Task[] = [
    {
      id: "task_1",
      organization_id: "org_1",
      lead_id: "lead_1",
      title: "Call prospect",
      due_at: "2026-07-16T10:00:00.000Z",
      priority: "high",
      assigned_to: "user_1",
      status: "open",
      created_at: "2026-07-15T10:00:00.000Z",
      updated_at: "2026-07-15T10:00:00.000Z",
    },
  ];
  const activities: Activity[] = [
    {
      id: "activity_1",
      organization_id: "org_1",
      lead_id: "lead_1",
      quote_id: null,
      type: "lead_created",
      title: "Lead created",
      detail: "Jane Doe was created.",
      created_at: "2026-07-10T09:00:00.000Z",
    },
  ];

  const metrics = buildLeadDashboardMetrics({ leads, tasks, activities, now: new Date("2026-07-16T09:00:00.000Z") });

  assert.equal(metrics.totalLeads, 2);
  assert.equal(metrics.newLeads, 1);
  assert.equal(metrics.pipelineValue, 420000);
  assert.equal(metrics.wonRevenue, 300000);
  assert.equal(metrics.overdueFollowUps, 0);
  assert.equal(metrics.followUpsDue, 2);
  assert.equal(metrics.tasksDueToday, 1);
});
