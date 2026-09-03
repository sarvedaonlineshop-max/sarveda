import {
  OrderInventoryRestockDisposition,
  OrderInventoryRestockSourceType,
  type Prisma
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { applyOrderInventoryRestockTx } from "./order-inventory-restock.service";
import { appendCaseEvent } from "./return-case-events.service";

export type ReturnQcLineInput = {
  orderItemId?: string | null;
  quantity: number;
  disposition: OrderInventoryRestockDisposition;
  note?: string;
  receivedVariantId?: string | null;
  receivedSkuSnapshot?: string | null;
  isUnexpectedSku?: boolean;
  vendorId?: string | null;
  vendorNameSnapshot?: string | null;
};

function incrementsSellable(d: OrderInventoryRestockDisposition): boolean {
  return d === "SELLABLE";
}

function incrementsQuarantine(d: OrderInventoryRestockDisposition): boolean {
  return d === "QUARANTINE";
}

/**
 * Record warehouse receipt quantities for expected return lines.
 * Does NOT change sellable inventory.
 */
export async function recordReturnReceipt(opts: {
  requestId: string;
  adminUserId?: string;
  lines: Array<{ orderItemId: string; qtyReceived: number; note?: string }>;
}): Promise<void> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: opts.requestId },
    include: { items: true, returnShipment: true }
  });
  if (!request || request.type !== "REFUND_AFTER_DELIVERY") {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (request.status !== "APPROVED") {
    throw Object.assign(new Error("Return must be approved before warehouse receipt"), {
      statusCode: 400,
      code: "NOT_APPROVED"
    });
  }

  const itemByOrderItemId = new Map(request.items.map((i) => [i.orderItemId, i]));
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const line of opts.lines) {
      const reqItem = itemByOrderItemId.get(line.orderItemId);
      if (!reqItem) {
        throw Object.assign(new Error("Order item is not on this return case"), {
          statusCode: 400,
          code: "ITEM_NOT_ON_CASE"
        });
      }
      if (!Number.isInteger(line.qtyReceived) || line.qtyReceived < 0) {
        throw Object.assign(new Error("Invalid received quantity"), {
          statusCode: 400,
          code: "INVALID_QTY"
        });
      }
      if (line.qtyReceived > reqItem.qtySelected) {
        throw Object.assign(
          new Error(
            `Received qty ${line.qtyReceived} exceeds case qty ${reqItem.qtySelected} for ${reqItem.skuSnapshot}`
          ),
          { statusCode: 400, code: "RECEIVED_EXCEEDS_EXPECTED" }
        );
      }

      await tx.orderReturnReceiptLine.upsert({
        where: {
          requestId_orderItemId: {
            requestId: request.id,
            orderItemId: line.orderItemId
          }
        },
        create: {
          requestId: request.id,
          orderItemId: line.orderItemId,
          qtyExpected: reqItem.qtySelected,
          qtyReceived: line.qtyReceived,
          receivedAt: line.qtyReceived > 0 ? now : null,
          receivedByUserId: opts.adminUserId ?? null,
          note: line.note?.trim() || null
        },
        update: {
          qtyReceived: line.qtyReceived,
          receivedAt: line.qtyReceived > 0 ? now : null,
          receivedByUserId: opts.adminUserId ?? null,
          note: line.note?.trim() || null
        }
      });
    }

    if (!request.returnShipment) {
      await tx.orderReturnShipment.create({
        data: {
          requestId: request.id,
          orderId: request.orderId,
          physicalStatus: "RECEIVED",
          receivedAt: now,
          receivedByUserId: opts.adminUserId ?? null
        }
      });
    } else if (!request.returnShipment.receivedAt) {
      await tx.orderReturnShipment.update({
        where: { id: request.returnShipment.id },
        data: {
          physicalStatus: "RECEIVED",
          receivedAt: now,
          receivedByUserId: opts.adminUserId ?? null
        }
      });
    }

    await tx.orderServiceRequest.update({
      where: { id: request.id },
      data: { returnPhysicalStatus: "RECEIVED" }
    });
  });

  await appendCaseEvent({
    requestId: request.id,
    eventType: "ITEM_RECEIVED",
    message: "Warehouse receipt recorded",
    payloadJson: { lines: opts.lines },
    actor: { userId: opts.adminUserId, role: "ADMIN" }
  });
}

/**
 * Perform QC with mixed dispositions. Sum of disposition qty per order item
 * must be <= warehouse received qty for that item.
 * Unexpected SKUs do not credit expected order lines.
 */
export async function performReturnQc(opts: {
  requestId: string;
  adminUserId?: string;
  adminEmail?: string;
  lines: ReturnQcLineInput[];
}): Promise<{ qcLineIds: string[]; restockEventIds: string[] }> {
  if (!opts.lines.length) {
    throw Object.assign(new Error("Provide at least one QC line"), {
      statusCode: 400,
      code: "QC_LINES_REQUIRED"
    });
  }

  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: opts.requestId },
    include: {
      items: true,
      returnShipment: true,
      receiptLines: true,
      qcLines: true
    }
  });
  if (!request || request.type !== "REFUND_AFTER_DELIVERY") {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (!request.returnShipment?.receivedAt && !request.receiptLines.some((r) => r.qtyReceived > 0)) {
    throw Object.assign(new Error("Record warehouse receipt before QC"), {
      statusCode: 400,
      code: "NOT_RECEIVED"
    });
  }

  const receivedByItem = new Map<string, number>();
  for (const r of request.receiptLines) {
    receivedByItem.set(r.orderItemId, r.qtyReceived);
  }
  // Fallback: if only shipment-level receipt exists, expected qty = case qtySelected
  if (!receivedByItem.size && request.returnShipment?.receivedAt) {
    for (const item of request.items) {
      if (item.requestedResolution === "KEEP_ITEM_PARTIAL_REFUND") continue;
      if (item.requestedResolution === "MISSING_PART") continue;
      receivedByItem.set(item.orderItemId, item.qtySelected);
    }
  }

  const alreadyQcByItem = new Map<string, number>();
  for (const q of request.qcLines) {
    if (!q.orderItemId || q.isUnexpectedSku) continue;
    alreadyQcByItem.set(q.orderItemId, (alreadyQcByItem.get(q.orderItemId) ?? 0) + q.quantity);
  }

  const proposedByItem = new Map<string, number>();
  for (const line of opts.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw Object.assign(new Error("QC quantity must be a positive integer"), {
        statusCode: 400,
        code: "INVALID_QTY"
      });
    }
    if (line.isUnexpectedSku || !line.orderItemId) {
      if (!line.receivedSkuSnapshot && !line.receivedVariantId) {
        throw Object.assign(new Error("Unexpected SKU requires received SKU or variant"), {
          statusCode: 400,
          code: "UNEXPECTED_SKU_DETAIL_REQUIRED"
        });
      }
      continue;
    }
    proposedByItem.set(
      line.orderItemId,
      (proposedByItem.get(line.orderItemId) ?? 0) + line.quantity
    );
  }

  for (const [orderItemId, qty] of proposedByItem) {
    const received = receivedByItem.get(orderItemId) ?? 0;
    const already = alreadyQcByItem.get(orderItemId) ?? 0;
    if (already + qty > received) {
      throw Object.assign(
        new Error(
          `QC qty sum ${already + qty} exceeds warehouse received ${received} for item ${orderItemId}`
        ),
        { statusCode: 400, code: "QC_EXCEEDS_RECEIVED" }
      );
    }
  }

  const qcLineIds: string[] = [];
  const restockEventIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const line of opts.lines) {
      const qcId = randomUUID();
      const isUnexpected = Boolean(line.isUnexpectedSku || !line.orderItemId);
      let restockEventId: string | null = null;

      if (!isUnexpected && line.orderItemId) {
        // Unique sourceId per QC line so same orderItem can have mixed dispositions.
        const sourceId = `${request.id}:qc:${qcId}`;
        const events = await applyOrderInventoryRestockTx(tx, {
          orderId: request.orderId,
          sourceType: OrderInventoryRestockSourceType.CUSTOMER_RETURN_RECEIPT,
          sourceId,
          reason: `Return QC ${line.disposition}`,
          createdByUserId: opts.adminUserId,
          lines: [
            {
              orderItemId: line.orderItemId,
              quantity: line.quantity,
              disposition: line.disposition
            }
          ]
        });
        restockEventId = events[0]?.id ?? null;
        if (restockEventId) restockEventIds.push(restockEventId);

        // Quarantine / REPACK tracking beyond default applyOrderInventoryRestockTx behaviour
        const orderItem = await tx.orderItem.findUnique({
          where: { id: line.orderItemId },
          select: { variantId: true }
        });
        if (orderItem?.variantId && incrementsQuarantine(line.disposition)) {
          await tx.inventory.updateMany({
            where: { variantId: orderItem.variantId },
            data: { quarantineOnHand: { increment: line.quantity } }
          });
        }
      } else {
        // Unexpected SKU — record QC only; do not credit expected order inventory.
        logger.info("return_qc_unexpected_sku", {
          requestId: request.id,
          receivedSku: line.receivedSkuSnapshot,
          receivedVariantId: line.receivedVariantId,
          quantity: line.quantity,
          disposition: line.disposition
        });
        if (line.receivedVariantId && incrementsSellable(line.disposition)) {
          throw Object.assign(
            new Error(
              "Unexpected SKU cannot be made sellable against an order line — confirm inventory manually via admin restock if appropriate"
            ),
            { statusCode: 400, code: "UNEXPECTED_SKU_NO_AUTO_SELLABLE" }
          );
        }
      }

      const reqItem = line.orderItemId
        ? request.items.find((i) => i.orderItemId === line.orderItemId)
        : null;

      await tx.orderReturnQcLine.create({
        data: {
          id: qcId,
          requestId: request.id,
          orderItemId: isUnexpected ? null : line.orderItemId ?? null,
          expectedSkuSnapshot: reqItem?.skuSnapshot ?? null,
          receivedVariantId: line.receivedVariantId ?? null,
          receivedSkuSnapshot: line.receivedSkuSnapshot ?? null,
          isUnexpectedSku: isUnexpected,
          quantity: line.quantity,
          disposition: line.disposition,
          note: line.note?.trim() || null,
          vendorId: line.vendorId ?? null,
          vendorNameSnapshot: line.vendorNameSnapshot ?? null,
          restockEventId,
          createdByUserId: opts.adminUserId ?? null
        }
      });
      qcLineIds.push(qcId);
    }

    await tx.orderReturnShipment.update({
      where: { id: request.returnShipment!.id },
      data: {
        physicalStatus: "INSPECTED",
        dispositionAt: new Date(),
        dispositionByUserId: opts.adminUserId ?? null,
        // Keep legacy single disposition for refund gate when all lines sellable/damaged mix:
        disposition: "NEEDS_REVIEW"
      }
    });

    // If every expected received unit is QC'd with a terminal disposition, unlock refund path.
    let allCovered = true;
    for (const [orderItemId, received] of receivedByItem) {
      if (received <= 0) continue;
      const prior = alreadyQcByItem.get(orderItemId) ?? 0;
      const added = proposedByItem.get(orderItemId) ?? 0;
      if (prior + added < received) {
        allCovered = false;
        break;
      }
    }
    if (allCovered && receivedByItem.size) {
      await tx.orderReturnShipment.update({
        where: { id: request.returnShipment!.id },
        data: { disposition: "RESTOCKABLE" }
      });
      await tx.orderServiceRequest.update({
        where: { id: request.id },
        data: {
          returnPhysicalStatus: "INSPECTED",
          resolutionStatus:
            request.resolutionStatus === "NONE" ? "REFUND_PENDING" : request.resolutionStatus
        }
      });
    } else {
      await tx.orderServiceRequest.update({
        where: { id: request.id },
        data: { returnPhysicalStatus: "INSPECTED" }
      });
    }
  });

  await appendCaseEvent({
    requestId: request.id,
    eventType: "QC_PERFORMED",
    message: `${opts.lines.length} QC line(s) recorded`,
    payloadJson: {
      lines: opts.lines.map((l) => ({
        orderItemId: l.orderItemId ?? null,
        quantity: l.quantity,
        disposition: l.disposition,
        isUnexpectedSku: Boolean(l.isUnexpectedSku)
      }))
    },
    actor: { userId: opts.adminUserId, email: opts.adminEmail, role: "ADMIN" }
  });

  // Best-effort write-off accounting for WRITE_OFF lines (idempotent; no real money movement).
  for (const id of restockEventIds) {
    void tryPostInventoryWriteOffForRestockEvent(id).catch((err) => {
      logger.warn("inventory_writeoff_post_skipped", {
        restockEventId: id,
        error: err instanceof Error ? err.message : String(err)
      });
    });
  }

  return { qcLineIds, restockEventIds };
}

/**
 * After REPACK QC, release units to sellable stock (separate step).
 * Upgrades the existing REPACK restock event — does not consume additional returnable qty.
 */
export async function releaseRepackToSellable(opts: {
  requestId: string;
  qcLineId: string;
  adminUserId?: string;
}): Promise<void> {
  const qc = await prisma.orderReturnQcLine.findFirst({
    where: { id: opts.qcLineId, requestId: opts.requestId }
  });
  if (!qc) {
    throw Object.assign(new Error("QC line not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (qc.disposition !== "REPACK") {
    throw Object.assign(new Error("Only REPACK lines can be released to sellable"), {
      statusCode: 400,
      code: "NOT_REPACK"
    });
  }
  if (qc.releasedToSellableAt) return;
  if (!qc.orderItemId || !qc.restockEventId) {
    throw Object.assign(new Error("REPACK line missing order item or restock event"), {
      statusCode: 400,
      code: "REPACK_INCOMPLETE"
    });
  }

  await prisma.$transaction(async (tx) => {
    const event = await tx.orderInventoryRestockEvent.findUnique({
      where: { id: qc.restockEventId! }
    });
    if (!event) {
      throw Object.assign(new Error("Restock event not found"), { statusCode: 404, code: "NOT_FOUND" });
    }
    if (event.disposition !== "REPACK") {
      throw Object.assign(new Error("Restock event is not in REPACK state"), {
        statusCode: 409,
        code: "NOT_REPACK"
      });
    }

    let inventoryIncremented = event.inventoryIncremented;
    if (!inventoryIncremented) {
      const inv = await tx.inventory.findUnique({ where: { variantId: event.variantId } });
      if (inv) {
        await tx.inventory.update({
          where: { id: inv.id },
          data: { onHand: { increment: event.quantity } }
        });
        inventoryIncremented = true;
      }
    }

    await tx.orderInventoryRestockEvent.update({
      where: { id: event.id },
      data: {
        disposition: "SELLABLE",
        inventoryIncremented,
        reason: `${event.reason ?? "REPACK"} → released to sellable`
      }
    });

    await tx.orderReturnQcLine.update({
      where: { id: qc.id },
      data: {
        disposition: "SELLABLE",
        releasedToSellableAt: new Date()
      }
    });
  });

  await appendCaseEvent({
    requestId: opts.requestId,
    eventType: "DISPOSITION_SELECTED",
    message: "REPACK released to sellable stock",
    payloadJson: { qcLineId: qc.id, quantity: qc.quantity },
    actor: { userId: opts.adminUserId, role: "ADMIN" }
  });
}

async function tryPostInventoryWriteOffForRestockEvent(restockEventId: string): Promise<void> {
  const { postInventoryWriteOffIfEligible } = await import(
    "../accounting/inventory-writeoff-posting.service"
  );
  await postInventoryWriteOffIfEligible(restockEventId);
}

/** Exported for tests — quarantine must never count as sellable onHand. */
export function dispositionAffectsSellableOnHand(
  d: OrderInventoryRestockDisposition
): boolean {
  return incrementsSellable(d);
}

export type { Prisma };
