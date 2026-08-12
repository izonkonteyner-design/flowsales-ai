import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { generateText } from "@/server/services/ai";
import { listStaleOpportunities } from "@/server/services/sales-intelligence-v3";
import { isSalesRepresentativeRole } from "@/lib/workspace-roles";

const CLOSED = new Set(["won", "lost", "support"]);
const STAGE_PROBABILITY: Record<string, number> = {
  new_lead: 0.08,
  discovery: 0.16,
  qualified: 0.32,
  quote_ready: 0.48,
  quote_sent: 0.62,
  negotiation: 0.78,
  won: 1,
  lost: 0,
};

type Scope = { organizationId: string; userId: string; userRole: string };

type LatestQualification = {
  lead_id: string | null;
  conversation_id: string;
  score: number;
  priority: string | null;
  sales_stage: string | null;
  summary: string;
  signals: unknown;
  missing_information: unknown;
  next_best_action: string;
  recommended_follow_up_at: string | null;
  created_at: string;
};

type QualificationSignals = {
  productInterest: string | null;
  location: string | null;
  budget: string | null;
  timeline: string | null;
  objections: string[];
};

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function qualificationSignals(value: unknown): QualificationSignals {
  const signals = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const text = (key: string) => typeof signals[key] === "string" && signals[key].trim() ? signals[key].trim() : null;
  return {
    productInterest: text("productInterest"),
    location: text("location"),
    budget: text("budget"),
    timeline: text("timeline"),
    objections: asStrings(signals.objections),
  };
}

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLocaleLowerCase("tr-TR");
}

function normalizePhone(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function latestQualifications(scope: Scope, includeClosed = true): Promise<LatestQualification[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("conversation_ai_qualifications")
    .select("lead_id,conversation_id,score,priority,sales_stage,summary,signals,missing_information,next_best_action,recommended_follow_up_at,created_at")
    .eq("organization_id", scope.organizationId)
    .order("created_at", { ascending: false })
    .limit(750);
  if (error) throw new Error("Gelir zekâsı verileri yüklenemedi.");

  const latest = new Map<string, LatestQualification>();
  for (const row of (data || []) as LatestQualification[]) {
    if (row.lead_id && !latest.has(row.lead_id)) latest.set(row.lead_id, row);
  }
  const rows = [...latest.values()];
  return includeClosed ? rows : rows.filter((row) => !CLOSED.has(row.sales_stage || ""));
}

async function scopedLeads(scope: Scope, ids?: string[]) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("leads")
    .select("id,full_name,email,phone,company,city,status,source,assigned_to,estimated_value,currency,next_follow_up_at,created_at,updated_at")
    .eq("organization_id", scope.organizationId);
  if (ids?.length) query = query.in("id", ids);
  if (isSalesRepresentativeRole(scope.userRole as "sales" | "sales_rep")) query = query.or(`assigned_to.eq.${scope.userId},assigned_to.is.null`);
  const { data, error } = await query.limit(1000);
  if (error) throw new Error("Lead verileri yüklenemedi.");
  return data || [];
}

export async function listFollowUpAutomationV2(scope: Scope) {
  const risks = await listStaleOpportunities({ ...scope, limit: 50 });
  return risks.map((item) => ({
    ...item,
    urgency: item.riskScore >= 80 ? "critical" : item.riskScore >= 60 ? "high" : "normal",
    recommendedDelayHours: item.riskScore >= 80 ? 0 : item.riskScore >= 60 ? 2 : 12,
    draftContext: `${item.name} · skor ${item.score} · aşama ${item.salesStage} · ${item.reason} · sonraki aksiyon: ${item.nextBestAction}`,
  }));
}

export async function generateFollowUpDraftV2(input: {
  customerName: string;
  salesStage: string;
  score: number;
  reason: string;
  nextBestAction: string;
  productInterest?: string | null;
  objection?: string | null;
}) {
  const prompt = `Türkçe bir satış takip mesajı taslağı yaz. Yalnızca taslak üret; gönderim kararı insana aittir.\nMüşteri: ${input.customerName}\nSatış aşaması: ${input.salesStage}\nLead Score: ${input.score}\nTakip nedeni: ${input.reason}\nSonraki en iyi aksiyon: ${input.nextBestAction}\nÜrün ilgisi: ${input.productInterest || "bilinmiyor"}\nİtiraz: ${input.objection || "bilinmiyor"}\nKurallar: 2-4 kısa cümle, doğal ve kişisel ton. Fiyat, indirim, stok, teslim tarihi veya ödeme koşulu uydurma. Baskıcı satış dili kullanma.`;
  return (await generateText(prompt, { temperature: 0.2 })).trim();
}

export async function getQuoteIntelligence(scope: Scope, leadId: string) {
  const [qualifications, leads] = await Promise.all([latestQualifications(scope), scopedLeads(scope, [leadId])]);
  const qualification = qualifications.find((row) => row.lead_id === leadId) || null;
  const signals = qualificationSignals(qualification?.signals);
  const lead = leads[0] || null;
  if (!lead) return null;
  return {
    lead,
    conversationId: qualification?.conversation_id || null,
    score: qualification?.score || 0,
    salesStage: qualification?.sales_stage || "new_lead",
    productInterest: signals.productInterest,
    location: signals.location || lead.city || null,
    budget: signals.budget,
    timeline: signals.timeline,
    objections: signals.objections,
    missingInformation: asStrings(qualification?.missing_information),
    nextBestAction: qualification?.next_best_action || "Müşteri ihtiyacını netleştir.",
    readiness: qualification?.score && qualification.score >= 70 && ["qualified", "quote_ready", "quote_sent", "negotiation"].includes(qualification.sales_stage || "") ? "ready" : "needs_review",
    warnings: [
      ...(!signals.productInterest ? ["Ürün veya hizmet ilgisi net değil."] : []),
      ...(!signals.budget ? ["Bütçe bilgisi bulunmuyor."] : []),
      ...(!signals.timeline ? ["Satın alma zamanlaması bilinmiyor."] : []),
    ],
  };
}

export async function getWinLossIntelligence(scope: Scope) {
  const closed = (await latestQualifications(scope)).filter((row) => ["won", "lost"].includes(row.sales_stage || ""));
  const ids = closed.map((row) => row.lead_id).filter((id): id is string => Boolean(id));
  const leads = await scopedLeads(scope, ids);
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const reasonCounts = new Map<string, number>();
  const records = closed.flatMap((row) => {
    const lead = row.lead_id ? leadMap.get(row.lead_id) : null;
    if (!lead) return [];
    const reasons = qualificationSignals(row.signals).objections;
    if (row.sales_stage === "lost") for (const reason of reasons.length ? reasons : ["Neden belirtilmedi"]) reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    return [{ leadId: lead.id, name: lead.full_name, outcome: row.sales_stage, value: Number(lead.estimated_value || 0), score: row.score, reasons, summary: row.summary, closedAt: row.created_at }];
  });
  const wins = records.filter((row) => row.outcome === "won");
  const losses = records.filter((row) => row.outcome === "lost");
  return {
    wins: wins.length,
    losses: losses.length,
    winRate: records.length ? Math.round((wins.length / records.length) * 100) : 0,
    wonValue: wins.reduce((sum, row) => sum + row.value, 0),
    lostValue: losses.reduce((sum, row) => sum + row.value, 0),
    topLossReasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    records: records.slice(0, 50),
  };
}

export async function getSalesForecast(scope: Scope) {
  const open = await latestQualifications(scope, false);
  const ids = open.map((row) => row.lead_id).filter((id): id is string => Boolean(id));
  const leads = await scopedLeads(scope, ids);
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const opportunities = open.flatMap((row) => {
    const lead = row.lead_id ? leadMap.get(row.lead_id) : null;
    if (!lead) return [];
    const stageProbability = STAGE_PROBABILITY[row.sales_stage || "new_lead"] || 0.08;
    const scoreProbability = Math.max(0.05, Math.min(0.95, (row.score || 0) / 100));
    const probability = Math.round(((stageProbability * 0.6) + (scoreProbability * 0.4)) * 100);
    const value = Number(lead.estimated_value || 0);
    return [{ leadId: lead.id, name: lead.full_name, stage: row.sales_stage || "new_lead", score: row.score || 0, probability, value, weightedValue: Math.round(value * probability / 100), priority: row.priority || "medium", nextBestAction: row.next_best_action }];
  }).sort((a, b) => b.weightedValue - a.weightedValue);
  const weightedForecast = opportunities.reduce((sum, row) => sum + row.weightedValue, 0);
  const totalPipeline = opportunities.reduce((sum, row) => sum + row.value, 0);
  const commit = opportunities.filter((row) => row.probability >= 70).reduce((sum, row) => sum + row.weightedValue, 0);
  const upside = opportunities.filter((row) => row.probability >= 40 && row.probability < 70).reduce((sum, row) => sum + row.weightedValue, 0);
  const risk = opportunities.filter((row) => row.probability < 40).reduce((sum, row) => sum + row.value, 0);
  return { totalPipeline, weightedForecast, commit, upside, risk, opportunities: opportunities.slice(0, 50) };
}

export async function listIdentityResolutionCandidates(scope: Scope) {
  const admin = createSupabaseAdminClient();
  const leads = await scopedLeads(scope);
  const { data: customers, error } = await admin
    .from("customers")
    .select("id,full_name,email,phone,created_at")
    .eq("organization_id", scope.organizationId)
    .limit(1000);
  if (error) throw new Error("Müşteri kimlik verileri yüklenemedi.");

  const candidates: Array<{ type: "lead_lead" | "lead_customer"; confidence: "exact"; reason: string; primary: { id: string; name: string }; duplicate: { id: string; name: string } }> = [];
  for (let i = 0; i < leads.length; i += 1) {
    for (let j = i + 1; j < leads.length; j += 1) {
      const a = leads[i]; const b = leads[j];
      const sameEmail = normalizeEmail(a.email) && normalizeEmail(a.email) === normalizeEmail(b.email);
      const samePhone = normalizePhone(a.phone) && normalizePhone(a.phone) === normalizePhone(b.phone);
      if (sameEmail || samePhone) candidates.push({ type: "lead_lead", confidence: "exact", reason: sameEmail && samePhone ? "Aynı e-posta ve telefon" : sameEmail ? "Aynı e-posta" : "Aynı telefon", primary: { id: a.id, name: a.full_name }, duplicate: { id: b.id, name: b.full_name } });
    }
  }
  for (const lead of leads) for (const customer of customers || []) {
    const sameEmail = normalizeEmail(lead.email) && normalizeEmail(lead.email) === normalizeEmail(customer.email);
    const samePhone = normalizePhone(lead.phone) && normalizePhone(lead.phone) === normalizePhone(customer.phone);
    if (sameEmail || samePhone) candidates.push({ type: "lead_customer", confidence: "exact", reason: sameEmail && samePhone ? "Aynı e-posta ve telefon" : sameEmail ? "Aynı e-posta" : "Aynı telefon", primary: { id: lead.id, name: lead.full_name }, duplicate: { id: customer.id, name: customer.full_name } });
  }
  return candidates.slice(0, 100);
}
