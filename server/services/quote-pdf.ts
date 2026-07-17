import fs from "node:fs";

import PDFDocument from "pdfkit";

import { buildQuotePdfFileName, type QuoteDocumentModel } from "@/server/services/quote-document";

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

function setFont(pdf: PDFKit.PDFDocument, fonts: PdfFonts, weight: "regular" | "bold" = "regular") {
  const fontPath = weight === "bold" ? fonts.bold : fonts.regular;
  if (fontPath) {
    pdf.font(fontPath);
    return;
  }

  pdf.font(weight === "bold" ? "Helvetica-Bold" : "Helvetica");
}

function ensureSpace(pdf: PDFKit.PDFDocument, minHeight: number, fonts: PdfFonts, document?: QuoteDocumentModel) {
  if (pdf.y + minHeight <= PAGE_HEIGHT - PAGE_MARGIN - 18) {
    return;
  }

  pdf.addPage({ size: "A4", margin: PAGE_MARGIN });
  drawPageHeader(pdf, fonts, document);
}

function drawKeyValue(pdf: PDFKit.PDFDocument, fonts: PdfFonts, label: string, value: string, x: number, y: number, width: number) {
  setFont(pdf, fonts, "regular");
  pdf.fontSize(8.5).fillColor("#64748b").text(label, x, y, { width, continued: false });
  const valueY = y + 11;
  setFont(pdf, fonts, "bold");
  pdf.fontSize(9.5).fillColor("#0f172a").text(value || "-", x, valueY, { width, continued: false });
}

function drawPageHeader(pdf: PDFKit.PDFDocument, fonts: PdfFonts, document?: QuoteDocumentModel) {
  const topY = PAGE_MARGIN;

  setFont(pdf, fonts, "bold");
  pdf.fontSize(18).fillColor("#0f172a").text(document?.company.name ?? "Quote", PAGE_MARGIN, topY, { width: CONTENT_WIDTH * 0.55 });
  setFont(pdf, fonts, "regular");
  pdf.fontSize(8.5).fillColor("#64748b").text(document?.company.company_slogan ?? "Branded quote document", PAGE_MARGIN, topY + 22, {
    width: CONTENT_WIDTH * 0.55,
  });

  if (document) {
    const headerX = PAGE_MARGIN + CONTENT_WIDTH * 0.58;
    drawKeyValue(pdf, fonts, "Quote number", document.quote_number, headerX, topY, CONTENT_WIDTH * 0.42);
    drawKeyValue(pdf, fonts, "Status", document.status_label, headerX, topY + 28, CONTENT_WIDTH * 0.42);
    drawKeyValue(pdf, fonts, "Issue date", document.issue_date, headerX, topY + 56, CONTENT_WIDTH * 0.42);
  }

  pdf.moveTo(PAGE_MARGIN, topY + 84).lineTo(PAGE_MARGIN + CONTENT_WIDTH, topY + 84).lineWidth(0.8).strokeColor("#cbd5e1").stroke();
  pdf.y = topY + 94;
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
  const visibleLineCount = lines.filter(([, value]) => formatText(value).length > 0).length;
  const boxHeight = Math.max(86, 34 + visibleLineCount * 12 + 10);
  pdf.roundedRect(x, y, width, boxHeight, 12).fillAndStroke("#ffffff", "#e2e8f0");
  setFont(pdf, fonts, "bold");
  pdf.fontSize(9.2).fillColor("#0f172a").text(title, x + 12, y + 10, { width: width - 24 });
  let currentY = y + 26;
  for (const [label, value] of lines) {
    if (!formatText(value)) {
      continue;
    }

    setFont(pdf, fonts, "regular");
    pdf.fontSize(8.2).fillColor("#64748b").text(`${label}:`, x + 12, currentY, { width: width - 24 });
    setFont(pdf, fonts, "regular");
    pdf.fontSize(8.6).fillColor("#0f172a").text(formatText(value), x + 58, currentY, { width: width - 70 });
    currentY += 12;
  }

  return boxHeight;
}

function drawMetaCard(pdf: PDFKit.PDFDocument, fonts: PdfFonts, document: QuoteDocumentModel) {
  const x = PAGE_MARGIN + CONTENT_WIDTH * 0.62;
  const width = CONTENT_WIDTH * 0.38;
  const y = pdf.y;

  pdf.roundedRect(x, y, width, 96, 12).fillAndStroke("#f8fafc", "#e2e8f0");
  setFont(pdf, fonts, "bold");
  pdf.fontSize(9.2).fillColor("#0f172a").text("Quote metadata", x + 12, y + 10, { width: width - 24 });

  const rows: Array<[string, string]> = [
    ["Valid until", document.valid_until],
    ["Currency", document.currency],
    ["Record mode", document.recordMode === "demo" ? "Demo" : "Live"],
    ["Updated", document.updated_at || "-"],
  ];

  let currentY = y + 28;
  for (const [label, value] of rows) {
    drawKeyValue(pdf, fonts, label, value, x + 12, currentY, width - 24);
    currentY += 20;
  }
}

function drawItemTableHeader(pdf: PDFKit.PDFDocument, fonts: PdfFonts) {
  const headerY = pdf.y;
  const columns = [
    { label: "#", width: 16 },
    { label: "Line", width: 202 },
    { label: "Qty", width: 34 },
    { label: "Unit", width: 40 },
    { label: "Price", width: 70 },
    { label: "Discount", width: 64 },
    { label: "Tax", width: 52 },
    { label: "Total", width: 61 },
  ];

  pdf.rect(PAGE_MARGIN, headerY, CONTENT_WIDTH, 20).fillAndStroke("#f8fafc", "#e2e8f0");
  let x = PAGE_MARGIN;
  setFont(pdf, fonts, "bold");
  pdf.fontSize(TABLE_HEADER_FONT_SIZE).fillColor("#64748b");
  for (const column of columns) {
    pdf.text(column.label, x + 4, headerY + 6, { width: column.width - 8, align: "left" });
    x += column.width;
  }

  pdf.y = headerY + 20;
  return columns;
}

function drawItemRow(pdf: PDFKit.PDFDocument, fonts: PdfFonts, document: QuoteDocumentModel, item: QuoteDocumentModel["items"][number]) {
  const columns = [
    { width: 16, align: "left" as const },
    { width: 202, align: "left" as const },
    { width: 34, align: "center" as const },
    { width: 40, align: "left" as const },
    { width: 70, align: "right" as const },
    { width: 64, align: "right" as const },
    { width: 52, align: "right" as const },
    { width: 61, align: "right" as const },
  ];

  const detailText = `${item.name}\n${item.description || "Manual line"}${item.sku ? `\nSKU: ${item.sku}` : ""}`;
  const detailHeight = pdf.heightOfString(detailText, { width: columns[1].width - 8, lineGap: 1.5, align: "left" });
  const rowHeight = Math.max(24, detailHeight + 10);

  ensureSpace(pdf, rowHeight + 12, fonts, document);

  const startY = pdf.y;
  pdf.rect(PAGE_MARGIN, startY, CONTENT_WIDTH, rowHeight).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
  let x = PAGE_MARGIN;
  const values = [
    String(item.index),
    detailText,
    String(Number.isFinite(item.quantity) ? item.quantity : 0),
    item.unit,
    formatMoney(document.currency, item.unit_price),
    item.discount,
    item.tax,
    formatMoney(document.currency, item.line_total),
  ];

  values.forEach((value, index) => {
    const col = columns[index];
    pdf.save();
    pdf.rect(x, startY, col.width, rowHeight).clip();
    setFont(pdf, fonts, index === 1 || index === 7 ? "bold" : "regular");
    pdf.fontSize(TABLE_ROW_FONT_SIZE).fillColor("#0f172a").text(value, x + 4, startY + 5, {
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

function drawTotals(pdf: PDFKit.PDFDocument, fonts: PdfFonts, document: QuoteDocumentModel) {
  ensureSpace(pdf, 140, fonts, document);
  const y = pdf.y + 8;
  const width = 210;
  const x = PAGE_MARGIN + CONTENT_WIDTH - width;

  pdf.roundedRect(x, y, width, 128, 12).fillAndStroke("#ffffff", "#e2e8f0");
  setFont(pdf, fonts, "bold");
  pdf.fontSize(10).fillColor("#0f172a").text("Totals", x + 12, y + 10, { width: width - 24 });

  const rows: Array<[string, number]> = [
    ["Subtotal", document.subtotal],
    ["Line discounts", document.line_discount_total],
    ["Order discount", document.order_discount_total],
    ["Shipping", document.shipping_total],
    ["Taxable subtotal", document.taxable_subtotal],
    ["Tax total", document.tax_total],
  ];

  let currentY = y + 28;
  for (const [label, value] of rows) {
    setFont(pdf, fonts, "regular");
    pdf.fontSize(8.5).fillColor("#64748b").text(label, x + 12, currentY, { width: 104 });
    pdf.fontSize(8.7).fillColor("#0f172a").text(formatMoney(document.currency, value), x + 118, currentY, {
      width: 80,
      align: "right",
    });
    currentY += 15;
  }

  pdf.moveTo(x + 12, currentY + 3).lineTo(x + width - 12, currentY + 3).strokeColor("#e2e8f0").stroke();
  setFont(pdf, fonts, "bold");
  pdf.fontSize(10.2).fillColor("#0f172a").text("Grand total", x + 12, currentY + 8, { width: 104 });
  pdf.fontSize(10.2).text(formatMoney(document.currency, document.grand_total), x + 118, currentY + 8, {
    width: 80,
    align: "right",
  });
  pdf.y = y + 136;
}

function drawNotesAndTerms(pdf: PDFKit.PDFDocument, fonts: PdfFonts, document: QuoteDocumentModel) {
  const sectionHeight = 92;
  ensureSpace(pdf, sectionHeight + 20, fonts, document);
  const y = pdf.y + 10;
  const boxWidth = (CONTENT_WIDTH - 10) / 2;

  const renderBox = (x: number, title: string, value: string) => {
    pdf.roundedRect(x, y, boxWidth, 92, 12).fillAndStroke("#ffffff", "#e2e8f0");
    setFont(pdf, fonts, "bold");
    pdf.fontSize(9.2).fillColor("#0f172a").text(title, x + 12, y + 10, { width: boxWidth - 24 });
    setFont(pdf, fonts, "regular");
    pdf.fontSize(8.6).fillColor("#334155").text(value || "Not specified", x + 12, y + 28, {
      width: boxWidth - 24,
      lineGap: 2.5,
    });
  };

  renderBox(PAGE_MARGIN, "Notes", document.notes || "No notes provided.");
  renderBox(
    PAGE_MARGIN + boxWidth + 10,
    "Payment and delivery",
    `Payment terms: ${document.payment_terms || "Not specified"}\nDelivery terms: ${document.delivery_terms || "Not specified"}`,
  );
  pdf.y = y + 102;
}

function drawSignature(pdf: PDFKit.PDFDocument, fonts: PdfFonts, document: QuoteDocumentModel) {
  ensureSpace(pdf, 90, fonts);
  const y = pdf.y + 10;
  const width = CONTENT_WIDTH;
  pdf.roundedRect(PAGE_MARGIN, y, width, 80, 12).fillAndStroke("#ffffff", "#e2e8f0");
  setFont(pdf, fonts, "bold");
  pdf.fontSize(9.2).fillColor("#0f172a").text("Signature / approval", PAGE_MARGIN + 12, y + 10, { width: width - 24 });
  pdf.moveTo(PAGE_MARGIN + 12, y + 52).lineTo(PAGE_MARGIN + width - 12, y + 52).strokeColor("#cbd5e0").stroke();
  setFont(pdf, fonts, "regular");
  const signer = document.company.signature_name || "Authorized signatory";
  const signerTitle = document.company.signature_title ? `, ${document.company.signature_title}` : "";
  pdf.fontSize(8.6).fillColor("#64748b").text(`${signer}${signerTitle}`, PAGE_MARGIN + 12, y + 58, { width: width - 24 });
  pdf.y = y + 92;
}

function drawFooter(pdf: PDFKit.PDFDocument, fonts: PdfFonts, document: QuoteDocumentModel, pageNumber: number, totalPages: number) {
  const footerY = PAGE_HEIGHT - PAGE_MARGIN + 2;
  pdf.moveTo(PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN - 8).lineTo(PAGE_MARGIN + CONTENT_WIDTH, PAGE_HEIGHT - PAGE_MARGIN - 8).strokeColor("#e2e8f0").stroke();
  setFont(pdf, fonts, "regular");
  const footerText = document.company.quote_footer_text
    ? `${document.company.name} - ${document.company.quote_footer_text}`
    : `${document.company.name} - ${document.quote_number}`;
  pdf.fontSize(7.8).fillColor("#64748b").text(footerText, PAGE_MARGIN, footerY, { width: CONTENT_WIDTH * 0.7 });
  pdf.text(`Page ${pageNumber} of ${totalPages}`, PAGE_MARGIN, footerY, { width: CONTENT_WIDTH, align: "right" });
}

export async function renderQuotePdfBuffer(document: QuoteDocumentModel) {
  const fonts = resolveFonts();
  const pdf = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: `${document.company.name} quote ${document.quote_number}`,
      Author: document.company.name,
      Subject: document.company.company_slogan ?? "Quote document",
    },
  });

  const chunks: Buffer[] = [];
  pdf.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));

    drawPageHeader(pdf, fonts, document);

    const companyAndRecipientY = pdf.y + 14;
    const companyCardHeight = drawPartyCard(
      pdf,
      fonts,
      "Company",
      [
        ["Name", document.company.name],
        ["Legal name", document.company.legal_name],
        ["Website", document.company.website],
        ["Email", document.company.email],
        ["Phone", document.company.phone],
        ["Address", [document.company.address_line_1, document.company.address_line_2].filter(Boolean).join(", ")],
        ["City", [document.company.district, document.company.city, document.company.country].filter(Boolean).join(", ")],
        ["Tax office", document.company.tax_office],
        ["Tax number", document.company.tax_number],
        ["Workspace", document.company.slug],
        ["Currency", document.company.currency],
      ],
      PAGE_MARGIN,
      companyAndRecipientY,
      CONTENT_WIDTH * 0.58 - 4,
    );

    drawMetaCard(pdf, fonts, document);

    const recipientY = companyAndRecipientY + Math.max(companyCardHeight, 96) + 14;
    drawPartyCard(
      pdf,
      fonts,
      "Recipient",
      document.recipient.type === "none"
        ? [["Status", "No recipient information"]]
        : [
            [document.recipient.type === "customer" ? "Customer" : "Lead", document.recipient.name],
            ["Company", document.recipient.company],
            ["Email", document.recipient.email],
            ["Phone", document.recipient.phone],
            ["City", document.recipient.city],
          ],
      PAGE_MARGIN,
      recipientY,
      CONTENT_WIDTH * 0.58 - 4,
    );

    pdf.y = Math.max(recipientY + 100, pdf.y + 12);
    ensureSpace(pdf, 40, fonts, document);
    drawItemTableHeader(pdf, fonts);
    for (const item of document.items) {
      drawItemRow(pdf, fonts, document, item);
      if (pdf.y + 8 > PAGE_HEIGHT - PAGE_MARGIN - 28) {
        pdf.addPage({ size: "A4", margin: PAGE_MARGIN });
        drawPageHeader(pdf, fonts, document);
        drawItemTableHeader(pdf, fonts);
      }
    }

    drawTotals(pdf, fonts, document);
    drawNotesAndTerms(pdf, fonts, document);
    drawSignature(pdf, fonts, document);

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
