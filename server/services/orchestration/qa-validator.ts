import { calculateQuoteTotals } from "@/server/services/quote-math";
import type { QuoteMathItem } from "@/server/services/quote-math";

export interface QaValidationResult {
  passed: boolean;
  score: number; // 0 to 100
  issues: string[];
  evidenceVerified: boolean;
  sanitizedOutput?: Record<string, unknown>;
}

export class QaValidatorService {
  /**
   * Bir ajan çıktısını kalite, doğruluk, politika uyumu ve finansal hesap açısından denetler.
   */
  static validateTaskOutput(params: {
    taskTitle: string;
    agentKey: string;
    output: Record<string, unknown>;
    policyRules?: Array<{ title: string; content: string }>;
  }): QaValidationResult {
    const { output, policyRules } = params;
    const issues: string[] = [];
    let score = 100;

    // 1. Boş çıktı denetimi
    if (!output || Object.keys(output).length === 0) {
      return {
        passed: false,
        score: 0,
        issues: ["Ajan çıktısı boş veya geçersiz."],
        evidenceVerified: false,
      };
    }

    // 2. Fiyat / Teklif Matematiksel Tutarlılık Doğrulaması (Deterministic Quote Math)
    if (output.quoteLines && Array.isArray(output.quoteLines) && output.quoteLines.length > 0) {
      try {
        const rawLines = output.quoteLines as Array<{
          quantity: number;
          unit_price: number;
          tax_rate?: number;
          discount?: number;
        }>;

        const formattedLines: QuoteMathItem[] = rawLines.map((l) => ({
          quantity: Number(l.quantity || 1),
          unit_price: Number(l.unit_price || 0),
          tax_rate: Number(l.tax_rate ?? 20),
          discount: Number(l.discount || 0),
          currency: "TRY",
        }));

        const calculated = calculateQuoteTotals(formattedLines, { currency: "TRY" });

        // Eğer ajan toplam hesaplamışsa, deterministik hesapla karşılaştır
        const reportedTotal = typeof output.total === "number" ? output.total : typeof output.grand_total === "number" ? output.grand_total : null;
        if (reportedTotal !== null) {
          const diff = Math.abs(reportedTotal - calculated.grand_total);
          if (diff > 0.05) {
            issues.push(
              `Matematiksel tutarsızlık: Ajanın toplamı (${reportedTotal}) ile gerçek hesaplanan toplam (${calculated.grand_total}) uyuşmuyor.`
            );
            score -= 35;
          }
        }

        // Çıktıya garantili deterministik hesap sonucunu ekle
        output.verified_totals = {
          subtotal: calculated.subtotal,
          tax_total: calculated.tax_total,
          discount_total: calculated.discount_total,
          grand_total: calculated.grand_total,
          total: calculated.grand_total,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        issues.push(`Teklif satırları matematiksel doğrulama hatası: ${message}`);
        score -= 30;
      }
    }

    // 3. Politika Uyumu Denetimi (Policy Rules)
    if (policyRules && policyRules.length > 0) {
      for (const rule of policyRules) {
        const ruleLower = rule.content.toLowerCase();

        // Örnek: Maksimum iskonto kuralı
        if (ruleLower.includes("iskonto") || ruleLower.includes("indirim")) {
          const discountMatch = ruleLower.match(/%(\d+)/);
          const maxDiscount = discountMatch ? Number(discountMatch[1]) : 15;

          const proposedDiscount = Number(output.discount_percent || output.discountPercent || 0);
          if (proposedDiscount > maxDiscount) {
            issues.push(
              `Şirket politikası ihlali: Önerilen indirim (%${proposedDiscount}), izin verilen azami indirim kuralını (%${maxDiscount}) aşıyor. Kural: "${rule.title}"`
            );
            score -= 40;
          }
        }
      }
    }

    // 4. Halüsinasyon ve Tehlikeli Taahhüt Denetimi
    const summaryText = String(output.summary || output.message || output.text || "").toLowerCase();
    const bannedPhrases = ["garanti %100", "kesin iade", "ücretsiz ömür boyu"];
    for (const phrase of bannedPhrases) {
      if (summaryText.includes(phrase)) {
        issues.push(`Tehlikeli ve izinsiz pazarlama taahhüdü tespit edildi: "${phrase}"`);
        score -= 20;
      }
    }

    // 5. Karar
    const passed = score >= 70 && issues.length === 0;

    return {
      passed,
      score: Math.max(0, score),
      issues,
      evidenceVerified: true,
      sanitizedOutput: output,
    };
  }
}
