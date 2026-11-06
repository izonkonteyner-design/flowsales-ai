import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { canManageQuotes } from "@/server/services/quote-domain";
import { getQuoteDocumentData, buildQuotePdfFileName } from "@/server/services/quote-document";
import { renderQuotePdfBuffer } from "@/server/services/quote-pdf";
import { updateQuoteStatusRecord } from "@/server/services/quotes";
import { listEmailConnections, sendEmailWithAttachment } from "@/server/services/integrations/email-service";

export async function sendQuoteByEmail(quoteId: string) {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") throw new Error("Teklif gönderimi canlı çalışma alanı gerektirir.");
  if (!canManageQuotes(context.role)) throw new Error("Teklif göndermek için yetkiniz yok.");

  const documentResult = await getQuoteDocumentData(quoteId);
  if (!documentResult.ok) throw new Error(documentResult.message);
  const document = documentResult.document;

  const recipientEmail = document.recipient.email;
  if (!recipientEmail) throw new Error("Müşterinin/lead'in kayıtlı bir e-posta adresi yok, teklif otomatik gönderilemedi.");

  const connections = await listEmailConnections(context.organization.id);
  const connection = connections.find((item) => item.status === "connected");
  if (!connection) throw new Error("Teklif göndermek için önce Ayarlar > E-posta bölümünden bir hesap bağlayın.");

  const pdfBuffer = await renderQuotePdfBuffer(document);
  const fileName = buildQuotePdfFileName(document.quote_number);

  await sendEmailWithAttachment({
    organizationId: context.organization.id,
    connectionId: connection.id,
    to: recipientEmail,
    subject: `${document.company.name} - Teklif ${document.quote_number}`,
    body: `Sayın ${document.recipient.name || "Yetkili"},\n\n${document.company.name} tarafından hazırlanan ${document.quote_number} numaralı teklifiniz ekte yer almaktadır.\n\nSorularınız için bize ulaşabilirsiniz.\n\nSaygılarımızla,\n${document.company.name}`,
    attachment: { fileName, contentType: "application/pdf", data: pdfBuffer },
  });

  const result = await updateQuoteStatusRecord(quoteId, "sent");
  const leadId = (result.quote as { lead_id?: string | null }).lead_id;
  if (leadId) {
    const admin = createSupabaseAdminClient();
    await admin.from("activities").insert({
      organization_id: context.organization.id,
      lead_id: leadId,
      type: "quote_sent",
      title: "Teklif e-posta ile gönderildi",
      detail: `${document.quote_number} numaralı teklif ${recipientEmail} adresine gönderildi.`,
    });
    await admin.from("leads").update({ status: "quote_sent" }).eq("id", leadId).eq("organization_id", context.organization.id);
  }

  return { quote: result.quote, sentTo: recipientEmail };
}
