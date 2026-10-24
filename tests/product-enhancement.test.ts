import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import assert from "node:assert/strict";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

import { t, navLabel, normalizeLocale } from "@/lib/i18n";
import { sanitizeTurkishForPdf } from "@/lib/utils";
import {
  PLATFORM_CAPABILITY_MATRIX,
  validatePlatformCapabilities,
  validateSocialPostInput,
  adaptCaptionForPlatform,
  type SocialPlatform,
} from "@/server/services/integrations/social-domain";
import {
  publishSocialPost,
  publishSocialPostToTikTok,
  publishSocialPostToYouTube,
  generateSocialCaptionSuggestions,
} from "@/server/services/integrations/social-publisher";
import { getProviderAdapter, isProviderConfigured } from "@/server/services/integrations/provider-adapter";
import { renderQuotePdfBuffer } from "@/server/services/quote-pdf";
import type { QuoteDocumentModel } from "@/server/services/quote-document";

const testsDir = dirname(fileURLToPath(import.meta.url));
const migration0061Path = join(testsDir, "..", "supabase", "migrations", "0061_social_multiplatform_and_company_profile.sql");
const migration0061Source = readFileSync(migration0061Path, "utf8");

describe("Product Enhancement — Full Integration & Quality Gates", () => {
  // Phase 1: Localization
  describe("Phase 1: Complete Turkish / English Localization", () => {
    test("normalizes and serves typed keys in TR and EN", () => {
      assert.equal(normalizeLocale("tr"), "tr");
      assert.equal(normalizeLocale("en"), "en");
      assert.equal(normalizeLocale(null), "tr");

      assert.equal(t("tr", "socialMedia"), "Sosyal Medya");
      assert.equal(t("en", "socialMedia"), "Social Media");

      assert.equal(t("tr", "warrantyTerms"), "Garanti Koşulları");
      assert.equal(t("en", "warrantyTerms"), "Warranty Terms");

      assert.equal(t("tr", "bankDetails"), "Banka & Hesap Bilgileri");
      assert.equal(t("en", "bankDetails"), "Bank & Account Details");
    });

    test("navLabel translates standard routes and handles newly added platforms", () => {
      assert.equal(navLabel("tr", "Dashboard"), "Kontrol Paneli");
      assert.equal(navLabel("en", "Dashboard"), "Dashboard");
      assert.equal(navLabel("tr", "Social Media"), "Sosyal Medya");
      assert.equal(navLabel("en", "Social Media"), "Social Media");
    });

    test("sanitizes Turkish characters for ASCII/WinAnsi fallback safely", () => {
      const original = "Şirketimiz çağdaş, güvenilir ve kaliteli çelik prefabrik ürünler üretmektedir.";
      const sanitized = sanitizeTurkishForPdf(original);
      assert.doesNotMatch(sanitized, /[ğĞşŞıİ]/);
      assert.match(sanitized, /Sirketimiz cagdas/);
    });
  });

  // Phase 3: Company Quotation PDF & Settings
  describe("Phase 3: Company Profile & Professional Quotation PDF", () => {
    test("generates valid A4 PDF buffer with company profile, bank info and warranty terms", async () => {
      const mockDoc: QuoteDocumentModel = {
        id: "quote-test-123",
        quote_number: "TKF-2026-0042",
        status: "sent",
        status_label: "Gönderildi",
        currency: "TRY",
        issue_date: "2026-10-24",
        valid_until: "2026-11-24",
        company: {
          name: "İzon Konteyner & Prefabrik A.Ş.",
          slug: "izon-konteyner",
          currency: "TRY",
          logo_url: null,
          logo_path: null,
          legal_name: "İzon Konteyner Tasarım İmalat San. ve Tic. A.Ş.",
          website: "https://izonkonteyner.com",
          email: "bilgi@izonkonteyner.com",
          phone: "+90 216 555 0100",
          secondary_phone: null,
          address_line_1: "Organize Sanayi Bölgesi 4. Cadde No: 12",
          address_line_2: null,
          district: "Tuzla",
          city: "İstanbul",
          postal_code: "34959",
          country: "Türkiye",
          tax_office: "Tuzla VD",
          tax_number: "4810559281",
          trade_registry_number: "847291",
          mersis_number: "0481055928100001",
          bank_name: "Türkiye İş Bankası",
          bank_branch: "Tuzla Ticari",
          iban: "TR640006400000142000000123",
          account_holder: "İzon Konteyner Tasarım A.Ş.",
          default_tax_rate: 20,
          default_payment_terms: "%50 Peşinat, bakiye montaj tesliminde",
          default_delivery_terms: "Fabrika teslimi / Türkiye geneli nakliye",
          default_warranty_terms: "Taşıyıcı çelik konstrüksiyon 5 yıl, iç donanım ve sızdırmazlık 2 yıl tam garantilidir.",
          default_quote_notes: "Fiyatlarımıza KDV dahildir.",
          default_quote_validity_days: 30,
          quote_footer_text: "Güvenli ve modern modüler yaşam alanları",
          signature_name: "Murat Yılmaz",
          signature_title: "Satış & Operasyon Direktörü",
          company_slogan: "Modüler Yapıda Güven ve Hız",
        },
        recipient: {
          type: "customer",
          name: "Ahmet Demir",
          company: "Demir İnşaat Taahhüt Ltd.",
          email: "ahmet@demirinsaat.com",
          phone: "+90 532 100 2030",
          city: "Kocaeli",
          notes: null,
        },
        items: [
          {
            id: "item-1",
            index: 1,
            name: "3x7m Standart Yaşam Konteyneri",
            description: "Sandviç panel duvarlar, PVC pencereler, elektrik tesisatı hazır.",
            sku: "KNT-3X7-STD",
            quantity: 2,
            unit: "Adet",
            unit_price: 125000,
            discount: "-",
            tax: "%20",
            line_total: 250000,
            product_image_url: null,
          },
        ],
        subtotal: 250000,
        line_discount_total: 0,
        order_discount_total: 0,
        shipping_total: 15000,
        taxable_subtotal: 265000,
        tax_total: 53000,
        grand_total: 318000,
        notes: "Özel renk talepleri için sipariş esnasında teyit alınız.",
        payment_terms: "%50 Peşin, %50 Teslimatta",
        delivery_terms: "10 iş günü içerisinde şantiye teslimi.",
        warranty_terms: "5 Yıl Taşıyıcı Karkas Garantisi, 2 Yıl İşçilik Garantisi",
        created_at: "2026-10-24T00:00:00Z",
        updated_at: "2026-10-24T00:00:00Z",
        created_by: "Murat Yılmaz",
        recordMode: "live",
        demoBadge: "Canlı Veri",
      };

      const pdfBuffer = await renderQuotePdfBuffer(mockDoc);
      assert.ok(Buffer.isBuffer(pdfBuffer));
      assert.ok(pdfBuffer.length > 1000, "PDF buffer must be non-empty and well-formed");
      const pdfHeader = pdfBuffer.slice(0, 5).toString("utf8");
      assert.equal(pdfHeader, "%PDF-", "PDF buffer must start with %PDF- header");
    });
  });

  // Phase 4 & 5: 4 Platforms & Unified Content Creation
  describe("Phase 4 & 5: Social Media Expansion to 4 Platforms & Unified Content", () => {
    test("platform capability matrix covers Instagram, Facebook, TikTok, and YouTube", () => {
      const platforms: SocialPlatform[] = ["instagram", "facebook", "tiktok", "youtube"];
      for (const p of platforms) {
        const cap = PLATFORM_CAPABILITY_MATRIX[p];
        assert.ok(cap, `Capability must be defined for ${p}`);
        assert.ok(cap.allowedContentTypes.length > 0, `${p} must define allowedContentTypes`);
        assert.ok(cap.maxCaptionLength > 0, `${p} must define maxCaptionLength`);
      }

      assert.deepEqual(PLATFORM_CAPABILITY_MATRIX.tiktok.supportedMediaTypes, ["video"]);
      assert.deepEqual(PLATFORM_CAPABILITY_MATRIX.youtube.supportedMediaTypes, ["video"]);
      assert.equal(PLATFORM_CAPABILITY_MATRIX.instagram.requiresMedia, true);
      assert.equal(PLATFORM_CAPABILITY_MATRIX.facebook.requiresMedia, false);
    });

    test("validates platform format and media requirements strictly", () => {
      // TikTok rejects image files
      const tiktokImage = validatePlatformCapabilities({
        platform: "tiktok",
        contentType: "reel_short",
        mediaUrls: ["https://example.com/banner.jpg"],
      });
      assert.equal(tiktokImage.ok, false);
      assert.match(tiktokImage.error!, /video/i);

      // TikTok requires media
      const tiktokNoMedia = validatePlatformCapabilities({
        platform: "tiktok",
        contentType: "reel_short",
        mediaUrls: [],
      });
      assert.equal(tiktokNoMedia.ok, false);

      // YouTube requires title
      const youtubeNoTitle = validatePlatformCapabilities({
        platform: "youtube",
        contentType: "video",
        mediaUrls: ["https://example.com/tour.mp4"],
        title: "",
      });
      assert.equal(youtubeNoTitle.ok, false);
      assert.match(youtubeNoTitle.error!, /başlık/i);

      // Facebook accepts text-only
      const fbText = validatePlatformCapabilities({
        platform: "facebook",
        contentType: "text",
        caption: "Yeni konteyner modellerimiz satışta!",
      });
      assert.equal(fbText.ok, true);

      // Instagram allows image
      const igPost = validatePlatformCapabilities({
        platform: "instagram",
        contentType: "post",
        mediaUrls: ["https://example.com/container.png"],
        caption: "Harika tasarım!",
      });
      assert.equal(igPost.ok, true);
    });

    test("validates unified social post input with platform customizations", () => {
      const valid = validateSocialPostInput({
        title: "Genel Başlık",
        caption: "Sonbahar kampanyası başladı!",
        contentType: "post",
        platforms: ["instagram", "facebook"],
        mediaUrls: ["https://example.com/image.jpg"],
        platformCustomizations: {
          facebook: {
            caption: "Facebook takipçilerimize özel kampanya detayı!",
          },
        },
      });
      assert.equal(valid.ok, true);

      // Customization adaptCaptionForPlatform uses override if present
      const adaptedFb = adaptCaptionForPlatform(
        "Sonbahar kampanyası başladı!",
        "facebook",
        { facebook: { caption: "Özel Facebook Metni" } },
      );
      assert.equal(adaptedFb, "Özel Facebook Metni");
    });

    test("provider adapters instantiate TikTok and YouTube contracts safely", () => {
      const tiktokAdapter = getProviderAdapter("tiktok");
      assert.equal(tiktokAdapter.provider, "tiktok");

      const youtubeAdapter = getProviderAdapter("youtube");
      assert.equal(youtubeAdapter.provider, "youtube");

      // Verify fail-safe config checks without real env secrets
      assert.equal(isProviderConfigured("tiktok"), false);
      assert.equal(isProviderConfigured("youtube"), false);
    });

    test("publishSocialPostToTikTok and publishSocialPostToYouTube guard demo and missing tokens", async () => {
      const demoRes = await publishSocialPostToTikTok({
        organizationId: "d3e00000-0000-0000-0000-000000000000",
        mediaUrls: ["https://example.com/video.mp4"],
      });
      assert.equal(demoRes.success, false);
      assert.equal(demoRes.errorCode, "demo_blocked");

      const ytNoMedia = await publishSocialPostToYouTube({
        organizationId: "11111111-1111-1111-1111-111111111111",
        mediaUrls: [],
      });
      assert.equal(ytNoMedia.success, false);
      assert.equal(ytNoMedia.errorCode, "media_required");

      const ytNoToken = await publishSocialPostToYouTube({
        organizationId: "11111111-1111-1111-1111-111111111111",
        mediaUrls: ["https://example.com/video.mp4"],
      });
      assert.equal(ytNoToken.success, false);
      assert.equal(ytNoToken.errorCode, "missing_token");
    });

    test("publishSocialPost dispatches to appropriate platform publisher", async () => {
      const ytResult = await publishSocialPost({
        organizationId: "d3e00000-0000-0000-0000-000000000000",
        platform: "youtube",
        mediaUrls: ["https://example.com/video.mp4"],
      });
      assert.equal(ytResult.errorCode, "demo_blocked");

      const ttResult = await publishSocialPost({
        organizationId: "d3e00000-0000-0000-0000-000000000000",
        platform: "tiktok",
        mediaUrls: ["https://example.com/video.mp4"],
      });
      assert.equal(ttResult.errorCode, "demo_blocked");
    });
  });

  // Phase 6: AI-Assisted Content Generation
  describe("Phase 6: AI-Assisted Social Content Generation", () => {
    test("generates titles, hooks, captions, and hashtags in TR and EN without paid API dependency", async () => {
      const trResult = await generateSocialCaptionSuggestions({
        topic: "Lüks Konteyner Ofis Çözümleri",
        platform: "instagram",
        contentType: "post",
        language: "tr",
      });
      assert.ok(trResult.caption.length > 10);
      assert.ok(trResult.headlines.length > 0);
      assert.ok(trResult.hooks.length > 0);
      assert.ok(trResult.hashtags.length > 0);
      assert.ok(trResult.callToAction.length > 0);

      const enResult = await generateSocialCaptionSuggestions({
        topic: "Modular Steel Living Units",
        platform: "tiktok",
        contentType: "reel_short",
        language: "en",
      });
      assert.ok(enResult.caption.length > 10);
      assert.ok(enResult.headlines.length > 0);
      assert.ok(enResult.hashtags.length > 0);
    });
  });

  // Phase 7: Database & Tenant Security Migration
  describe("Phase 7: Database & Tenant Security (Migration 0061)", () => {
    test("migration 0061 contains forward-only updates for multiplatform and warranty", () => {
      assert.match(migration0061Source, /default_warranty_terms TEXT/);
      assert.match(migration0061Source, /ai_language TEXT/);
      assert.match(migration0061Source, /social_posts_platform_check/);
      assert.match(migration0061Source, /'tiktok'/);
      assert.match(migration0061Source, /'youtube'/);
      assert.match(migration0061Source, /content_type/);
      assert.match(migration0061Source, /platform_customizations/);
      assert.match(migration0061Source, /idx_social_posts_org_content_type/);
      assert.match(migration0061Source, /0061/);
    });
  });
});
