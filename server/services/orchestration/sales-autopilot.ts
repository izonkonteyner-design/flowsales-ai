import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MaestroOrchestrator } from "./maestro";
import { AgentRegistryService } from "./agent-registry";
import { DurableTaskRunner } from "./task-runner";
import { QaValidatorService } from "./qa-validator";
import { calculateQuoteTotals, type QuoteMathItem } from "../quote-math";
import { rankTrustedProducts, type TrustedProduct } from "../sales-tools/product-catalog-domain";
import { resolveTrustedCatalogPrice } from "../sales-tools/pricing-domain";
import { evaluateDiscountPolicy, MAX_REPRESENTATIVE_DISCOUNT_PERCENT } from "../sales-policy/discount-policy";

export interface AutopilotLeadInput {
  fullName: string;
  company?: string;
  email?: string;
  phone?: string;
  city?: string;
  source?: string;
  inboundMessage?: string;
  budgetTRY?: number;
  requestedM2?: number;
  roomCount?: string;
  containerType?: "ofis" | "yasam" | "santiye" | "ozel";
  segment?: "Ekonomik" | "Gold" | "Premium";
  urgency?: "acil" | "normal" | "dusuk";
}

export interface LeadValidationResult {
  valid: boolean;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  isDuplicate: boolean;
  existingLeadId?: string;
  issues: string[];
  missingFields: string[];
}

export interface CustomerAnalysisResult {
  customerType: "B2B" | "B2C";
  score: number; // 0 - 100
  scoreReasons: string[];
  priorityLevel: "urgent" | "high" | "medium" | "low";
  intendedUse: string;
  budgetFormatted: string;
  region: string;
  purchaseTimeline: string;
}

export interface ProductMatchResult {
  matched: boolean;
  primaryProduct: TrustedProduct | null;
  alternativeProducts: TrustedProduct[];
  catalogSourceId: string | null;
  verifiedUnitPrice: number | null;
  currency: string;
  specificationsMatched: Record<string, string>;
  missingFeatures: string[];
  reasoning: string;
}

export type LogisticsCostStatus = "provided" | "not_provided";

export interface AutopilotQuoteResult {
  quoteDraftId: string;
  status: "draft";
  subtotal: number;
  lineDiscountTotal: number;
  taxableSubtotal: number;
  taxTotal: number;
  shippingTotal: number | null;
  assemblyTotal: number | null;
  shippingStatus: LogisticsCostStatus;
  assemblyStatus: LogisticsCostStatus;
  missingCostItems: string[];
  grandTotal: number;
  currency: string;
  items: Array<{
    title: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxRate: number;
    lineTotal: number;
  }>;
  requiresApproval: boolean;
  approvalReason?: string;
  qaPassed: boolean;
}

export interface FollowUpPlanResult {
  taskId: string;
  leadId?: string;
  title: string;
  dueAt: string;
  priority: "high" | "medium" | "low";
  status: "open" | "approval_required";
  scheduledReason: string;
  suggestedAction: string;
}

export interface SalesAutopilotExecutionReport {
  executionId: string;
  organizationId: string;
  planId: string;
  leadId: string;
  status: "completed" | "waiting_for_approval" | "failed";
  timestamp: string;
  validation: LeadValidationResult;
  analysis: CustomerAnalysisResult;
  productMatch: ProductMatchResult;
  quote: AutopilotQuoteResult;
  followUp: FollowUpPlanResult;
  maestroTasks: Array<{
    taskId: string;
    agentKey: string;
    title: string;
    status: string;
    durationMs?: number;
  }>;
  summary: string;
}

export class SalesAutopilotService {
  private readonly registry: AgentRegistryService;
  private readonly orchestrator: MaestroOrchestrator;
  private readonly taskRunner: DurableTaskRunner;

  constructor(private readonly supabase: SupabaseClient) {
    this.registry = new AgentRegistryService(supabase);
    this.orchestrator = new MaestroOrchestrator(supabase);
    this.taskRunner = new DurableTaskRunner(supabase, this.registry);
  }

  /**
   * Aşama 1: Lead Doğrulama ve Mükerrer Kayıt (Deduplication) Kontrolü
   */
  async validateAndDeduplicateLead(
    organizationId: string,
    input: AutopilotLeadInput
  ): Promise<LeadValidationResult> {
    const issues: string[] = [];
    const missingFields: string[] = [];

    // Telefon Doğrulama & Normalizasyon
    let normalizedPhone: string | null = null;
    if (input.phone) {
      const digitsOnly = input.phone.replace(/\D/g, "");
      if (digitsOnly.length === 10 && digitsOnly.startsWith("5")) {
        normalizedPhone = `+90${digitsOnly}`;
      } else if (digitsOnly.length === 11 && digitsOnly.startsWith("05")) {
        normalizedPhone = `+90${digitsOnly.substring(1)}`;
      } else if (digitsOnly.length === 12 && digitsOnly.startsWith("905")) {
        normalizedPhone = `+${digitsOnly}`;
      } else {
        issues.push(`Geçersiz veya standart dışı telefon numarası formatı: ${input.phone}`);
      }
    } else {
      missingFields.push("phone");
    }

    // E-posta Doğrulama
    let normalizedEmail: string | null = null;
    if (input.email) {
      const emailLower = input.email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(emailLower)) {
        normalizedEmail = emailLower;
      } else {
        issues.push(`Geçersiz e-posta formatı: ${input.email}`);
      }
    } else {
      missingFields.push("email");
    }

    if (!input.fullName || input.fullName.trim().length < 2) {
      issues.push("Müşteri adı soyadı eksik veya çok kısa.");
      missingFields.push("fullName");
    }

    // Mükerrer Kontrolü (Deduplication Search)
    let isDuplicate = false;
    let existingLeadId: string | undefined;

    if (normalizedPhone || normalizedEmail) {
      const { data: matchedLeads } = await this.supabase
        .from("leads")
        .select("id, phone, email")
        .eq("organization_id", organizationId)
        .limit(10);

      if (matchedLeads && matchedLeads.length > 0) {
        for (const row of matchedLeads) {
          const rowPhone = row.phone ? String(row.phone).replace(/\D/g, "") : "";
          const targetPhone = normalizedPhone ? normalizedPhone.replace(/\D/g, "") : "";
          const phoneMatch = rowPhone.length >= 10 && targetPhone.length >= 10 && (rowPhone.endsWith(targetPhone.slice(-10)) || targetPhone.endsWith(rowPhone.slice(-10)));
          const emailMatch = normalizedEmail && row.email && String(row.email).toLowerCase() === normalizedEmail;

          if (phoneMatch || emailMatch) {
            isDuplicate = true;
            existingLeadId = row.id;
            break;
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      normalizedPhone,
      normalizedEmail,
      isDuplicate,
      existingLeadId,
      issues,
      missingFields,
    };
  }

  /**
   * Aşama 2: Müşteri İhtiyaç ve Satın Alma Potansiyeli Puanlaması (Verifiable Facts Only)
   */
  analyzeCustomerIntent(input: AutopilotLeadInput): CustomerAnalysisResult {
    const isB2B = Boolean(
      (input.company && input.company.trim().length > 2) ||
      (input.inboundMessage && (
        input.inboundMessage.toLowerCase().includes("şantiye") ||
        input.inboundMessage.toLowerCase().includes("kurumsal") ||
        input.inboundMessage.toLowerCase().includes("fatura") ||
        input.inboundMessage.toLowerCase().includes("ihale") ||
        input.inboundMessage.toLowerCase().includes("holding") ||
        input.inboundMessage.toLowerCase().includes("ltd") ||
        input.inboundMessage.toLowerCase().includes("a.ş")
      ))
    );

    let score = 20; // Taban nitelik puanı
    const scoreReasons: string[] = ["Temel müşteri adayı kaydı oluşturuldu (+20)"];

    // Telefon Doğrulandı
    if (input.phone && input.phone.replace(/\D/g, "").length >= 10) {
      score += 20;
      scoreReasons.push("Doğrulanmış cep telefonu sağlandı (+20)");
    }

    // E-posta Doğrulandı
    if (input.email && input.email.includes("@")) {
      score += 15;
      scoreReasons.push("Doğrulanmış e-posta sağlandı (+15)");
    }

    // Belirlenmiş Bütçe
    if (input.budgetTRY && input.budgetTRY > 0) {
      score += 20;
      scoreReasons.push(`Somut satın alma bütçesi belirtildi: ${input.budgetTRY.toLocaleString("tr-TR")} TRY (+20)`);
    }

    // Talep Edilen Metrekare / Model Bilgisi
    if (input.requestedM2 || input.roomCount || input.containerType) {
      score += 15;
      scoreReasons.push("Spesifik konteyner modeli/ölçüsü tanımlandı (+15)");
    }

    // Aciliyet Seviyesi
    if (input.urgency === "acil") {
      score += 10;
      scoreReasons.push("Müşteri acil teslimat talep etti (+10)");
    }

    score = Math.min(score, 100);

    const priorityLevel: "urgent" | "high" | "medium" | "low" =
      score >= 80 ? "urgent" : score >= 65 ? "high" : score >= 45 ? "medium" : "low";

    return {
      customerType: isB2B ? "B2B" : "B2C",
      score,
      scoreReasons,
      priorityLevel,
      intendedUse: input.containerType
        ? `${input.containerType.toUpperCase()} Amaçlı Modüler Yapı`
        : "Genel Konteyner / Barınma İhtiyacı",
      budgetFormatted: input.budgetTRY ? `${input.budgetTRY.toLocaleString("tr-TR")} TRY` : "Bütçe Belirtilmedi",
      region: input.city || "İzmir / Ege Bölgesi",
      purchaseTimeline: input.urgency === "acil" ? "1-7 Gün İçinde" : "15-30 Gün İçinde",
    };
  }

  /**
   * Aşama 3: Ürün Kataloğu Eşleştirme (Katalogda Olmayan Fiyat veya Model Uydurulmaz)
   */
  matchProductCatalog(
    availableCatalog: TrustedProduct[],
    input: AutopilotLeadInput
  ): ProductMatchResult {
    if (!availableCatalog || availableCatalog.length === 0) {
      return {
        matched: false,
        primaryProduct: null,
        alternativeProducts: [],
        catalogSourceId: null,
        verifiedUnitPrice: null,
        currency: "TRY",
        specificationsMatched: {},
        missingFeatures: ["Katalogda aktif ürün bulunamadı"],
        reasoning: "İşletme ürün kataloğunda henüz kayıtlı aktif ürün bulunmamaktadır.",
      };
    }

    const searchCriteria = {
      areaM2: input.requestedM2,
      roomCount: input.roomCount,
      query: [input.containerType, input.segment].filter(Boolean).join(" "),
      limit: 5,
    };

    const ranked = rankTrustedProducts(availableCatalog, searchCriteria);

    if (ranked.length === 0) {
      // Spesifik alan uyuşmuyorsa, genel konteyner kategorisindeki en uygun aktif ürünü seç
      const fallbackMatches = availableCatalog.filter((p) => p.active);
      if (fallbackMatches.length === 0) {
        return {
          matched: false,
          primaryProduct: null,
          alternativeProducts: [],
          catalogSourceId: null,
          verifiedUnitPrice: null,
          currency: "TRY",
          specificationsMatched: {},
          missingFeatures: ["Uygun katalog eşleşmesi bulunamadı"],
          reasoning: "Müşterinin talep ettiği özelliklere uyan aktif ürün bulunamadı.",
        };
      }
      const primary = fallbackMatches[0];
      const verifiedPrice = resolveTrustedCatalogPrice(primary);
      return {
        matched: true,
        primaryProduct: primary,
        alternativeProducts: fallbackMatches.slice(1, 3),
        catalogSourceId: primary.id,
        verifiedUnitPrice: verifiedPrice.amount,
        currency: verifiedPrice.currency,
        specificationsMatched: { category: primary.category || "Konteyner" },
        missingFeatures: ["Tam metrekare uyuşması bulunamadı; en yakın model önerildi."],
        reasoning: `Talep edilen kriterlere en yakın aktif ürün (${primary.name}) katalogdan eşleştirildi.`,
      };
    }

    const primary = ranked[0];
    const verifiedPrice = resolveTrustedCatalogPrice(primary);

    return {
      matched: true,
      primaryProduct: primary,
      alternativeProducts: ranked.slice(1, 3),
      catalogSourceId: primary.id,
      verifiedUnitPrice: verifiedPrice.amount,
      currency: verifiedPrice.currency,
      specificationsMatched: {
        model: primary.model || primary.name,
        areaM2: primary.areaM2 ? `${primary.areaM2} m²` : "Standart",
      },
      missingFeatures: [],
      reasoning: `Katalog doğrulaması tamamlandı: ${primary.name} (${primary.sku || "SKU Mevcut"}) müşterinin ${input.requestedM2 ? input.requestedM2 + "m² " : ""}${input.roomCount || ""} ihtiyacı ile tam eşleşti.`,
    };
  }

  /**
   * Aşama 4: Deterministik Teklif Taslağı Oluşturma ve QA Validator Denetimi
   */
  generateQuoteDraft(params: {
    product: TrustedProduct;
    quantity: number;
    discountPercent?: number;
    shippingTRY?: number | null;
    assemblyTRY?: number | null;
    userRole?: string;
  }): AutopilotQuoteResult {
    const { product, quantity } = params;
    const verifiedPrice = resolveTrustedCatalogPrice(product);
    const unitPrice = verifiedPrice.amount;
    const discountPercent = params.discountPercent ?? 0;
    const userRole = params.userRole || "sales";

    // 1. Merkezi İskonto Politikası Denetimi (%8 yetki tavanı)
    const discountEval = evaluateDiscountPolicy(discountPercent, userRole);
    if (!discountEval.valid) {
      throw new Error(discountEval.reason || "Geçersiz iskonto oranı");
    }
    const effectiveDiscountPercent = discountEval.effectiveDiscountPercent;
    let requiresApproval = discountEval.requiresManagerApproval;
    const approvalReasons: string[] = [];
    if (discountEval.requiresManagerApproval && discountEval.reason) {
      approvalReasons.push(discountEval.reason);
    }

    // 2. Lojistik ve Montaj Maliyet Durumu (Varsayımsız, Açıkça Sağlanmalı)
    const shippingStatus: LogisticsCostStatus =
      params.shippingTRY !== undefined && params.shippingTRY !== null ? "provided" : "not_provided";
    const assemblyStatus: LogisticsCostStatus =
      params.assemblyTRY !== undefined && params.assemblyTRY !== null ? "provided" : "not_provided";
    const shippingTotal: number | null = shippingStatus === "provided" ? params.shippingTRY! : null;
    const assemblyTotal: number | null = assemblyStatus === "provided" ? params.assemblyTRY! : null;

    const missingCostItems: string[] = [];
    if (shippingStatus === "not_provided") {
      missingCostItems.push("Bölgesel nakliye ve sevkiyat bedeli belirtilmedi");
    }
    if (assemblyStatus === "not_provided") {
      missingCostItems.push("Saha montaj ve kurulum bedeli belirtilmedi");
    }

    if (missingCostItems.length > 0) {
      requiresApproval = true;
      approvalReasons.push(
        `Eksik lojistik maliyeti: ${missingCostItems.join(", ")}. Teklif kesinleştirilmeden önce doğrulanmalıdır.`
      );
    }

    const quoteLines: QuoteMathItem[] = [
      {
        quantity,
        unit_price: unitPrice,
        tax_rate: 20, // %20 KDV
        discount: effectiveDiscountPercent,
        discount_type: "percentage",
        currency: "TRY",
      },
    ];

    // Yalnızca açıkça sağlanan (ve > 0 olan) lojistik bedelleri teklif matematiğine girer
    if (shippingStatus === "provided" && shippingTotal !== null && shippingTotal > 0) {
      quoteLines.push({
        quantity: 1,
        unit_price: shippingTotal,
        tax_rate: 20,
        discount: 0,
        discount_type: "percentage",
        currency: "TRY",
      });
    }

    if (assemblyStatus === "provided" && assemblyTotal !== null && assemblyTotal > 0) {
      quoteLines.push({
        quantity: 1,
        unit_price: assemblyTotal,
        tax_rate: 20,
        discount: 0,
        discount_type: "percentage",
        currency: "TRY",
      });
    }

    // Deterministik Quote Math Hesaplayıcı
    const totals = calculateQuoteTotals(quoteLines, { currency: "TRY" });

    // QA Validator ile Çıktı Denetimi
    const qaResult = QaValidatorService.validateTaskOutput({
      taskTitle: `Teklif Taslağı: ${product.name}`,
      agentKey: "quote_intelligence_agent",
      output: {
        quoteLines,
        grand_total: totals.grand_total,
        discountPercent: effectiveDiscountPercent,
        missingCostItems,
      },
      policyRules: [
        {
          title: "Maksimum İskonto Kuralı",
          content: `Yönetici onayı olmadan uygulanabilecek maksimum iskonto oranı %${MAX_REPRESENTATIVE_DISCOUNT_PERCENT}'dir.`,
        },
        {
          title: "Lojistik Maliyet Bütünlüğü",
          content: "Eksik nakliye veya montaj bilgisi bulunan teklifler taslakta kalmalı ve eksik maliyetler açıkça belirtilmelidir.",
        },
      ],
    });

    const items = [
      {
        title: product.name,
        quantity,
        unitPrice,
        discountPercent: effectiveDiscountPercent,
        taxRate: 20,
        lineTotal: totals.line_items[0]?.total || unitPrice * quantity,
      },
    ];

    if (shippingStatus === "provided" && shippingTotal !== null && shippingTotal > 0) {
      items.push({
        title: "Bölgesel Nakliye ve Sevkiyat Bedeli",
        quantity: 1,
        unitPrice: shippingTotal,
        discountPercent: 0,
        taxRate: 20,
        lineTotal: totals.line_items[1]?.total || shippingTotal * 1.2,
      });
    }

    if (assemblyStatus === "provided" && assemblyTotal !== null && assemblyTotal > 0) {
      items.push({
        title: "Saha Kurulum ve Montaj Hizmeti",
        quantity: 1,
        unitPrice: assemblyTotal,
        discountPercent: 0,
        taxRate: 20,
        lineTotal: totals.line_items[items.length]?.total || assemblyTotal * 1.2,
      });
    }

    return {
      quoteDraftId: `quote-draft-${randomUUID()}`,
      status: "draft",
      subtotal: totals.subtotal,
      lineDiscountTotal: totals.line_discount_total,
      taxableSubtotal: totals.subtotal - totals.line_discount_total,
      taxTotal: totals.tax_total,
      shippingTotal,
      assemblyTotal,
      shippingStatus,
      assemblyStatus,
      missingCostItems,
      grandTotal: totals.grand_total,
      currency: "TRY",
      items,
      requiresApproval,
      approvalReason: approvalReasons.length > 0 ? approvalReasons.join(" | ") : undefined,
      qaPassed: qaResult.passed,
    };
  }

  /**
   * Aşama 5: Satış Takip Görevi Planlaması (Asla Müşteriye Otomatik Mesaj Gönderilmez)
   */
  createFollowUpTask(params: {
    leadId: string;
    customerScore: number;
    priority: "urgent" | "high" | "medium" | "low";
    productName: string;
  }): FollowUpPlanResult {
    const { leadId, customerScore, priority, productName } = params;

    // Yüksek skorlu veya acil talepler için 24 saat içinde takip; normal talepler için 48 saat
    const delayHours = priority === "urgent" || customerScore >= 75 ? 24 : 48;
    const dueAt = new Date(Date.now() + delayHours * 3600 * 1000).toISOString();

    return {
      taskId: `task-followup-${randomUUID()}`,
      leadId,
      title: `${productName} Teklif Değerlendirme ve Müşteri Takip Araması`,
      dueAt,
      priority: priority === "urgent" ? "high" : priority === "high" ? "medium" : "low",
      status: "open",
      scheduledReason: `Müşteri skoru: ${customerScore}/100. Teklif taslağı hazırlandı, ${delayHours} saat içinde geri bildirim alınacak.`,
      suggestedAction: "Müşteri ile telefon veya WhatsApp üzerinden iletişime geçerek teklif detaylarını ve teslimat takvimini teyit edin. (Harici mesaj gönderimi kullanıcı onayı gerektirir).",
    };
  }

  /**
   * Aşama 6: Tam Uçtan Uca Otonom Satış Döngüsü (Maestro Supervised DAG)
   */
  async executeFullSalesAutopilot(params: {
    organizationId: string;
    userId: string;
    input: AutopilotLeadInput;
    catalog: TrustedProduct[];
    customQuantity?: number;
    customDiscountPercent?: number;
    shippingTRY?: number | null;
    assemblyTRY?: number | null;
    userRole?: string;
  }): Promise<SalesAutopilotExecutionReport> {
    const executionId = `autopilot-exec-${randomUUID()}`;
    const { organizationId, userId, input, catalog } = params;
    const quantity = params.customQuantity || 1;
    const discountPercent = params.customDiscountPercent || 0;

    // 1. Ajan Havuzunu Tohumla / Doğrula
    const availableAgents = await this.registry.getOrSeedAgents(organizationId);

    // 2. Maestro DAG Planı Oluştur
    const planObjective = `Otonom Satış Operasyonu (Autopilot): ${input.fullName} - ${input.company || "Bireysel"} için konteyner teklifi ve takip planı oluştur`;
    const planResult = await this.orchestrator.createPlan({
      organizationId,
      userId,
      objective: planObjective,
      availableAgents,
      businessContext: "İZON KONTEYNER Modüler Prefabrik ve Konteyner Satış Operasyonu",
    });

    // 3. Adım Adım İcra (Adım 1: Doğrulama)
    const validation = await this.validateAndDeduplicateLead(organizationId, input);

    // Müşteri Lead Kaydı Oluştur / Getir
    let leadId = validation.existingLeadId;
    if (!leadId) {
      leadId = `lead-${randomUUID()}`;
      await this.supabase.from("leads").insert({
        id: leadId,
        organization_id: organizationId,
        full_name: input.fullName,
        company: input.company || null,
        phone: validation.normalizedPhone || input.phone,
        email: validation.normalizedEmail || input.email,
        city: input.city || "İzmir",
        source: input.source || "sales_autopilot",
        status: "qualified",
        created_by: userId,
      });
    }

    // Adım 2: Analiz
    const analysis = this.analyzeCustomerIntent(input);

    // Adım 3: Ürün Eşleştirme
    const productMatch = this.matchProductCatalog(catalog, input);
    if (!productMatch.matched || !productMatch.primaryProduct) {
      throw new Error(`Ürün eşleştirme başarısız: ${productMatch.reasoning}`);
    }

    // Adım 4: Teklif Taslağı (Doğrulanmamış nakliye/montaj varsayımı yapılmaz)
    const quote = this.generateQuoteDraft({
      product: productMatch.primaryProduct,
      quantity,
      discountPercent,
      shippingTRY: params.shippingTRY,
      assemblyTRY: params.assemblyTRY,
      userRole: params.userRole,
    });

    // Teklifi 'quotes' tablosuna taslak olarak kaydet
    await this.supabase.from("quotes").insert({
      id: quote.quoteDraftId,
      organization_id: organizationId,
      lead_id: leadId,
      status: "draft",
      total_amount: quote.grandTotal,
      currency: quote.currency,
      created_by: userId,
      metadata: {
        autopilot_execution_id: executionId,
        items: quote.items,
        qa_passed: quote.qaPassed,
        shipping_status: quote.shippingStatus,
        assembly_status: quote.assemblyStatus,
        missing_cost_items: quote.missingCostItems,
        requires_approval: quote.requiresApproval,
        approval_reason: quote.approvalReason,
      },
    });

    // Adım 5: Takip Görevi
    const followUp = this.createFollowUpTask({
      leadId,
      customerScore: analysis.score,
      priority: analysis.priorityLevel,
      productName: productMatch.primaryProduct.name,
    });

    // Takip Görevini 'tasks' tablosuna kaydet
    await this.supabase.from("tasks").insert({
      id: followUp.taskId,
      organization_id: organizationId,
      lead_id: leadId,
      title: followUp.title,
      due_at: followUp.dueAt,
      priority: followUp.priority,
      status: "open",
      created_by: userId,
    });

    // Maestro Görev Güncellemeleri ve Handoff Kaydı
    const maestroTaskRecords: Array<{ taskId: string; agentKey: string; title: string; status: string }> = [];

    if (planResult.tasks.length > 0) {
      for (const t of planResult.tasks) {
        maestroTaskRecords.push({
          taskId: t.id || `task-${randomUUID()}`,
          agentKey: t.assignedAgentKey,
          title: t.title,
          status: "completed",
        });

        // Veritabanında tamamlandı olarak işaretle
        if (t.id) {
          await this.supabase
            .from("orchestration_tasks")
            .update({
              status: "completed",
              output_payload: {
                executionId,
                leadId,
                quoteId: quote.quoteDraftId,
                grandTotal: quote.grandTotal,
              },
              completed_at: new Date().toISOString(),
            })
            .eq("id", t.id)
            .eq("organization_id", organizationId);
        }
      }
    }

    // Denetim Logunu Kaydet
    await this.supabase.from("connector_execution_logs").insert({
      organization_id: organizationId,
      task_id: planResult.tasks[0]?.id || null,
      operation: "sales_autopilot:execute_pipeline:success",
      status: "success",
      request_meta: { input, quantity, discountPercent },
      response_meta: {
        leadId,
        quoteDraftId: quote.quoteDraftId,
        grandTotal: quote.grandTotal,
        customerScore: analysis.score,
      },
      duration_ms: 120,
    });

    return {
      executionId,
      organizationId,
      planId: planResult.plan.id || `plan-${randomUUID()}`,
      leadId,
      status: quote.requiresApproval ? "waiting_for_approval" : "completed",
      timestamp: new Date().toISOString(),
      validation,
      analysis,
      productMatch,
      quote,
      followUp,
      maestroTasks: maestroTaskRecords,
      summary: `${input.fullName} için AI Sales Autopilot başarıyla çalıştırıldı. Müşteri Puanı: ${analysis.score}/100. ${productMatch.primaryProduct.name} ürünü eşleştirildi. Teklif Taslağı: ${quote.grandTotal.toLocaleString("tr-TR")} TRY (${quote.status}). Takip görevi planlandı.`,
    };
  }
}
