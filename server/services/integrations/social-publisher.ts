import "server-only";

import { generateText } from "@/server/services/ai";
import {
  SocialPlatform,
  SocialPostInput,
  SocialPostRecord,
  publishSocialPostToMetaMock,
  socialPlatformSchema,
  socialPostInputSchema,
  socialPostStatusSchema,
  validateSocialPostInput,
  buildMockSocialPost,
} from "@/lib/validations/social-publisher";

export type { SocialPlatform, SocialPostInput, SocialPostRecord };
export {
  socialPlatformSchema,
  socialPostInputSchema,
  socialPostStatusSchema,
  validateSocialPostInput,
  buildMockSocialPost,
};

export async function generateCaptionAi(options: {
  topic: string;
  platform: SocialPlatform;
  tone?: string;
}): Promise<{ caption: string; hashtags: string[] }> {
  const prompt = `Sen FlowSales AI dijital pazarlama uzmanısın.
Platform: ${options.platform}
Konu / Ürün: ${options.topic}
Üslup: ${options.tone || "Profesyonel ve ilgi çekici"}

Lütfen aşağıdakileri içeren yanıt üret:
1. İlgi çekici Türkçe sosyal medya metni (hakkında soru veya çağrı içeren).
2. 5 adet uygun hashtag (#kapsamli #satis).

Format JSON:
{
  "caption": "Metin içeriği...",
  "hashtags": ["#etiket1", "#etiket2", "#etiket3", "#etiket4", "#etiket5"]
}`;

  try {
    const raw = await generateText(prompt, { responseMimeType: "application/json" });
    const parsed = JSON.parse(raw) as { caption?: string; hashtags?: string[] };

    return {
      caption: parsed.caption?.trim() || options.topic,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 10) : ["#flowsales"],
    };
  } catch (_error) {
    return {
      caption: options.topic,
      hashtags: ["#flowsales", "#pazarlama", "#satis"],
    };
  }
}

export async function publishSocialPostToMeta(post: SocialPostRecord, pageAccessToken?: string): Promise<{
  success: boolean;
  metaPostId?: string;
  errorMessage?: string;
}> {
  return publishSocialPostToMetaMock(post, pageAccessToken);
}
