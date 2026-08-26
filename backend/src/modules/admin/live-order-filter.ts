import type { Prisma } from "@prisma/client";

import {
  isAccountingFixtureOrderNumber,
  isCommerceTestOrderNumber,
  isLiveAdminOrder,
  launchOrderCutoverDate
} from "./launch-order-rules";

/** Prisma filter: live admin Orders — post-cutover website orders only (no test/accounting fixtures). */
export function liveAdminOrderWhere(): Prisma.OrderWhereInput {
  const cutover = launchOrderCutoverDate();

  return {
    deletedAt: null,
    AND: [
      { NOT: { orderNumber: { contains: "SRV-ACCT-", mode: "insensitive" } } },
      { NOT: { orderNumber: { contains: "TEST-ACC", mode: "insensitive" } } },
      { NOT: { orderNumber: { startsWith: "WOO-" } } },
      { NOT: { orderNumber: { startsWith: "SRV-TEST-" } } },
      {
        OR: [{ placedAt: { gte: cutover } }, { placedAt: null, createdAt: { gte: cutover } }]
      }
    ]
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
