export type Organization = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  role: "owner" | "admin" | "sales" | "viewer";
  logo_url?: string | null;
  logo_path?: string | null;
  legal_name?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  district?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_office?: string | null;
  tax_number?: string | null;
  trade_registry_number?: string | null;
  mersis_number?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  iban?: string | null;
  account_holder?: string | null;
  default_tax_rate?: number | null;
  default_payment_terms?: string | null;
  default_delivery_terms?: string | null;
  default_quote_notes?: string | null;
  default_quote_validity_days?: number | null;
  quote_footer_text?: string | null;
  signature_name?: string | null;
  signature_title?: string | null;
  company_slogan?: string | null;
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
  source_lead_id?: string | null;
  converted_at?: string | null;
  converted_by?: string | null;
  quote_count?: number;
  last_quote_at?: string | null;
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

export type CurrencyCode = "TRY" | "USD" | "EUR";

export type QuoteDiscountType = "percentage" | "fixed";

export type ProductSpecification = {
  key: string;
  value: string;
};

export type Product = {
  id: string;
  organization_id: string;
  sku?: string;
  name: string;
  category: string;
  description: string;
  short_description?: string;
  brand?: string;
  model?: string;
  base_price: number;
  unit_price?: number;
  currency: string;
  tax_rate: number;
  unit: string;
  width?: number | null;
  length?: number | null;
  height?: number | null;
  area_m2?: number | null;
  weight_kg?: number | null;
  material?: string;
  color?: string;
  stock_quantity?: number;
  minimum_order_quantity?: number;
  lead_time_days?: number;
  warranty_months?: number;
  internal_code?: string;
  barcode?: string;
  tags: string[];
  features: string[];
  specifications: ProductSpecification[];
  image_url?: string | null;
  gallery_urls: string[];
  featured?: boolean;
  notes?: string;
  active: boolean;
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
  converted_customer_id?: string | null;
  converted_at?: string | null;
  converted_by?: string | null;
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
  product_id?: string | null;
  name?: string;
  description?: string | null;
  sku?: string | null;
  quantity?: number;
  unit?: string;
  currency?: CurrencyCode;
  unit_price?: number;
  discount?: number;
  discount_type?: QuoteDiscountType;
  discount_value?: number;
  tax_rate?: number;
  line_subtotal?: number;
  line_discount?: number;
  taxable_subtotal?: number;
  line_tax?: number;
  line_total?: number;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type Quote = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  customer_id?: string | null;
  quote_number: string;
  issue_date: string;
  valid_until?: string | null;
  expiry_date?: string | null;
  status: QuoteStatus;
  currency: string;
  notes: string;
  payment_terms: string;
  delivery_terms: string;
  shipping_total?: number;
  subtotal: number;
  discount_total?: number;
  line_discount_total?: number;
  order_discount_type?: QuoteDiscountType | null;
  order_discount_value?: number;
  order_discount_total?: number;
  taxable_subtotal?: number;
  tax_total: number;
  grand_total?: number;
  total?: number;
  items: QuoteItem[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type QuoteMoneyLine = {
  quantity: number;
  unit_price: number;
  product_id?: string | null;
  name?: string;
  description?: string;
  sku?: string;
  unit?: string;
  discount?: number;
  discount_type?: QuoteDiscountType;
  discount_value?: number;
  tax_rate?: number;
  currency?: CurrencyCode;
  line_subtotal?: number;
  line_discount?: number;
  taxable_subtotal?: number;
  line_tax?: number;
};

export type QuoteMoneyTotals = {
  currency: CurrencyCode;
  subtotal: number;
  discount_total: number;
  taxable_subtotal: number;
  shipping_total: number;
  tax_total: number;
  grand_total: number;
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
