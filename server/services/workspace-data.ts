import type {
  ApiEndpoint,
  AuditLogEntry,
  CalendarEvent,
  Customer,
  NotificationItem,
  TeamMember,
} from "@/types/crm";
import { demoOrganization } from "@/server/services/crm-data";

export const demoCustomers: Customer[] = [
  {
    id: "cust_001",
    organization_id: demoOrganization.id,
    name: "Ahmet Yilmaz",
    company: "Yilmaz Yapi",
    email: "ahmet@yilmazyapi.com",
    phone: "+90 532 000 0001",
    city: "Istanbul",
    segment: "Construction",
    lifetime_value: 1850000,
    last_order_at: "2026-06-12T10:00:00.000Z",
    next_review_at: "2026-07-21T09:00:00.000Z",
  },
  {
    id: "cust_002",
    organization_id: demoOrganization.id,
    name: "Mehmet Demir",
    company: "Demir Solar",
    email: "mehmet@demirsolar.com",
    phone: "+90 530 111 2200",
    city: "Izmir",
    segment: "Renewables",
    lifetime_value: 920000,
    last_order_at: "2026-05-03T14:30:00.000Z",
    next_review_at: "2026-07-18T13:00:00.000Z",
  },
  {
    id: "cust_003",
    organization_id: demoOrganization.id,
    name: "Ece Aydin",
    company: "Aydin Group",
    email: "ece@aydingroup.com",
    phone: "+90 533 222 3000",
    city: "Ankara",
    segment: "Commercial",
    lifetime_value: 2450000,
    last_order_at: null,
    next_review_at: "2026-07-17T09:00:00.000Z",
  },
];

export const demoCalendarEvents: CalendarEvent[] = [
  {
    id: "event_001",
    organization_id: demoOrganization.id,
    title: "Call with Ahmet",
    starts_at: "2026-07-16T10:00:00.000Z",
    ends_at: "2026-07-16T10:30:00.000Z",
    type: "call",
    owner: "Selin Kaya",
  },
  {
    id: "event_002",
    organization_id: demoOrganization.id,
    title: "On-site demo",
    starts_at: "2026-07-16T13:00:00.000Z",
    ends_at: "2026-07-16T14:00:00.000Z",
    type: "demo",
    owner: "Mert Arslan",
  },
  {
    id: "event_003",
    organization_id: demoOrganization.id,
    title: "Delivery planning review",
    starts_at: "2026-07-17T09:30:00.000Z",
    ends_at: "2026-07-17T10:15:00.000Z",
    type: "delivery",
    owner: "Aylin Toprak",
  },
];

export const demoNotifications: NotificationItem[] = [
  {
    id: "notif_001",
    organization_id: demoOrganization.id,
    title: "Quote accepted",
    detail: "The demo quote for Mehmet Demir was viewed twice today.",
    level: "success",
    created_at: "2026-07-15T11:45:00.000Z",
    read: false,
  },
  {
    id: "notif_002",
    organization_id: demoOrganization.id,
    title: "Follow-up due",
    detail: "Ahmet Yilmaz needs a call before 5 PM today.",
    level: "warning",
    created_at: "2026-07-15T09:10:00.000Z",
    read: false,
  },
  {
    id: "notif_003",
    organization_id: demoOrganization.id,
    title: "AI draft ready",
    detail: "A proposal outline was generated for the prefab office deal.",
    level: "info",
    created_at: "2026-07-15T07:30:00.000Z",
    read: true,
  },
];

export const demoTeam: TeamMember[] = [
  {
    id: "member_001",
    organization_id: demoOrganization.id,
    name: "Selin Kaya",
    email: "selin@flowsales.ai",
    role: "owner",
    quota: "Unlimited",
    active: true,
  },
  {
    id: "member_002",
    organization_id: demoOrganization.id,
    name: "Mert Arslan",
    email: "mert@flowsales.ai",
    role: "sales",
    quota: "500 AI messages",
    active: true,
  },
  {
    id: "member_003",
    organization_id: demoOrganization.id,
    name: "Aylin Toprak",
    email: "aylin@flowsales.ai",
    role: "admin",
    quota: "10 seats",
    active: true,
  },
  {
    id: "member_004",
    organization_id: demoOrganization.id,
    name: "Kerem Tan",
    email: "kerem@flowsales.ai",
    role: "viewer",
    quota: "Read-only",
    active: false,
  },
];

export const demoAuditLogs: AuditLogEntry[] = [
  {
    id: "audit_001",
    organization_id: demoOrganization.id,
    actor: "Selin Kaya",
    action: "Created quote",
    entity: "quote",
    entity_id: "quote_003",
    created_at: "2026-07-15T09:02:00.000Z",
  },
  {
    id: "audit_002",
    organization_id: demoOrganization.id,
    actor: "Mert Arslan",
    action: "Updated lead status",
    entity: "lead",
    entity_id: "lead_002",
    created_at: "2026-07-15T08:21:00.000Z",
  },
  {
    id: "audit_003",
    organization_id: demoOrganization.id,
    actor: "System",
    action: "Generated AI draft",
    entity: "ai",
    entity_id: "draft_001",
    created_at: "2026-07-15T07:30:00.000Z",
  },
];

export const demoApiEndpoints: ApiEndpoint[] = [
  {
    id: "api_001",
    method: "GET",
    path: "/api/health",
    purpose: "Health monitoring",
    auth: "Public",
  },
  {
    id: "api_002",
    method: "POST",
    path: "/api/leads",
    purpose: "Create leads",
    auth: "Bearer token",
  },
  {
    id: "api_003",
    method: "POST",
    path: "/api/quotes",
    purpose: "Generate quotes",
    auth: "Bearer token",
  },
  {
    id: "api_004",
    method: "POST",
    path: "/api/ai/draft",
    purpose: "Create AI drafts",
    auth: "Bearer token",
  },
];

export function getCustomers() {
  return [...demoCustomers];
}

export function getCalendarEvents() {
  return [...demoCalendarEvents].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

export function getNotifications() {
  return [...demoNotifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getTeamMembers() {
  return [...demoTeam];
}

export function getAuditLogs() {
  return [...demoAuditLogs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getApiEndpoints() {
  return [...demoApiEndpoints];
}
