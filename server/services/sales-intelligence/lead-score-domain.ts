import { z } from "zod";

export const leadScoreFactorSchema = z.enum([
  "product_interest",
  "pricing_intent",
  "availability_intent",
  "location_known",
  "budget_known",
  "timeline_known",
  "use_case_known",
  "repeat_engagement",
  "quote_requested",
  "purchase_commitment",
  "explicit_objection",
  "low_intent",
]);

export type LeadScoreFactor = z.infer<typeof leadScoreFactorSchema>;

export const LEAD_SCORE_WEIGHTS: Readonly<Record<LeadScoreFactor, number>> = Object.freeze({
  product_interest: 15,
  pricing_intent: 10,
  availability_intent: 10,
  location_known: 10,
  budget_known: 15,
  timeline_known: 15,
  use_case_known: 5,
  repeat_engagement: 10,
  quote_requested: 20,
  purchase_commitment: 30,
  explicit_objection: -10,
  low_intent: -20,
});

export const leadScoreEvidenceSchema = z.object({
  factor: leadScoreFactorSchema,
  evidence: z.string().trim().min(1).max(240),
});

export const leadScoreBreakdownItemSchema = leadScoreEvidenceSchema.extend({
  points: z.number().int(),
});

export type LeadScoreEvidence = z.infer<typeof leadScoreEvidenceSchema>;
export type LeadScoreBreakdownItem = z.infer<typeof leadScoreBreakdownItemSchema>;

export function calculateLeadScoreBreakdown(evidence: LeadScoreEvidence[]): LeadScoreBreakdownItem[] {
  const seen = new Set<LeadScoreFactor>();
  const breakdown: LeadScoreBreakdownItem[] = [];

  for (const item of evidence) {
    const parsed = leadScoreEvidenceSchema.parse(item);
    if (seen.has(parsed.factor)) continue;
    seen.add(parsed.factor);
    breakdown.push({
      factor: parsed.factor,
      points: LEAD_SCORE_WEIGHTS[parsed.factor],
      evidence: parsed.evidence,
    });
  }

  return breakdown;
}

export function calculateLeadScore(input: LeadScoreEvidence[] | LeadScoreBreakdownItem[]) {
  const breakdown = input.length > 0 && "points" in input[0]
    ? (input as LeadScoreBreakdownItem[])
    : calculateLeadScoreBreakdown(input as LeadScoreEvidence[]);

  const raw = breakdown.reduce((total, item) => total + item.points, 0);
  return Math.max(0, Math.min(100, raw));
}

export function deriveQualificationScoreEvidence(input: {
  productInterest?: string | null;
  pricingIntent?: boolean;
  availabilityIntent?: boolean;
  location?: string | null;
  budget?: number | null;
  timeline?: string | null;
  useCase?: string | null;
  quoteRequested?: boolean;
  purchaseCommitment?: boolean;
  explicitObjection?: string | null;
  lowIntent?: boolean;
}): LeadScoreEvidence[] {
  const evidence: LeadScoreEvidence[] = [];
  if (input.productInterest) evidence.push({ factor: "product_interest", evidence: `Product interest: ${input.productInterest}` });
  if (input.pricingIntent) evidence.push({ factor: "pricing_intent", evidence: "Customer explicitly asked about pricing." });
  if (input.availabilityIntent) evidence.push({ factor: "availability_intent", evidence: "Customer explicitly asked about availability." });
  if (input.location) evidence.push({ factor: "location_known", evidence: `Location: ${input.location}` });
  if (input.budget !== null && input.budget !== undefined) evidence.push({ factor: "budget_known", evidence: "Customer budget is known." });
  if (input.timeline) evidence.push({ factor: "timeline_known", evidence: `Purchase timing: ${input.timeline}` });
  if (input.useCase) evidence.push({ factor: "use_case_known", evidence: `Use case: ${input.useCase}` });
  if (input.quoteRequested) evidence.push({ factor: "quote_requested", evidence: "Customer explicitly requested a quote." });
  if (input.purchaseCommitment) evidence.push({ factor: "purchase_commitment", evidence: "Customer explicitly stated readiness to proceed." });
  if (input.explicitObjection) evidence.push({ factor: "explicit_objection", evidence: input.explicitObjection });
  if (input.lowIntent) evidence.push({ factor: "low_intent", evidence: "Customer explicitly stated low or no commercial intent." });
  return evidence;
}
