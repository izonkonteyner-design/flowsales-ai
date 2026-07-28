import "server-only";

import { generateText, getGeminiModel, hasGeminiConfig } from "@/server/services/ai";

export type ContentIdea = {
  id: string;
  platform: string;
  topic: string;
  headline: string;
  rationale: string;
};

export type AdVariant = {
  id: string;
  platform: string;
  product_name: string | null;
  headline: string;
  body: string | null;
  cta: string;
};

export type GeneratedReportSummary = {
  period_start: string;
  period_end: string;
  quote_count: number;
  totals: Array<{ currency: string; total: number }>;
  narrative: string;
};

type Platform = "linkedin" | "twitter" | "instagram" | "facebook" | "blog" | "google";

const PLATFORM_AUDIENCE_HINT: Record<Platform, string> = {
  linkedin: "professional, insightful, audience peers",
  twitter: "short, punchy, conversational",
  instagram: "visual-first, story-driven, casual",
  facebook: "engaging, community-oriented",
  blog: "long-form, educational, evergreen",
  google: "intent-driven search copy",
};

function buildSuggestContentPrompt(platform: Platform, topic: string, count: number): string {
  return `You are an expert social media strategist.

Generate ${count} distinct, ready-to-publish content ideas for ${platform} about "${topic}".

Audience cues for ${platform}: ${PLATFORM_AUDIENCE_HINT[platform]}.

Rules:
- Each idea must have a catchy, ready-to-publish headline (<= 90 chars).
- Include a one-sentence rationale explaining the angle.
- Do not invent prices, links, or fake statistics.
- Avoid duplicating angles across ideas.
- Be authentic, on-brand, and platform-native.

Return STRICT JSON: { "ideas": [ { "headline": string, "rationale": string } ] }.
Only output the JSON object.`;
}

function buildDraftAdCopyPrompt(
  platform: Platform,
  productName: string | null,
  cta: string | null,
  variantCount: number
): string {
  const productLine = productName ? `Product: ${productName}.` : "Product: generic SaaS.";
  const ctaLine = cta ? `Call-to-action text: ${cta}.` : "Default CTA: Learn more.";

  return `You are an expert direct-response copywriter.

Write ${variantCount} distinct, high-converting ad variants for ${platform}.

${productLine}
${ctaLine}
Audience cues for ${platform}: ${PLATFORM_AUDIENCE_HINT[platform]}.

Rules:
- Headline must be <= 60 chars and grab attention.
- Body must be <= 140 chars; reference the product's value proposition.
- Each variant must use a different hook (e.g. question, benefit, urgency, social proof).
- Do not invent prices, stats, or testimonial quotes.
- Output the same CTA text for every variant.

Return STRICT JSON: { "variants": [ { "headline": string, "body": string } ] }.
Only output the JSON object.`;
}

function buildReportNarrativePrompt(period: string, totals: string, quoteCount: number): string {
  return `You are a sales analyst.

Write a concise 3-sentence narrative summary of the sales report for ${period}.

Data:
- Quotes issued: ${quoteCount}
- Totals: ${totals}

Rules:
- Be accurate and direct.
- Highlight what changed, what's healthy, and what needs attention.
- No marketing fluff. No invented numbers.`;
}

function safeParseJsonList(text: string): { ideas?: Array<{ headline?: string; rationale?: string }> } {
  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.ideas)) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return { ideas: [] };
}

function safeParseAdVariants(text: string): { variants?: Array<{ headline?: string; body?: string }> } {
  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.variants)) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return { variants: [] };
}

export async function generateContentIdeas(input: {
  platform: string;
  topic: string;
  count: number;
  brandVoice?: string;
}): Promise<ContentIdea[]> {
  const platform = input.platform as Platform;
  const count = Math.max(1, Math.min(10, input.count));
  const brandHint = input.brandVoice?.trim() ? `\nBrand voice: ${input.brandVoice.trim()}.` : "";

  const prompt = `${buildSuggestContentPrompt(platform, input.topic, count)}${brandHint}`;

  const text = await generateText(prompt, {
    responseMimeType: "application/json",
    temperature: 0.7,
  });

  const buildFallback = (idx: number): ContentIdea => ({
    id: `idea-${idx + 1}`,
    platform: input.platform,
    topic: input.topic,
    headline: `${input.topic} — angle ${idx + 1} for ${platform}`,
    rationale: `Concept tuned for the ${platform} audience.`,
  });

  if (!text || text.trim() === "") {
    return Array.from({ length: count }).map((_, idx) => buildFallback(idx));
  }

  const parsed = safeParseJsonList(text);
  const ideas: ContentIdea[] = (parsed.ideas ?? []).slice(0, count).map((idea, idx) => ({
    id: `idea-${idx + 1}`,
    platform: input.platform,
    topic: input.topic,
    headline: (idea.headline ?? "").trim().slice(0, 90) || buildFallback(idx).headline,
    rationale: (idea.rationale ?? "").trim() || buildFallback(idx).rationale,
  }));

  while (ideas.length < count) {
    ideas.push(buildFallback(ideas.length));
  }
  return ideas;
}

export async function generateAdVariants(input: {
  platform: string;
  productName?: string | null;
  cta?: string | null;
  variantCount: number;
  brandVoice?: string;
}): Promise<AdVariant[]> {
  const platform = input.platform as Platform;
  const count = Math.max(1, Math.min(5, input.variantCount));
  const brandHint = input.brandVoice?.trim() ? `\nBrand voice: ${input.brandVoice.trim()}.` : "";

  const prompt = `${buildDraftAdCopyPrompt(platform, input.productName ?? null, input.cta ?? null, count)}${brandHint}`;

  const text = await generateText(prompt, {
    responseMimeType: "application/json",
    temperature: 0.8,
  });

  const buildFallback = (idx: number): AdVariant => ({
    id: `ad-${idx + 1}`,
    platform: input.platform,
    product_name: input.productName ?? null,
    headline: `${input.productName ?? "FlowSales"} — ad variant ${idx + 1}`,
    body: null,
    cta: input.cta ?? "Learn more",
  });

  if (!text || text.trim() === "") {
    return Array.from({ length: count }).map((_, idx) => buildFallback(idx));
  }

  const parsed = safeParseAdVariants(text);
  const cta = input.cta ?? "Learn more";
  const variants: AdVariant[] = (parsed.variants ?? []).slice(0, count).map((v, idx) => ({
    id: `ad-${idx + 1}`,
    platform: input.platform,
    product_name: input.productName ?? null,
    headline: (v.headline ?? "").trim().slice(0, 60) || buildFallback(idx).headline,
    body: (v.body ?? "").trim().slice(0, 140) || null,
    cta,
  }));

  while (variants.length < count) {
    variants.push(buildFallback(variants.length));
  }
  return variants;
}

export async function generateReportNarrative(input: {
  periodStart: string;
  periodEnd: string;
  quoteCount: number;
  totals: Array<{ currency: string; total: number }>;
}): Promise<string> {
  const totalsStr = JSON.stringify(input.totals);
  const period = `${input.periodStart} to ${input.periodEnd}`;
  const prompt = buildReportNarrativePrompt(period, totalsStr, input.quoteCount);
  const text = await generateText(prompt, { temperature: 0.4 });
  return text?.trim() || `${input.quoteCount} quotes issued during ${period}.`;
}

export function aiReady(): boolean {
  return hasGeminiConfig();
}

export { getGeminiModel };
