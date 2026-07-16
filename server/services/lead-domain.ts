import { LEAD_STATUSES } from "@/lib/constants";
import type { Activity, Lead, LeadStatus, Organization, Task } from "@/types/crm";

export type LeadRole = Organization["role"];
export type LeadSortMode = "newest" | "oldest" | "value" | "follow_up";
export type LeadViewMode = "table" | "pipeline";

export type LeadFilterState = {
  query: string;
  status: LeadStatus | "";
  source: string;
  assignedTo: string;
  sort: LeadSortMode;
  view: LeadViewMode;
  page: number;
  pageSize: number;
};

export type LeadMemberOption = {
  user_id: string;
  full_name: string;
  role: LeadRole;
};

export type LeadDashboardMetrics = {
  totalLeads: number;
  newLeads: number;
  pipelineValue: number;
  quotesSent: number;
  wonRevenue: number;
  conversionRate: number;
  averageDealValue: number;
  followUpsDue: number;
  overdueFollowUps: number;
  tasksDueToday: number;
  leadSources: Array<{ label: string; value: number }>;
  leadsByStatus: Array<{ label: string; value: number }>;
  pipelineStages: Array<{ label: string; value: number }>;
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  recentLeads: Lead[];
  recentActivity: Activity[];
  aiRecommendations: string[];
};

const statusLabels = new Map(LEAD_STATUSES.map((status) => [status.value, status.label]));
const statusIndex = new Map(LEAD_STATUSES.map((status, index) => [status.value, index]));

export function canManageLeads(role: LeadRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "sales";
}

export function canViewLeads(role: LeadRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "sales" || role === "viewer";
}

export function isLeadInOrganization(lead: Pick<Lead, "organization_id">, organizationId: string) {
  return lead.organization_id === organizationId;
}

export function getLeadStatusLabel(status: LeadStatus) {
  return statusLabels.get(status) ?? status.replace("_", " ");
}

export function buildLeadStatusActivity(
  previousStatus: LeadStatus,
  nextStatus: LeadStatus,
  leadName: string,
) {
  if (previousStatus === nextStatus) {
    return null;
  }

  return {
    type: "status_changed" as const,
    title: "Status changed",
    detail: `${leadName} moved from ${getLeadStatusLabel(previousStatus)} to ${getLeadStatusLabel(nextStatus)}.`,
  };
}

export function getLeadStatusTone(status: LeadStatus): "neutral" | "info" | "warning" | "success" | "danger" {
  const index = statusIndex.get(status) ?? 0;

  if (status === "won") {
    return "success";
  }

  if (status === "lost") {
    return "danger";
  }

  if (status === "quote_sent" || status === "negotiation") {
    return "warning";
  }

  if (index <= 2) {
    return "info";
  }

  return "neutral";
}

export function normalizeLeadSearchParams(
  input: Partial<Record<string, string | string[] | undefined>>,
): LeadFilterState {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const status =
    typeof input.status === "string" && statusLabels.has(input.status as LeadStatus)
      ? (input.status as LeadStatus)
      : "";
  const source = typeof input.source === "string" ? input.source.trim() : "";
  const assignedTo = typeof input.assignedTo === "string" ? input.assignedTo.trim() : "";
  const sortValue = typeof input.sort === "string" ? input.sort : "newest";
  const viewValue = input.view === "pipeline" ? "pipeline" : "table";
  const page = Number.parseInt(typeof input.page === "string" ? input.page : "1", 10);
  const pageSize = Number.parseInt(typeof input.pageSize === "string" ? input.pageSize : "8", 10);

  return {
    query,
    status,
    source,
    assignedTo,
    sort:
      sortValue === "oldest" || sortValue === "value" || sortValue === "follow_up"
        ? sortValue
        : "newest",
    view: viewValue,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 8,
  };
}

export function isLeadOverdue(nextFollowUpAt: string | null, now = new Date()) {
  return Boolean(nextFollowUpAt && new Date(nextFollowUpAt).getTime() < now.getTime());
}

export function isLeadUpcoming(nextFollowUpAt: string | null, now = new Date()) {
  if (!nextFollowUpAt) {
    return false;
  }

  const followUpDate = new Date(nextFollowUpAt).getTime();
  return followUpDate >= now.getTime() && followUpDate <= now.getTime() + 1000 * 60 * 60 * 24 * 7;
}

export function formatLeadFollowUpState(nextFollowUpAt: string | null, now = new Date()) {
  if (!nextFollowUpAt) {
    return { label: "Not set", tone: "neutral" as const };
  }

  if (isLeadOverdue(nextFollowUpAt, now)) {
    return { label: "Overdue", tone: "danger" as const };
  }

  if (isLeadUpcoming(nextFollowUpAt, now)) {
    return { label: "Upcoming", tone: "warning" as const };
  }

  return { label: "Scheduled", tone: "info" as const };
}

export function sortLeads<T extends Lead>(leads: T[], sort: LeadSortMode) {
  return [...leads].sort((a, b) => {
    if (sort === "oldest") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }

    if (sort === "value") {
      return Number(b.estimated_value) - Number(a.estimated_value);
    }

    if (sort === "follow_up") {
      const aValue = a.next_follow_up_at ? new Date(a.next_follow_up_at).getTime() : Number.POSITIVE_INFINITY;
      const bValue = b.next_follow_up_at ? new Date(b.next_follow_up_at).getTime() : Number.POSITIVE_INFINITY;
      return aValue - bValue;
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function filterLeads<T extends Lead>(leads: T[], filters: LeadFilterState) {
  const query = filters.query.toLowerCase();

  return leads.filter((lead) => {
    const matchesQuery =
      !query ||
      [lead.full_name, lead.company, lead.email, lead.phone, lead.city, lead.source]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));

    const matchesStatus = !filters.status || lead.status === filters.status;
    const matchesSource = !filters.source || lead.source === filters.source;
    const matchesAssigned = !filters.assignedTo || lead.assigned_to === filters.assignedTo;

    return matchesQuery && matchesStatus && matchesSource && matchesAssigned;
  });
}

export function paginateLeads<T>(leads: T[], page: number, pageSize: number) {
  const total = leads.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    currentPage,
    totalPages,
    total,
    items: leads.slice(start, start + pageSize),
  };
}

export function buildLeadDashboardMetrics({
  leads,
  tasks,
  activities,
  now = new Date(),
}: {
  leads: Lead[];
  tasks: Task[];
  activities: Activity[];
  now?: Date;
}): LeadDashboardMetrics {
  const totalLeads = leads.length;
  const newLeads = leads.filter((lead) => lead.status === "new").length;
  const pipelineValue = leads.reduce((sum, lead) => sum + Number(lead.estimated_value), 0);
  const wonLeads = leads.filter((lead) => lead.status === "won");
  const wonRevenue = wonLeads.reduce((sum, lead) => sum + Number(lead.estimated_value), 0);
  const quotesSent = leads.filter((lead) => ["quote_sent", "negotiation", "won"].includes(lead.status)).length;
  const conversionRate = totalLeads ? Math.round((wonLeads.length / totalLeads) * 100) : 0;
  const averageDealValue = totalLeads ? Math.round(pipelineValue / totalLeads) : 0;
  const followUpsDue = leads.filter(
    (lead) => lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() >= now.getTime(),
  ).length;
  const overdueFollowUps = leads.filter((lead) => isLeadOverdue(lead.next_follow_up_at, now)).length;
  const tasksDueToday = tasks.filter((task) => task.due_at.slice(0, 10) === now.toISOString().slice(0, 10)).length;

  const sourceCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const monthlyRevenue = new Map<string, number>();

  for (const lead of leads) {
    sourceCounts.set(lead.source, (sourceCounts.get(lead.source) ?? 0) + 1);
    statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);
    if (lead.status === "won") {
      const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(lead.created_at));
      monthlyRevenue.set(month, (monthlyRevenue.get(month) ?? 0) + Number(lead.estimated_value));
    }
  }

  return {
    totalLeads,
    newLeads,
    pipelineValue,
    quotesSent,
    wonRevenue,
    conversionRate,
    averageDealValue,
    followUpsDue,
    overdueFollowUps,
    tasksDueToday,
    leadSources: [...sourceCounts.entries()].map(([label, value]) => ({ label, value })),
    leadsByStatus: LEAD_STATUSES.map((status) => ({
      label: status.label,
      value: statusCounts.get(status.value) ?? 0,
    })),
    pipelineStages: LEAD_STATUSES.map((status) => ({
      label: status.label,
      value: statusCounts.get(status.value) ?? 0,
    })),
    monthlyRevenue: [...monthlyRevenue.entries()].map(([month, revenue]) => ({ month, revenue })),
    recentLeads: [...leads]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5),
    recentActivity: [...activities]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5),
    aiRecommendations: [
      overdueFollowUps
        ? `${overdueFollowUps} lead${overdueFollowUps === 1 ? "" : "s"} need overdue follow-up attention.`
        : "No overdue follow-ups right now.",
      newLeads
        ? `${newLeads} new lead${newLeads === 1 ? "" : "s"} were captured and should be qualified.`
        : "No new leads this period.",
      wonLeads.length
        ? `Your team has ${wonLeads.length} won lead${wonLeads.length === 1 ? "" : "s"} in the pipeline.`
        : "Keep pushing qualified opportunities toward win.",
    ],
  };
}
