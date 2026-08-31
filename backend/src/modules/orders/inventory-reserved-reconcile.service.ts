/**
 * Inventory.reserved must match stock held by unpaid checkouts only.
 *
 * Authoritative hold = SUM(OrderItem.qtyOrdered) where Order.status = PENDING_PAYMENT
 * and Order.deletedAt IS NULL.
 *
 * Order-linked tables (do not delete blindly — cancel via cancelUnpaidOrderWithRelease):
 * - Order
 * - OrderItem          ← drives reserved qty
 * - OrderAddress
 * - OrderStatusHistory
 * - Payment
 * - OrderAttribution
 * - Shipment / Invoice / Refund / Coupon usage (usually none while PENDING_PAYMENT)
 * - OrderInventoryRestockEvent (paid path only)
 *
 * This module NEVER deletes orders. It only realigns Inventory.reserved to pending holds.
 * onHand is never modified here.
 */
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { shopInventoryWhere } from "../../utils/shop-catalog";

export type ReservedHoldRow = {
  variantId: string;
  sku: string;
  productName: string;
  onHand: number;
  reservedStored: number;
  reservedExpected: number;
  orphanUnits: number;
  pendingOrderNumbers: string[];
};

export type ReservedStockSummary = {
  pendingPaymentOrders: number;
  variantsWithStoredReserved: number;
  totalStoredReservedUnits: number;
  totalExpectedReservedUnits: number;
  orphanVariantCount: number;
  orphanUnits: number;
  reservedExceedsOnHandCount: number;
};

export type ReservedReconcileResult = {
  dryRun: boolean;
  summaryBefore: ReservedStockSummary;
  summaryAfter: ReservedStockSummary;
  repaired: Array<{
    variantId: string;
    sku: string;
    before: number;
    after: number;
    orphanUnitsReleased: number;
  }>;
  unchanged: number;
};

/** Pending unpaid holds by variantId. */
export async function computePendingReservedByVariant(
  variantIds?: string[]
): Promise<Map<string, { qty: number; orderNumbers: string[] }>> {
  const holds = await prisma.orderItem.findMany({
    where: {
      ...(variantIds?.length ? { variantId: { in: variantIds } } : {}),
      order: {
        status: "PENDING_PAYMENT",
        deletedAt: null
      }
    },
    select: {
      variantId: true,
      qtyOrdered: true,
      order: { select: { orderNumber: true } }
    }
  });

  const map = new Map<string, { qty: number; orderNumbers: string[] }>();
  for (const row of holds) {
    const cur = map.get(row.variantId) ?? { qty: 0, orderNumbers: [] };
    cur.qty += row.qtyOrdered;
    if (!cur.orderNumbers.includes(row.order.orderNumber)) {
      cur.orderNumbers.push(row.order.orderNumber);
    }
    map.set(row.variantId, cur);
  }
  return map;
}

export async function getReservedStockSummary(): Promise<ReservedStockSummary> {
  const [pendingPaymentOrders, invRows, expectedMap] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING_PAYMENT", deletedAt: null } }),
    prisma.inventory.findMany({
      where: shopInventoryWhere,
      select: { variantId: true, onHand: true, reserved: true }
    }),
    computePendingReservedByVariant()
  ]);

  let totalStoredReservedUnits = 0;
  let variantsWithStoredReserved = 0;
  let totalExpectedReservedUnits = 0;
  let orphanVariantCount = 0;
  let orphanUnits = 0;
  let reservedExceedsOnHandCount = 0;

  const expectedTotalByVariant = new Map<string, number>();
  for (const [vid, h] of expectedMap) {
    expectedTotalByVariant.set(vid, h.qty);
    totalExpectedReservedUnits += h.qty;
  }

  for (const inv of invRows) {
    if (inv.reserved > 0) variantsWithStoredReserved++;
    totalStoredReservedUnits += inv.reserved;
    const expected = expectedTotalByVariant.get(inv.variantId) ?? 0;
    if (inv.reserved > expected) {
      orphanVariantCount++;
      orphanUnits += inv.reserved - expected;
    }
    if (inv.reserved > inv.onHand) reservedExceedsOnHandCount++;
  }

  return {
    pendingPaymentOrders,
    variantsWithStoredReserved,
    totalStoredReservedUnits,
    totalExpectedReservedUnits,
    orphanVariantCount,
    orphanUnits,
    reservedExceedsOnHandCount
  };
}

export async function listReservedMismatches(limit = 50): Promise<ReservedHoldRow[]> {
  const [invRows, expectedMap] = await Promise.all([
    prisma.inventory.findMany({
      where: {
        ...shopInventoryWhere,
        OR: [{ reserved: { gt: 0 } }]
      },
      include: {
        variant: {
          select: {
            sku: true,
            productRel: { select: { name: true } }
          }
        }
      },
      orderBy: { reserved: "desc" },
      take: 2000
    }),
    computePendingReservedByVariant()
  ]);

  const out: ReservedHoldRow[] = [];
  for (const inv of invRows) {
    const hold = expectedMap.get(inv.variantId);
    const expected = hold?.qty ?? 0;
    if (inv.reserved === expected) continue;
    out.push({
      variantId: inv.variantId,
      sku: inv.variant.sku,
      productName: inv.variant.productRel.name,
      onHand: inv.onHand,
      reservedStored: inv.reserved,
      reservedExpected: expected,
      orphanUnits: Math.max(0, inv.reserved - expected),
      pendingOrderNumbers: hold?.orderNumbers ?? []
    });
  }
  return out
    .sort((a, b) => b.orphanUnits - a.orphanUnits || b.reservedStored - a.reservedStored)
    .slice(0, limit);
}

/**
 * Realign Inventory.reserved → pending unpaid holds.
 * Safe for production: does not touch onHand, orders, payments, or history.
 */
export async function reconcileInventoryReserved(opts?: {
  dryRun?: boolean;
  variantIds?: string[];
}): Promise<ReservedReconcileResult> {
  const dryRun = Boolean(opts?.dryRun);
  const summaryBefore = await getReservedStockSummary();

  const whereInv = opts?.variantIds?.length
    ? { variantId: { in: opts.variantIds } }
    : shopInventoryWhere;

  const [invRows, expectedMap] = await Promise.all([
    prisma.inventory.findMany({
      where: whereInv,
      include: { variant: { select: { sku: true } } }
    }),
    computePendingReservedByVariant(opts?.variantIds)
  ]);

  const repaired: ReservedReconcileResult["repaired"] = [];
  let unchanged = 0;

  for (const inv of invRows) {
    const expected = expectedMap.get(inv.variantId)?.qty ?? 0;
    if (inv.reserved === expected) {
      unchanged++;
      continue;
    }
    const orphanUnitsReleased = Math.max(0, inv.reserved - expected);
    repaired.push({
      variantId: inv.variantId,
      sku: inv.variant.sku,
      before: inv.reserved,
      after: expected,
      orphanUnitsReleased
    });
    if (!dryRun) {
      await prisma.inventory.update({
        where: { id: inv.id },
        data: { reserved: expected }
      });
    }
  }

  if (!dryRun && repaired.length > 0) {
    logger.info("inventory_reserved_reconciled", {
      repaired: repaired.length,
      orphanUnitsReleased: repaired.reduce((s, r) => s + r.orphanUnitsReleased, 0)
    });
  }

  const summaryAfter = dryRun ? summaryBefore : await getReservedStockSummary();

  return {
    dryRun,
    summaryBefore,
    summaryAfter,
    repaired,
    unchanged
  };
}

/** After cancel/confirm — recompute reserved for the order's variants only. */
export async function recomputeReservedForOrder(orderId: string): Promise<void> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { variantId: true }
  });
  const variantIds = Array.from(new Set(items.map((i) => i.variantId)));
  if (!variantIds.length) return;
  await reconcileInventoryReserved({ dryRun: false, variantIds });
}
