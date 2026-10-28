import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type IndustryPackKey,
  type IndustryPackPreset,
  type TenantIndustryPackConfig,
  industryPackKeySchema,
} from "./domain";

export const INDUSTRY_PACK_PRESETS: Record<IndustryPackKey, IndustryPackPreset> = {
  container_modular: {
    packKey: "container_modular",
    name: "Konteyner & Prefabrik Modüler Yapı",
    description: "Konteyner imalatçıları, prefabrik ev ve şantiye yapı üreticileri için tam donanımlı sektör paketi.",
    version: "1.0.0",
    customFields: [
      { fieldKey: "dimensions", label: "Konteyner Ebatı (Örn: 3x7m)", type: "select", options: ["3x7m Standart (21m²)", "3x8m (24m²)", "2.40x6m", "Özel Proje"], required: true, targetEntity: "lead" },
      { fieldKey: "insulation_type", label: "Yalıtım Tipi", type: "select", options: ["Poliüretan Sandviç Panel", "Taşyünü Sandviç Panel", "EPS Panel"], required: true, targetEntity: "lead" },
      { fieldKey: "has_wet_area", label: "Islak Hacim (WC / Duş / Mutfak)", type: "boolean", required: false, targetEntity: "lead" },
      { fieldKey: "delivery_city", label: "Teslimat İli / İlçesi", type: "text", required: true, targetEntity: "lead" },
      { fieldKey: "crane_required", label: "Vinç İndirme Hizmeti Talebi", type: "boolean", required: false, targetEntity: "quote" },
    ],
    pipelineStages: [
      { stageKey: "talep_alindi", label: "Yeni Talep", color: "#3B82F6", order: 1 },
      { stageKey: "olcu_teknik_netlesti", label: "Teknik Netleştirme", color: "#6366F1", order: 2 },
      { stageKey: "teklif_gonderildi", label: "Teklif Sunuldu", color: "#F59E0B", order: 3 },
      { stageKey: "pazarlik_revizyon", label: "Pazarlık / Revizyon", color: "#EC4899", order: 4 },
      { stageKey: "uretim_onayi", label: "Sipariş Onayı / Üretim", color: "#10B981", order: 5 },
      { stageKey: "sevk_ve_teslim", label: "Sevk & Teslim Edildi", color: "#059669", order: 6 },
    ],
    catalogTemplates: [
      { name: "3x7m Standart Yaşam Konteyneri", category: "Konteyner", description: "Poliüretan sandviç panel, çelik şase, 2 adet PVC pencere, çelik kapı.", unit: "adet", suggestedUnitPrice: 135000 },
      { name: "3x7m WC + Duş Şantiye Konteyneri", category: "Saniter", description: "2 kabin klozet, 2 lavabo veya duşlu kombine sistem.", unit: "adet", suggestedUnitPrice: 155000 },
      { name: "42m² Birleşimli Prefabrik Ofis", category: "Modüler", description: "İki adet 3x7 konteyner birleşimi geniş toplantı ve çalışma salonu.", unit: "adet", suggestedUnitPrice: 295000 },
      { name: "Şehirler Arası Nakliye ve Sevk", category: "Lojistik", description: "Fabrikadan şantiye lokasyonuna nakliye bedeli.", unit: "sefer", suggestedUnitPrice: 15000 },
    ],
    quoteTemplatePreset: {
      headerNote: "İZON KONTEYNER — Yüksek Mukavemetli Modüler Yaşam ve Çalışma Çözümleri",
      footerTerms: [
        "Fiyatlarımıza KDV dahil değildir.",
        "Ürünlerimiz korozyona dayanıklı galvaniz karkas ve yangın dayanımlı panellerden üretilmiştir.",
        "İmalat ve malzeme kusurlarına karşı 2 yıl resmi garantilidir.",
        "Nakliye ve montaj sahasındaki zemin tesviyesi alıcıya aittir.",
      ],
      defaultTaxRate: 20,
      defaultValidityDays: 14,
    },
    aiSystemInstructions: "Sen modüler yapı ve konteyner sektöründe uzman bir satış mühendisisin. Müşterinin ebat (3x7m vb.), yalıtım (taşyünü/poliüretan), ıslak hacim (WC/duş) ve nakliye gereksinimlerini her zaman netleştir. Fiyat tekliflerinde karkas mukavemetini ve sızdırmazlık kalitesini ön plana çıkar.",
  },

  real_estate: {
    packKey: "real_estate",
    name: "Gayrimenkul & Proje Pazarlama",
    description: "Emlak ofisleri, gayrimenkul danışmanları ve konut projesi satış ekipleri için portföy odaklı paket.",
    version: "1.0.0",
    customFields: [
      { fieldKey: "property_type", label: "Mülk Tipi", type: "select", options: ["Daire", "Villa", "Arsa/Tarla", "Ticari/Ofis"], required: true, targetEntity: "lead" },
      { fieldKey: "investment_purpose", label: "Amaç", type: "select", options: ["Oturum", "Yatırım/Kira", "Geliştirme"], required: true, targetEntity: "lead" },
      { fieldKey: "target_district", label: "Tercih Edilen İlçe/Bölge", type: "text", required: true, targetEntity: "lead" },
      { fieldKey: "max_budget", label: "Maksimum Bütçe", type: "number", required: true, targetEntity: "lead" },
    ],
    pipelineStages: [
      { stageKey: "talep_girisi", label: "Yeni Aday", color: "#3B82F6", order: 1 },
      { stageKey: "kriter_analizi", label: "Kriter Analizi", color: "#6366F1", order: 2 },
      { stageKey: "portfoy_sunumu", label: "Portföy Sunuldu", color: "#F59E0B", order: 3 },
      { stageKey: "yer_gosterme", label: "Yer Gösterme Randevusu", color: "#8B5CF6", order: 4 },
      { stageKey: "pazarlik_ve_kaparo", label: "Pazarlık / Kaparo", color: "#EC4899", order: 5 },
      { stageKey: "tapu_devri", label: "Tapu Devri & Başarı", color: "#10B981", order: 6 },
    ],
    catalogTemplates: [
      { name: "3+1 Lüks Konut Portföyü", category: "Konut", description: "Merkezi lokasyonda kapalı otoparklı lüks daire.", unit: "portföy", suggestedUnitPrice: 4500000 },
      { name: "İmarlı Villa Parseli Arsa", category: "Arsa", description: "Müstakil parsel, elektrik ve su altyapısı hazır villa arsası.", unit: "m²", suggestedUnitPrice: 2500000 },
    ],
    quoteTemplatePreset: {
      headerNote: "Gayrimenkul Yatırım & Satış Teklif Protokolü",
      footerTerms: [
        "Mülk üzerindeki ipotek ve haciz sorgulamaları yapılmıştır.",
        "Hizmet bedeli yasal mevzuat uyarınca %2 + KDV alıcı ve satıcı tarafından ayrı karşılanır.",
        "Ön protokol ve kaparo 7 iş günü süreyle geçerlidir.",
      ],
      defaultTaxRate: 20,
      defaultValidityDays: 7,
    },
    aiSystemInstructions: "Sen gayrimenkul yatırım danışmanısın. Müşterinin bütçesini, amortisman beklentisini, lokasyon tercihini ve tapu uygunluğunu analiz et. Portföy eşleştirmelerini profesyonel ve güven verici bir dille açıkla.",
  },

  automotive: {
    packKey: "automotive",
    name: "Otomotiv & Filo Satış",
    description: "Araç galerileri, filo kiralama ve ticari araç satış şirketleri için uzman paket.",
    version: "1.0.0",
    customFields: [
      { fieldKey: "vehicle_class", label: "Araç Sınıfı", type: "select", options: ["Binek Sedan", "SUV", "Hafif Ticari", "Ağır Vasıta"], required: true, targetEntity: "lead" },
      { fieldKey: "trade_in_requested", label: "Takas Talebi Var mı?", type: "boolean", required: false, targetEntity: "lead" },
      { fieldKey: "financing_need", label: "Finansman / Kredi Desteği", type: "select", options: ["Peşin", "Taşıt Kredisi", "Finansal Kiralama"], required: true, targetEntity: "lead" },
    ],
    pipelineStages: [
      { stageKey: "talep_alindi", label: "Gelen Çağrı / Form", color: "#3B82F6", order: 1 },
      { stageKey: "arac_ekspertiz", label: "Araç Seçimi / Ekspertiz", color: "#6366F1", order: 2 },
      { stageKey: "finansman_teklifi", label: "Kredi / Fiyat Teklifi", color: "#F59E0B", order: 3 },
      { stageKey: "test_surusu", label: "Test Sürüşü", color: "#8B5CF6", order: 4 },
      { stageKey: "sozlesme_satis", label: "Noter & Teslimat", color: "#10B981", order: 5 },
    ],
    catalogTemplates: [
      { name: "Ticari Panelvan 13m³", category: "Ticari", description: "Dizel manuel klima, geniş yük hacmi.", unit: "adet", suggestedUnitPrice: 1100000 },
      { name: "Ekspertiz ve Garanti Paketi", category: "Hizmet", description: "TSE onaylı 101 nokta ekspertiz ve 1 yıl motor-şanzıman güvencesi.", unit: "paket", suggestedUnitPrice: 12000 },
    ],
    quoteTemplatePreset: {
      headerNote: "Otomotiv Satış ve Teslimat Teklifi",
      footerTerms: [
        "Fiyatlar noter devir masrafları hariçtir.",
        "Kredi faiz oranları bankaların güncel şartlarına göre değişkenlik gösterebilir.",
        "Araç rezervasyonu kaparo ödemesiyle 3 iş günü geçerlidir.",
      ],
      defaultTaxRate: 20,
      defaultValidityDays: 3,
    },
    aiSystemInstructions: "Sen otomotiv satış ve filo danışmanısın. Müşterinin kullanım amacını (binek vs ticari), takas imkanını ve kredi uygunluğunu analiz ederek en doğru aracı öner.",
  },

  general_services: {
    packKey: "general_services",
    name: "Genel Hizmet & Kurumsal B2B",
    description: "Danışmanlık, mühendislik, ajans ve profesyonel hizmet sağlayıcıları için esnek paket.",
    version: "1.0.0",
    customFields: [
      { fieldKey: "service_scope", label: "Hizmet Kapsamı", type: "text", required: true, targetEntity: "lead" },
      { fieldKey: "billing_model", label: "Faturalama Modeli", type: "select", options: ["Proje Bazlı", "Aylık Hizmet (Retainer)", "Saatlik"], required: true, targetEntity: "lead" },
      { fieldKey: "timeline_weeks", label: "Tahmini Tamamlanma Süresi (Hafta)", type: "number", required: false, targetEntity: "lead" },
    ],
    pipelineStages: [
      { stageKey: "tanisma_kesif", label: "Keşif / İhtiyaç Analizi", color: "#3B82F6", order: 1 },
      { stageKey: "kapsam_belirleme", label: "Kapsam Belirleme", color: "#6366F1", order: 2 },
      { stageKey: "teklif_sunuldu", label: "Teklif Sunuldu", color: "#F59E0B", order: 3 },
      { stageKey: "sozlesme_imza", label: "Sözleşme Aşaması", color: "#EC4899", order: 4 },
      { stageKey: "proje_basladi", label: "Proje Başlatıldı", color: "#10B981", order: 5 },
    ],
    catalogTemplates: [
      { name: "Aylık Yönetim ve Danışmanlık", category: "Danışmanlık", description: "Aylık düzenli operasyonel yönetim ve raporlama.", unit: "ay", suggestedUnitPrice: 45000 },
      { name: "Anahtar Teslim Proje Uygulaması", category: "Proje", description: "Gereksinim analizi, uygulama ve teslimat fazlarını içeren uçtan uca hizmet.", unit: "proje", suggestedUnitPrice: 180000 },
    ],
    quoteTemplatePreset: {
      headerNote: "Kurumsal B2B Hizmet ve Çözüm Teklifi",
      footerTerms: [
        "Fiyatlarımıza KDV dahil değildir.",
        "Hizmet seviyesi sözleşmesi (SLA) işbu teklifin ayrılmaz bir parçasıdır.",
        "Ödemeler proje faz onaylarına istinaden faturalandırılır.",
      ],
      defaultTaxRate: 20,
      defaultValidityDays: 30,
    },
    aiSystemInstructions: "Sen kurumsal B2B hizmet danışmanısın. Müşteri ihtiyaçlarını kapsamlı biçimde analiz et, iş teslimat kilometre taşlarını ve net başarı metriklerini tanımla.",
  },
};

/**
 * Lists all available industry pack presets.
 */
export function getIndustryPackPresets(): IndustryPackPreset[] {
  return Object.values(INDUSTRY_PACK_PRESETS);
}

/**
 * Returns the active pack config for an organization.
 * Defaults to container_modular if none is saved.
 */
export async function getActiveIndustryPack(
  supabase: SupabaseClient,
  organizationId: string
): Promise<TenantIndustryPackConfig> {
  const { data, error } = await supabase
    .from("industry_pack_configurations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .single();

  if (data && !error) {
    return {
      id: data.id,
      organizationId: data.organization_id,
      packKey: data.pack_key,
      isActive: data.is_active,
      packVersion: data.pack_version,
      customFields: data.custom_fields ?? [],
      pipelineStages: data.pipeline_stages ?? [],
      catalogTemplates: data.catalog_templates ?? [],
      quoteTemplatePreset: data.quote_template_preset ?? {},
      aiSystemInstructions: data.ai_system_instructions ?? "",
      activatedBy: data.activated_by,
      activatedAt: data.activated_at,
    };
  }

  // Fallback default: container_modular
  const defaultPreset = INDUSTRY_PACK_PRESETS.container_modular;
  return {
    organizationId,
    packKey: "container_modular",
    isActive: true,
    packVersion: defaultPreset.version,
    customFields: defaultPreset.customFields,
    pipelineStages: defaultPreset.pipelineStages,
    catalogTemplates: defaultPreset.catalogTemplates,
    quoteTemplatePreset: defaultPreset.quoteTemplatePreset,
    aiSystemInstructions: defaultPreset.aiSystemInstructions,
  };
}

/**
 * Activates a specific industry pack for an organization.
 */
export async function activateIndustryPack(
  supabase: SupabaseClient,
  organizationId: string,
  packKey: IndustryPackKey,
  userId?: string
): Promise<TenantIndustryPackConfig> {
  industryPackKeySchema.parse(packKey);
  const preset = INDUSTRY_PACK_PRESETS[packKey];
  if (!preset) {
    throw new Error(`Invalid industry pack key: ${packKey}`);
  }

  // Deactivate any currently active pack for this org
  await supabase
    .from("industry_pack_configurations")
    .update({ is_active: false })
    .eq("organization_id", organizationId);

  // Upsert the selected pack
  const { data, error } = await supabase
    .from("industry_pack_configurations")
    .upsert(
      {
        organization_id: organizationId,
        pack_key: packKey,
        is_active: true,
        pack_version: preset.version,
        custom_fields: preset.customFields,
        pipeline_stages: preset.pipelineStages,
        catalog_templates: preset.catalogTemplates,
        quote_template_preset: preset.quoteTemplatePreset,
        ai_system_instructions: preset.aiSystemInstructions,
        activated_by: userId ?? null,
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id, pack_key" }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to activate industry pack: ${error?.message || "Unknown error"}`);
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    packKey: data.pack_key,
    isActive: data.is_active,
    packVersion: data.pack_version,
    customFields: data.custom_fields,
    pipelineStages: data.pipeline_stages,
    catalogTemplates: data.catalog_templates,
    quoteTemplatePreset: data.quote_template_preset,
    aiSystemInstructions: data.ai_system_instructions,
    activatedBy: data.activated_by,
    activatedAt: data.activated_at,
  };
}
