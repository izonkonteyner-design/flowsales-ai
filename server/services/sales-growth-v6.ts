import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

function hoursSince(value?: string | null) {
  if (!value) return 9999;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
}

export async function getSlaBreaches(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: policies }, { data: leads }] = await Promise.all([
    admin.from("sales_sla_policies").select("id,name,lead_status,first_response_minutes,follow_up_minutes").eq("organization_id", organizationId).eq("active", true).order("created_at"),
    admin.from("leads").select("id,full_name,status,assigned_to,created_at,updated_at,next_follow_up_at").eq("organization_id", organizationId).not("status", "in", "(won,lost)").limit(1000),
  ]);
  const defaultPolicy = policies?.[0] || { first_response_minutes: 60, follow_up_minutes: 1440, name: "Varsayılan SLA", lead_status: null };
  const now = Date.now();
  return (leads || []).flatMap((lead) => {
    const policy = (policies || []).find((item) => !item.lead_status || item.lead_status === lead.status) || defaultPolicy;
    const ageMinutes = Math.max(0, (now - new Date(lead.created_at).getTime()) / 60000);
    const inactivityMinutes = hoursSince(lead.updated_at) * 60;
    const followUpOverdue = lead.next_follow_up_at ? new Date(lead.next_follow_up_at).getTime() < now : false;
    const firstResponseBreach = lead.status === "new" && ageMinutes > Number(policy.first_response_minutes);
    const followUpBreach = lead.status !== "new" && (inactivityMinutes > Number(policy.follow_up_minutes) || followUpOverdue);
    if (!firstResponseBreach && !followUpBreach) return [];
    return [{
      leadId: lead.id,
      name: lead.full_name,
      assignedTo: lead.assigned_to,
      status: lead.status,
      breachType: firstResponseBreach ? "first_response" : "follow_up",
      overdueMinutes: Math.round(firstResponseBreach ? ageMinutes - Number(policy.first_response_minutes) : Math.max(0, inactivityMinutes - Number(policy.follow_up_minutes))),
      policy: policy.name,
    }];
  }).sort((a, b) => b.overdueMinutes - a.overdueMinutes);
}

export async function getRepWorkload(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data: leads, error } = await admin.from("leads").select("id,assigned_to,status,estimated_value,next_follow_up_at").eq("organization_id", organizationId).not("status", "in", "(won,lost)").limit(2000);
  if (error) throw new Error("Temsilci iş yükü yüklenemedi.");
  const map = new Map<string, { userId: string; open: number; advanced: number; overdue: number; value: number; score: number }>();
  for (const lead of leads || []) {
    const key = lead.assigned_to || "unassigned";
    const row = map.get(key) || { userId: key, open: 0, advanced: 0, overdue: 0, value: 0, score: 0 };
    row.open += 1;
    row.advanced += ["qualified", "quote_sent", "negotiation"].includes(lead.status) ? 1 : 0;
    row.overdue += lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() < Date.now() ? 1 : 0;
    row.value += Number(lead.estimated_value || 0);
    row.score = row.open * 2 + row.advanced * 3 + row.overdue * 5;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

export async function suggestLeadRouting(organizationId: string, leadId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: lead }, { data: rules }, workload] = await Promise.all([
    admin.from("leads").select("id,source,city,estimated_value").eq("organization_id", organizationId).eq("id", leadId).maybeSingle(),
    admin.from("sales_routing_rules").select("id,name,source,city,min_estimated_value,target_user_id,priority").eq("organization_id", organizationId).eq("active", true).order("priority"),
    getRepWorkload(organizationId),
  ]);
  if (!lead) throw new Error("Lead bulunamadı.");
  const matched = (rules || []).find((rule) => (!rule.source || rule.source === lead.source) && (!rule.city || rule.city === lead.city) && (!rule.min_estimated_value || Number(lead.estimated_value || 0) >= Number(rule.min_estimated_value)) && rule.target_user_id);
  if (matched?.target_user_id) return { userId: matched.target_user_id, reason: `Routing kuralı: ${matched.name}`, confidence: 95 };
  const candidates = workload.filter((row) => row.userId !== "unassigned").sort((a, b) => a.score - b.score);
  return candidates[0] ? { userId: candidates[0].userId, reason: "En düşük aktif iş yükü", confidence: 70 } : { userId: null, reason: "Uygun temsilci bulunamadı", confidence: 0 };
}

export async function detectDuplicateLeads(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("leads").select("id,full_name,email,phone,status,created_at").eq("organization_id", organizationId).limit(5000);
  if (error) throw new Error("Duplicate kontrolü yapılamadı.");
  const groups = new Map<string, NonNullable<typeof data>>();
  for (const lead of data || []) {
    const phone = String(lead.phone || "").replace(/\D/g, "").slice(-10);
    const email = String(lead.email || "").trim().toLowerCase();
    const key = phone ? `p:${phone}` : email ? `e:${email}` : "";
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), lead]);
  }
  return [...groups.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, leads: rows }));
}

export function calculateLeadCompleteness(lead: { full_name?: string | null; email?: string | null; phone?: string | null; city?: string | null; company?: string | null; estimated_value?: number | null; next_follow_up_at?: string | null; assigned_to?: string | null }) {
  const fields = [lead.full_name, lead.email || lead.phone, lead.city, lead.company, lead.estimated_value, lead.next_follow_up_at, lead.assigned_to];
  const completed = fields.filter((value) => value !== null && value !== undefined && value !== "").length;
  const missing = [!lead.full_name && "name", !(lead.email || lead.phone) && "contact", !lead.city && "city", !lead.company && "company", !lead.estimated_value && "estimated_value", !lead.next_follow_up_at && "next_follow_up", !lead.assigned_to && "assignee"].filter((value): value is string => typeof value === "string");
  return { score: Math.round(completed / fields.length * 100), missing };
}

export async function getDataHygieneReport(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("leads").select("id,full_name,email,phone,city,company,estimated_value,next_follow_up_at,assigned_to,updated_at,status").eq("organization_id", organizationId).limit(5000);
  if (error) throw new Error("Veri kalite raporu yüklenemedi.");
  const rows = (data || []).map((lead) => ({ leadId: lead.id, name: lead.full_name, ...calculateLeadCompleteness(lead), staleDays: Math.floor(hoursSince(lead.updated_at) / 24), status: lead.status })).filter((row) => row.score < 80 || row.staleDays > 30).sort((a, b) => a.score - b.score || b.staleDays - a.staleDays);
  return { total: (data || []).length, needsAttention: rows.length, rows: rows.slice(0, 100) };
}

export function calculateQuoteMargin(input: { revenue: number; cost: number }) {
  if (input.cost <= 0) return { revenue: input.revenue, cost: input.cost, marginPercent: null as number | null, guarded: true, reason: "Maliyet verisi eksik; marj doğrulanamıyor." };
  const margin = input.revenue > 0 ? (input.revenue - input.cost) / input.revenue * 100 : -100;
  return { revenue: input.revenue, cost: input.cost, marginPercent: Math.round(margin * 10) / 10, guarded: margin < 15, reason: margin < 15 ? "Marj %15 güvenlik eşiğinin altında." : "Marj güvenlik eşiğinin üzerinde." };
}

export async function getQuoteMarginGuard(organizationId: string, quoteId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: quote }, { data: items, error }] = await Promise.all([
    admin.from("quotes").select("id,subtotal,discount_total,total,status").eq("organization_id", organizationId).eq("id", quoteId).maybeSingle(),
    admin.from("quote_items").select("quantity,cost_snapshot,product_id").eq("quote_id", quoteId),
  ]);
  if (!quote || error) throw new Error("Teklif marjı yüklenemedi.");
  let cost = 0;
  let complete = true;
  for (const item of items || []) {
    let unitCost = Number(item.cost_snapshot || 0);
    if (!unitCost && item.product_id) {
      const { data: product } = await admin.from("products").select("unit_cost").eq("organization_id", organizationId).eq("id", item.product_id).maybeSingle();
      unitCost = Number(product?.unit_cost || 0);
    }
    if (!unitCost) complete = false;
    cost += unitCost * Number(item.quantity || 0);
  }
  const margin = calculateQuoteMargin({ revenue: Number(quote.total || 0), cost: complete ? cost : 0 });
  return { ...margin, quoteId, subtotal: Number(quote.subtotal || 0), discountTotal: Number(quote.discount_total || 0), costComplete: complete };
}

export async function requestDiscountApproval(params: { organizationId: string; quoteId: string; userId: string; discountPercent: number; reason: string }) {
  if (params.discountPercent <= 0 || params.discountPercent > 100) throw new Error("İndirim oranı 0-100 arasında olmalı.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("quote_discount_approvals").insert({ organization_id: params.organizationId, quote_id: params.quoteId, requested_by: params.userId, discount_percent: params.discountPercent, reason: params.reason, status: "pending" }).select("id,status,discount_percent").single();
  if (error || !data) throw new Error("İndirim onayı oluşturulamadı.");
  return data;
}

export async function decideDiscountApproval(params: { organizationId: string; approvalId: string; userId: string; decision: "approved" | "rejected" }) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("quote_discount_approvals").update({ status: params.decision, decided_by: params.userId, decided_at: new Date().toISOString() }).eq("organization_id", params.organizationId).eq("id", params.approvalId).eq("status", "pending").select("id,status").maybeSingle();
  if (error || !data) throw new Error("İndirim kararı kaydedilemedi.");
  return data;
}

export async function getProductFitRecommendations(organizationId: string, leadId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: lead }, { data: products, error }] = await Promise.all([
    admin.from("leads").select("id,city,notes,estimated_value").eq("organization_id", organizationId).eq("id", leadId).maybeSingle(),
    admin.from("products").select("id,name,category,base_price,unit_price,active,description").eq("organization_id", organizationId).eq("active", true).limit(500),
  ]);
  if (!lead || error) throw new Error("Ürün uyumu hesaplanamadı.");
  const text = `${lead.notes || ""}`.toLocaleLowerCase("tr-TR");
  return (products || []).map((product) => {
    const price = Number(product.unit_price ?? product.base_price ?? 0);
    let score = 10;
    if (product.category && text.includes(String(product.category).toLocaleLowerCase("tr-TR"))) score += 30;
    if (product.name && text.includes(String(product.name).toLocaleLowerCase("tr-TR"))) score += 40;
    if (lead.estimated_value && price) score += Math.max(0, 20 - Math.round(Math.abs(Number(lead.estimated_value) - price) / Math.max(Number(lead.estimated_value), 1) * 20));
    return { productId: product.id, name: product.name, score, price };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function checkDeliveryRegionFit(organizationId: string, leadId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: lead }, { data: locations }] = await Promise.all([
    admin.from("leads").select("id,city").eq("organization_id", organizationId).eq("id", leadId).maybeSingle(),
    admin.from("business_locations").select("city,active,metadata").eq("organization_id", organizationId).eq("active", true),
  ]);
  if (!lead?.city) return { supported: null, reason: "Lead şehir bilgisi eksik." };
  const city = lead.city.toLocaleLowerCase("tr-TR");
  const supported = (locations || []).some((location) => {
    if (String(location.city || "").toLocaleLowerCase("tr-TR") === city) return true;
    const metadata = location.metadata && typeof location.metadata === "object" ? location.metadata as Record<string, unknown> : {};
    const regions = Array.isArray(metadata.service_regions) ? metadata.service_regions : [];
    return regions.some((region) => typeof region === "string" && region.toLocaleLowerCase("tr-TR") === city);
  });
  return { supported, reason: supported ? "Aktif lokasyon/hizmet bölgesiyle eşleşti." : "Trusted location verisinde eşleşme bulunamadı; insan doğrulaması gerekir." };
}

export async function snapshotQuoteVersion(params: { organizationId: string; quoteId: string; userId: string; changeNote?: string }) {
  const admin = createSupabaseAdminClient();
  const [{ data: quote }, { data: items }] = await Promise.all([
    admin.from("quotes").select("*").eq("organization_id", params.organizationId).eq("id", params.quoteId).maybeSingle(),
    admin.from("quote_items").select("*").eq("quote_id", params.quoteId).order("created_at"),
  ]);
  if (!quote) throw new Error("Teklif bulunamadı.");
  const { count } = await admin.from("quote_versions").select("id", { count: "exact", head: true }).eq("organization_id", params.organizationId).eq("quote_id", params.quoteId);
  const { data, error } = await admin.from("quote_versions").insert({ organization_id: params.organizationId, quote_id: params.quoteId, version_number: (count || 0) + 1, snapshot: { quote, items: items || [] }, change_note: params.changeNote || null, created_by: params.userId }).select("id,version_number,created_at").single();
  if (error || !data) throw new Error("Teklif sürümü kaydedilemedi.");
  return data;
}

export async function getQuoteVersionComparison(organizationId: string, quoteId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("quote_versions").select("id,version_number,snapshot,change_note,created_at").eq("organization_id", organizationId).eq("quote_id", quoteId).order("version_number", { ascending: true });
  if (error) throw new Error("Teklif sürümleri yüklenemedi.");
  return data || [];
}

export async function detectGrowthOpportunities(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: leads }, { data: customers }, { data: quotes }] = await Promise.all([
    admin.from("leads").select("id,full_name,status,estimated_value,updated_at").eq("organization_id", organizationId).limit(3000),
    admin.from("contacts").select("id,full_name").eq("organization_id", organizationId).limit(3000),
    admin.from("quotes").select("id,lead_id,customer_id,status,total,created_at").eq("organization_id", organizationId).limit(5000),
  ]);
  const candidates: Array<{ lead_id?: string; customer_id?: string; opportunity_type: "reactivation" | "expansion" | "referral"; score: number; reason: string; estimated_value: number }> = [];
  for (const lead of leads || []) {
    if (lead.status === "lost" && hoursSince(lead.updated_at) > 24 * 30) candidates.push({ lead_id: lead.id, opportunity_type: "reactivation", score: Math.min(90, 50 + Math.floor(hoursSince(lead.updated_at) / (24 * 30)) * 5), reason: "Kaybedilmiş fırsat 30+ gündür yeniden değerlendirilmedi.", estimated_value: Number(lead.estimated_value || 0) });
  }
  for (const customer of customers || []) {
    const accepted = (quotes || []).filter((quote) => quote.customer_id === customer.id && quote.status === "accepted").sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lifetimeValue = accepted.reduce((sum, quote) => sum + Number(quote.total || 0), 0);
    const lastOrderAt = accepted[0]?.created_at || null;
    if (accepted.length && hoursSince(lastOrderAt) > 24 * 90) candidates.push({ customer_id: customer.id, opportunity_type: "expansion", score: 70, reason: "Geçmiş müşteride 90+ gündür yeni kabul edilmiş teklif görünmüyor.", estimated_value: lifetimeValue * 0.25 });
    if (lifetimeValue > 0 && accepted.length >= 2) candidates.push({ customer_id: customer.id, opportunity_type: "referral", score: 60 + Math.min(30, accepted.length * 5), reason: "Tekrarlı/başarılı müşteri; referans istemek için uygun aday.", estimated_value: 0 });
  }
  for (const item of candidates) {
    let query = admin.from("sales_growth_opportunities").select("id").eq("organization_id", organizationId).eq("status", "open").eq("opportunity_type", item.opportunity_type);
    query = item.lead_id ? query.eq("lead_id", item.lead_id) : query.eq("customer_id", item.customer_id || "");
    const { data: existing } = await query.maybeSingle();
    if (!existing) await admin.from("sales_growth_opportunities").insert({ organization_id: organizationId, ...item, status: "open" });
  }
  const { data, error } = await admin.from("sales_growth_opportunities").select("id,lead_id,customer_id,opportunity_type,score,reason,estimated_value,status,created_at").eq("organization_id", organizationId).eq("status", "open").order("score", { ascending: false }).limit(100);
  if (error) throw new Error("Büyüme fırsatları yüklenemedi.");
  return data || [];
}

export async function calculateForecastConfidence(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data: leads, error } = await admin.from("leads").select("id,status,estimated_value,updated_at,next_follow_up_at").eq("organization_id", organizationId).not("status", "in", "(won,lost)").limit(5000);
  if (error) throw new Error("Forecast hesaplanamadı.");
  const stageWeight: Record<string, number> = { new: 0.1, contacted: 0.2, qualified: 0.45, quote_sent: 0.6, negotiation: 0.8 };
  let open = 0;
  let weighted = 0;
  let confidenceParts = 0;
  const stageCounts: Record<string, number> = {};
  for (const lead of leads || []) {
    const value = Number(lead.estimated_value || 0);
    const weight = stageWeight[lead.status] || 0.1;
    open += value;
    weighted += value * weight;
    stageCounts[lead.status] = (stageCounts[lead.status] || 0) + 1;
    const fresh = hoursSince(lead.updated_at) <= 72 ? 1 : 0.5;
    const followed = lead.next_follow_up_at ? 1 : 0.6;
    confidenceParts += weight * fresh * followed;
  }
  const count = (leads || []).length;
  const confidence = count ? Math.max(0, Math.min(100, Math.round(confidenceParts / count * 100))) : 0;
  return { openPipelineValue: open, weightedPipelineValue: weighted, forecastConfidence: confidence, stageCounts, count };
}

export async function persistWeeklyPipelineSnapshot(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const forecast = await calculateForecastConfidence(organizationId);
  const date = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin.from("pipeline_snapshots").upsert({ organization_id: organizationId, snapshot_date: date, open_pipeline_value: forecast.openPipelineValue, weighted_pipeline_value: forecast.weightedPipelineValue, forecast_confidence: forecast.forecastConfidence, stage_counts: forecast.stageCounts, risk_summary: { leadCount: forecast.count } }, { onConflict: "organization_id,snapshot_date" }).select("*").single();
  if (error || !data) throw new Error("Pipeline snapshot kaydedilemedi.");
  return data;
}

export async function getGrowthControlCenter(organizationId: string) {
  const [sla, workload, duplicates, hygiene, growth, forecast] = await Promise.all([
    getSlaBreaches(organizationId),
    getRepWorkload(organizationId),
    detectDuplicateLeads(organizationId),
    getDataHygieneReport(organizationId),
    detectGrowthOpportunities(organizationId),
    calculateForecastConfidence(organizationId),
  ]);
  return { sla, workload, duplicates, hygiene, growth, forecast };
}
