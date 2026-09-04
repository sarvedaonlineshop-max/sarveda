import type { Prisma } from "@prisma/client";

import { allocateOrderDiscountPaise } from "../accounting/discount-allocation";
import { prisma } from "../../config/db";
import { gstFromInclusiveLine, lookupGstRate } from "../../utils/gst";

/**
 * Immutable per-line refund breakdown written with the Refund row.
 * reverseShippingDeductedPaise / otherDeduction* are always 0 in Phase 1A —
 * columns exist so Phase 4 can write them without another schema change.
 */
export type RefundAllocationLineInput = {
  orderItemId: string;
  quantity: number;
  /** Inclusive merchandise amount eligible before shipping adjustments (after discount). */
  eligibleItemValuePaise: number;
  merchandiseTaxablePaise: number;
  gstPaise: number;
  discountReversedPaise: number;
  /** Positive when shipping is refunded to the customer; 0 when retained. */
  forwardShippingPaise: number;
  reverseShippingDeductedPaise?: number;
  otherDeductionPaise?: number;
  otherDeductionLabel?: string | null;
  approvedRefundPaise: number;
};

export type BuildLineAllocationOpts = {
  orderItem: {
    id: string;
    lineTotalInPaise: number;
    unitPriceInPaise: number;
    qtyOrdered: number;
    taxClass?: string | null;
  };
  allItems: Array<{
    lineTotalInPaise: number;
    unitPriceInPaise: number;
    qtyOrdered: number;
  }>;
  orderDiscountInPaise: number;
  quantity: number;
  merchandiseInclusivePaise: number;
  forwardShippingPaise: number;
  isGstApplicable: boolean;
  /** Explicit goodwill credit — does not alter GST extraction from merchandise. */
  goodwillAdjustmentPaise?: number;
};

/**
 * Build one allocation row from a known merchandise + shipping split.
 * GST is extracted from merchandise only — shipping stays symmetrical with ORDER_PAID
 * (untaxed Shipping Income). Goodwill is an explicit credit (negative otherDeduction).
 */
export function buildLineRefundAllocation(opts: BuildLineAllocationOpts): RefundAllocationLineInput {
  const { lineDiscountsPaise } = allocateOrderDiscountPaise(
    opts.allItems,
    opts.orderDiscountInPaise
  );
  const itemIndex = opts.allItems.findIndex(
    (row) =>
      row.lineTotalInPaise === opts.orderItem.lineTotalInPaise &&
      row.qtyOrdered === opts.orderItem.qtyOrdered &&
      row.unitPriceInPaise === opts.orderItem.unitPriceInPaise
  );
  const lineDiscount = itemIndex >= 0 ? (lineDiscountsPaise[itemIndex] ?? 0) : 0;
  const perUnitDiscount = Math.round(lineDiscount / Math.max(1, opts.orderItem.qtyOrdered));
  const discountReversedPaise = perUnitDiscount * opts.quantity;

  let merchandiseTaxablePaise = opts.merchandiseInclusivePaise;
  let gstPaise = 0;
  if (opts.isGstApplicable && opts.merchandiseInclusivePaise > 0) {
    const rate = lookupGstRate(opts.orderItem.taxClass).ratePercent;
    const extracted = gstFromInclusiveLine(opts.merchandiseInclusivePaise, rate);
    merchandiseTaxablePaise = extracted.taxableMinor;
    gstPaise = extracted.taxMinor;
  }

  const reverseShippingDeductedPaise = 0;
  const goodwill = Math.max(0, opts.goodwillAdjustmentPaise ?? 0);
  // Negative otherDeduction = customer credit (goodwill). Never invent GST on goodwill.
  const otherDeductionPaise = goodwill > 0 ? -goodwill : 0;
  const otherDeductionLabel = goodwill > 0 ? "GOODWILL_ADJUSTMENT" : null;
  const approvedRefundPaise =
    opts.merchandiseInclusivePaise +
    opts.forwardShippingPaise -
    reverseShippingDeductedPaise -
    otherDeductionPaise;

  return {
    orderItemId: opts.orderItem.id,
    quantity: opts.quantity,
    eligibleItemValuePaise: opts.merchandiseInclusivePaise,
    merchandiseTaxablePaise,
    gstPaise,
    discountReversedPaise,
    forwardShippingPaise: opts.forwardShippingPaise,
    reverseShippingDeductedPaise,
    otherDeductionPaise,
    otherDeductionLabel,
    approvedRefundPaise
  };
}

/**
 * Persist allocations for a refund. Idempotent: if any rows already exist for this
 * refundId, returns them without writing again (historical / retry safe).
 */
export async function persistRefundAllocations(
  refundId: string,
  lines: RefundAllocationLineInput[],
  tx?: Prisma.TransactionClient
): Promise<void> {
  if (!lines.length) return;
  const db = tx ?? prisma;

  const existing = await db.refundAllocation.count({ where: { refundId } });
  if (existing > 0) return;

  await db.refundAllocation.createMany({
    data: lines.map((line) => ({
      refundId,
      orderItemId: line.orderItemId,
      quantity: line.quantity,
      eligibleItemValuePaise: line.eligibleItemValuePaise,
      merchandiseTaxablePaise: line.merchandiseTaxablePaise,
      gstPaise: line.gstPaise,
      discountReversedPaise: line.discountReversedPaise,
      forwardShippingPaise: line.forwardShippingPaise,
      reverseShippingDeductedPaise: line.reverseShippingDeductedPaise ?? 0,
      otherDeductionPaise: line.otherDeductionPaise ?? 0,
      otherDeductionLabel: line.otherDeductionLabel ?? null,
      approvedRefundPaise: line.approvedRefundPaise
    })),
    skipDuplicates: true
  });
}
