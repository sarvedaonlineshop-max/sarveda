/** WooCommerce / Sarveda store reporting timezone (India). */
const KOLKATA = "Asia/Kolkata";

/** Start of calendar day in Asia/Kolkata as a UTC instant. */
export function startOfDayKolkata(ref: Date = new Date()): Date {
  const ymd = ref.toLocaleDateString("en-CA", { timeZone: KOLKATA });
  return new Date(`${ymd}T00:00:00+05:30`);
}

export function addDaysInstant(start: Date, days: number): Date {
  return new Date(start.getTime() + days * 86_400_000);
}

/** First moment of calendar month in Asia/Kolkata. */
export function startOfMonthKolkata(ref: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return new Date(`${y}-${m}-01T00:00:00+05:30`);
}

/** Month key YYYY-MM in Kolkata for grouping. */
export function monthKeyKolkata(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(d);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

/** Date key YYYY-MM-DD in Kolkata. */
export function dateKeyKolkata(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: KOLKATA });
}
