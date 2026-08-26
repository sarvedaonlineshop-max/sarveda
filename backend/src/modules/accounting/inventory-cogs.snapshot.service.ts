import { createHash } from "crypto";

import { prisma } from "../../config/db";

import { classifyCutover, isPreCutoverDocument } from "./accounting-cutover";
import { classifyVariantForInventory } from "./inventory-classification";
import { ORDER_PAID_EVENT_TYPE, orderPaidUniqueKey } from "./order-paid.constants";
import { getPostingEvent } from "./posting-event.service";
import type { InventoryCogsOrderSnapshot } from "./inventory-cogs.types";

function fingerprintOrderCogsSource(input: {
  orderId: string;
  items: Array<{ orderItemId: string; variantId: string | null; qtyOrdered: number }>;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        orderId: input.orderId,
        items: input.items
          .slice()
          .sort((a, b) => a.orderItemId.localeCompare(b.orderItemId))
          .map((i) => ({
            orderItemId: i.orderItemId,
            variantId: i.variantId,
            qtyOrdered: i.qtyOrdered
          }))
      })
    )
    .digest("hex");
}

export async function loadInventoryCogsSnapshotByOrderId(
  orderId: string
): Promise<InventoryCogsOrderSnapshot> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: {
        include: {
          variant: {
            include: {
              productRel: { select: { productType: true, catalogHidden: true } }
            }
          }
        }
      }
    }
  });
  if (!order) {
    throw Object.assign(new Error(`Order not found: ${orderId}`), {
      code: "ORDER_NOT_FOUND",
      statusCode: 404
    });
  }
  if (!order.placedAt) {
    throw Object.assign(new Error(`Order missing placedAt: ${order.orderNumber}`), {
      code: "MISSING_PLACED_AT",
      statusCode: 409
    });
  }

  const paidEvent = await getPostingEvent(ORDER_PAID_EVENT_TYPE, orderPaidUniqueKey(order.id));
  const lines = order.items.map((item) => {
    const classification = item.variant
      ? classifyVariantForInventory({
          sku: item.skuSnapshot,
          productType: item.variant.productRel.productType,
          catalogHidden: item.variant.productRel.catalogHidden,
          onHand: 0
        })
      : "UNKNOWN";
    return {
      orderItemId: item.id,
      variantId: item.variantId,
      skuSnapshot: item.skuSnapshot,
      nameSnapshot: item.nameSnapshot,
      qtyOrdered: item.qtyOrdered,
      unitPriceInPaise: item.unitPriceInPaise,
      lineTotalInPaise: item.lineTotalInPaise,
      classification,
      productType: item.variant?.productRel.productType ?? null
    };
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    placedAt: order.placedAt,
    currency: order.currency,
    lines,
    sourceFingerprint: fingerprintOrderCogsSource({
      orderId: order.id,
      items: lines.map((l) => ({
        orderItemId: l.orderItemId,
        variantId: l.variantId,
        qtyOrdered: l.qtyOrdered
      }))
    }),
    nativeOrderPaidPosted: paidEvent?.status === "POSTED",
    paidJournalEntryId: paidEvent?.journalEntryId ?? null,
    cutoverClassification: classifyCutover(order.placedAt)
  };
}

export async function loadInventoryCogsSnapshot(identifier: {
  orderId?: string;
  orderNumber?: string;
}) {
  if (identifier.orderId?.trim()) {
    return loadInventoryCogsSnapshotByOrderId(identifier.orderId.trim());
  }
  if (!identifier.orderNumber?.trim()) {
    throw Object.assign(new Error("orderId or orderNumber required"), {
      code: "ORDER_NOT_FOUND",
      statusCode: 404
    });
  }
  const order = await prisma.order.findFirst({
    where: { orderNumber: identifier.orderNumber.trim(), deletedAt: null },
    select: { id: true }
  });
  if (!order) {
    throw Object.assign(new Error(`Order not found: ${identifier.orderNumber}`), {
      code: "ORDER_NOT_FOUND",
      statusCode: 404
    });
  }
  return loadInventoryCogsSnapshotByOrderId(order.id);
}

export async function findInventoryCogsDiscoveryCandidates(opts: {
  orderId?: string;
  since?: Date;
  until?: Date;
  variantId?: string;
  limit: number;
}) {
  const rows = await prisma.order.findMany({
    where: {
      deletedAt: null,
      placedAt: opts.orderId
        ? undefined
        : {
            ...(opts.since ? { gte: opts.since } : {}),
            ...(opts.until ? { lt: opts.until } : {})
          },
      ...(opts.orderId ? { id: opts.orderId } : {}),
      items: opts.variantId ? { some: { variantId: opts.variantId } } : undefined
    },
    orderBy: [{ placedAt: "asc" }, { id: "asc" }],
    select: { id: true, orderNumber: true, placedAt: true },
    take: opts.limit
  });
  return rows.filter((r) => Boolean(r.placedAt));
}

export function isSnapshotPreCutover(snapshot: Pick<InventoryCogsOrderSnapshot, "placedAt">) {
  return isPreCutoverDocument(snapshot.placedAt);
}
