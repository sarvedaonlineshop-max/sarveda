const DEFAULT_EMAIL = "care@sarveda.com";
const DEFAULT_WHATSAPP = "919531975075";

export function enquiryEmail(): string {
  return process.env.NEXT_PUBLIC_ENQUIRY_EMAIL?.trim() || DEFAULT_EMAIL;
}

export function enquiryWhatsAppE164(): string {
  const raw = process.env.NEXT_PUBLIC_ENQUIRY_WHATSAPP?.trim() || DEFAULT_WHATSAPP;
  return raw.replace(/\D/g, "");
}

export function buildEnquiryMailto(courseTitle: string, courseUrl: string): string {
  const subject = encodeURIComponent(`Course enquiry: ${courseTitle}`);
  const body = encodeURIComponent(
    `Hello Sarveda team,\n\nI would like to know more about: ${courseTitle}\n${courseUrl}\n\nThank you.`
  );
  return `mailto:${enquiryEmail()}?subject=${subject}&body=${body}`;
}

export function buildEnquiryWhatsAppUrl(courseTitle: string, courseUrl: string): string {
  const text = encodeURIComponent(
    `Hello Sarveda, I would like to enquire about: ${courseTitle} — ${courseUrl}`
  );
  return `https://wa.me/${enquiryWhatsAppE164()}?text=${text}`;
}
