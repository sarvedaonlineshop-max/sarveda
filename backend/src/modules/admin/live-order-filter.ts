import type { Prisma } from "@prisma/client";

import {
  isAccountingFixtureOrderNumber,
  isCommerceTestOrderNumber,
  isBeforeLaunchOrderCutover,
  isLiveAdminOrder,
  launchOrderCutoverDate
} from "./launch-order-rules";

/** Shared exclusions: accounting fixtures, commerce TEST rows, Woo imports. */
function liveOrderNumberExclusions(): Prisma.OrderWhereInput[] {
  return [
    { NOT: { orderNumber: { contains: "SRV-ACCT-", mode: "insensitive" } } },
    { NOT: { orderNumber: { contains: "TEST-ACC", mode: "insensitive" } } },
    { NOT: { orderNumber: { startsWith: "WOO-" } } },
    { NOT: { orderNumber: { startsWith: "SRV-TEST-" } } }
  ];
}

/**
 * Prisma filter: live admin Orders + dashboard commerce stats.
 * Pre-cutover (before LAUNCH_ORDER_CUTOVER_ISO): all real website orders.
 * Post-cutover: only orders placed on/after the cutover instant.
 */
export function liveAdminOrderWhere(now = new Date()): Prisma.OrderWhereInput {
  const exclusions = liveOrderNumberExclusions();

  if (isBeforeLaunchOrderCutover(now)) {
    return {
      deletedAt: null,
      AND: exclusions
    };
  }

  const cutover = launchOrderCutoverDate();
  return {
    deletedAt: null,
    AND: [
      ...exclusions,
      {
        OR: [{ placedAt: { gte: cutover } }, { placedAt: null, createdAt: { gte: cutover } }]
      }
    ]
  };
}

/**
 * Prisma filter for live marketplace orders (overview / list / analytics).
 * Pre-cutover: optional extra filters only.
 * Post-cutover: only rows with orderDate on/after LAUNCH_ORDER_CUTOVER_ISO.
 */
export function liveMarketplaceOrderWhere(
  extra: Prisma.MarketplaceOrderWhereInput = {},
  now = new Date()
): Prisma.MarketplaceOrderWhereInput {
  if (isBeforeLaunchOrderCutover(now)) {
    return extra;
  }

  const cutover = launchOrderCutoverDate();
  return {
    AND: [{ orderDate: { gte: cutover } }, extra]
  };
}

export function classifyOrderForCutover(order: {
  orderNumber: string;
  placedAt: Date | null;
  createdAt: Date;
}): "live" | "archive" | "delete" {
  if (isAccountingFixtureOrderNumber(order.orderNumber)) return "live";
  if (isCommerceTestOrderNumber(order.orderNumber)) return "delete";
  if (isLiveAdminOrder(order)) return "live";
  return "archive";
}
