import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  NormalizedLeadInput,
  LeadIntelligenceResult,
  DailyRevenueBriefing,
} from "./domain";
import { detectBuyingSignals, detectObjections } from "@/server/services/sales-operations-v5";

/**
 * Normalizes phone numbers to standard format for safe matching.
 */
export function canonicalizePhoneNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("5")) {
    return `+90${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("05")) {
    return `+90${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("905")) {
    return `+${digits}`;
  }
  return digits.length >= 7 ? `+${digits}` : null;
}

/**
 * Ingests and normalizes lead events across all authorized intake sources.
 * Applies strict, safe deduplication based only on canonical phone or email.
 * NEVER merges identities based on similar names.
 */
export async function ingestNormalizedLead(
  arg1: unknown,
  arg2: unknown,
  arg3?: unknown
): Promise<{
  leadId: string;
  isDuplicate: boolean;
  matchedBy?: "phone" | "email";
  existingLeadId?: string;
  deduplicationReason?: string;
}> {
  let admin: SupabaseClient;
  let organizationId: string;
  let input: NormalizedLeadInput;

  if (arg1 && typeof arg1 === "object" && "from" in arg1) {
    admin = arg1 as SupabaseClient;
    organizationId = String(arg2);
    input = arg3 as NormalizedLeadInput;
  } else {
    organizationId = String(arg1);
    input = arg2 as NormalizedLeadInput;
    admin = (arg3 && typeof arg3 === "object" && "from" in arg3) ? (arg3 as SupabaseClient) : createSupabaseAdminClient();
  }

  const canonicalPhone = canonicalizePhoneNumber(input.phone);
  const normalizedEmail = input.email?.trim().toLowerCase() || null;

  // 1. Strict deduplication check: phone or email only
  let existingLeadId: string | null = null;
  let matchedBy: "phone" | "email" | undefined = undefined;

  if (canonicalPhone) {
    const { data } = await admin
      .from("leads")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("phone", canonicalPhone)
      .maybeSingle();

    if (data?.id) {
      existingLeadId = data.id;
      matchedBy = "phone";
    }
  }

  if (!existingLeadId && normalizedEmail) {
    const { data } = await admin
      .from("leads")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (data?.id) {
      existingLeadId = data.id;
      matchedBy = "email";
    }
  }

  if (existingLeadId) {
    // Append activity note indicating re-engagement from channel
    await admin.from("activities").insert({
      organization_id: organizationId,
      lead_id: existingLeadId,
      type: "lead_re_engagement",
      title: `${input.sourceChannel.toUpperCase()} üzerinden tekrar iletişim`,
      detail: input.notes || `${input.productInterest || "İlgili ürün"} hakkında yeni talep alındı.`,
      metadata: {
        sourceChannel: input.sourceChannel,
        utmParameters: input.utmParameters,
      },
    });

    return {
      leadId: existingLeadId,
      isDuplicate: true,
      matchedBy,
      existingLeadId,
      deduplicationReason: matchedBy === "phone" ? "canonical_phone" : "email",
    };
  }

  // 2. Insert fresh lead record
  const { data: newLead, error } = await admin
    .from("leads")
    .insert({
      organization_id: organizationId,
      full_name: input.fullName.trim(),
      phone: canonicalPhone || input.phone || null,
      email: normalizedEmail,
      company: input.company?.trim() || null,
      notes: input.notes || null,
      source: input.sourceChannel,
      status: "new",
      budget: input.budgetAmount ?? null,
      city: input.city || null,
    })
    .select("id")
    .single();

  if (error || !newLead) {
    throw new Error(`Failed to ingest lead: ${error?.message || "Unknown error"}`);
  }

  // 3. Insert initial activity
  await admin.from("activities").insert({
    organization_id: organizationId,
    lead_id: newLead.id,
    type: "lead_created",
    title: `Yeni Aday: ${input.sourceChannel.toUpperCase()}`,
    detail: `${input.fullName} - ${input.productInterest || "Genel Bilgi Talebi"}`,
    metadata: {
      sourceChannel: input.sourceChannel,
      expectedTimeline: input.expectedTimeline,
      utmParameters: input.utmParameters,
    },
  });

  return { leadId: newLead.id, isDuplicate: false };
}

/**
 * Analyzes lead context, separates observed facts from AI inferences,
 * computes qualification score, and produces actionable next steps.
 */
export async function evaluateLeadIntelligence(
  arg1: unknown,
  arg2: unknown,
  arg3?: unknown
): Promise<LeadIntelligenceResult> {
  let admin: SupabaseClient;
  let organizationId: string;
  let leadId: string;
  let fallbackContext: Record<string, unknown> | null = null;

  if (arg1 && typeof arg1 === "object" && "from" in arg1) {
    admin = arg1 as SupabaseClient;
    organizationId = String(arg2);
    if (typeof arg3 === "string") {
      leadId = arg3;
    } else {
      const obj = (arg3 && typeof arg3 === "object") ? (arg3 as Record<string, unknown>) : {};
      leadId = (obj.leadId as string) || "unknown-lead";
      fallbackContext = obj;
    }
  } else {
    organizationId = String(arg1);
    if (typeof arg2 === "string") {
      leadId = arg2;
      admin = (arg3 && typeof arg3 === "object" && "from" in arg3) ? (arg3 as SupabaseClient) : createSupabaseAdminClient();
    } else {
      const obj = (arg2 && typeof arg2 === "object") ? (arg2 as Record<string, unknown>) : {};
      leadId = (obj.leadId as string) || "unknown-lead";
      fallbackContext = obj;
      admin = (arg3 && typeof arg3 === "object" && "from" in arg3) ? (arg3 as SupabaseClient) : createSupabaseAdminClient();
    }
  }

  const [leadRes, activitiesRes, quotesRes] = await Promise.all([
    admin
      .from("leads")
      .select("id, full_name, phone, email, company, notes, status, budget, city, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("id", leadId)
      .single(),
    admin
      .from("activities")
      .select("type, title, detail, created_at")
      .eq("organization_id", organizationId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("quotes")
      .select("id, status, grand_total, created_at")
      .eq("organization_id", organizationId)
      .eq("lead_id", leadId),
  ]);

  let lead = leadRes.data;
  if (!lead && fallbackContext) {
    lead = {
      id: leadId,
      full_name: String(fallbackContext.fullName || ""),
      phone: fallbackContext.phone ? String(fallbackContext.phone) : null,
      email: fallbackContext.email ? String(fallbackContext.email) : null,
      company: fallbackContext.company ? String(fallbackContext.company) : null,
      notes: fallbackContext.notes ? String(fallbackContext.notes) : null,
      status: String(fallbackContext.status || "new_lead"),
      budget: typeof fallbackContext.budgetAmount === "number" ? fallbackContext.budgetAmount : null,
      city: fallbackContext.city ? String(fallbackContext.city) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  } else if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  const activities = activitiesRes.data || [];
  const quotes = quotesRes.data || [];

  // Extract observed facts (Grounded Facts)
  const observedFacts: string[] = [];
  if (lead.phone) observedFacts.push(`Doğrulanmış Telefon: ${lead.phone}`);
  if (lead.email) observedFacts.push(`Doğrulanmış E-posta: ${lead.email}`);
  if (lead.city) observedFacts.push(`Talep Edilen Konum/Şehir: ${lead.city}`);
  if (lead.budget && lead.budget > 0) {
    observedFacts.push(`Açıkça Belirtilen Bütçe: ${lead.budget.toLocaleString("tr-TR")} TRY`);
  }
  if (quotes.length > 0) {
    observedFacts.push(`${quotes.length} adet kayıtlı teklif bulunmaktadır (Son durum: ${quotes[0].status}).`);
  }

  // Combined interaction text for signal detection
  const combinedText = [
    lead.notes || "",
    ...activities.map((a: { title?: string | null; detail?: string | null }) => `${a.title || ""} ${a.detail || ""}`),
  ].join(" ");

  const buyingSignals = detectBuyingSignals(combinedText);
  const objections = detectObjections(combinedText);

  // Compute qualification score
  let score = 30; // Baseline
  if (lead.phone) score += 15;
  if (lead.email) score += 10;
  if (lead.budget && lead.budget > 0) score += 15;
  if (lead.city) score += 10;

  for (const sig of buyingSignals) {
    score += sig.weight;
  }
  score -= Math.min(30, objections.length * 10);
  score = Math.max(5, Math.min(95, score));

  const temperature = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";

  // AI Inferences (Clearly separated from observed facts)
  const aiInferences: string[] = [];
  if (temperature === "hot") {
    aiInferences.push("Yüksek satın alma niyeti ve acil ihtiyaç olasılığı yüksek.");
  } else if (temperature === "warm") {
    aiInferences.push("Bilgi toplama ve fiyat kıyaslama aşamasında olabilir.");
  } else {
    aiInferences.push("Düşük etkileşim veya belirsiz gereksinimler tespit edildi.");
  }

  if (objections.includes("price_high")) {
    aiInferences.push("Fiyat itirazı algılandı; alternatif standart model veya esnek ödeme planı önerilmeli.");
  }

  if (!lead.phone && !lead.email) {
    aiInferences.push("Eksik iletişim bilgisi: Ne geçerli bir telefon numarası ne de e-posta adresi mevcut.");
  }

  // Determine recommended stage
  let recommendedStage: LeadIntelligenceResult["recommendedStage"] = "new_lead";
  if (quotes.some((q: { status?: string | null }) => q.status === "approved" || q.status === "sent")) {
    recommendedStage = "quote_sent";
  } else if (quotes.length > 0) {
    recommendedStage = "quote_preparation";
  } else if (score >= 60 || lead.budget) {
    recommendedStage = "qualified";
  }

  // Build next-best actions requiring human review
  const recommendedNextActions: LeadIntelligenceResult["recommendedNextActions"] = [];

  if (quotes.length === 0 && score >= 50) {
    recommendedNextActions.push({
      id: crypto.randomUUID(),
      actionType: "quote_draft",
      title: "Teklif Taslağı Hazırla",
      reason: "Aday nitelikli ve bütçe/ürün ilgisi doğrulanmış durumda.",
      evidence: `Nitelik skoru: ${score}/100, Talep: ${lead.city || "Genel"}`,
      priority: "high",
      suggestedExecutionTime: "Hemen",
      requiresHumanApproval: true,
    });
  } else if (quotes.some((q: { status?: string | null }) => q.status === "sent")) {
    recommendedNextActions.push({
      id: crypto.randomUUID(),
      actionType: "reply_draft",
      title: "Teklif Sonrası Takip Mesajı Taslağı",
      reason: "Gönderilen teklif için müşteri geri dönüşü bekleniyor.",
      evidence: `Mevcut teklif durumu: sent`,
      priority: "medium",
      suggestedExecutionTime: "24 saat içinde",
      requiresHumanApproval: true,
    });
  } else {
    recommendedNextActions.push({
      id: crypto.randomUUID(),
      actionType: "call",
      title: "Gereksinim Netleştirme Araması Planla",
      reason: "Eksik detayları tamamlamak için görüşme önerilir.",
      evidence: `Belirtilen not: ${lead.notes?.slice(0, 50) || "Özel not yok"}`,
      priority: "medium",
      suggestedExecutionTime: "Bugün 14:00 - 17:00 arası",
      requiresHumanApproval: true,
    });
  }

  const hoursInactive = Math.floor(
    (Date.now() - new Date(lead.updated_at || lead.created_at).getTime()) / 3_600_000
  );
  const isStalled = hoursInactive > 72 && (recommendedStage as string) !== "won" && (recommendedStage as string) !== "lost";

  return {
    leadId,
    qualificationScore: score,
    temperature,
    observedFacts,
    aiInferences,
    recommendedStage,
    recommendedNextActions,
    isStalled,
    stalledReason: isStalled ? `${hoursInactive} saattir yeni etkileşim gerçekleşmedi.` : undefined,
  };
}

/**
 * Generates daily executive operational briefing from real CRM records.
 * Direct links provided for immediate navigation.
 */
export async function generateDailyRevenueBriefing(
  organizationId: string
): Promise<DailyRevenueBriefing> {
  const admin = createSupabaseAdminClient();
  const todayStr = new Date().toISOString().split("T")[0];

  const [leadsRes, quotesRes, tasksRes] = await Promise.all([
    admin
      .from("leads")
      .select("id, full_name, status, budget, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("quotes")
      .select("id, quote_number, status, grand_total, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("tasks")
      .select("id, title, status, due_date")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .limit(50),
  ]);

  const leads = leadsRes.data || [];
  const quotes = quotesRes.data || [];
  const tasks = tasksRes.data || [];

  const newLeads = leads.filter((l) => l.created_at.startsWith(todayStr) || l.status === "new");
  const quotesAwaitingApproval = quotes.filter((q) => q.status === "pending" || q.status === "draft");
  const wonQuotes = quotes.filter((q) => q.status === "accepted" || q.status === "won");
  const wonTotal = wonQuotes.reduce((sum, q) => sum + Number(q.grand_total || 0), 0);

  const now = new Date();
  const overdueTasks = tasks.filter((t) => t.due_date && new Date(t.due_date) < now);

  const priorities: DailyRevenueBriefing["actionablePriorities"] = [];

  for (const lead of newLeads.slice(0, 3)) {
    priorities.push({
      title: `Yeni Aday İnceleme: ${lead.full_name}`,
      detail: `Sisteme yeni giriş yaptı. İlk yanıt SLA süresi dolmadan değerlendirin.`,
      recordType: "lead",
      recordId: lead.id,
      href: `/leads/${lead.id}`,
      priority: "high",
    });
  }

  for (const quote of quotesAwaitingApproval.slice(0, 3)) {
    priorities.push({
      title: `Onay Bekleyen Teklif: #${quote.quote_number || quote.id.slice(0, 8)}`,
      detail: `Toplam: ${Number(quote.grand_total || 0).toLocaleString("tr-TR")} TRY. İnceleyip onaylayın.`,
      recordType: "quote",
      recordId: quote.id,
      href: `/quotes/${quote.id}`,
      priority: "urgent",
    });
  }

  for (const task of overdueTasks.slice(0, 2)) {
    priorities.push({
      title: `Gecikmiş Takip Görevi: ${task.title}`,
      detail: `Vadesi geçmiş görev. İlgili müşteri ile temasa geçin.`,
      recordType: "task",
      recordId: task.id,
      href: `/tasks`,
      priority: "high",
    });
  }

  return {
    date: todayStr,
    workspaceId: organizationId,
    summary: `Bugün ${newLeads.length} yeni aday, ${quotesAwaitingApproval.length} onay bekleyen teklif ve ${overdueTasks.length} gecikmiş görev bulunmaktadır.`,
    newLeadsCount: newLeads.length,
    qualifiedOpportunitiesCount: leads.filter((l) => l.status === "qualified").length,
    quotesAwaitingApprovalCount: quotesAwaitingApproval.length,
    overdueFollowUpsCount: overdueTasks.length,
    atRiskDealsCount: leads.filter((l) => l.status === "contacted").length,
    wonDealsValue: wonTotal,
    currency: "TRY",
    actionablePriorities: priorities,
  };
}
