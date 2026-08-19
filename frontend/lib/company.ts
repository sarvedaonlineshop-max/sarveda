/**
 * Public company identity shown on the storefront.
 * Mirrors backend invoice / seller defaults where applicable.
 */
export const COMPANY_LEGAL_NAME =
  process.env.NEXT_PUBLIC_SELLER_LEGAL_NAME?.trim() || "Sarveda Life Private Limited";

export const COMPANY_WAREHOUSE_ADDRESS =
  process.env.NEXT_PUBLIC_SELLER_WAREHOUSE_ADDRESS?.trim() ||
  "Sarveda Life Private Limited, 5th Cross, Basaveshwara Nagar, Near Lions Community Hall Road, Kollegal, Karnataka Pin Code: 571440 India";

export const COMPANY_REGISTERED_ADDRESS =
  process.env.NEXT_PUBLIC_SELLER_REGISTERED_ADDRESS?.trim() ||
  "A2/403, Purva Atria RMV 2nd Stage, 1st Block Bangalore, Karnataka Pin Code: 560094 India";

/** Sales / tracking / bulk enquiry WhatsApp (live site contact page). */
export const COMPANY_SALES_WHATSAPP_E164 =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_NUMBER?.replace(/\D/g, "") || "919535975075";

export function companySalesWhatsAppDisplay(): string {
  const digits = COMPANY_SALES_WHATSAPP_E164.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return `+${digits}`;
}

export function companySalesWhatsAppUrl(text = "Hi Sarveda, I have a query."): string {
  return `https://wa.me/${COMPANY_SALES_WHATSAPP_E164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
