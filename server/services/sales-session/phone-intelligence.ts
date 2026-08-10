import type { SalesQualification, SalesSession } from "./domain";
import {
  calculateLeadScore,
  calculateLeadScoreBreakdown,
  deriveQualificationScoreEvidence,
  type LeadScoreBreakdownItem,
} from "@/server/services/sales-intelligence/lead-score-domain";

export type PhoneLeadScoreResult = {
  score: number;
  breakdown: LeadScoreBreakdownItem[];
};

export function scorePhoneQualification(qualification: SalesQualification): PhoneLeadScoreResult {
  const evidence = deriveQualificationScoreEvidence({
    productInterest: qualification.productInterest,
    pricingIntent: qualification.pricingIntent,
    availabilityIntent: qualification.availabilityIntent,
    location: qualification.deliveryLocation ?? qualification.location,
    budget: qualification.budget,
    timeline: qualification.purchaseTiming,
    useCase: qualification.usagePurpose,
    quoteRequested: qualification.quoteRequested,
    purchaseCommitment: qualification.purchaseCommitment,
    explicitObjection: qualification.explicitObjection,
  });
  const breakdown = calculateLeadScoreBreakdown(evidence);
  return { score: calculateLeadScore(breakdown), breakdown };
}

export function applyPhoneLeadScore(session: SalesSession): SalesSession {
  const result = scorePhoneQualification(session.qualification);
  return {
    ...session,
    currentLeadScore: result.score,
    updatedAt: new Date().toISOString(),
  };
}
