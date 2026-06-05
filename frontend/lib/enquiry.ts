/** Sarveda official WhatsApp: +91 95359 75075 */
export const SARVEDA_WHATSAPP_E164 = "919535975075";

const DEFAULT_EMAIL = "care@sarveda.com";

export function enquiryEmail(): string {
  return process.env.NEXT_PUBLIC_ENQUIRY_EMAIL?.trim() || DEFAULT_EMAIL;
}

export function enquiryWhatsAppE164(): string {
  const raw =
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() ||
    process.env.NEXT_PUBLIC_ENQUIRY_WHATSAPP?.trim() ||
    SARVEDA_WHATSAPP_E164;
  return raw.replace(/\D/g, "");
}

export function buildCourseEnquiryMessage(courseTitle: string): string {
  return `Hi, Im trying to join the ${courseTitle} course, I have some queries regarding the same , please clarify me`;
}

export function buildEnquiryWhatsAppUrl(courseTitle: string, _courseUrl?: string): string {
  const text = encodeURIComponent(buildCourseEnquiryMessage(courseTitle));
  return `https://wa.me/${enquiryWhatsAppE164()}?text=${text}`;
}

/** @deprecated Use submitCourseEnquiry API from course page email form. */
export function buildEnquiryMailto(courseTitle: string, courseUrl: string): string {
  const subject = encodeURIComponent(`Course enquiry: ${courseTitle}`);
  const body = encodeURIComponent(`${buildCourseEnquiryMessage(courseTitle)}\n\n${courseUrl}`);
  return `mailto:${enquiryEmail()}?subject=${subject}&body=${body}`;
}

export function whatsAppSiteUrl(): string {
  return `https://wa.me/${enquiryWhatsAppE164()}`;
}
