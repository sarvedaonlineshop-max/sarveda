/** Canonical Woo → Sarveda tax class slugs (DB + invoices). */
export const TAX_CLASS_OPTIONS = [
  { value: "standard", label: "18% GST (standard)" },
  { value: "gst12", label: "12% GST" },
  { value: "gst-5", label: "5% GST" },
  { value: "gst-zero-rate", label: "0% GST" }
] as const;

/** WooCommerce used both `standard` and `gst18` for 18% — store one canonical slug. */
export function normalizeTaxClass(taxClass: string | null | undefined): string {
  const t = (taxClass ?? "standard").trim().toLowerCase();
  if (t === "gst18") return "standard";
  if (TAX_CLASS_OPTIONS.some((o) => o.value === t)) return t;
  return "standard";
}

export function taxClassForDisplay(taxClass: string | null | undefined): string {
  return normalizeTaxClass(taxClass);
}
