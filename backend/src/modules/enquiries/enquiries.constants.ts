import type { EnquirySource, EnquirySubjectCategory } from "@prisma/client";

export const CARE_INBOX_EMAIL =
  process.env.SUPPORT_CONTACT_EMAIL?.trim() ||
  process.env.CORPORATE_CONTACT_EMAIL?.trim() ||
  process.env.ENQUIRY_CONTACT_EMAIL?.trim() ||
  "care@sarveda.com";

export const SOURCE_LABELS: Record<EnquirySource, string> = {
  CONTACT: "Contact form",
  CORPORATE: "Corporate wellness",
  COURSE: "Course enquiry",
  EVENT: "Event enquiry",
  INSIGHTS: "Insights",
  WHATSAPP: "WhatsApp"
};

export const SUBJECT_LABELS: Record<EnquirySubjectCategory, string> = {
  ORDER: "Order related",
  PAYMENT: "Payment related",
  PRODUCT: "Product / bulk enquiry",
  COURSE: "Course enquiry",
  CORPORATE: "Corporate wellness",
  OTHER: "Other"
};

export const ALLOWED_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/mpeg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav"
]);

export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_MB = 25;

/**
 * S3 key prefix for enquiry / WhatsApp chat media.
 * Must stay under `media/` — the sarveda-media bucket policy only allows
 * anonymous GetObject for `media/*`. Keys under bare `enquiries/` upload fine
 * but return 403 publicly, so admin UI previews break and WhatsApp/Exotel
 * cannot fetch the link to deliver the media.
 */
export const ENQUIRY_MEDIA_S3_PREFIX = "media/enquiries";
