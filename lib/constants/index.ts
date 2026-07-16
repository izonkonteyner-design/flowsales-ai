import type { LeadStatus, QuoteStatus, TaskPriority } from "@/types/crm";

export const BRAND = {
  name: "FlowSales AI",
  tagline: "Your AI Sales Employee",
};

export const ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "sales",
  "viewer",
] as const;

export const LEAD_STATUSES: Array<{
  value: LeadStatus;
  label: string;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
}> = [
  { value: "new", label: "New", tone: "info" },
  { value: "contacted", label: "Contacted", tone: "neutral" },
  { value: "qualified", label: "Qualified", tone: "info" },
  { value: "quote_sent", label: "Quote sent", tone: "warning" },
  { value: "negotiation", label: "Negotiation", tone: "warning" },
  { value: "won", label: "Won", tone: "success" },
  { value: "lost", label: "Lost", tone: "danger" },
];

export const QUOTE_STATUSES: Array<{
  value: QuoteStatus;
  label: string;
}> = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

export const TASK_PRIORITIES: Array<{
  value: TaskPriority;
  label: string;
}> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const APP_NAVIGATION = [
  { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
  { label: "Leads", href: "/leads", icon: "users" },
  { label: "Customers", href: "/customers", icon: "user-group" },
  { label: "Products", href: "/products", icon: "package" },
  { label: "Quotes", href: "/quotes", icon: "file-text" },
  { label: "Tasks", href: "/tasks", icon: "check-circle-2" },
  { label: "Calendar", href: "/calendar", icon: "calendar" },
  { label: "Notifications", href: "/notifications", icon: "bell" },
  { label: "AI", href: "/ai", icon: "bot" },
  { label: "Reports", href: "/reports", icon: "bar-chart-3" },
  { label: "Billing", href: "/billing", icon: "credit-card" },
  { label: "Team", href: "/team", icon: "users-2" },
  { label: "Permissions", href: "/permissions", icon: "shield-check" },
  { label: "Audit Logs", href: "/audit-logs", icon: "clipboard-list" },
  { label: "API", href: "/api-layer", icon: "braces" },
  { label: "Settings", href: "/settings", icon: "settings" },
] as const;

export const SUBSCRIPTION_PLANS = [
  {
    id: "starter",
    name: "Starter",
    seatLimit: 3,
    aiMessageLimit: 100,
    features: ["Leads", "Quotes", "Tasks"],
  },
  {
    id: "pro",
    name: "Pro",
    seatLimit: 10,
    aiMessageLimit: 500,
    features: ["Reports", "Workspace settings", "AI drafts"],
  },
  {
    id: "business",
    name: "Business",
    seatLimit: 50,
    aiMessageLimit: 2000,
    features: ["Role controls", "Advanced analytics", "Priority support"],
  },
] as const;
