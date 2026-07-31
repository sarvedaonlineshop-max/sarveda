/**
 * Single customer-facing WhatsApp / mobile number for Sarveda.
 * Always driven by EXOTEL_WHATSAPP_FROM so one .env change updates emails, invoices, and links.
 */

export type CustomerWhatsAppContact = {
  /** Original env value, e.g. +919972238158 */
  raw: string;
  /** Digits only for wa.me, e.g. 919972238158 */
  e164Digits: string;
  /** Human display, e.g. +91 99722 38158 */
  displayPhone: string;
  /** https://wa.me/919972238158 */
  waLink: string;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function toWaDigits(digits: string): string {
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
}

function formatDisplayPhone(waDigits: string, fallbackRaw: string): string {
  if (waDigits.length === 12 && waDigits.startsWith("91")) {
    return `+91 ${waDigits.slice(2, 7)} ${waDigits.slice(7)}`;
  }
  if (waDigits.length === 10) {
    return `+91 ${waDigits.slice(0, 5)} ${waDigits.slice(5)}`;
  }
  if (fallbackRaw.startsWith("+")) return fallbackRaw;
  return waDigits ? `+${waDigits}` : fallbackRaw;
}

/**
 * Customer WhatsApp / mobile from EXOTEL_WHATSAPP_FROM.
 * Returns null if unset (caller should omit phone lines).
 */
export function resolveCustomerWhatsApp(): CustomerWhatsAppContact | null {
  const raw = process.env.EXOTEL_WHATSAPP_FROM?.trim() || "";
  if (!raw) return null;

  const e164Digits = toWaDigits(digitsOnly(raw));
  if (e164Digits.length < 10) return null;

  return {
    raw,
    e164Digits,
    displayPhone: formatDisplayPhone(e164Digits, raw),
    waLink: `https://wa.me/${e164Digits}`
  };
}

/** Care / support inbox for customers (email only). */
export function resolveSupportContactEmail(): string {
  return (
    process.env.SUPPORT_CONTACT_EMAIL?.trim() ||
    process.env.SELLER_EMAIL?.trim() ||
    process.env.ZEPTOMAIL_FROM_EMAIL?.trim() ||
    "care@sarveda.com"
  );
}
