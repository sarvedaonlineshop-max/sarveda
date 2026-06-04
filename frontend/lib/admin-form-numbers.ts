/** Keep only non-negative decimal input for admin money/qty fields. */
export function sanitizeNonNegativeInput(raw: string, allowDecimal = true): string {
  let s = raw.replace(/[^\d.]/g, "");
  if (!allowDecimal) s = s.replace(/\./g, "");
  const parts = s.split(".");
  if (parts.length > 2) s = `${parts[0]}.${parts.slice(1).join("")}`;
  return s;
}

export function parseNonNegativeNumber(raw: string, allowDecimal = true): number | null {
  const s = sanitizeNonNegativeInput(raw, allowDecimal).trim();
  if (!s || s === ".") return null;
  const n = allowDecimal ? parseFloat(s) : parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
