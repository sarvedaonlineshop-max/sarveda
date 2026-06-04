export const TAX_CLASS_OPTIONS = [
  { value: "standard", label: "18% GST (standard)" },
  { value: "gst12", label: "12% GST" },
  { value: "gst-5", label: "5% GST" },
  { value: "gst-zero-rate", label: "0% GST" }
] as const;

/** Map legacy Woo `gst18` → canonical `standard` for the admin dropdown. */
export function taxClassForForm(taxClass: string | null | undefined): string {
  const t = (taxClass ?? "standard").trim().toLowerCase();
  return t === "gst18" ? "standard" : t;
}
