import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import {
  demoActivities,
  demoLeads,
  demoOrganization,
  demoTasks,
} from "@/server/services/crm-data";
import { demoTeam } from "@/server/services/workspace-data";
import {
  buildLeadDashboardMetrics,
  buildLeadStatusActivity,
  canManageLeads,
  filterLeads,
  isLeadOverdue,
  isLeadUpcoming,
  isLeadInOrganization,
  normalizeLeadSearchParams,
  paginateLeads,
  sortLeads,
  type LeadDashboardMetrics,
  type LeadFilterState,
  type LeadMemberOption,
  type LeadRole,
} from "@/server/services/lead-domain";
import type { Activity, Lead, Organization, Task } from "@/types/crm";

export type LeadRow = Lead & {
  assigned_to_label: string;
  created_by_label: string;
  overdue_follow_up: boolean;
  upcoming_follow_up: boolean;
};

export type LeadWorkspaceContext = {
  mode: "demo" | "live";
  organization: Organization;
  role: LeadRole;
  userId: string | null;
  members: LeadMemberOption[];
};

export type LeadPageData = {
  context: LeadWorkspaceContext;
  filters: LeadFilterState;
  total: number;
  totalPages: number;
  currentPage: number;
  leads: LeadRow[];
  allLeads: LeadRow[];
  summary: LeadDashboardMetrics;
};

export type LeadDetailData = {
  context: LeadWorkspaceContext;
  lead: LeadRow | null;
  tasks: Task[];
  activities: Activity[];
};

export type LeadDashboardData = {
  context: LeadWorkspaceContext;
  metrics: LeadDashboardMetrics;
};

type LeadMutationContext = {
  client: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  context: LeadWorkspaceContext;
};

function mapDemoMembers(): LeadMemberOption[] {
  return demoTeam.map((member) => ({
    user_id: member.id,
    full_name: member.name,
    role: member.role,
  }));
}

function createDemoContext(): LeadWorkspaceContext {
  return {
    mode: "demo",
    organization: demoOrganization,
    role: demoOrganization.role,
    userId: null,
    members: mapDemoMembers(),
  };
}

function mapLeadRow(lead: Lead, members: LeadMemberOption[]): LeadRow {
  const memberMap = new Map(members.map((member) => [member.user_id, member.full_name]));
  const assigned_to_label = lead.assigned_to ? memberMap.get(lead.assigned_to) ?? lead.assigned_to : "Unassigned";
  const created_by_label = lead.created_by ? memberMap.get(lead.created_by) ?? lead.created_by : "Team member";

  return {
    ...lead,
    assigned_to_label,
    created_by_label,
    overdue_follow_up: isLeadOverdue(lead.next_follow_up_at),
    upcoming_follow_up: isLeadUpcoming(lead.next_follow_up_at),
  };
}

async function loadLiveContext(): Promise<LeadWorkspaceContext | null> {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return null;
  }

  const { data: organization, error: orgError } = await client
    .from("organizations")
    .select("id, name, slug, currency")
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (orgError || !organization) {
    return null;
  }

  let members: LeadMemberOption[] = [];
  try {
    const { data } = await client.rpc("get_org_member_options", {
      target_org: organization.id,
    });

    members = (data ?? []).map((member: { user_id: string; full_name: string; role: LeadRole }) => ({
      user_id: member.user_id,
      full_name: member.full_name,
      role: member.role,
    }));
  } catch {
    members = [];
  }

  return {
    mode: "live",
    organization: organization as Organization,
    role: membership.role as LeadRole,
    userId: user.id,
    members,
  };
}

async function getWorkspaceContext(): Promise<LeadWorkspaceContext> {
  const liveContext = await loadLiveContext();
  return liveContext ?? createDemoContext();
}

async function loadLiveLeads(context: LeadWorkspaceContext) {
  const client = await createSupabaseServerClient();
  if (!client || context.mode === "demo") {
    return null;
  }

  const { data, error } = await client
    .from("leads")
    .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
    .eq("organization_id", context.organization.id);

  if (error || !data) {
    return null;
  }

  return data.map((lead) => mapLeadRow(lead as Lead, context.members));
}

function buildPageData(
  context: LeadWorkspaceContext,
  filters: LeadFilterState,
  leads: LeadRow[],
): LeadPageData {
  const filtered = sortLeads(filterLeads(leads, filters), filters.sort).map((lead) => lead);
  const page = paginateLeads(filtered, filters.page, filters.pageSize);
  const summary = buildLeadDashboardMetrics({
    leads: filtered,
    tasks: [],
    activities: [],
  });

  return {
    context,
    filters,
    total: page.total,
    totalPages: page.totalPages,
    currentPage: page.currentPage,
    leads: page.items,
    allLeads: filtered,
    summary,
  };
}

export async function getLeadPageData(input: Partial<Record<string, string | string[] | undefined>>) {
  const context = await getWorkspaceContext();
  const filters = normalizeLeadSearchParams(input);

  if (context.mode === "demo") {
    const leadRows = demoLeads.map((lead) => mapLeadRow(lead, context.members));
    return buildPageData(context, filters, leadRows);
  }

  const liveLeads = await loadLiveLeads(context);
  if (!liveLeads) {
    const leadRows = demoLeads.map((lead) => mapLeadRow(lead, context.members));
    return buildPageData(context, filters, leadRows);
  }

  return buildPageData(context, filters, liveLeads);
}

export async function getLeadDetailData(id: string) {
  const context = await getWorkspaceContext();

  if (context.mode === "demo") {
    const lead = demoLeads.find((item) => item.id === id) ?? null;
    const tasks = demoTasks.filter((task) => task.lead_id === id);
    const activities = demoActivities.filter((activity) => activity.lead_id === id);
    return {
      context,
      lead: lead ? mapLeadRow(lead, context.members) : null,
      tasks,
      activities,
    } satisfies LeadDetailData;
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      context: createDemoContext(),
      lead: null,
      tasks: [],
      activities: [],
    } satisfies LeadDetailData;
  }

  const { data: lead, error } = await client
    .from("leads")
    .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
    .eq("id", id)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (error || !lead) {
    return {
      context,
      lead: null,
      tasks: [],
      activities: [],
    } satisfies LeadDetailData;
  }

  const [tasksResponse, activitiesResponse] = await Promise.all([
    client
      .from("tasks")
      .select("id, organization_id, lead_id, title, due_at, priority, assigned_to, status, created_at, updated_at")
      .eq("lead_id", id)
      .eq("organization_id", context.organization.id)
      .order("due_at", { ascending: true }),
    client
      .from("activities")
      .select("id, organization_id, lead_id, quote_id, type, title, detail, created_by, created_at, updated_at")
      .eq("lead_id", id)
      .eq("organization_id", context.organization.id)
      .order("created_at", { ascending: false }),
  ]);

  const memberMap = new Map(context.members.map((member) => [member.user_id, member.full_name]));
  const leadRow = mapLeadRow(lead as Lead, context.members);

  return {
    context,
    lead: {
      ...leadRow,
      created_by_label: lead.created_by ? memberMap.get(lead.created_by) ?? "Team member" : "Team member",
    },
    tasks: (tasksResponse.data ?? []) as Task[],
    activities: (activitiesResponse.data ?? []) as Activity[],
  };
}

async function getMutationContext(): Promise<LeadMutationContext | null> {
  const context = await getWorkspaceContext();
  const client = await createSupabaseServerClient();

  if (!client || context.mode === "demo") {
    return null;
  }

  return { client, context };
}

function ensureCanManage(context: LeadWorkspaceContext) {
  if (!canManageLeads(context.role)) {
    throw new Error("You do not have permission to change leads.");
  }
}

function ensureLeadInOrganization(lead: Pick<Lead, "organization_id">, organizationId: string) {
  if (!isLeadInOrganization(lead, organizationId)) {
    throw new Error("Lead not found.");
  }
}

async function getLeadForMutation(client: NonNullable<LeadMutationContext["client"]>, context: LeadWorkspaceContext, leadId: string) {
  const { data, error } = await client
    .from("leads")
    .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
    .eq("id", leadId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Lead not found.");
  }

  ensureLeadInOrganization(data as Lead, context.organization.id);
  return data as Lead;
}

function buildLeadInsertPayload(input: {
  full_name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  source: string;
  status: string;
  estimated_value: number;
  currency: string;
  notes: string;
  assigned_to: string;
  next_follow_up_at: string | null;
}) {
  return {
    full_name: input.full_name,
    company: input.company || null,
    email: input.email || null,
    phone: input.phone || null,
    city: input.city || null,
    source: input.source,
    status: input.status,
    estimated_value: input.estimated_value,
    currency: input.currency,
    notes: input.notes || null,
    assigned_to: input.assigned_to || null,
    next_follow_up_at: input.next_follow_up_at,
  };
}

export async function createLeadRecord(input: {
  full_name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  source: string;
  status: string;
  estimated_value: number;
  currency: string;
  notes: string;
  assigned_to: string;
  next_follow_up_at: string | null;
}) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Lead creation requires a live Supabase session.");
  }

  ensureCanManage(mutation.context);

  const { data: lead, error } = await mutation.client
    .from("leads")
    .insert({
      organization_id: mutation.context.organization.id,
      created_by: mutation.context.userId,
      ...buildLeadInsertPayload(input),
    })
    .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
    .single();

  if (error || !lead) {
    throw new Error(error?.message ?? "Unable to create lead.");
  }

  await mutation.client.from("activities").insert({
    organization_id: mutation.context.organization.id,
    lead_id: lead.id,
    type: "lead_created",
    title: "Lead created",
    detail: `Lead ${input.full_name} was created.`,
    created_by: mutation.context.userId,
  });

  return { lead: lead as Lead };
}

export async function updateLeadRecord(
  leadId: string,
  input: {
    full_name: string;
    company: string;
    email: string;
    phone: string;
    city: string;
    source: string;
    status: string;
    estimated_value: number;
    currency: string;
    notes: string;
    assigned_to: string;
    next_follow_up_at: string | null;
  },
) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Lead updates require a live Supabase session.");
  }

  ensureCanManage(mutation.context);
  const currentLead = await getLeadForMutation(mutation.client, mutation.context, leadId);

  const { data: lead, error } = await mutation.client
    .from("leads")
    .update({
      ...buildLeadInsertPayload(input),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("organization_id", mutation.context.organization.id)
    .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
    .single();

  if (error || !lead) {
    throw new Error(error?.message ?? "Unable to update lead.");
  }

  const statusActivity = buildLeadStatusActivity(
    currentLead.status,
    input.status as Lead["status"],
    currentLead.full_name,
  );

  await mutation.client.from("activities").insert({
    organization_id: mutation.context.organization.id,
    lead_id: leadId,
    type: statusActivity?.type ?? "lead_updated",
    title: statusActivity?.title ?? "Lead updated",
    detail: statusActivity?.detail ?? `Lead ${input.full_name} was updated.`,
    created_by: mutation.context.userId,
  });

  return { lead: lead as Lead };
}

export async function changeLeadStatusRecord(leadId: string, status: string) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Lead status updates require a live Supabase session.");
  }

  ensureCanManage(mutation.context);
  const currentLead = await getLeadForMutation(mutation.client, mutation.context, leadId);

  const { data: lead, error } = await mutation.client
    .from("leads")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("organization_id", mutation.context.organization.id)
    .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
    .single();

  if (error || !lead) {
    throw new Error(error?.message ?? "Unable to change lead status.");
  }

  if (currentLead.status !== status) {
    const statusActivity = buildLeadStatusActivity(
      currentLead.status,
      status as Lead["status"],
      currentLead.full_name,
    );
    await mutation.client.from("activities").insert({
      organization_id: mutation.context.organization.id,
      lead_id: leadId,
      type: statusActivity?.type ?? "status_changed",
      title: statusActivity?.title ?? "Status changed",
      detail: statusActivity?.detail ?? `${currentLead.full_name} status changed.`,
      created_by: mutation.context.userId,
    });
  }

  return { lead: lead as Lead };
}

export async function addLeadNoteRecord(leadId: string, note: string) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Lead notes require a live Supabase session.");
  }

  ensureCanManage(mutation.context);
  const currentLead = await getLeadForMutation(mutation.client, mutation.context, leadId);
  const combinedNotes = [currentLead.notes?.trim(), note.trim()].filter(Boolean).join("\n\n");

  const { data: lead, error } = await mutation.client
    .from("leads")
    .update({
      notes: combinedNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("organization_id", mutation.context.organization.id)
    .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
    .single();

  if (error || !lead) {
    throw new Error(error?.message ?? "Unable to add note.");
  }

  await mutation.client.from("activities").insert({
    organization_id: mutation.context.organization.id,
    lead_id: leadId,
    type: "note_added",
    title: "Note added",
    detail: note.trim(),
    created_by: mutation.context.userId,
  });

  return { lead: lead as Lead };
}

export async function scheduleLeadFollowUpRecord(leadId: string, next_follow_up_at: string) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Lead follow-ups require a live Supabase session.");
  }

  ensureCanManage(mutation.context);
  const currentLead = await getLeadForMutation(mutation.client, mutation.context, leadId);

  const { data: lead, error } = await mutation.client
    .from("leads")
    .update({
      next_follow_up_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("organization_id", mutation.context.organization.id)
    .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
    .single();

  if (error || !lead) {
    throw new Error(error?.message ?? "Unable to schedule follow-up.");
  }

  await mutation.client.from("activities").insert({
    organization_id: mutation.context.organization.id,
    lead_id: leadId,
    type: "follow_up_scheduled",
    title: "Follow-up scheduled",
    detail: `${currentLead.full_name} next follow-up set for ${new Date(next_follow_up_at).toLocaleString("en-US")}.`,
    created_by: mutation.context.userId,
  });

  return { lead: lead as Lead };
}

export async function createLeadTaskRecord(input: {
  leadId: string;
  title: string;
  dueAt: string;
  priority: "low" | "medium" | "high";
  assignedTo: string;
}) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Task creation requires a live Supabase session.");
  }

  ensureCanManage(mutation.context);
  const currentLead = await getLeadForMutation(mutation.client, mutation.context, input.leadId);

  const { data: task, error } = await mutation.client
    .from("tasks")
    .insert({
      organization_id: mutation.context.organization.id,
      lead_id: input.leadId,
      title: input.title,
      due_at: input.dueAt,
      priority: input.priority,
      assigned_to: input.assignedTo || mutation.context.userId,
      status: "open",
      created_by: mutation.context.userId,
    })
    .select("id, organization_id, lead_id, title, due_at, priority, assigned_to, status, created_at, updated_at")
    .single();

  if (error || !task) {
    throw new Error(error?.message ?? "Unable to create task.");
  }

  await mutation.client.from("activities").insert({
    organization_id: mutation.context.organization.id,
    lead_id: input.leadId,
    type: "task_created",
    title: "Task created",
    detail: `${currentLead.full_name} received task ${input.title}.`,
    created_by: mutation.context.userId,
  });

  return { task: task as Task };
}

export async function deleteLeadRecord(leadId: string) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Lead deletion requires a live Supabase session.");
  }

  ensureCanManage(mutation.context);
  await getLeadForMutation(mutation.client, mutation.context, leadId);

  const { error } = await mutation.client
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("organization_id", mutation.context.organization.id);

  if (error) {
    throw new Error(error.message ?? "Unable to delete lead.");
  }
}

export async function getLeadDashboardData(): Promise<LeadDashboardData> {
  const context = await getWorkspaceContext();

  if (context.mode === "demo") {
    return {
      context,
      metrics: buildLeadDashboardMetrics({
        leads: demoLeads,
        tasks: demoTasks,
        activities: demoActivities,
      }),
    };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      context,
      metrics: buildLeadDashboardMetrics({
        leads: demoLeads,
        tasks: demoTasks,
        activities: demoActivities,
      }),
    };
  }

  const [leadsResponse, tasksResponse, activitiesResponse] = await Promise.all([
    client
      .from("leads")
      .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
      .eq("organization_id", context.organization.id),
    client
      .from("tasks")
      .select("id, organization_id, lead_id, title, due_at, priority, assigned_to, status, created_at, updated_at")
      .eq("organization_id", context.organization.id),
    client
      .from("activities")
      .select("id, organization_id, lead_id, quote_id, type, title, detail, created_by, created_at, updated_at")
      .eq("organization_id", context.organization.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const leads = (leadsResponse.data ?? []).map((lead) => mapLeadRow(lead as Lead, context.members));
  const tasks = (tasksResponse.data ?? []) as Task[];
  const activities = (activitiesResponse.data ?? []) as Activity[];

  return {
    context,
    metrics: buildLeadDashboardMetrics({
      leads,
      tasks,
      activities,
    }),
  };
}
