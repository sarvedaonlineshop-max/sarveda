/** Merchandise ceiling for a return-case line = proportional share of line total by qtySelected. */
export function caseMerchandiseCeilingPaise(
  lineTotalInPaise: number,
  qtyOrdered: number,
  qtySelected: number,
  alreadyRefundedInPaise = 0
): number {
  if (qtyOrdered <= 0 || qtySelected <= 0) return 0;
  const full = Math.round((lineTotalInPaise * Math.min(qtySelected, qtyOrdered)) / qtyOrdered);
  return Math.max(0, full - alreadyRefundedInPaise);
}
