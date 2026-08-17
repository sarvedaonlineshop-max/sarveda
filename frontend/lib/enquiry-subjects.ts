export const ENQUIRY_SUBJECT_OPTIONS = [
  { value: "ORDER", label: "Order related issues" },
  { value: "PAYMENT", label: "Payment related issues" },
  { value: "COURSE", label: "Course enquiry" },
  { value: "CORPORATE", label: "Corporate wellness enquiry" },
  { value: "OTHER", label: "Other" }
] as const;

export type EnquirySubjectValue = (typeof ENQUIRY_SUBJECT_OPTIONS)[number]["value"];

/** Default “What is this about?” when the URL does not set a topic. */
export const DEFAULT_ENQUIRY_SUBJECT: EnquirySubjectValue = "ORDER";

export type EnquirySource =
  | "CONTACT"
  | "CORPORATE"
  | "COURSE"
  | "EVENT"
  | "INSIGHTS"
  | "WHATSAPP";

export const ENQUIRY_SOURCE_LABELS: Record<EnquirySource, string> = {
  CONTACT: "Contact",
  CORPORATE: "Corporate wellness",
  COURSE: "Course",
  EVENT: "Event",
  INSIGHTS: "Insights",
  WHATSAPP: "WhatsApp"
};

export const ACCEPTED_ENQUIRY_FILE_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,video/mp4,video/quicktime,video/webm,video/x-msvideo,video/mpeg,audio/mpeg,audio/mp4,audio/wav,.mp4,.mov,.webm,.avi,.mpeg,.mpg,.mp3,.m4a,.wav";
