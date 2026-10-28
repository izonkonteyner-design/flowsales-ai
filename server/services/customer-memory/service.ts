import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CreateMemoryInput,
  type CustomerMemoryChannel,
  type CustomerMemoryContext,
  type CustomerMemoryRecord,
  type CustomerMemoryType,
  type InteractionExtractionInput,
  createMemoryInputSchema,
  interactionExtractionInputSchema,
} from "./domain";

/**
 * Persists an omnichannel memory entry with strict organization isolation.
 */
export async function recordCustomerMemory(
  supabase: SupabaseClient,
  input: CreateMemoryInput
): Promise<CustomerMemoryRecord> {
  const validated = createMemoryInputSchema.parse(input);

  const { data, error } = await supabase
    .from("customer_memories")
    .insert({
      organization_id: validated.organizationId,
      customer_id: validated.customerId ?? null,
      lead_id: validated.leadId ?? null,
      memory_type: validated.memoryType,
      content: validated.content.trim(),
      confidence: validated.confidence,
      source_channel: validated.sourceChannel,
      source_ref_id: validated.sourceRefId ?? null,
      source_timestamp: validated.sourceTimestamp ?? new Date().toISOString(),
      verified_by: validated.verifiedBy ?? null,
      metadata: validated.metadata ?? {},
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to record customer memory: ${error?.message || "Unknown error"}`);
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    customerId: data.customer_id,
    leadId: data.lead_id,
    memoryType: data.memory_type,
    content: data.content,
    confidence: Number(data.confidence),
    sourceChannel: data.source_channel,
    sourceRefId: data.source_ref_id,
    sourceTimestamp: data.source_timestamp,
    verifiedBy: data.verified_by,
    verifiedAt: data.verified_at,
    metadata: data.metadata ?? {},
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Extracts facts, statements, preferences, and objections from an omnichannel raw interaction.
 * Uses zero-cost deterministic extraction with fallback to ensure high reliability.
 */
export async function ingestInteractionToMemories(
  supabase: SupabaseClient,
  input: InteractionExtractionInput
): Promise<CustomerMemoryRecord[]> {
  const validated = interactionExtractionInputSchema.parse(input);
  const text = validated.rawText;
  const recorded: CustomerMemoryRecord[] = [];

  // Deterministic rule-based extraction for zero-cost operation & testability
  const extractions: Array<{
    type: "verified_fact" | "customer_statement" | "preference" | "objection" | "ai_summary";
    content: string;
    confidence: number;
  }> = [];

  // Detect explicit customer statements regarding budget
  const budgetMatch = text.match(/(?:bütçe|butce|budget)[a-zA-ZğüşıöçĞÜŞİÖÇ\s:]*?([0-9.,]+(?:\s*(?:bin|k|TL|₺|USD|EUR))?)/i);
  if (budgetMatch) {
    extractions.push({
      type: "customer_statement",
      content: `Müşteri bütçe ifadesi: "${budgetMatch[0].trim()}"`,
      confidence: 0.95,
    });
  }

  // Detect dimension / product specifications (Container, Modular, Dimensions)
  const dimensionMatch = text.match(/(?:[234]x[3-9]|3x7|3x8|4x8|21\s*m2|42\s*m2|\d+\s*m2|\d+\s*adet|sandviç\s*panel|konteyner|prefabrik)/gi);
  if (dimensionMatch && dimensionMatch.length > 0) {
    extractions.push({
      type: "verified_fact",
      content: `Talep edilen ürün / ölçü özellikleri: ${dimensionMatch.join(", ")}`,
      confidence: 0.9,
    });
  }

  // Detect delivery / location facts
  const locationMatch = text.match(/(?:teslimat|sevk|kurulum|arsa|bölge|ilçe|şehir)[\s:]*([a-zA-ZğüşıöçĞÜŞİÖÇ\s]{3,30})/i);
  if (locationMatch && locationMatch[1]) {
    const locClean = locationMatch[1].trim();
    if (locClean.length > 2) {
      extractions.push({
        type: "verified_fact",
        content: `Lokasyon / teslimat hedefi: ${locClean}`,
        confidence: 0.85,
      });
    }
  }

  // Detect preferences (color, insulation, WC/shower)
  const prefKeywords = [
    { match: /antrasit|beyaz|ahşap\s*desen|özel\s*renk/i, label: "Renk tercihi" },
    { match: /wc|tuvalet|banyo|duş|mutfak|evye/i, label: "İç donanım tercihi" },
    { match: /taşyünü|poliüretan|eps|izolasyon|yalıtım/i, label: "Yalıtım tercihi" },
  ];
  for (const p of prefKeywords) {
    const m = text.match(p.match);
    if (m) {
      extractions.push({
        type: "preference",
        content: `${p.label}: ${m[0]} talep edildi.`,
        confidence: 0.88,
      });
    }
  }

  // Detect objections (price, timing, competitor)
  const objectionKeywords = [
    { match: /pahalı|yüksek|fiyatı\s*çok|bütçemi\s*aşıyor|indirim/i, label: "Fiyat itirazı / İndirim beklentisi" },
    { match: /geç|teslim\s*süresi\s*uzun|acil|hemen\s*lazım/i, label: "Teslim süresi endişesi" },
    { match: /rakip|başka\s*firma|teklif\s*aldım|daha\s*uygun/i, label: "Alternatif teklif / Rakip karşılaştırması" },
  ];
  for (const o of objectionKeywords) {
    const m = text.match(o.match);
    if (m) {
      extractions.push({
        type: "objection",
        content: `${o.label}: "${m[0]}" vurgulandı.`,
        confidence: 0.85,
      });
    }
  }

  // Always create an AI summary or interaction snippet
  extractions.push({
    type: "ai_summary",
    content: text.length > 150 ? `${text.slice(0, 147)}...` : text,
    confidence: 0.9,
  });

  for (const ext of extractions) {
    const mem = await recordCustomerMemory(supabase, {
      organizationId: validated.organizationId,
      customerId: validated.customerId,
      leadId: validated.leadId,
      memoryType: ext.type,
      content: ext.content,
      confidence: ext.confidence,
      sourceChannel: validated.channel,
      sourceRefId: validated.sourceRefId,
      sourceTimestamp: validated.timestamp,
      metadata: { speaker: validated.speaker ?? "customer" },
    });
    recorded.push(mem);
  }

  return recorded;
}

/**
 * Retrieves chronological memories for a lead or customer.
 */
export async function getCustomerMemoryTimeline(
  supabase: SupabaseClient,
  organizationId: string,
  params: { customerId?: string; leadId?: string; limit?: number }
): Promise<CustomerMemoryRecord[]> {
  let query = supabase
    .from("customer_memories")
    .select("*")
    .eq("organization_id", organizationId);

  if (params.customerId) {
    query = query.eq("customer_id", params.customerId);
  } else if (params.leadId) {
    query = query.eq("lead_id", params.leadId);
  }

  const { data, error } = await query
    .order("source_timestamp", { ascending: false })
    .limit(params.limit || 50);

  if (error || !data) {
    return [];
  }

  return data.map((row: unknown) => {
    const d = row as Record<string, unknown>;
    return {
      id: String(d.id),
      organizationId: String(d.organization_id),
      customerId: d.customer_id ? String(d.customer_id) : null,
      leadId: d.lead_id ? String(d.lead_id) : null,
      memoryType: d.memory_type as CustomerMemoryType,
      content: String(d.content),
      confidence: Number(d.confidence),
      sourceChannel: d.source_channel as CustomerMemoryChannel,
      sourceRefId: d.source_ref_id ? String(d.source_ref_id) : null,
      sourceTimestamp: String(d.source_timestamp),
      verifiedBy: d.verified_by ? String(d.verified_by) : null,
      verifiedAt: d.verified_at ? String(d.verified_at) : null,
      metadata: (d.metadata && typeof d.metadata === "object") ? (d.metadata as Record<string, unknown>) : {},
      createdAt: String(d.created_at),
      updatedAt: String(d.updated_at),
    };
  });
}

/**
 * Synthesizes customer memory into distinct categories for quoting and negotiation.
 */
export async function synthesizeCustomerMemoryContext(
  supabase: SupabaseClient,
  organizationId: string,
  params: { customerId?: string; leadId?: string }
): Promise<CustomerMemoryContext> {
  const targetId = params.customerId || params.leadId || "";
  const targetType = params.customerId ? "customer" : "lead";

  const memories = await getCustomerMemoryTimeline(supabase, organizationId, params);

  const verifiedFacts: string[] = [];
  const customerStatements: string[] = [];
  const preferences: string[] = [];
  const activeObjections: string[] = [];
  const recentSummaries: string[] = [];

  for (const m of memories) {
    switch (m.memoryType) {
      case "verified_fact":
        verifiedFacts.push(m.content);
        break;
      case "customer_statement":
        customerStatements.push(m.content);
        break;
      case "preference":
        preferences.push(m.content);
        break;
      case "objection":
        activeObjections.push(m.content);
        break;
      case "ai_summary":
        recentSummaries.push(m.content);
        break;
    }
  }

  let recommendedNegotiationAngle = "Standart ticari yaklaşım.";
  if (activeObjections.some((o) => o.toLowerCase().includes("fiyat") || o.toLowerCase().includes("indirim"))) {
    recommendedNegotiationAngle = "Müşteri fiyata duyarlı. Liste fiyatı yerine opsiyonel kalemleri (nakliye, ek pencere) esneterek veya peşin ödeme indirimi sunarak değer odaklı ilerleyin.";
  } else if (activeObjections.some((o) => o.toLowerCase().includes("teslim") || o.toLowerCase().includes("acil"))) {
    recommendedNegotiationAngle = "Müşteri için zamanlama kritik. Hazır stok veya öncelikli üretim planlamasını öne çıkarın.";
  }

  return {
    organizationId,
    targetId,
    targetType,
    verifiedFacts,
    customerStatements,
    preferences,
    activeObjections,
    recentSummaries,
    timeline: memories.map((m) => ({
      id: m.id,
      memoryType: m.memoryType,
      content: m.content,
      sourceChannel: m.sourceChannel,
      timestamp: m.sourceTimestamp,
      confidence: m.confidence,
    })),
    recommendedNegotiationAngle,
  };
}
