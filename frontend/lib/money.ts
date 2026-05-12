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

export function discountPercentOff(mrpInPaise: number, saleInPaise: number): number | null {
  if (mrpInPaise <= saleInPaise || mrpInPaise <= 0) return null;
  return Math.round(((mrpInPaise - saleInPaise) / mrpInPaise) * 100);
}

export function savingsInPaise(mrpInPaise: number, saleInPaise: number): number {
  return Math.max(0, mrpInPaise - saleInPaise);
}
