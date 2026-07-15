import type {
  Activity,
  DashboardMetrics,
  Lead,
  Product,
  Quote,
  Task,
} from "@/types/crm";
import { formatCurrency } from "@/lib/utils";

export const demoOrganization = {
  id: "org_demo_001",
  name: "FlowSales Demo Workspace",
  slug: "flowsales-demo",
  currency: "TRY",
  role: "owner" as const,
};

export const demoLeads: Lead[] = [
  {
    id: "lead_001",
    organization_id: demoOrganization.id,
    full_name: "Ahmet Yilmaz",
    company: "Yilmaz Yapı",
    email: "ahmet@yilmazyapi.com",
    phone: "+90 532 000 0001",
    city: "Istanbul",
    source: "Website",
    status: "qualified",
    estimated_value: 1850000,
    currency: "TRY",
    notes: "Interested in 56m² container office and installation in Q3.",
    assigned_to: "Selin Kaya",
    next_follow_up_at: "2026-07-18T10:00:00.000Z",
    created_by: "Selin Kaya",
    created_at: "2026-07-14T08:45:00.000Z",
    updated_at: "2026-07-15T08:10:00.000Z",
  },
  {
    id: "lead_002",
    organization_id: demoOrganization.id,
    full_name: "Mehmet Demir",
    company: "Demir Solar",
    email: "mehmet@demirsolar.com",
    phone: "+90 530 111 2200",
    city: "Izmir",
    source: "WhatsApp",
    status: "quote_sent",
    estimated_value: 920000,
    currency: "TRY",
    notes: "Requested quote with energy-efficient prefab package.",
    assigned_to: "Mert Arslan",
    next_follow_up_at: "2026-07-16T14:30:00.000Z",
    created_by: "Mert Arslan",
    created_at: "2026-07-12T11:15:00.000Z",
    updated_at: "2026-07-15T12:00:00.000Z",
  },
  {
    id: "lead_003",
    organization_id: demoOrganization.id,
    full_name: "Ece Aydin",
    company: "Aydin Group",
    email: "ece@aydingroup.com",
    phone: "+90 533 222 3000",
    city: "Ankara",
    source: "Referral",
    status: "negotiation",
    estimated_value: 2450000,
    currency: "TRY",
    notes: "Large office campus expansion; waiting for board review.",
    assigned_to: "Selin Kaya",
    next_follow_up_at: "2026-07-17T09:00:00.000Z",
    created_by: "Selin Kaya",
    created_at: "2026-07-11T09:30:00.000Z",
    updated_at: "2026-07-15T09:10:00.000Z",
  },
  {
    id: "lead_004",
    organization_id: demoOrganization.id,
    full_name: "Burak Cinar",
    company: "Cinar Hospitality",
    email: "burak@cinarhospitality.com",
    phone: "+90 535 444 5500",
    city: "Bodrum",
    source: "Instagram",
    status: "new",
    estimated_value: 640000,
    currency: "TRY",
    notes: "Looking for a site cabin and guest service module.",
    assigned_to: "Aylin Toprak",
    next_follow_up_at: "2026-07-19T13:15:00.000Z",
    created_by: "Aylin Toprak",
    created_at: "2026-07-15T06:45:00.000Z",
    updated_at: "2026-07-15T06:45:00.000Z",
  },
];

export const demoProducts: Product[] = [
  {
    id: "prod_001",
    organization_id: demoOrganization.id,
    name: "Container Office",
    category: "Container",
    description: "Insulated modular office unit for field operations.",
    base_price: 420000,
    currency: "TRY",
    tax_rate: 20,
    unit: "unit",
    active: true,
    specifications: ["Steel frame", "Thermal insulation", "Plug-and-play electrical pack"],
  },
  {
    id: "prod_002",
    organization_id: demoOrganization.id,
    name: "Tiny House",
    category: "Residential",
    description: "Compact premium home with a modern living layout.",
    base_price: 1350000,
    currency: "TRY",
    tax_rate: 20,
    unit: "unit",
    active: true,
    specifications: ["Open plan", "Kitchen module", "Solar-ready roof"],
  },
  {
    id: "prod_003",
    organization_id: demoOrganization.id,
    name: "Site Cabin",
    category: "Construction",
    description: "Durable cabin for site management and security teams.",
    base_price: 265000,
    currency: "TRY",
    tax_rate: 20,
    unit: "unit",
    active: true,
    specifications: ["Portable", "Weather resistant", "Optional restroom package"],
  },
  {
    id: "prod_004",
    organization_id: demoOrganization.id,
    name: "Prefabricated Office",
    category: "Commercial",
    description: "Scalable prefabricated workspace for teams and showrooms.",
    base_price: 980000,
    currency: "TRY",
    tax_rate: 20,
    unit: "unit",
    active: false,
    specifications: ["Premium facade", "HVAC ready", "Custom branding panel"],
  },
];

const quoteItems = [
  {
    id: "qi_001",
    product_id: "prod_001",
    description: "Container Office - turnkey installation",
    quantity: 2,
    unit_price: 420000,
    discount: 5,
    tax_rate: 20,
    line_total: 1596000,
  },
  {
    id: "qi_002",
    product_id: "prod_003",
    description: "Site Cabin - security package",
    quantity: 1,
    unit_price: 265000,
    discount: 0,
    tax_rate: 20,
    line_total: 318000,
  },
  {
    id: "qi_003",
    product_id: "prod_002",
    description: "Tiny House - showroom edition",
    quantity: 1,
    unit_price: 1350000,
    discount: 10,
    tax_rate: 20,
    line_total: 1458000,
  },
];

export const demoQuotes: Quote[] = [
  {
    id: "quote_001",
    organization_id: demoOrganization.id,
    lead_id: "lead_001",
    quote_number: "FSA-2026-0142",
    issue_date: "2026-07-12",
    expiry_date: "2026-08-11",
    status: "sent",
    currency: "TRY",
    notes: "Includes installation and warranty coverage for 12 months.",
    payment_terms: "50% advance, 50% on delivery",
    delivery_terms: "Delivery within 30 business days",
    subtotal: 1685000,
    discount_total: 84500,
    tax_total: 329900,
    total: 1930400,
    items: [quoteItems[0]],
    created_by: "Selin Kaya",
    created_at: "2026-07-12T12:00:00.000Z",
    updated_at: "2026-07-14T10:00:00.000Z",
  },
  {
    id: "quote_002",
    organization_id: demoOrganization.id,
    lead_id: "lead_002",
    quote_number: "FSA-2026-0143",
    issue_date: "2026-07-13",
    expiry_date: "2026-08-12",
    status: "viewed",
    currency: "TRY",
    notes: "Energy-efficient layout with optional solar bundle.",
    payment_terms: "Net 15",
    delivery_terms: "Delivery within 21 business days",
    subtotal: 265000,
    discount_total: 0,
    tax_total: 53000,
    total: 318000,
    items: [quoteItems[1]],
    created_by: "Mert Arslan",
    created_at: "2026-07-13T09:45:00.000Z",
    updated_at: "2026-07-15T11:30:00.000Z",
  },
  {
    id: "quote_003",
    organization_id: demoOrganization.id,
    lead_id: "lead_003",
    quote_number: "FSA-2026-0144",
    issue_date: "2026-07-10",
    expiry_date: "2026-08-09",
    status: "draft",
    currency: "TRY",
    notes: "Awaiting final approval from procurement.",
    payment_terms: "50% advance, 50% before shipment",
    delivery_terms: "Custom delivery planning required",
    subtotal: 1350000,
    discount_total: 135000,
    tax_total: 270000,
    total: 1485000,
    items: [quoteItems[2]],
    created_by: "Selin Kaya",
    created_at: "2026-07-10T08:00:00.000Z",
    updated_at: "2026-07-15T09:00:00.000Z",
  },
];

export const demoTasks: Task[] = [
  {
    id: "task_001",
    organization_id: demoOrganization.id,
    lead_id: "lead_001",
    title: "Call Ahmet about installation timeline",
    due_at: "2026-07-15T15:00:00.000Z",
    priority: "high",
    assigned_to: "Selin Kaya",
    status: "open",
    created_at: "2026-07-14T09:00:00.000Z",
    updated_at: "2026-07-15T10:00:00.000Z",
  },
  {
    id: "task_002",
    organization_id: demoOrganization.id,
    lead_id: "lead_002",
    title: "Send revised quote PDF",
    due_at: "2026-07-15T17:00:00.000Z",
    priority: "medium",
    assigned_to: "Mert Arslan",
    status: "open",
    created_at: "2026-07-15T08:30:00.000Z",
    updated_at: "2026-07-15T08:30:00.000Z",
  },
  {
    id: "task_003",
    organization_id: demoOrganization.id,
    lead_id: "lead_004",
    title: "Prepare site cabin brochure",
    due_at: "2026-07-18T12:00:00.000Z",
    priority: "low",
    assigned_to: "Aylin Toprak",
    status: "open",
    created_at: "2026-07-15T07:00:00.000Z",
    updated_at: "2026-07-15T07:00:00.000Z",
  },
];

export const demoActivities: Activity[] = [
  {
    id: "activity_001",
    organization_id: demoOrganization.id,
    lead_id: "lead_001",
    quote_id: "quote_001",
    type: "quote_sent",
    title: "Quote sent",
    detail: "FSA-2026-0142 shared with Ahmet Yilmaz.",
    created_at: "2026-07-12T12:05:00.000Z",
  },
  {
    id: "activity_002",
    organization_id: demoOrganization.id,
    lead_id: "lead_002",
    quote_id: "quote_002",
    type: "quote_viewed",
    title: "Quote viewed",
    detail: "Lead opened the quote twice in the last 24 hours.",
    created_at: "2026-07-15T09:40:00.000Z",
  },
  {
    id: "activity_003",
    organization_id: demoOrganization.id,
    lead_id: "lead_003",
    quote_id: null,
    type: "note",
    title: "Board review requested",
    detail: "Ece asked for a revised payment schedule.",
    created_at: "2026-07-15T08:05:00.000Z",
  },
];

function buildDashboardMetrics(): DashboardMetrics {
  const wonLeads = demoLeads.filter((lead) => lead.status === "won");
  const quotesSent = demoQuotes.filter((quote) =>
    ["sent", "viewed", "accepted"].includes(quote.status),
  );

  return {
    totalPipelineValue: demoLeads.reduce((sum, lead) => sum + lead.estimated_value, 0),
    newLeads: demoLeads.filter((lead) => lead.status === "new").length,
    quotesSent: quotesSent.length,
    wonRevenue: demoQuotes
      .filter((quote) => quote.status === "accepted")
      .reduce((sum, quote) => sum + quote.total, 0),
    conversionRate: Math.round((wonLeads.length / demoLeads.length) * 100),
    averageDealValue: Math.round(
      demoLeads.reduce((sum, lead) => sum + lead.estimated_value, 0) / demoLeads.length,
    ),
    followUpsDue: demoLeads.filter(
      (lead) => lead.next_follow_up_at && new Date(lead.next_follow_up_at) <= new Date("2026-07-16T00:00:00.000Z"),
    ).length,
    tasksDueToday: demoTasks.filter(
      (task) => task.due_at.startsWith("2026-07-15"),
    ).length,
    leadSources: [
      { label: "Website", value: 1 },
      { label: "WhatsApp", value: 1 },
      { label: "Referral", value: 1 },
      { label: "Instagram", value: 1 },
    ],
    pipelineStages: [
      { label: "New", value: 1 },
      { label: "Qualified", value: 1 },
      { label: "Quote sent", value: 1 },
      { label: "Negotiation", value: 1 },
    ],
    monthlyRevenue: [
      { month: "Jan", revenue: 180000 },
      { month: "Feb", revenue: 240000 },
      { month: "Mar", revenue: 160000 },
      { month: "Apr", revenue: 410000 },
      { month: "May", revenue: 530000 },
      { month: "Jun", revenue: 690000 },
    ],
    recentLeads: demoLeads.slice(0, 3),
    recentActivity: demoActivities,
    aiRecommendations: [
      "Follow up with Ahmet today to confirm installation timing.",
      "Ece is waiting for a revised payment schedule before approving the quote.",
      "Burak is a strong new lead for a site cabin upsell.",
    ],
  };
}

export function getDashboardMetrics() {
  return buildDashboardMetrics();
}

export function getLeads() {
  return [...demoLeads].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getLeadById(id: string) {
  return demoLeads.find((lead) => lead.id === id) ?? null;
}

export function getProducts() {
  return [...demoProducts].sort((a, b) => a.name.localeCompare(b.name));
}

export function getProductById(id: string) {
  return demoProducts.find((product) => product.id === id) ?? null;
}

export function getQuotes() {
  return [...demoQuotes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getQuoteById(id: string) {
  return demoQuotes.find((quote) => quote.id === id) ?? null;
}

export function getTasks() {
  return [...demoTasks].sort(
    (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
  );
}

export function getActivities() {
  return [...demoActivities].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function formatDemoMoney(value: number) {
  return formatCurrency(value, "TRY", "en-US");
}
