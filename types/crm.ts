export type Organization = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  role: "owner" | "admin" | "sales" | "viewer";
};

export type Customer = {
  id: string;
  organization_id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  segment: string;
  lifetime_value: number;
  last_order_at: string | null;
  next_review_at: string | null;
};

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "quote_sent"
  | "negotiation"
  | "won"
  | "lost";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high";

export type TaskStatus = "open" | "completed";

export type Product = {
  id: string;
  organization_id: string;
  sku?: string;
  name: string;
  category: string;
  description: string;
  unit_price?: number;
  base_price: number;
  currency: string;
  tax_rate: number;
  unit: string;
  active: boolean;
  specifications: string[];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
};

export type Lead = {
  id: string;
  organization_id: string;
  full_name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  source: string;
  status: LeadStatus;
  estimated_value: number;
  currency: string;
  notes: string;
  assigned_to: string;
  next_follow_up_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  title: string;
  due_at: string;
  priority: TaskPriority;
  assigned_to: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
};

export type QuoteItem = {
  id: string;
  quote_id?: string;
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  tax_rate: number;
  line_total: number;
  sort_order?: number;
  name?: string;
  unit?: string;
};

export type Quote = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  quote_number: string;
  issue_date: string;
  expiry_date: string;
  status: QuoteStatus;
  currency: string;
  customer_name?: string;
  customer_company?: string;
  customer_email?: string;
  customer_phone?: string;
  notes: string;
  payment_terms: string;
  delivery_terms: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  grand_total?: number;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  shipping_total?: number;
  items: QuoteItem[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  quote_id: string | null;
  type: string;
  title: string;
  detail: string;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  organization_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  type: "call" | "demo" | "delivery" | "review";
  owner: string;
};

export type NotificationItem = {
  id: string;
  organization_id: string;
  title: string;
  detail: string;
  level: "info" | "warning" | "success";
  created_at: string;
  read: boolean;
};

export type TeamMember = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  role: Organization["role"];
  quota: string;
  active: boolean;
};

export type AuditLogEntry = {
  id: string;
  organization_id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  created_at: string;
};

export type ApiEndpoint = {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  purpose: string;
  auth: string;
};

export type DashboardMetrics = {
  totalPipelineValue: number;
  newLeads: number;
  quotesSent: number;
  wonRevenue: number;
  conversionRate: number;
  averageDealValue: number;
  followUpsDue: number;
  tasksDueToday: number;
  leadSources: Array<{ label: string; value: number }>;
  pipelineStages: Array<{ label: string; value: number }>;
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  recentLeads: Lead[];
  recentActivity: Activity[];
  aiRecommendations: string[];
};
