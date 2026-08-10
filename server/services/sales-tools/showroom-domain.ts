import { z } from "zod";

export const showroomRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(120),
  district: z.string().trim().min(1).max(120).nullable(),
  address: z.string().trim().min(1).max(500),
  appointmentRequired: z.boolean(),
  active: z.boolean(),
  productIds: z.array(z.string().uuid()).max(100).default([]),
  visitingHours: z.string().trim().min(1).max(300).nullable(),
  updatedAt: z.string().datetime(),
});

export type ShowroomRecord = z.infer<typeof showroomRecordSchema>;

export const showroomTruthSchema = showroomRecordSchema.extend({
  source: z.literal("trusted_showroom"),
  sourceId: z.string().uuid(),
});

export type ShowroomTruth = z.infer<typeof showroomTruthSchema>;

export class ShowroomTruthUnavailableError extends Error {}

export function resolveShowroomTruth(record: ShowroomRecord): ShowroomTruth {
  const parsed = showroomRecordSchema.parse(record);
  if (!parsed.active) throw new ShowroomTruthUnavailableError("Inactive showroom records cannot be presented to customers.");

  return showroomTruthSchema.parse({
    ...parsed,
    source: "trusted_showroom",
    sourceId: parsed.id,
  });
}

export function findTrustedShowrooms(records: ShowroomRecord[], input: { city?: string; productId?: string }) {
  const city = input.city?.trim().toLocaleLowerCase("tr-TR");
  return records
    .filter((record) => record.active)
    .filter((record) => !city || record.city.toLocaleLowerCase("tr-TR") === city)
    .filter((record) => !input.productId || record.productIds.length === 0 || record.productIds.includes(input.productId))
    .map(resolveShowroomTruth);
}

export function assertShowroomClaimMatchesTrustedSource(input: {
  claimedAddress: string;
  appointmentRequired: boolean;
  truth: ShowroomTruth;
}) {
  if (
    input.claimedAddress.trim() !== input.truth.address.trim() ||
    input.appointmentRequired !== input.truth.appointmentRequired
  ) {
    throw new ShowroomTruthUnavailableError("Showroom claim does not match the trusted showroom source.");
  }
  return input.truth;
}
