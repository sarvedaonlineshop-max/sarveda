/**
 * Discount allocation for ORDER_PAID journals.
 *
 * Native accounting uses paise-accurate allocation on lineTotalInPaise (Phase 2B).
 * Zoho uses unitPrice × qty weights and round2 unit rates — parity helpers mirror
 * zoho-invoices.ts lineRatesAfterOrderDiscount for reconciliation tests only.
 */

export type DiscountAllocationLine = {
  lineTotalInPaise: number;
  unitPriceInPaise: number;
  qtyOrdered: number;
};

export type DiscountAllocationResult = {
  lineDiscountsPaise: number[];
  totalAllocatedPaise: number;
};

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Paise-accurate pro-rata allocation (remainder on last line). */
export function allocateOrderDiscountPaise(
  items: DiscountAllocationLine[],
  discountInPaise: number
): DiscountAllocationResult {
  const grossTotal = items.reduce((sum, item) => sum + item.lineTotalInPaise, 0);
  const totalDiscount = Math.min(Math.max(0, discountInPaise), grossTotal);

  if (totalDiscount <= 0 || grossTotal <= 0 || items.length === 0) {
    return {
      lineDiscountsPaise: items.map(() => 0),
      totalAllocatedPaise: 0
    };
  }

  let allocated = 0;
  const lineDiscountsPaise = items.map((item, index) => {
    if (index === items.length - 1) {
      return totalDiscount - allocated;
    }
    const lineDiscount = Math.round((item.lineTotalInPaise * totalDiscount) / grossTotal);
    allocated += lineDiscount;
    return lineDiscount;
  });

  return { lineDiscountsPaise, totalAllocatedPaise: totalDiscount };
}

/**
 * Exact mirror of zoho-invoices.ts lineRatesAfterOrderDiscount (rupee unit rates).
 * For parity testing / reconciliation variance — do NOT modify Zoho code.
 */
export function zohoLineRatesAfterOrderDiscount(
  items: Array<{ unitPriceInPaise: number; qtyOrdered: number }>,
  discountInPaise: number
): number[] {
  const grossLinePaise = items.reduce(
    (sum, item) => sum + item.unitPriceInPaise * item.qtyOrdered,
    0
  );
  const discountPaise = Math.min(Math.max(0, discountInPaise), grossLinePaise);
  if (discountPaise <= 0 || grossLinePaise <= 0) {
    return items.map((item) => round2(item.unitPriceInPaise / 100));
  }

  let allocatedDiscount = 0;
  return items.map((item, index) => {
    const lineGross = item.unitPriceInPaise * item.qtyOrdered;
    const lineDiscount =
      index === items.length - 1
        ? discountPaise - allocatedDiscount
        : Math.round((lineGross * discountPaise) / grossLinePaise);
    allocatedDiscount += lineDiscount;

    const lineNetPaise = lineGross - lineDiscount;
    return item.qtyOrdered > 0
      ? round2(lineNetPaise / item.qtyOrdered / 100)
      : round2(item.unitPriceInPaise / 100);
  });
}

/** Zoho-effective post-discount merchandise total in paise (rate × qty rounding). */
export function zohoEffectiveMerchandiseNetPaise(
  items: Array<{ unitPriceInPaise: number; qtyOrdered: number }>,
  discountInPaise: number
): number {
  const rates = zohoLineRatesAfterOrderDiscount(items, discountInPaise);
  return items.reduce((sum, item, index) => {
    const rateRupees = rates[index] ?? 0;
    return sum + Math.round(rateRupees * item.qtyOrdered * 100);
  }, 0);
}

/** Native post-discount merchandise total in paise (exact allocation). */
export function nativeMerchandiseNetPaise(
  items: DiscountAllocationLine[],
  discountInPaise: number
): number {
  const { lineDiscountsPaise } = allocateOrderDiscountPaise(items, discountInPaise);
  return items.reduce(
    (sum, item, i) => sum + item.lineTotalInPaise - (lineDiscountsPaise[i] ?? 0),
    0
  );
}
