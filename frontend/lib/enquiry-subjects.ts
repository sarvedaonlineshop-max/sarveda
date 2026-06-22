export const ENQUIRY_SUBJECT_OPTIONS = [
  { value: "ORDER", label: "Order related issues" },
  { value: "PAYMENT", label: "Payment related issues" },
  { value: "COURSE", label: "Course enquiry" },
  { value: "CORPORATE", label: "Corporate wellness enquiry" },
  { value: "OTHER", label: "Other" }
] as const;

export type EnquirySubjectValue = (typeof ENQUIRY_SUBJECT_OPTIONS)[number]["value"];

export type EnquirySource =
  | "CONTACT"
  | "CORPORATE"
  | "COURSE"
  | "EVENT"
  | "INSIGHTS";

export const ENQUIRY_SOURCE_LABELS: Record<EnquirySource, string> = {
  CONTACT: "Contact",
  CORPORATE: "Corporate wellness",
  COURSE: "Course",
  EVENT: "Event",
  INSIGHTS: "Insights"
};

export const ACCEPTED_ENQUIRY_FILE_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx";
