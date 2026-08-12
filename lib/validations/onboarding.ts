import { z } from "zod";

export const ONBOARDING_TIMEZONES = ["Europe/Istanbul", "Europe/London", "Europe/Berlin", "UTC"] as const;

export const onboardingSchema = z.object({
  company_name: z.string().trim().min(2, "Şirket adı en az 2 karakter olmalı.").max(120, "Şirket adı en fazla 120 karakter olabilir."),
  industry: z.string().trim().max(120, "Sektör en fazla 120 karakter olabilir.").optional().default(""),
  currency: z.enum(["TRY", "USD", "EUR"]),
  phone: z.string().trim().max(30, "Telefon en fazla 30 karakter olabilir.").optional().default(""),
  city: z.string().trim().max(80, "Şehir en fazla 80 karakter olabilir.").optional().default(""),
  country: z.string().trim().min(2, "Ülke bilgisi gereklidir.").max(80, "Ülke en fazla 80 karakter olabilir."),
  timezone: z.enum(ONBOARDING_TIMEZONES),
});

export type OnboardingField = keyof z.input<typeof onboardingSchema> | "logo";
export type OnboardingActionState = {
  success: boolean;
  message: string;
  fieldErrors: Partial<Record<OnboardingField, string>>;
};
