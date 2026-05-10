/** Format integer paise as INR for display (GST-inclusive prices in DB). */
export function formatINRFromPaise(paise: number | null | undefined): string {
  if (paise == null || Number.isNaN(paise)) {
    return "—";
  }
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}
