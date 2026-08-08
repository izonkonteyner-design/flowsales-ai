import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { localeMeta, normalizeLocale, type Locale } from "@/lib/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function resolveIntlLocale(locale?: string | Locale) {
  if (!locale) return localeMeta.tr.intl;
  if (locale === "tr" || locale === "en") return localeMeta[locale].intl;
  return locale;
}

export function formatCurrency(value: number, currency = "TRY", locale: string | Locale = "tr-TR") {
  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, locale: string | Locale = "tr-TR") {
  return new Intl.NumberFormat(resolveIntlLocale(locale), { maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(value: number, locale: string | Locale = "tr-TR") {
  return new Intl.NumberFormat(resolveIntlLocale(locale), { style: "percent", maximumFractionDigits: 1 }).format(value);
}

export function formatDate(value: string | Date, locale: string | Locale = "tr-TR") {
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date, locale: string | Locale = "tr-TR") {
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatRelativeDate(value: string | Date, locale: string | Locale = "tr-TR") {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffDays = Math.round((date.getTime() - Date.now()) / 86_400_000);
  return new Intl.RelativeTimeFormat(resolveIntlLocale(locale), { numeric: "auto" }).format(diffDays, "day");
}

export function localeFromValue(value: string | null | undefined): Locale {
  return normalizeLocale(value);
}

export function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
