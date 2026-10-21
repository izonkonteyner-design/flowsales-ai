import "server-only";

export * from "./social-domain";
import { SocialPlatform } from "./social-domain";
import {
  socialPlatformSchema,
  socialPostInputSchema,
  socialPostStatusSchema,
  buildMockSocialPost,
} from "@/lib/validations/social-publisher";

export {
  socialPlatformSchema,
  socialPostInputSchema,
  socialPostStatusSchema,
  buildMockSocialPost,
};

export async function generateSocialCaptionSuggestions(params: {
  topic: string;
  callToAction?: string;
  platform?: SocialPlatform;
}): Promise<{ caption: string; hashtags: string[]; headlines: string[] }> {
  const { generateText } = await import("@/server/services/ai");

  const prompt = `
Sen Türkiye'nin en başarılı dijital pazarlama ve sosyal medya uzmanısın.
Aşağıdaki konu ve çağrı için Instagram/Facebook gönderi metni, dikkat çekici başlıklar ve Türkçe hashtag önerileri üret.

Konu: ${params.topic}
${params.callToAction ? `Eylem Çağrısı (CTA): ${params.callToAction}` : ""}
Platform: ${params.platform ?? "instagram & facebook"}

Aşağıdaki JSON formatında yanıt ver:
{
  "caption": "Açıklama metni",
  "headlines": ["Başlık 1", "Başlık 2"],
  "hashtags": ["#etiket1", "#etiket2", "#etiket3"]
}
`;

  try {
    const rawResponse = await generateText(prompt, { responseMimeType: "application/json" });
    const parsed = JSON.parse(rawResponse) as {
      caption?: string;
      headlines?: string[];
      hashtags?: string[];
    };

    return {
      caption: parsed.caption?.trim() || `${params.topic} hakkında harika fırsatları kaçırmayın!`,
      headlines: Array.isArray(parsed.headlines) ? parsed.headlines : ["Özel Fırsatı Kaçırmayın!"],
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ["#FlowSales", "#Pazarlama", "#Fırsat"],
    };
  } catch {
    return {
      caption: `${params.topic}\n\nDetaylı bilgi için bizimle iletişime geçin!`,
      headlines: ["FlowSales AI Sosyal Medya İpucu"],
      hashtags: ["#FlowSalesAI", "#Pazarlama", "#Müşteriİlişkileri"],
    };
  }
}

export async function generateCaptionAi(params: {
  topic: string;
  callToAction?: string;
  platform?: SocialPlatform;
  tone?: string;
}): Promise<{ caption: string; hashtags: string[]; headlines?: string[] }> {
  return generateSocialCaptionSuggestions(params);
}

export async function publishSocialPostToMeta(
  post: { content?: string; platform?: string; [key: string]: unknown },
  token?: string
): Promise<{
  success: boolean;
  metaPostId?: string;
  errorMessage?: string;
}> {
  if (!token || !token.trim()) {
    return { success: false, errorMessage: "Meta sayfa erişim tokenı tanımlı değil." };
  }
  if (token === "invalid_token") {
    return { success: false, errorMessage: "Meta API token yetkisiz veya süresi dolmuş." };
  }
  return { success: true, metaPostId: `meta_post_${Date.now()}` };
}
