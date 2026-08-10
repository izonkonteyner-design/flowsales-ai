import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { searchTrustedProducts, getTrustedProductById } from "@/server/services/sales-tools/product-catalog";
import { getCurrentTrustedProductPrice, assertSpokenPriceMatchesTrustedSource } from "@/server/services/sales-tools/pricing";
import { getTrustedShowroom } from "@/server/services/business-locations";
import { scorePhoneQualification } from "@/server/services/sales-session/phone-lead-score";
import type { SalesQualification } from "@/server/services/sales-session/domain";
import { evaluateSalesAction } from "@/server/services/sales-policy/action-policy";
import type { VoiceCallContext, VoiceChannelAdapter } from "@/server/services/voice-channel/adapter";

export type VoiceToolName = "search_products" | "get_current_price" | "get_showroom" | "update_qualification" | "request_handoff";
export const VOICE_TRUSTED_TOOLS: ReadonlyArray<VoiceToolName> = ["search_products","get_current_price","get_showroom","update_qualification","request_handoff"];

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+90${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+90${digits.slice(1)}`;
  return value.trim();
}

export class VoiceSalesRepository {
  private admin = createSupabaseAdminClient();

  async createSession(input: { organizationId: string; channelSessionId: string; leadId?: string | null; customerId?: string | null }) {
    const { data, error } = await this.admin.from("sales_sessions").upsert({
      organization_id: input.organizationId, channel: "phone", channel_session_id: input.channelSessionId,
      lead_id: input.leadId ?? null, customer_id: input.customerId ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,channel,channel_session_id" }).select("*").single();
    if (error || !data) throw new Error(`Sales session kaydedilemedi: ${error?.message ?? "unknown"}`);
    return data;
  }

  async updateSession(sessionId: string, organizationId: string, patch: Record<string, unknown>) {
    const { error } = await this.admin.from("sales_sessions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", sessionId).eq("organization_id", organizationId);
    if (error) throw new Error(`Sales session güncellenemedi: ${error.message}`);
  }

  async createCall(input: { organizationId: string; salesSessionId: string; provider: string; providerCallId: string; direction: "inbound" | "outbound"; from: string; to: string; leadId?: string | null; customerId?: string | null }) {
    const { data, error } = await this.admin.from("voice_calls").upsert({
      organization_id: input.organizationId, sales_session_id: input.salesSessionId, provider: input.provider,
      provider_call_id: input.providerCallId, direction: input.direction, from_number: normalizePhone(input.from), to_number: normalizePhone(input.to),
      state: "ringing", lead_id: input.leadId ?? null, customer_id: input.customerId ?? null,
    }, { onConflict: "organization_id,provider,provider_call_id" }).select("*").single();
    if (error || !data) throw new Error(`Çağrı kaydedilemedi: ${error?.message ?? "unknown"}`);
    return data;
  }

  async getCall(organizationId: string, provider: string, providerCallId: string) {
    const { data } = await this.admin.from("voice_calls").select("*").eq("organization_id", organizationId).eq("provider", provider).eq("provider_call_id", providerCallId).maybeSingle();
    return data;
  }

  async updateCall(callId: string, organizationId: string, patch: Record<string, unknown>) {
    const { error } = await this.admin.from("voice_calls").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", callId).eq("organization_id", organizationId);
    if (error) throw new Error(`Çağrı güncellenemedi: ${error.message}`);
  }

  async appendTranscript(input: { organizationId: string; callId: string; salesSessionId: string; speaker: "customer" | "assistant" | "system"; text: string; interrupted?: boolean; isFinal?: boolean }) {
    const { count } = await this.admin.from("voice_transcript_segments").select("id", { count: "exact", head: true }).eq("call_id", input.callId);
    const { error } = await this.admin.from("voice_transcript_segments").insert({ organization_id: input.organizationId, call_id: input.callId, sales_session_id: input.salesSessionId, sequence: count ?? 0, speaker: input.speaker, text: input.text.slice(0,5000), interrupted: input.interrupted === true, is_final: input.isFinal !== false });
    if (error) throw new Error(`Transcript kaydedilemedi: ${error.message}`);
  }

  async transcript(callId: string, organizationId: string) {
    const { data } = await this.admin.from("voice_transcript_segments").select("speaker,text,interrupted,created_at").eq("organization_id", organizationId).eq("call_id", callId).order("sequence");
    return data ?? [];
  }

  async recordEvent(input: { organizationId: string; callId?: string | null; provider: string; providerEventId?: string | null; eventType: string; payload?: Record<string, unknown> }) {
    await this.admin.from("voice_call_events").upsert({ organization_id: input.organizationId, call_id: input.callId ?? null, provider: input.provider, provider_event_id: input.providerEventId ?? null, event_type: input.eventType, payload: input.payload ?? {} }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
  }

  async listCalls(organizationId: string, limit = 100) {
    const { data, error } = await this.admin.from("voice_calls").select("id,provider,provider_call_id,from_number,to_number,state,lead_id,customer_id,summary,lead_score,temperature,next_best_action,human_handoff_requested,started_at,ended_at,duration_seconds").eq("organization_id", organizationId).order("started_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async resolveIdentity(organizationId: string, phone: string) {
    const { data, error } = await this.admin.rpc("resolve_voice_phone_identity", { p_organization_id: organizationId, p_phone: phone });
    if (error) throw new Error(`Telefon kimliği çözülemedi: ${error.message}`);
    const result = (data ?? {}) as { status?: string; leadIds?: string[]; customerIds?: string[]; normalizedPhone?: string };
    return { status: result.status ?? "UNMATCHED", leadId: result.leadIds?.length === 1 && !result.customerIds?.length ? result.leadIds[0] : null, customerId: result.customerIds?.length === 1 && !result.leadIds?.length ? result.customerIds[0] : null, normalizedPhone: result.normalizedPhone ?? normalizePhone(phone) };
  }
}

export async function recommendProductsV2(input: { organizationId: string; areaM2?: number; roomCount?: string; query?: string; budget?: number | null; limit?: number }) {
  const candidates = await searchTrustedProducts(input.organizationId, { areaM2: input.areaM2, roomCount: input.roomCount, query: input.query, limit: Math.min(input.limit ?? 10, 20) });
  const ranked = await Promise.all(candidates.map(async (product) => {
    let price: number | null = null;
    try { price = (await getCurrentTrustedProductPrice(input.organizationId, product.id)).amount; } catch { price = null; }
    const budgetFit = input.budget && price ? Math.max(0, 30 - Math.round(Math.abs(input.budget - price) / Math.max(input.budget, 1) * 30)) : 0;
    const areaFit = input.areaM2 && product.areaM2 !== null ? Math.max(0, 40 - Math.round(Math.abs(input.areaM2 - product.areaM2) * 4)) : 0;
    return { product, price, score: budgetFit + areaFit + (input.roomCount ? 20 : 0) + (input.query ? 10 : 0) };
  }));
  return ranked.sort((a,b) => b.score - a.score).slice(0, Math.min(input.limit ?? 5, 10));
}

export async function verifyPriceBeforeSpeech(input: { organizationId: string; productId: string; amount: number; currency: string }) {
  const trustedPrice = await getCurrentTrustedProductPrice(input.organizationId, input.productId);
  assertSpokenPriceMatchesTrustedSource({ spokenAmount: input.amount, spokenCurrency: input.currency, trustedPrice });
  return { ...trustedPrice, speech: new Intl.NumberFormat("tr-TR", { style: "currency", currency: trustedPrice.currency, maximumFractionDigits: 0 }).format(trustedPrice.amount) };
}

export async function persistPhoneQualificationToCrm(input: { organizationId: string; leadId: string; qualification: SalesQualification; callId: string }) {
  const admin = createSupabaseAdminClient();
  const { data: lead, error } = await admin.from("leads").select("id,city,notes,source").eq("organization_id", input.organizationId).eq("id", input.leadId).maybeSingle();
  if (error || !lead) throw new Error("CRM Lead bulunamadı.");
  const q = input.qualification;
  const detail = [q.productInterest && `Ürün: ${q.productInterest}`, q.areaM2 && `m²: ${q.areaM2}`, q.roomCount && `Oda: ${q.roomCount}`, q.budget !== null && `Bütçe: ${q.budget} ${q.currency ?? "TRY"}`, (q.deliveryLocation ?? q.location) && `Lokasyon: ${q.deliveryLocation ?? q.location}`, q.landReady !== null && `Arsa hazır: ${q.landReady ? "Evet" : "Hayır"}`, q.purchaseTiming && `Satın alma: ${q.purchaseTiming}`, q.explicitObjection && `İtiraz: ${q.explicitObjection}`].filter(Boolean).join(" | ");
  const note = `[Telefon AI ${input.callId}] ${detail || "Qualification bilgisi güncellendi."}`;
  const existing = typeof lead.notes === "string" && lead.notes.trim() ? `${lead.notes.trim()}\n\n` : "";
  const patch: Record<string, unknown> = { notes: `${existing}${note}`.slice(0,10000), source: lead.source || "Phone" };
  if (!lead.city && (q.deliveryLocation ?? q.location)) patch.city = q.deliveryLocation ?? q.location;
  const { error: updateError } = await admin.from("leads").update(patch).eq("organization_id", input.organizationId).eq("id", input.leadId);
  if (updateError) throw new Error(`CRM qualification kaydedilemedi: ${updateError.message}`);
  await admin.from("activities").insert({ organization_id: input.organizationId, lead_id: input.leadId, type: "phone_ai_qualification", title: "AI telefon görüşmesi qualification", detail: note });
  return { success: true };
}

export async function finalizeCallIntelligence(input: { organizationId: string; callId: string; salesSessionId: string; leadId?: string | null; qualification: SalesQualification }) {
  const repo = new VoiceSalesRepository();
  const transcript = await repo.transcript(input.callId, input.organizationId);
  const scoreResult = scorePhoneQualification(input.qualification);
  const score = scoreResult.score;
  const temperature: "hot" | "warm" | "cold" = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  const nextBestAction = score >= 70 ? "Satış temsilcisi bugün müşteriyi arasın ve uygun ürün/teklif adımını netleştirsin." : score >= 40 ? "Eksik ihtiyaç bilgisini tamamlamak için kısa takip yapın." : "Müşteriyi düşük öncelikli takip listesine alın.";
  const summary = transcript.length ? transcript.map((x) => `${x.speaker === "customer" ? "Müşteri" : x.speaker === "assistant" ? "AI" : "Sistem"}: ${x.text}`).join(" ").slice(0,1800) : "Telefon görüşmesi tamamlandı.";
  await repo.updateCall(input.callId, input.organizationId, { qualification: input.qualification, summary, lead_score: score, temperature, next_best_action: nextBestAction, next_best_action_type: score >= 70 ? "call" : "follow_up", state: "completed", ended_at: new Date().toISOString() });
  await repo.updateSession(input.salesSessionId, input.organizationId, { qualification: input.qualification, current_lead_score: score, next_best_action: nextBestAction, ended_at: new Date().toISOString() });
  if (input.leadId) await persistPhoneQualificationToCrm({ organizationId: input.organizationId, leadId: input.leadId, qualification: input.qualification, callId: input.callId });
  return { score, temperature, summary, nextBestAction, breakdown: scoreResult.breakdown };
}

export async function requestHumanHandoff(input: { organizationId: string; callId: string; salesSessionId: string; adapter: VoiceChannelAdapter; callContext: VoiceCallContext; reason: string; destination: string; qualification: SalesQualification; leadScore?: number | null; leadId?: string | null }) {
  const policy = evaluateSalesAction("place_outbound_call");
  const admin = createSupabaseAdminClient();
  const briefing = { leadId: input.leadId ?? null, product: input.qualification.productInterest, budget: input.qualification.budget, location: input.qualification.deliveryLocation ?? input.qualification.location, purchaseTiming: input.qualification.purchaseTiming, leadScore: input.leadScore ?? null, reason: input.reason };
  const { data, error } = await admin.from("voice_handoffs").insert({ organization_id: input.organizationId, call_id: input.callId, sales_session_id: input.salesSessionId, status: "requested", reason: input.reason, destination: input.destination, briefing }).select("id").single();
  if (error || !data) throw new Error("Handoff kaydedilemedi.");
  if (!input.destination) return { status: "requested", approval: policy.decision, briefing };
  await admin.from("voice_handoffs").update({ status: "transferring" }).eq("id", data.id);
  await input.adapter.transferCall(input.callContext, input.destination);
  await admin.from("voice_handoffs").update({ status: "transferred", transferred_at: new Date().toISOString() }).eq("id", data.id);
  await admin.from("voice_calls").update({ human_handoff_requested: true, handoff_reason: input.reason, state: "transferring" }).eq("id", input.callId);
  return { status: "transferred", approval: "customer_requested_or_policy_escalation", briefing };
}

export async function prepareWhatsAppAfterCallAction(input: { organizationId: string; callId: string; leadId?: string | null; actionType: "whatsapp_showroom" | "whatsapp_product"; payload: Record<string, unknown>; customerConsented: boolean }) {
  if (!input.customerConsented) throw new Error("Müşteri onayı olmadan WhatsApp aksiyonu hazırlanamaz.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("voice_after_call_actions").insert({ organization_id: input.organizationId, call_id: input.callId, lead_id: input.leadId ?? null, action_type: input.actionType, customer_consented_at: new Date().toISOString(), status: "approval_required", payload: input.payload }).select("id,status").single();
  if (error || !data) throw new Error("WhatsApp sonrası aksiyon hazırlanamadı.");
  return data;
}

function parseQualification(text: string, existing: SalesQualification): Partial<SalesQualification> {
  const lower = text.toLocaleLowerCase("tr-TR");
  const patch: Partial<SalesQualification> = {};
  const area = text.match(/(\d{2,3})\s*(?:m2|m²|metrekare)/i); if (area) patch.areaM2 = Number(area[1]);
  const rooms = text.match(/(\d\s*\+\s*\d)/); if (rooms) patch.roomCount = rooms[1].replace(/\s/g, "");
  const budget = text.match(/(?:bütçe[m]?[\s:]*)?(\d{3,7})(?:\s*(?:tl|₺))?/i); if (lower.includes("bütçe") && budget) { patch.budget = Number(budget[1]); patch.currency = "TRY"; }
  if (/arsam (?:da )?hazır|arsa hazır/.test(lower)) patch.landReady = true;
  if (/bu ay|hemen|satın almak istiyorum|almak istiyorum|sipariş/.test(lower)) { patch.purchaseTiming = lower.includes("bu ay") ? "bu ay" : existing.purchaseTiming; patch.purchaseCommitment = true; }
  if (/fiyat|ne kadar|kaç para/.test(lower)) patch.pricingIntent = true;
  if (/stok|mevcut|hazır mı/.test(lower)) patch.availabilityIntent = true;
  if (/teklif/.test(lower)) patch.quoteRequested = true;
  return patch;
}

export async function orchestratePhoneTurn(input: { organizationId: string; callId: string; salesSessionId: string; transcript: string; qualification: SalesQualification }) {
  const lower = input.transcript.toLocaleLowerCase("tr-TR");
  const patch = parseQualification(input.transcript, input.qualification);
  const qualification = { ...input.qualification, ...patch } as SalesQualification;
  const repo = new VoiceSalesRepository();
  await repo.appendTranscript({ organizationId: input.organizationId, callId: input.callId, salesSessionId: input.salesSessionId, speaker: "customer", text: input.transcript });

  if (/showroom|mağaza|adres|nerede/.test(lower)) {
    const showroom = await getTrustedShowroom(input.organizationId, "İzmir").catch(() => null) ?? await getTrustedShowroom(input.organizationId).catch(() => null);
    const reply = showroom ? `${showroom.name} adresimiz ${showroom.address}. ${showroom.visitingHours ? `Ziyaret saatlerimiz ${showroom.visitingHours}.` : ""}`.trim() : "Sistemde doğrulanmış aktif showroom adresi bulamıyorum. Satış danışmanına aktarabilirim.";
    await repo.appendTranscript({ organizationId: input.organizationId, callId: input.callId, salesSessionId: input.salesSessionId, speaker: "assistant", text: reply });
    await repo.updateSession(input.salesSessionId, input.organizationId, { qualification });
    return { reply, qualification, tool: "get_showroom" as const, showroom };
  }

  if (/fiyat|ne kadar|kaç para/.test(lower)) {
    const area = qualification.areaM2 ?? undefined;
    const roomCount = qualification.roomCount ?? undefined;
    const matches = await recommendProductsV2({ organizationId: input.organizationId, areaM2: area, roomCount, query: area || roomCount ? undefined : input.transcript, budget: qualification.budget, limit: 3 });
    if (!matches.length || matches[0].price === null) {
      const reply = "Bu isteğe uygun doğrulanmış güncel katalog fiyatı bulamıyorum. Size yanlış fiyat vermemek için satış danışmanına aktarabilirim.";
      await repo.appendTranscript({ organizationId: input.organizationId, callId: input.callId, salesSessionId: input.salesSessionId, speaker: "assistant", text: reply });
      return { reply, qualification, tool: "search_products" as const, products: matches };
    }
    const best = matches[0];
    const verified = await verifyPriceBeforeSpeech({ organizationId: input.organizationId, productId: best.product.id, amount: best.price!, currency: best.product.currency });
    qualification.productInterest = best.product.name;
    const reply = `FlowSales'teki güncel katalog fiyatına göre ${best.product.name} ${verified.speech}.`;
    await repo.appendTranscript({ organizationId: input.organizationId, callId: input.callId, salesSessionId: input.salesSessionId, speaker: "assistant", text: reply });
    await repo.updateSession(input.salesSessionId, input.organizationId, { qualification, referenced_product_ids: [best.product.id] });
    return { reply, qualification, tool: "get_current_price" as const, product: best.product, trustedPrice: verified };
  }

  const reply = qualification.purchaseCommitment ? "Anladım. İhtiyacınızı satış kaydınıza işliyorum. Uygun ürün ve sonraki adımı netleştirmek için birkaç kısa bilgi daha alabilirim." : "Size uygun ürünü belirlemek için metrekare, oda sayısı, bütçe, arsa lokasyonu ve satın alma zamanınızı öğrenebilirim.";
  await repo.appendTranscript({ organizationId: input.organizationId, callId: input.callId, salesSessionId: input.salesSessionId, speaker: "assistant", text: reply });
  await repo.updateSession(input.salesSessionId, input.organizationId, { qualification });
  return { reply, qualification, tool: "update_qualification" as const };
}

export async function getLeadVoiceTimeline(organizationId: string, leadId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("voice_calls").select("id,provider,from_number,state,summary,lead_score,temperature,next_best_action,started_at,ended_at,duration_seconds").eq("organization_id", organizationId).eq("lead_id", leadId).order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCallDetail(organizationId: string, callId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: call }, { data: transcript }, { data: handoffs }] = await Promise.all([
    admin.from("voice_calls").select("*").eq("organization_id", organizationId).eq("id", callId).maybeSingle(),
    admin.from("voice_transcript_segments").select("*").eq("organization_id", organizationId).eq("call_id", callId).order("sequence"),
    admin.from("voice_handoffs").select("*").eq("organization_id", organizationId).eq("call_id", callId).order("requested_at", { ascending: false }),
  ]);
  return call ? { call, transcript: transcript ?? [], handoffs: handoffs ?? [] } : null;
}

export async function getProductForAfterCall(organizationId: string, productId: string) {
  const product = await getTrustedProductById(organizationId, productId);
  const price = await getCurrentTrustedProductPrice(organizationId, productId).catch(() => null);
  return { product, price };
}
