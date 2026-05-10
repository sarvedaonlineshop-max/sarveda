/** INR rupees → paise (integer). */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** USD dollars → cents. */
export function toUsdCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** GBP pounds → pence. */
export function toGbpPence(pounds: number): number {
  return Math.round(pounds * 100);
}

export function parseDecimal(raw: string | undefined | null): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
