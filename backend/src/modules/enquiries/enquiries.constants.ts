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
  INSIGHTS: "Insights"
};

export const SUBJECT_LABELS: Record<EnquirySubjectCategory, string> = {
  ORDER: "Order related",
  PAYMENT: "Payment related",
  COURSE: "Course enquiry",
  CORPORATE: "Corporate wellness",
  OTHER: "Other"
};

export const ALLOWED_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
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
