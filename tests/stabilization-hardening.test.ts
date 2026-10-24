import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";

import { t, DEFAULT_LOCALE, SUPPORTED_LOCALES, normalizeLocale, type Locale } from "@/lib/i18n";
import { sanitizeTurkishForPdf } from "@/lib/utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

function readCode(relativePath: string) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

describe("FLOWSALES AI — Production Stabilization & Hardening Tests", () => {
  describe("A. Turkish / English Localization Consistency", () => {
    test("supported locales are Turkish and English with proper defaults", () => {
      assert.deepEqual(SUPPORTED_LOCALES, ["tr", "en"]);
      assert.equal(DEFAULT_LOCALE, "tr");
      assert.equal(normalizeLocale("en"), "en");
      assert.equal(normalizeLocale("tr"), "tr");
      assert.equal(normalizeLocale("de"), "tr");
      assert.equal(normalizeLocale(null), "tr");
    });

    test("email workspace localization keys exist in both TR and EN", () => {
      const emailKeys = [
        "emailCenter",
        "emailCenterDesc",
        "emailInboxSync",
        "emailRecipient",
        "emailSubject",
        "emailSend",
        "emailBodyPlaceholder",
        "emailNoAccounts",
        "emailThreads",
        "emailCrmMatched",
        "emailNoSync",
        "emailOpenLead",
        "emailOpenCustomer",
        "emailNoCrmMatch",
        "emailNoContent",
        "emailSelectThread",
        "emailDisconnectConfirm",
        "emailDisconnect",
        "emailConnectAnother",
        "emailConnectAccount",
        "emailProviderKeysRequired",
        "emailAdminOnly",
        "emailConnected",
        "openEmailCenter",
      ] as const;

      for (const loc of ["tr", "en"] as Locale[]) {
        for (const key of emailKeys) {
          const val = t(loc, key);
          assert.ok(val && val.length > 0, `Missing translation for ${key} in ${loc}`);
        }
      }
    });

    test("quote document toolbar localization keys exist in both TR and EN", () => {
      const toolbarKeys = ["quotePreview", "quotePreviewDesc", "print", "downloadPdf", "back"] as const;
      for (const loc of ["tr", "en"] as Locale[]) {
        for (const key of toolbarKeys) {
          const val = t(loc, key);
          assert.ok(val && val.length > 0, `Missing translation for ${key} in ${loc}`);
        }
      }
    });

    test("email components consume localized strings via i18n helper", () => {
      const connectionsCode = readCode("components/email/email-connections.tsx");
      assert.match(connectionsCode, /t\(activeLocale,\s*"emailDisconnectConfirm"\)/);
      assert.match(connectionsCode, /t\(activeLocale,\s*"emailInboxSync"\)/);
      assert.match(connectionsCode, /t\(activeLocale,\s*"emailConnected"\)/);
      assert.match(connectionsCode, /t\(activeLocale,\s*"emailDisconnect"\)/);

      const workspaceCode = readCode("components/email/email-workspace.tsx");
      assert.match(workspaceCode, /t\(activeLocale,\s*"emailCenter"\)/);
      assert.match(workspaceCode, /t\(activeLocale,\s*"emailRecipient"\)/);
      assert.match(workspaceCode, /t\(activeLocale,\s*"emailSend"\)/);
      assert.match(workspaceCode, /t\(activeLocale,\s*"emailThreads"\)/);
    });

    test("quote document toolbar consumes localized strings", () => {
      const toolbarCode = readCode("components/quotes/quote-document-toolbar.tsx");
      assert.match(toolbarCode, /t\(activeLocale,\s*"quotePreview"\)/);
      assert.match(toolbarCode, /t\(activeLocale,\s*"print"\)/);
      assert.match(toolbarCode, /t\(activeLocale,\s*"downloadPdf"\)/);
      assert.match(toolbarCode, /t\(activeLocale,\s*"back"\)/);
    });
  });

  describe("B. Light / Dark Theme Contrast Invariants", () => {
    test("AppShell root adapts cleanly to both light and dark themes", () => {
      const appShell = readCode("components/layout/app-shell.tsx");
      assert.match(appShell, /bg-slate-50.*dark:bg-\[#050816\]/);
      assert.match(appShell, /text-slate-900.*dark:text-white/);
      assert.match(appShell, /border-slate-200\/80.*dark:border-white\/\[0\.08\]/);
      assert.match(appShell, /bg-white\/90.*dark:bg-\[#080c19\]\/92/);
      assert.match(appShell, /bg-white\/80.*dark:bg-\[#060a16\]\/75/);
    });

    test("Usage page implements comprehensive dark mode contrast", () => {
      const usage = readCode("app/usage/page.tsx");
      assert.match(usage, /dark:text-white/);
      assert.match(usage, /dark:bg-slate-900\/80/);
      assert.match(usage, /dark:border-white\/10/);
      assert.match(usage, /dark:bg-slate-800/);
    });

    test("AI History page implements comprehensive dark mode contrast", () => {
      const history = readCode("app/ai-history/page.tsx");
      assert.match(history, /dark:text-white/);
      assert.match(history, /dark:bg-slate-900\/80/);
      assert.match(history, /dark:border-white\/10/);
      assert.match(history, /dark:bg-slate-800/);
    });

    test("Approvals page implements comprehensive dark mode contrast", () => {
      const approvals = readCode("app/approvals/page.tsx");
      assert.match(approvals, /dark:text-white/);
      assert.match(approvals, /dark:bg-slate-900\/80/);
      assert.match(approvals, /dark:border-white\/10/);
      assert.match(approvals, /dark:bg-slate-800/);
    });

    test("Operations page implements comprehensive dark mode contrast", () => {
      const operations = readCode("app/operations/page.tsx");
      assert.match(operations, /dark:text-white/);
      assert.match(operations, /dark:bg-slate-900\/80/);
      assert.match(operations, /dark:border-white\/10/);
    });

    test("Command center, calendar, and tasks submit buttons have high contrast in both themes", () => {
      const cal = readCode("app/(app)/calendar/page.tsx");
      assert.match(cal, /bg-slate-950.*dark:bg-white.*dark:text-slate-950/);

      const tasks = readCode("app/(app)/tasks/page.tsx");
      assert.match(tasks, /bg-slate-950.*dark:bg-white.*dark:text-slate-950/);

      const command = readCode("app/(app)/command-center/page.tsx");
      assert.match(command, /dark:bg-slate-900\/80/);
      assert.match(command, /dark:border-white\/10/);
    });
  });

  describe("C. Quotation PDF & Document Verification", () => {
    test("sanitizeTurkishForPdf replaces all Turkish specific glyphs", () => {
      const turkishInput = "Çığır açan Şirketler için Öğütler ve Ürünler — ğ, ş, ı, ç, ö, ü";
      const sanitized = sanitizeTurkishForPdf(turkishInput);
      assert.equal(sanitized, "Cigir acan Sirketler icin Ogutler ve Urunler — g, s, i, c, o, u");
      // Must not contain any Turkish non-ASCII glyphs
      assert.doesNotMatch(sanitized, /[ğĞşŞıİçÇöÖüÜ]/);
    });

    test("quote PDF generator handles logo buffer and falls back gracefully", () => {
      const pdfService = readCode("server/services/quote-pdf.ts");
      assert.match(pdfService, /drawBankAndWarrantyCard/);
      assert.match(pdfService, /cleanText/);
      assert.match(pdfService, /sanitizeTurkishForPdf/);
      assert.match(pdfService, /logoBuffer/);
    });
  });

  describe("D. Security & Multi-Tenant Isolation Invariants", () => {
    test("Operations page enforces owner or admin access", () => {
      const ops = readCode("app/operations/page.tsx");
      assert.match(ops, /\["owner",\s*"admin"\]\.includes\(String\(membership\.role\)\)/);
      assert.match(ops, /redirect\("\/dashboard"\)/);
    });

    test("AI History and Approvals enforce authentication and tenant scope", () => {
      const history = readCode("app/ai-history/page.tsx");
      assert.match(history, /client\.auth\.getUser\(\)/);
      assert.match(history, /from\("organization_members"\)/);
      assert.match(history, /workspaceId:\s*membership\.organization_id/);

      const approvals = readCode("app/approvals/page.tsx");
      assert.match(approvals, /client\.auth\.getUser\(\)/);
      assert.match(approvals, /from\("organization_members"\)/);
      assert.match(approvals, /membership\.organization_id/);
    });
  });
});
