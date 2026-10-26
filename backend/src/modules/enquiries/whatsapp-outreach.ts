/** First name for outreach template {{1}}. Falls back to "there" when the stored name is missing or just the number. */
export function outreachCustomerFirstName(
  customerName: string | null | undefined,
  waPhone?: string | null
): string {
  const trimmed = customerName?.trim();
  if (!trimmed) return "there";
  if (waPhone && trimmed === waPhone) return "there";
  return trimmed.split(/\s+/)[0] || "there";
}

export type OutreachMediaKind = "image" | "video" | "document";

/** Map an attachment to the WhatsApp media-header template kind. */
export function outreachMediaKind(mimeType: string, fileName = ""): OutreachMediaKind {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (
    mime === "video/mp4" ||
    mime === "video/3gpp" ||
    name.endsWith(".mp4") ||
    name.endsWith(".3gp")
  ) {
    return "video";
  }
  return "document";
}

/**
 * Closed-window media template names.
 * Image uses a Utility follow-up template (name + enquiry/order ref — not a free sales caption).
 */
export function outreachMediaTemplateName(kind: OutreachMediaKind): string {
  const fromEnv =
    kind === "image"
      ? process.env.WHATSAPP_ADMIN_OUTREACH_IMAGE_TEMPLATE
      : kind === "video"
        ? process.env.WHATSAPP_ADMIN_OUTREACH_VIDEO_TEMPLATE
        : process.env.WHATSAPP_ADMIN_OUTREACH_DOCUMENT_TEMPLATE;
  if (fromEnv?.trim()) return fromEnv.trim();
  if (kind === "image") return "enquiry_followup_image";
  if (kind === "video") return "sarveda_support_outreach_video";
  return "sarveda_support_outreach_document";
}

/** {{2}} for the utility image template — keep this a reference, not a promo pitch. */
export function enquiryFollowUpRef(thread: {
  orderNumber?: string | null;
  customSubject?: string | null;
}): string {
  const order = thread.orderNumber?.trim();
  if (order) return `order ${order}`.slice(0, 60);
  const subject = thread.customSubject?.trim();
  if (subject) return subject.slice(0, 60);
  return "your enquiry";
}
