import fs from "node:fs";

import PDFDocument from "pdfkit";

import { buildQuotePdfFileName, type QuoteDocumentModel } from "@/server/services/quote-document";
import { sanitizeTurkishForPdf } from "@/lib/utils";

type PdfFonts = {
  regular: string | null;
  bold: string | null;
};

const PAGE_MARGIN = 28;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const TABLE_HEADER_FONT_SIZE = 8.5;
const TABLE_ROW_FONT_SIZE = 9.3;

function firstExistingPath(paths: string[]) {
  return paths.find((filePath) => fs.existsSync(filePath)) ?? null;
}

function resolveFonts(): PdfFonts {
  const regular = firstExistingPath([
    "C:\\Windows\\Fonts\\segoeui.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  ]);

  const bold =
    firstExistingPath([
      "C:\\Windows\\Fonts\\segoeuib.ttf",
      "C:\\Windows\\Fonts\\arialbd.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
      "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    ]) ?? regular;

  return { regular, bold };
}

function formatMoney(currency: string, value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(text: string | null | undefined, fonts: PdfFonts): string {
  const str = formatText(text);
  if (!fonts.regular) {
    // When falling back to Helvetica, sanitize Turkish characters to prevent WinAnsi glyph encoding errors
    return sanitizeTurkishForPdf(str);
  }
  return str;
}

function setFont(pdf: PDFKit.PDFDocument, fonts: PdfFonts, weight: "regular" | "bold" = "regular") {
  const fontPath = weight === "bold" ? fonts.bold : fonts.regular;
  if (fontPath) {
    pdf.font(fontPath);
    return;
  }

  pdf.font(weight === "bold" ? "Helvetica-Bold" : "Helvetica");
}

function ensureSpace(
  pdf: PDFKit.PDFDocument,
  minHeight: number,
  fonts: PdfFonts,
  document?: QuoteDocumentModel,
  logoBuffer?: Buffer | null,
) {
  if (pdf.y + minHeight <= PAGE_HEIGHT - PAGE_MARGIN - 24) {
    return;
  }

  pdf.addPage({ size: "A4", margin: PAGE_MARGIN });
  drawPageHeader(pdf, fonts, document, logoBuffer);
}

function drawKeyValue(
  pdf: PDFKit.PDFDocument,
  fonts: PdfFonts,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  setFont(pdf, fonts, "regular");
  pdf.fontSize(8.5).fillColor("#64748b").text(cleanText(label, fonts), x, y, { width, continued: false });
  const valueY = y + 11;
  setFont(pdf, fonts, "bold");
  pdf.fontSize(9.5).fillColor("#0f172a").text(cleanText(value || "-", fonts), x, valueY, { width, continued: false });
}

function drawPageHeader(
  pdf: PDFKit.PDFDocument,
  fonts: PdfFonts,
  document?: QuoteDocumentModel,
  logoBuffer?: Buffer | null,
) {
  const topY = PAGE_MARGIN;
  let textStartX = PAGE_MARGIN;

  if (logoBuffer && logoBuffer.length > 0) {
    try {
      pdf.image(logoBuffer, PAGE_MARGIN, topY, { fit: [80, 42] });
      textStartX = PAGE_MARGIN + 90;
    } catch {
      // Fallback cleanly to text if image parsing fails
      textStartX = PAGE_MARGIN;
    }
  }

  setFont(pdf, fonts, "bold");
  pdf.fontSize(16).fillColor("#0f172a").text(
    cleanText(document?.company.name ?? "Quote", fonts),
    textStartX,
    topY,
    { width: CONTENT_WIDTH * 0.5 - (textStartX - PAGE_MARGIN) },
  );

  setFont(pdf, fonts, "regular");
  pdf.fontSize(8.2).fillColor("#64748b").text(
    cleanText(document?.company.company_slogan ?? "Kurumsal Teklif Dokümanı", fonts),
    textStartX,
    topY + 20,
    { width: CONTENT_WIDTH * 0.5 - (textStartX - PAGE_MARGIN) },
  );

  if (document) {
    const headerX = PAGE_MARGIN + CONTENT_WIDTH * 0.55;
    drawKeyValue(pdf, fonts, "Teklif No / Quote", document.quote_number, headerX, topY, CONTENT_WIDTH * 0.22);
    drawKeyValue(pdf, fonts, "Durum / Status", document.status_label, headerX + CONTENT_WIDTH * 0.23, topY, CONTENT_WIDTH * 0.22);
    drawKeyValue(pdf, fonts, "Tarih / Issue Date", document.issue_date, headerX, topY + 28, CONTENT_WIDTH * 0.22);
    drawKeyValue(pdf, fonts, "Geçerlilik / Validity", document.valid_until, headerX + CONTENT_WIDTH * 0.23, topY + 28, CONTENT_WIDTH * 0.22);
  }

  pdf.moveTo(PAGE_MARGIN, topY + 68).lineTo(PAGE_MARGIN + CONTENT_WIDTH, topY + 68).lineWidth(0.8).strokeColor("#cbd5e1").stroke();
  pdf.y = topY + 76;
}

function drawPartyCard(
  pdf: PDFKit.PDFDocument,
  fonts: PdfFonts,
  title: string,
  lines: Array<[string, string | null | undefined]>,
  x: number,
  y: number,
  width: number,
) {
  const visibleLines = lines.filter(([, value]) => formatText(value).length > 0);
  const boxHeight = Math.max(90, 32 + visibleLines.length * 13 + 8);
  pdf.roundedRect(x, y, width, boxHeight, 10).fillAndStroke("#ffffff", "#e2e8f0");
  setFont(pdf, fonts, "bold");
  pdf.fontSize(9.2).fillColor("#0f172a").text(cleanText(title, fonts), x + 12, y + 10, { width: width - 24 });
  let currentY = y + 26;
  for (const [label, value] of visibleLines) {
    setFont(pdf, fonts, "regular");
    pdf.fontSize(8).fillColor("#64748b").text(`${cleanText(label, fonts)}:`, x + 12, currentY, { width: 70 });
    setFont(pdf, fonts, "bold");
    pdf.fontSize(8.4).fillColor("#1e293b").text(cleanText(value, fonts), x + 85, currentY, { width: width - 97 });
    currentY += 13;
  }

  return boxHeight;
}

function drawBankAndWarrantyCard(
  pdf: PDFKit.PDFDocument,
  fonts: PdfFonts,
  document: QuoteDocumentModel,
  x: number,
  y: number,
  width: number,
) {
  const bankRows: Array<[string, string | null | undefined]> = [
    ["Banka / Bank", document.company.bank_name],
    ["Şube / Branch", document.company.bank_branch],
    ["IBAN", document.company.iban],
    ["Hesap Sahibi", document.company.account_holder],
    ["Garanti / Warranty", document.warranty_terms || document.company.default_warranty_terms || "2 Yıl Standart Garanti"],
  ];

  return drawPartyCard(pdf, fonts, "Banka & Garanti Bilgileri", bankRows, x, y, width);
}

function drawItemTableHeader(pdf: PDFKit.PDFDocument, fonts: PdfFonts) {
  const headerY = pdf.y;
  const columns = [
    { label: "#", width: 20 },
    { label: "Ürün / Hizmet (Line Item)", width: 198 },
    { label: "Miktar", width: 36 },
    { label: "Birim", width: 40 },
    { label: "Birim Fiyat", width: 70 },
    { label: "İndirim", width: 60 },
    { label: "KDV", width: 48 },
    { label: "Toplam", width: 67 },
  ];

  pdf.rect(PAGE_MARGIN, headerY, CONTENT_WIDTH, 20).fillAndStroke("#f1f5f9", "#cbd5e1");
  let x = PAGE_MARGIN;
  setFont(pdf, fonts, "bold");
  pdf.fontSize(TABLE_HEADER_FONT_SIZE).fillColor("#334155");
  for (const column of columns) {
    pdf.text(cleanText(column.label, fonts), x + 4, headerY + 6, { width: column.width - 8, align: "left" });
    x += column.width;
  }

  pdf.y = headerY + 20;
  return columns;
}

function drawItemRow(
  pdf: PDFKit.PDFDocument,
  fonts: PdfFonts,
  document: QuoteDocumentModel,
  item: QuoteDocumentModel["items"][number],
  logoBuffer?: Buffer | null,
) {
  const columns = [
    { width: 20, align: "left" as const },
    { width: 198, align: "left" as const },
    { width: 36, align: "center" as const },
    { width: 40, align: "left" as const },
    { width: 70, align: "right" as const },
    { width: 60, align: "right" as const },
    { width: 48, align: "right" as const },
    { width: 67, align: "right" as const },
  ];

  const detailText = cleanText(`${item.name}\n${item.description || ""}${item.sku ? `\nSKU: ${item.sku}` : ""}`.trim(), fonts);
  const detailHeight = pdf.heightOfString(detailText, { width: columns[1].width - 8, lineGap: 1.5, align: "left" });
  const rowHeight = Math.max(22, detailHeight + 8);

  ensureSpace(pdf, rowHeight + 12, fonts, document, logoBuffer);

  const startY = pdf.y;
  pdf.rect(PAGE_MARGIN, startY, CONTENT_WIDTH, rowHeight).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
  let x = PAGE_MARGIN;
  const values = [
    String(item.index),
    detailText,
    String(Number.isFinite(item.quantity) ? item.quantity : 0),
    cleanText(item.unit, fonts),
    formatMoney(document.currency, item.unit_price),
    cleanText(item.discount, fonts),
    cleanText(item.tax, fonts),
    formatMoney(document.currency, item.line_total),
  ];

  values.forEach((value, index) => {
    const col = columns[index];
    pdf.save();
    pdf.rect(x, startY, col.width, rowHeight).clip();
    setFont(pdf, fonts, index === 1 || index === 7 ? "bold" : "regular");
    pdf.fontSize(TABLE_ROW_FONT_SIZE).fillColor("#0f172a").text(value, x + 4, startY + 4, {
      width: col.width - 8,
      align: col.align,
      lineBreak: false,
      ellipsis: true,
    });
    pdf.restore();
    x += col.width;
  });

  pdf.y = startY + rowHeight;
}

function drawTotals(
  pdf: PDFKit.PDFDocument,
  fonts: PdfFonts,
  document: QuoteDocumentModel,
  logoBuffer?: Buffer | null,
) {
  ensureSpace(pdf, 135, fonts, document, logoBuffer);
  const y = pdf.y + 8;
  const width = 220;
  const x = PAGE_MARGIN + CONTENT_WIDTH - width;

  pdf.roundedRect(x, y, width, 126, 10).fillAndStroke("#ffffff", "#cbd5e1");
  setFont(pdf, fonts, "bold");
  pdf.fontSize(9.5).fillColor("#0f172a").text("Genel Toplamlar (Totals)", x + 12, y + 8, { width: width - 24 });

  const rows: Array<[string, number]> = [
    ["Ara Toplam / Subtotal", document.subtotal],
    ["Satır İndirimleri", document.line_discount_total],
    ["Genel İndirim", document.order_discount_total],
    ["Kargo / Teslimat", document.shipping_total],
    ["KDV Matrahı", document.taxable_subtotal],
    ["Toplam KDV / Tax", document.tax_total],
  ];

  let currentY = y + 24;
  for (const [label, value] of rows) {
    setFont(pdf, fonts, "regular");
    pdf.fontSize(8.2).fillColor("#64748b").text(cleanText(label, fonts), x + 12, currentY, { width: 110 });
    pdf.fontSize(8.4).fillColor("#0f172a").text(formatMoney(document.currency, value), x + 124, currentY, {
      width: 84,
      align: "right",
    });
    currentY += 13.5;
  }

  pdf.moveTo(x + 10, currentY + 2).lineTo(x + width - 10, currentY + 2).strokeColor("#cbd5e1").stroke();
  setFont(pdf, fonts, "bold");
  pdf.fontSize(10).fillColor("#0f172a").text("Ödenecek Tutar", x + 12, currentY + 7, { width: 110 });
  pdf.fontSize(10).fillColor("#047857").text(formatMoney(document.currency, document.grand_total), x + 124, currentY + 7, {
    width: 84,
    align: "right",
  });
  pdf.y = y + 134;
}

function drawNotesAndTerms(
  pdf: PDFKit.PDFDocument,
  fonts: PdfFonts,
  document: QuoteDocumentModel,
  logoBuffer?: Buffer | null,
) {
  const sectionHeight = 84;
  ensureSpace(pdf, sectionHeight + 16, fonts, document, logoBuffer);
  const y = pdf.y + 6;
  const boxWidth = (CONTENT_WIDTH - 12) / 2;

  const renderBox = (x: number, title: string, value: string) => {
    pdf.roundedRect(x, y, boxWidth, sectionHeight, 10).fillAndStroke("#ffffff", "#e2e8f0");
    setFont(pdf, fonts, "bold");
    pdf.fontSize(8.8).fillColor("#0f172a").text(cleanText(title, fonts), x + 10, y + 8, { width: boxWidth - 20 });
    setFont(pdf, fonts, "regular");
    pdf.fontSize(8.2).fillColor("#334155").text(cleanText(value || "Belirtilmedi", fonts), x + 10, y + 22, {
      width: boxWidth - 20,
      lineGap: 2,
    });
  };

  renderBox(PAGE_MARGIN, "Ödeme & Teslimat Koşulları", `Ödeme: ${document.payment_terms || "Belirtilmedi"}\nTeslimat: ${document.delivery_terms || "Belirtilmedi"}`);
  renderBox(PAGE_MARGIN + boxWidth + 12, "Teklif Açıklaması & Notlar", document.notes || "Özel bir not belirtilmemiştir.");
  pdf.y = y + sectionHeight + 10;
}

function drawSignature(
  pdf: PDFKit.PDFDocument,
  fonts: PdfFonts,
  document: QuoteDocumentModel,
  logoBuffer?: Buffer | null,
) {
  ensureSpace(pdf, 74, fonts, document, logoBuffer);
  const y = pdf.y + 6;
  const width = CONTENT_WIDTH;
  pdf.roundedRect(PAGE_MARGIN, y, width, 68, 10).fillAndStroke("#ffffff", "#e2e8f0");
  setFont(pdf, fonts, "bold");
  pdf.fontSize(8.8).fillColor("#0f172a").text("Yetkili İmza & Onay / Authorized Approval", PAGE_MARGIN + 12, y + 8, { width: width - 24 });
  pdf.moveTo(PAGE_MARGIN + 12, y + 44).lineTo(PAGE_MARGIN + width - 12, y + 44).strokeColor("#cbd5e1").stroke();
  setFont(pdf, fonts, "regular");
  const signer = document.company.signature_name || "Yetkili İmza";
  const signerTitle = document.company.signature_title ? `, ${document.company.signature_title}` : "";
  pdf.fontSize(8.2).fillColor("#64748b").text(cleanText(`${signer}${signerTitle}`, fonts), PAGE_MARGIN + 12, y + 49, { width: width - 24 });
  pdf.y = y + 74;
}

function drawFooter(
  pdf: PDFKit.PDFDocument,
  fonts: PdfFonts,
  document: QuoteDocumentModel,
  pageNumber: number,
  totalPages: number,
) {
  const footerY = PAGE_HEIGHT - PAGE_MARGIN + 2;
  pdf.moveTo(PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN - 8).lineTo(PAGE_MARGIN + CONTENT_WIDTH, PAGE_HEIGHT - PAGE_MARGIN - 8).strokeColor("#e2e8f0").stroke();
  setFont(pdf, fonts, "regular");
  const footerText = document.company.quote_footer_text
    ? `${document.company.name} - ${document.company.quote_footer_text}`
    : `${document.company.name} - ${document.quote_number}`;
  pdf.fontSize(7.5).fillColor("#64748b").text(cleanText(footerText, fonts), PAGE_MARGIN, footerY, { width: CONTENT_WIDTH * 0.7 });
  pdf.text(`Sayfa ${pageNumber} / ${totalPages}`, PAGE_MARGIN, footerY, { width: CONTENT_WIDTH, align: "right" });
}

async function loadLogoBuffer(logoUrl: string | null | undefined): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    if (logoUrl.startsWith("data:image/")) {
      const base64Data = logoUrl.split(",")[1];
      return Buffer.from(base64Data, "base64");
    }
    if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } else if (fs.existsSync(logoUrl)) {
      return fs.readFileSync(logoUrl);
    }
  } catch {
    // Graceful fallback to typography
  }
  return null;
}

export async function renderQuotePdfBuffer(document: QuoteDocumentModel) {
  const fonts = resolveFonts();
  const logoBuffer = await loadLogoBuffer(document.company.logo_url ?? document.company.logo_path);

  const pdf = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: `${cleanText(document.company.name, fonts)} quote ${document.quote_number}`,
      Author: cleanText(document.company.name, fonts),
      Subject: cleanText(document.company.company_slogan ?? "Quote document", fonts),
    },
  });

  const chunks: Buffer[] = [];
  pdf.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));

    drawPageHeader(pdf, fonts, document, logoBuffer);

    const cardsY = pdf.y + 6;
    const cardWidth = (CONTENT_WIDTH - 12) / 2;

    const companyHeight = drawPartyCard(
      pdf,
      fonts,
      "Firma Bilgileri (Company)",
      [
        ["Ticari Unvan", document.company.legal_name || document.company.name],
        ["Vergi Dairesi", document.company.tax_office],
        ["Vergi No", document.company.tax_number],
        ["MERSİS / Tic. Sicil", [document.company.trade_registry_number, document.company.mersis_number].filter(Boolean).join(" / ")],
        ["Telefon", [document.company.phone, document.company.secondary_phone].filter(Boolean).join(" / ")],
        ["E-posta / Web", [document.company.email, document.company.website].filter(Boolean).join(" / ")],
        ["Adres", [document.company.address_line_1, document.company.address_line_2, document.company.district, document.company.city].filter(Boolean).join(", ")],
      ],
      PAGE_MARGIN,
      cardsY,
      cardWidth,
    );

    const recipientHeight = drawPartyCard(
      pdf,
      fonts,
      "Müşteri Bilgileri (Recipient)",
      document.recipient.type === "none"
        ? [["Durum", "Müşteri bilgisi belirtilmedi"]]
        : [
            ["Muhatap", document.recipient.name],
            ["Firma", document.recipient.company],
            ["E-posta", document.recipient.email],
            ["Telefon", document.recipient.phone],
            ["Şehir", document.recipient.city],
          ],
      PAGE_MARGIN + cardWidth + 12,
      cardsY,
      cardWidth,
    );

    const firstRowHeight = Math.max(companyHeight, recipientHeight);
    const bankY = cardsY + firstRowHeight + 8;
    const bankCardHeight = drawBankAndWarrantyCard(
      pdf,
      fonts,
      document,
      PAGE_MARGIN,
      bankY,
      CONTENT_WIDTH,
    );

    pdf.y = bankY + bankCardHeight + 12;
    ensureSpace(pdf, 44, fonts, document, logoBuffer);
    drawItemTableHeader(pdf, fonts);

    for (const item of document.items) {
      drawItemRow(pdf, fonts, document, item, logoBuffer);
      if (pdf.y + 8 > PAGE_HEIGHT - PAGE_MARGIN - 28) {
        pdf.addPage({ size: "A4", margin: PAGE_MARGIN });
        drawPageHeader(pdf, fonts, document, logoBuffer);
        drawItemTableHeader(pdf, fonts);
      }
    }

    drawTotals(pdf, fonts, document, logoBuffer);
    drawNotesAndTerms(pdf, fonts, document, logoBuffer);
    drawSignature(pdf, fonts, document, logoBuffer);

    const pages = pdf.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      pdf.switchToPage(index);
      drawFooter(pdf, fonts, document, index + 1, pages.count);
    }

    pdf.end();
  });

  return buffer;
}

export async function buildQuotePdfResponse(document: QuoteDocumentModel) {
  const buffer = await renderQuotePdfBuffer(document);
  const fileName = buildQuotePdfFileName(document.quote_number);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
