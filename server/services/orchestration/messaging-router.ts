import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentRegistryService } from "./agent-registry";

export interface IncomingMessagePayload {
  organizationId: string;
  channel: "whatsapp" | "instagram" | "facebook" | "email" | "phone";
  senderId: string;
  senderName?: string;
  content: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageRoutingResult {
  assignedAgentKey: string;
  intent: "sales_inquiry" | "support_request" | "pricing_quote" | "general_info";
  suggestedReply: string;
  requiresHumanReview: boolean;
  reviewReason?: string;
  confidence: number;
}

export class MessagingOperationsRouter {
  private readonly registry: AgentRegistryService;

  constructor(private readonly supabase: SupabaseClient) {
    this.registry = new AgentRegistryService(supabase);
  }

  /**
   * Çok kanallı gelen mesajı analiz eder, doğru ajana yönlendirir ve yanıt taslağı üretir.
   */
  async routeAndProcessMessage(payload: IncomingMessagePayload): Promise<MessageRoutingResult> {
    const { organizationId, content } = payload;
    const lower = content.toLowerCase();

    let intent: MessageRoutingResult["intent"] = "general_info";
    let assignedAgentKey = "customer_support_agent";
    let confidence = 0.85;

    // Niyet sınıflandırması (Intent Classification)
    if (lower.includes("fiyat") || lower.includes("teklif") || lower.includes("satın") || lower.includes("sipariş") || lower.includes("indirim")) {
      intent = "pricing_quote";
      assignedAgentKey = "sales_agent";
      confidence = 0.95;
    } else if (lower.includes("çalışmıyor") || lower.includes("arıza") || lower.includes("hata") || lower.includes("şikayet") || lower.includes("iade")) {
      intent = "support_request";
      assignedAgentKey = "customer_support_agent";
      confidence = 0.92;
    } else if (lower.includes("nasıl") || lower.includes("bilgi") || lower.includes("özellik") || lower.includes("kullanım")) {
      intent = "sales_inquiry";
      assignedAgentKey = "sales_agent";
      confidence = 0.88;
    }

    // Ajan izinlerini ve durumunu çek
    const agent = await this.registry.getAgentByKey(organizationId, assignedAgentKey);
    const requiresApproval = agent?.permissionProfile.requiresApprovalForExternal ?? true;

    // Kanal kuralları: WhatsApp 24 saat kuralı veya kritik iade/şikayetler insan onayı zorunludur
    const isSensitive = intent === "pricing_quote" || lower.includes("iade") || lower.includes("şikayet");
    const requiresHumanReview = requiresApproval || isSensitive || confidence < 0.9;

    let reviewReason: string | undefined;
    if (requiresHumanReview) {
      if (intent === "pricing_quote") {
        reviewReason = "Fiyatlandırma ve teklif taahhütleri operatör onayı gerektirir.";
      } else if (lower.includes("iade") || lower.includes("şikayet")) {
        reviewReason = "Müşteri memnuniyeti ve şikayet eskalasyonu nedeniyle insan denetimi zorunludur.";
      } else {
        reviewReason = "Dış kanala gönderim politikası gereği taslak onay bekliyor.";
      }
    }

    const suggestedReply = this.generateDraftReply(intent);

    return {
      assignedAgentKey,
      intent,
      suggestedReply,
      requiresHumanReview,
      reviewReason,
      confidence,
    };
  }

  private generateDraftReply(intent: MessageRoutingResult["intent"]): string {
    switch (intent) {
      case "pricing_quote":
        return `Merhaba, talebiniz için teşekkür ederiz. İlgilendiğiniz ürün/hizmet için en uygun teklifi ve özel çözümleri hazırlayıp kısa süre içinde sizinle paylaşacağız. Eklemek istediğiniz bir detay var mıdır?`;
      case "support_request":
        return `Merhaba, yaşadığınız aksaklık için üzgünüz. Konuyu teknik ekibimizle inceliyoruz. Size en hızlı çözümü sunabilmemiz adına ilgili sipariş veya hesap bilginizi paylaşabilir misiniz?`;
      case "sales_inquiry":
      default:
        return `Merhaba! Mesajınız için teşekkür ederiz. İhtiyacınıza en uygun çözümü belirlemek için ekibimiz sizinle ilgileniyor. Sorularınızı yanıtlamaktan memnuniyet duyarız.`;
    }
  }
}
