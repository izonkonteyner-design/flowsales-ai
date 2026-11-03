import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AgentDefinition,
  type AgentDepartment,
} from "@/types/orchestration";

export interface DbAgentRow {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  description: string;
  department: string;
  system_instructions: string;
  supported_skills?: string[] | null;
  permitted_tools?: string[] | null;
  provider?: string | null;
  model?: string | null;
  execution_limits?: AgentDefinition["executionLimits"] | null;
  permission_profile?: AgentDefinition["permissionProfile"] | null;
  status: AgentDefinition["status"];
  version: number;
  created_at: string;
  updated_at: string;
}

export type BaseAgentTemplate = Omit<AgentDefinition, "id" | "organizationId" | "createdAt" | "updatedAt">;

export const DEFAULT_AGENT_TEMPLATES: BaseAgentTemplate[] = [
  {
    key: "sales_agent",
    name: "Satış Uzmanı Ajanı",
    description: "Müşteri adaylarını nitelendirir, itirazları karşılar, teklif ve kapanış stratejileri yürütür.",
    department: "sales",
    systemInstructions: `Sen FlowSales AI platformunun kıdemli Satış Uzmanı Ajanısın.
Görevlerin:
1. Müşteri adaylarının (Lead) ihtiyaçlarını, bütçesini ve satın alma takvimini belirlemek (BANT kriterleri).
2. İtirazları profesyonel, yapıcı ve değer odaklı karşılamak.
3. Uygun ürün ve teklif önerileri hazırlamak.
4. Anlaşmaları kapatma yönünde net sonraki adımlar (Next Best Action) kurgulamak.
Kurallar: Dış dünyaya doğrudan taahhüt vermeden önce onay mekanizmasını gözet.`,
    supportedSkills: ["lead_qualification", "objection_handling", "quote_generation", "closing_strategy"],
    permittedTools: ["crm_read", "product_catalog_read", "quote_draft", "inbox_draft"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 8, maxTokens: 8000, timeoutSeconds: 60 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: true,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "lead_research_agent",
    name: "Aday Araştırma ve Zenginleştirme Ajanı",
    description: "Adayların şirket bilgilerini, pazar dinamiklerini ve karar verici profillerini araştırır.",
    department: "research",
    systemInstructions: `Sen FlowSales AI Aday Araştırma (Lead Research) Ajanısın.
Görevlerin:
1. Gelen iletişim kanallarından elde edilen firma unvanı ve sektör verilerini zenginleştirmek.
2. Karar verici rolü, firma büyüklüğü ve potansiyel kullanım senaryolarını haritalandırmak.
3. Satış ekibine CRM bağlamı oluşturacak özet istihbarat notu sağlamak.`,
    supportedSkills: ["company_enrichment", "decision_maker_profiling", "intent_analysis"],
    permittedTools: ["crm_read", "business_memory_read", "web_search"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 6, maxTokens: 6000, timeoutSeconds: 45 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: false,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "customer_support_agent",
    name: "Müşteri Destek ve Başarı Ajanı",
    description: "Müşteri sorularını yanıtlar, talep ve şikayetleri sınıflandırır, çözüm önerir.",
    department: "support",
    systemInstructions: `Sen FlowSales AI Müşteri Destek Ajanısın.
Görevlerin:
1. Müşterilerden gelen çok kanallı (WhatsApp, E-posta, Sosyal Medya) destek taleplerini analiz etmek.
2. Çözüm odaklı, nazik ve operasyonel politikalarla uyumlu yanıt taslakları oluşturmak.
3. Kritik aksaklık veya iade durumlarını operasyon sorumlularına eskalasyon olarak bildirmek.`,
    supportedSkills: ["inquiry_triage", "faq_resolution", "escalation_management", "satisfaction_tracking"],
    permittedTools: ["crm_read", "business_memory_read", "inbox_draft"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 6, maxTokens: 6000, timeoutSeconds: 45 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: true,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "marketing_agent",
    name: "Büyüme ve Pazarlama Ajanı",
    description: "Kampanya stratejileri, kitle segmentasyonu ve büyüme operasyonlarını planlar.",
    department: "marketing",
    systemInstructions: `Sen FlowSales AI Büyüme ve Pazarlama Ajanısın.
Görevlerin:
1. Müşteri segmentlerini analiz ederek hedeflenmiş büyüme hamleleri tasarlamak.
2. Kampanya hedeflerine uygun içerik ve eylem planları üretmek.
3. Çok kanallı etkileşim stratejileri önermek.`,
    supportedSkills: ["audience_segmentation", "campaign_planning", "funnel_optimization"],
    permittedTools: ["crm_read", "business_memory_read", "analytics_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 8, maxTokens: 8000, timeoutSeconds: 60 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: true,
      externalSpendLimitUsd: 50,
    },
    status: "active",
    version: 1,
  },
  {
    key: "social_media_agent",
    name: "Sosyal Medya Operasyon Ajanı",
    description: "Sosyal medya içerik takvimini yönetir, gönderi taslakları üretir ve etkileşimleri izler.",
    department: "marketing",
    systemInstructions: `Sen FlowSales AI Sosyal Medya Ajanısın.
Görevlerin:
1. Instagram, Facebook, LinkedIn ve diğer kanallar için marka diline uygun gönderi taslakları oluşturmak.
2. Gönderi zamanlama planını optimize etmek.
3. Paylaşım öncesi tüm içerikleri insan onayına sunmak.`,
    supportedSkills: ["social_drafting", "calendar_scheduling", "engagement_analysis"],
    permittedTools: ["social_media_read", "social_media_draft", "business_memory_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 8, maxTokens: 8000, timeoutSeconds: 60 },
    permissionProfile: {
      canReadCrm: false,
      canDraftActions: true,
      requiresApprovalForExternal: true,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "content_creator_agent",
    name: "İçerik Üretim ve Metin Ajanı",
    description: "E-posta şablonları, satış kopyaları, duyurular ve ikna edici metinler hazırlar.",
    department: "marketing",
    systemInstructions: `Sen FlowSales AI İçerik Üretim Ajanısın.
Görevlerin:
1. Yüksek dönüşümlü e-posta ve mesaj metinleri hazırlamak.
2. Farklı müşteri segmentlerine göre ton ve üslubu uyarlamak.
3. Yazım, imla ve marka ses uyumunu en üst seviyede tutmak.`,
    supportedSkills: ["copywriting", "email_sequencing", "brand_voice_alignment"],
    permittedTools: ["business_memory_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 6, maxTokens: 8000, timeoutSeconds: 45 },
    permissionProfile: {
      canReadCrm: false,
      canDraftActions: true,
      requiresApprovalForExternal: false,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "competitor_research_agent",
    name: "Rekabet Analizi Ajanı",
    description: "Rakipleri, fiyatlandırma stratejilerini ve sektör trendlerini karşılaştırır.",
    department: "research",
    systemInstructions: `Sen FlowSales AI Rekabet Analizi Ajanısın.
Görevlerin:
1. Benzer pazardaki alternatif ürün ve çözümleri analiz etmek.
2. FlowSales AI veya kullanıcının işletmesinin ayırt edici avantajlarını (USP) ortaya koymak.
3. Satış ekibine itiraz karşılama için rekabet bilgi kartları (battlecard) hazırlamak.`,
    supportedSkills: ["competitor_benchmarking", "pricing_analysis", "battlecard_generation"],
    permittedTools: ["business_memory_read", "web_search"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 8, maxTokens: 8000, timeoutSeconds: 60 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: false,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "business_analytics_agent",
    name: "İş Analitiği ve Raporlama Ajanı",
    description: "Gelir tahminleri, satış hızı ve operasyonel verimlilik raporları çıkarır.",
    department: "operations",
    systemInstructions: `Sen FlowSales AI İş Analitiği ve Metrik Ajanısın.
Görevlerin:
1. Dönüşüm oranlarını, ortalama anlaşma büyüklüğünü ve boru hattı (pipeline) hızını hesaplamak.
2. Yöneticiye anormallikleri (anomalies) ve büyüme darboğazlarını raporlamak.
3. Veriye dayalı optimizasyon tavsiyeleri formüle etmek.`,
    supportedSkills: ["pipeline_analytics", "revenue_forecasting", "kpi_diagnostics"],
    permittedTools: ["crm_read", "analytics_read", "business_memory_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 10, maxTokens: 10000, timeoutSeconds: 60 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: false,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "qa_agent",
    name: "Kalite Güvence ve Doğrulama Ajanı",
    description: "Çoklu ajan çıktılarının doğruluğunu, kurallara uygunluğunu ve güvenliğini denetler.",
    department: "quality",
    systemInstructions: `Sen FlowSales AI Kalite Güvence ve Çıktı Doğrulama (QA) Ajanısın.
Görevlerin:
1. Diğer ajanların ürettiği çıktıların kullanıcı hedefine ve şirket politikalarına uygunluğunu denetlemek.
2. Halüsinasyon, tutarsız fiyat veya izin verilmeyen taahhütleri tespit edip reddetmek.
3. Son onay öncesi kalite skoru vermek ve eksik adımları raporlamak.`,
    supportedSkills: ["output_verification", "policy_compliance", "hallucination_detection"],
    permittedTools: ["business_memory_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 6, maxTokens: 6000, timeoutSeconds: 45 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: false,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "lead_intelligence_agent",
    name: "Aday İstihbarat ve Doğrulama Ajanı",
    description: "Yeni müşteri kayıtlarını inceler, e-posta/telefon formatlarını doğrular, mükerrer kayıtları tespit eder ve CRM'i zenginleştirir.",
    department: "sales",
    systemInstructions: `Sen FlowSales AI Aday İstihbarat ve Doğrulama Ajanısın.
Görevlerin:
1. Yeni gelen müşteri adayı verilerini incelemek, telefon ve e-posta biçimlerini doğrulamak.
2. CRM ve geçmiş konuşmalarda mükerrer (duplicate) müşteri tespiti yapmak.
3. Eksik alanları işaretlemek ve doğrulanmış müşteri profilini satış hattına iletmek.`,
    supportedSkills: ["lead_verification", "deduplication", "format_validation", "crm_enrichment"],
    permittedTools: ["crm_read", "lead_dedup_check", "business_memory_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 6, maxTokens: 6000, timeoutSeconds: 45 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: false,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "customer_analysis_agent",
    name: "Müşteri İhtiyaç ve Potansiyel Analiz Ajanı",
    description: "Bireysel ve kurumsal müşteri ayrımı yapar, bütçe, kullanım amacı, satın alma zamanı ve bölgeyi analiz ederek satın alma potansiyelini puanlar.",
    department: "sales",
    systemInstructions: `Sen FlowSales AI Müşteri İhtiyaç ve Potansiyel Analiz Ajanısın.
Görevlerin:
1. Müşteri ihtiyacını analiz edip B2B (kurumsal) veya B2C (bireysel) sınıflandırması yapmak.
2. Kullanım amacı (şantiye, ofis, bağ evi, depo vb.), bütçe, satın alma takvimi ve teslimat bölgesini belirlemek.
3. Doğrulanabilir veriler ışığında 0-100 arasında satın alma potansiyel skoru hesaplamak ve puanın gerekçesini açıklamak.`,
    supportedSkills: ["b2b_b2c_classification", "intent_analysis", "budget_scoring", "timeline_qualification"],
    permittedTools: ["crm_read", "business_memory_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 6, maxTokens: 6000, timeoutSeconds: 45 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: false,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "product_matching_agent",
    name: "Ürün ve Model Eşleştirme Ajanı",
    description: "Müşteri ihtiyacını İZON KONTEYNER ürün kataloğuyla (21m²-84m², 1+1, 3+1, ofis, yaşam) eşleştirir ve doğrulanmış katalog fiyatlarını derler.",
    department: "sales",
    systemInstructions: `Sen FlowSales AI Ürün ve Model Eşleştirme Ajanısın.
Görevlerin:
1. Müşterinin ihtiyaç duyduğu metrekare (21m², 35m², 42m², 48m², 84m²), oda sayısı (1+1, 3+1) ve segmenti (Ekonomik, Gold, Premium, Ofis, Yaşam) belirlemek.
2. Yalnızca sistemde aktif olan gerçek ürün kataloğundan eşleştirme yapmak; asla katalogda olmayan fiyat veya model uydurmamak.
3. En uygun ana ürünü ve alternatif opsiyonları gerekçeleriyle sunmak.`,
    supportedSkills: ["catalog_matching", "specification_filter", "modular_container_selection", "pricing_resolution"],
    permittedTools: ["product_catalog_read", "crm_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 6, maxTokens: 6000, timeoutSeconds: 45 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: false,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "quote_intelligence_agent",
    name: "Teklif ve Fiyatlama İstihbarat Ajanı",
    description: "Deterministik Quote Math motoruyla teklif kalemlerini, iskontoyu, KDV'yi ve nakliye/montajı hesaplar, QA onaylı taslak oluşturur.",
    department: "sales",
    systemInstructions: `Sen FlowSales AI Teklif ve Fiyatlama İstihbarat Ajanısın.
Görevlerin:
1. Eşleştirilen ürün için miktar, birim fiyat, iskonto ve vergi satırlarını oluşturmak.
2. Nakliye ve montajı ayrı maliyet kalemleri olarak ele almak.
3. Deterministik Quote Math motorunu kullanarak hatasız ara toplam, KDV ve genel toplam hesaplamak.
4. İskonto yetki sınırlarını korumak ve teklifi onay bekleyen taslak (draft) olarak oluşturmak.`,
    supportedSkills: ["deterministic_quote_math", "discount_governance", "quote_drafting", "tax_calculation"],
    permittedTools: ["quote_draft", "product_catalog_read", "crm_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 6, maxTokens: 8000, timeoutSeconds: 60 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: true,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "sales_follow_up_agent",
    name: "Satış Takip ve Hatırlatma Ajanı",
    description: "Müşteri takip planını ve görevlerini oluşturur, bekleyen teklifleri izler. Asla izinsiz mesaj göndermez.",
    department: "sales",
    systemInstructions: `Sen FlowSales AI Satış Takip ve Hatırlatma Ajanısın.
Görevlerin:
1. Teklif sunulan veya iletişimdeki müşteriler için sonraki takip tarihini ve görevini belirlemek.
2. Bekleyen teklifleri izlemek ve yanıt gelmediğinde hatırlatma görevleri türetmek.
3. Asla otomatik olarak müşteriye doğrudan mesaj göndermemek; daima kullanıcı onayına sunulacak taslak ve görevler üretmek.`,
    supportedSkills: ["follow_up_scheduling", "task_creation", "pipeline_monitoring", "follow_up_drafting"],
    permittedTools: ["crm_task_create", "crm_read", "inbox_draft"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 6, maxTokens: 6000, timeoutSeconds: 45 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: true,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "sales_intelligence_agent",
    name: "Satış İstihbaratı ve Raporlama Ajanı",
    description: "Dönüşüm oranlarını, lead kaynak performansını ve satış darboğazlarını analiz eder, yönetime stratejik rapor sunar.",
    department: "operations",
    systemInstructions: `Sen FlowSales AI Satış İstihbaratı ve Raporlama Ajanısın.
Görevlerin:
1. Lead kaynaklarının dönüşüm performansını, tekliften satışa geçiş oranlarını ve kayıp nedenlerini analiz etmek.
2. Satış hunisindeki darboğazları tespit etmek ve Action Center için aksiyon önerileri hazırlamak.
3. Yönetim için günlük ve haftalık özet metrikleri raporlamak.`,
    supportedSkills: ["conversion_analytics", "pipeline_diagnostics", "executive_reporting", "action_center_insights"],
    permittedTools: ["crm_read", "analytics_read"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 8, maxTokens: 8000, timeoutSeconds: 60 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: false,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
  {
    key: "maestro_sales_supervisor",
    name: "Maestro Satış Operasyon Süpervizörü",
    description: "Tüm satış sürecini DAG bağımlılıklarıyla uçtan uca koordine eder, kalite kontrol ve hata kurtarma sağlar.",
    department: "executive",
    systemInstructions: `Sen FlowSales AI Maestro Satış Operasyon Süpervizörüsün.
Görevlerin:
1. Yeni müşteri girişinden teklif oluşturmaya ve takibe kadar tüm süreci satış ajanları arasında koordine etmek.
2. Görev bağımlılıklarını ve veri aktarımlarını (Handoff) eksiksiz yönetmek.
3. Çıktıların kalitesini denetlemek, başarısız adımları kurtarmak ve süreci başarıyla tamamlamak.`,
    supportedSkills: ["dag_orchestration", "sales_supervision", "qa_enforcement", "resilience_recovery"],
    permittedTools: ["crm_read", "quote_draft", "task_dispatch"],
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    executionLimits: { maxIterations: 10, maxTokens: 10000, timeoutSeconds: 90 },
    permissionProfile: {
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: true,
      externalSpendLimitUsd: 0,
    },
    status: "active",
    version: 1,
  },
];

export class AgentRegistryService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Organizasyonun ajan havuzunu getirir. Henüz kayıt yoksa varsayılan 9 şablonu yükler.
   */
  async getOrSeedAgents(organizationId: string): Promise<AgentDefinition[]> {
    const { data: rawExisting, error } = await this.supabase
      .from("agent_definitions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch agents: ${error.message}`);
    }

    const existing = (rawExisting || []) as DbAgentRow[];
    const existingKeys = new Set(existing.map((r) => r.key));
    const missingTemplates = DEFAULT_AGENT_TEMPLATES.filter((tpl) => !existingKeys.has(tpl.key));

    if (existing.length > 0 && missingTemplates.length === 0) {
      return existing.map((r) => this.mapRowToAgent(r));
    }

    // Seed defaults or missing templates
    const toInsert = (existing.length === 0 ? DEFAULT_AGENT_TEMPLATES : missingTemplates).map((tpl) => ({
      organization_id: organizationId,
      key: tpl.key,
      name: tpl.name,
      description: tpl.description,
      department: tpl.department,
      system_instructions: tpl.systemInstructions,
      supported_skills: tpl.supportedSkills,
      permitted_tools: tpl.permittedTools,
      provider: tpl.provider,
      model: tpl.model,
      execution_limits: tpl.executionLimits,
      permission_profile: tpl.permissionProfile,
      status: tpl.status,
      version: tpl.version,
    }));

    const { data: rawInserted, error: insertError } = await this.supabase
      .from("agent_definitions")
      .insert(toInsert)
      .select("*");

    if (insertError) {
      // In case of parallel race condition, re-fetch
      const { data: rawRefetched } = await this.supabase
        .from("agent_definitions")
        .select("*")
        .eq("organization_id", organizationId);
      const refetched = rawRefetched as DbAgentRow[] | null;
      if (refetched && refetched.length > 0) {
        return refetched.map((r) => this.mapRowToAgent(r));
      }
      throw new Error(`Failed to seed default agents: ${insertError.message}`);
    }

    if (existing.length > 0) {
      const { data: rawFull } = await this.supabase
        .from("agent_definitions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });
      return ((rawFull || existing) as DbAgentRow[]).map((r) => this.mapRowToAgent(r));
    }

    const inserted = rawInserted as DbAgentRow[] | null;
    return (inserted || []).map((r) => this.mapRowToAgent(r));
  }

  async getAgentByKey(organizationId: string, key: string): Promise<AgentDefinition | null> {
    const { data, error } = await this.supabase
      .from("agent_definitions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("key", key)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRowToAgent(data as DbAgentRow);
  }

  async updateAgent(
    organizationId: string,
    key: string,
    updates: Partial<AgentDefinition>
  ): Promise<AgentDefinition> {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.systemInstructions !== undefined) payload.system_instructions = updates.systemInstructions;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.model !== undefined) payload.model = updates.model;
    if (updates.provider !== undefined) payload.provider = updates.provider;
    if (updates.supportedSkills !== undefined) payload.supported_skills = updates.supportedSkills;
    if (updates.permittedTools !== undefined) payload.permitted_tools = updates.permittedTools;
    if (updates.executionLimits !== undefined) payload.execution_limits = updates.executionLimits;
    if (updates.permissionProfile !== undefined) payload.permission_profile = updates.permissionProfile;

    const { data, error } = await this.supabase
      .from("agent_definitions")
      .update(payload)
      .eq("organization_id", organizationId)
      .eq("key", key)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Failed to update agent ${key}: ${error?.message}`);
    }

    return this.mapRowToAgent(data);
  }

  /**
   * Server-side permission check preventing privilege escalation
   */
  validatePermission(
    agent: AgentDefinition,
    action: {
      type: "read_crm" | "draft_action" | "execute_external" | "spend_budget";
      spendAmountUsd?: number;
    }
  ): { allowed: boolean; reason?: string } {
    if (agent.status !== "active") {
      return { allowed: false, reason: `Ajan '${agent.name}' aktif değil (${agent.status}).` };
    }

    const perms = agent.permissionProfile;

    switch (action.type) {
      case "read_crm":
        if (!perms.canReadCrm) {
          return { allowed: false, reason: `Ajan '${agent.name}' CRM verisi okuma yetkisine sahip değil.` };
        }
        return { allowed: true };

      case "draft_action":
        if (!perms.canDraftActions) {
          return { allowed: false, reason: `Ajan '${agent.name}' eylem taslağı hazırlama yetkisine sahip değil.` };
        }
        return { allowed: true };

      case "execute_external":
        if (perms.requiresApprovalForExternal) {
          return {
            allowed: false,
            reason: `Ajan '${agent.name}' harici eylemleri doğrudan yürütemez; insan onayı zorunludur.`,
          };
        }
        return { allowed: true };

      case "spend_budget":
        const requested = action.spendAmountUsd || 0;
        if (requested > perms.externalSpendLimitUsd) {
          return {
            allowed: false,
            reason: `Ajanın harcama limiti ($${perms.externalSpendLimitUsd}) aşıldı: İstenen $${requested}.`,
          };
        }
        return { allowed: true };

      default:
        return { allowed: false, reason: "Bilinmeyen eylem türü." };
    }
  }

  private mapRowToAgent(row: DbAgentRow): AgentDefinition {
    return {
      id: row.id,
      organizationId: row.organization_id,
      key: row.key,
      name: row.name,
      description: row.description,
      department: row.department as AgentDepartment,
      systemInstructions: row.system_instructions,
      supportedSkills: row.supported_skills || [],
      permittedTools: row.permitted_tools || [],
      provider: row.provider || "gemini",
      model: row.model || "gemini-3.5-flash-lite",
      executionLimits: row.execution_limits || { maxIterations: 10, maxTokens: 8000, timeoutSeconds: 60 },
      permissionProfile: row.permission_profile || {
        canReadCrm: true,
        canDraftActions: true,
        requiresApprovalForExternal: true,
        externalSpendLimitUsd: 0,
      },
      status: row.status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
