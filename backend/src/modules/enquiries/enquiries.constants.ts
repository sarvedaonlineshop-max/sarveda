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
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
