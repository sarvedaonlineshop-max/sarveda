import {
  OrderInventoryRestockDisposition,
  OrderInventoryRestockSourceType,
  type ReturnPhysicalStatus,
  type RtoDisposition
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import {
  applyOrderInventoryRestockTx,
  listOrderInventoryRestocks
} from "./order-inventory-restock.service";

export const returnShipmentBodySchema = z.object({
  courier: z.string().trim().min(1).max(120).optional(),
  awb: z.string().trim().min(1).max(120).optional(),
  trackingUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  physicalStatus: z.enum(["AWAITING_RETURN", "IN_TRANSIT"]).optional()
});

export const returnDispositionBodySchema = z.object({
  disposition: z.enum(["RESTOCKABLE", "DAMAGED_NON_RESTOCKABLE", "NEEDS_REVIEW"])
});

function mapDispositionToRestock(
  disposition: RtoDisposition
): OrderInventoryRestockDisposition | null {
  if (disposition === "RESTOCKABLE") return OrderInventoryRestockDisposition.SELLABLE;
  if (disposition === "DAMAGED_NON_RESTOCKABLE") {
    return OrderInventoryRestockDisposition.NON_RESTOCKABLE;
  }
  return null;
}

export type CustomerReturnWorkflowState = {
  returnShipment: {
    id: string;
    mode: string;
    courier: string | null;
    awb: string | null;
    trackingUrl: string | null;
    physicalStatus: ReturnPhysicalStatus;
    receivedAt: Date | null;
    disposition: RtoDisposition | null;
  } | null;
  returnPhysicalStatus: ReturnPhysicalStatus;
  restockEvents: Awaited<ReturnType<typeof listOrderInventoryRestocks>>;
  canMarkReceived: boolean;
  canSetDisposition: boolean;
  canExecuteRefund: boolean;
};

export async function loadCustomerReturnWorkflowState(
  requestId: string
): Promise<CustomerReturnWorkflowState | null> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: requestId },
    include: { returnShipment: true, items: true }
  });
  if (!request || request.type !== "REFUND_AFTER_DELIVERY") return null;

  const restockEvents = await listOrderInventoryRestocks(request.orderId);
  const rs = request.returnShipment;

  const canMarkReceived = Boolean(
    rs && rs.physicalStatus !== "RECEIVED" && rs.physicalStatus !== "INSPECTED" && !rs.receivedAt
  );
  const canSetDisposition = Boolean(rs?.receivedAt && (!rs.disposition || rs.disposition === "NEEDS_REVIEW"));
  const needsPhysical = request.returnPhysicalStatus !== "NOT_REQUIRED";
  const physicalReady =
    !needsPhysical ||
    Boolean(rs?.receivedAt && rs.disposition && rs.disposition !== "NEEDS_REVIEW");
  const canExecuteRefund = Boolean(
    request.status === "APPROVED" &&
      physicalReady &&
      ["REFUND_PENDING", "NONE"].includes(request.resolutionStatus) &&
      !request.refundProcessedAt &&
      request.items.some(
        (i) =>
          i.requestedResolution === "RETURN_FOR_REFUND" ||
          i.requestedResolution === "PARTIAL_REFUND" ||
          i.requestedResolution === "KEEP_ITEM_PARTIAL_REFUND"
      )
  );

  return {
    returnShipment: rs
      ? {
          id: rs.id,
          mode: rs.mode,
          courier: rs.courier,
          awb: rs.awb,
          trackingUrl: rs.trackingUrl,
          physicalStatus: rs.physicalStatus,
          receivedAt: rs.receivedAt,
          disposition: rs.disposition
        }
      : null,
    returnPhysicalStatus: request.returnPhysicalStatus,
    restockEvents,
    canMarkReceived,
    canSetDisposition,
    canExecuteRefund
  };
}

export async function upsertReturnShipmentTracking(opts: {
  requestId: string;
  adminUserId?: string;
  courier?: string;
  awb?: string;
  trackingUrl?: string;
  physicalStatus?: "AWAITING_RETURN" | "IN_TRANSIT";
}): Promise<void> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: opts.requestId },
    include: { returnShipment: true }
  });
  if (!request || request.type !== "REFUND_AFTER_DELIVERY") {
    throw Object.assign(new Error("Return request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (request.status !== "APPROVED") {
    throw Object.assign(new Error("Return must be approved first"), { statusCode: 400, code: "NOT_APPROVED" });
  }

  const data = {
    courier: opts.courier?.trim() || undefined,
    awb: opts.awb?.trim() || undefined,
    trackingUrl: opts.trackingUrl?.trim() || undefined,
    physicalStatus: opts.physicalStatus ?? undefined
  };

  if (request.returnShipment) {
    await prisma.orderReturnShipment.update({
      where: { id: request.returnShipment.id },
      data
    });
  } else {
    await prisma.orderReturnShipment.create({
      data: {
        requestId: request.id,
        orderId: request.orderId,
        ...data,
        physicalStatus: opts.physicalStatus ?? "AWAITING_RETURN"
      }
    });
    await prisma.orderServiceRequest.update({
      where: { id: request.id },
      data: { returnPhysicalStatus: opts.physicalStatus ?? "AWAITING_RETURN" }
    });
  }
}

export async function markCustomerReturnReceived(opts: {
  requestId: string;
  adminUserId?: string;
}): Promise<{ alreadyReceived: boolean }> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: opts.requestId },
    include: { returnShipment: true, order: true, items: true }
  });
  if (!request?.returnShipment) {
    throw Object.assign(new Error("Return shipment record required"), {
      statusCode: 400,
      code: "NO_RETURN_SHIPMENT"
    });
  }
  const rs = request.returnShipment;
  if (rs.receivedAt) {
    return { alreadyReceived: true };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.orderReturnShipment.update({
      where: { id: rs.id },
      data: {
        receivedAt: now,
        receivedByUserId: opts.adminUserId ?? null,
        physicalStatus: "RECEIVED"
      }
    });
    await tx.orderServiceRequest.update({
      where: { id: request.id },
      data: { returnPhysicalStatus: "RECEIVED" }
    });
    // Seed receipt lines at case qty — sellable stock unchanged until QC.
    for (const item of request.items) {
      if (
        item.requestedResolution === "KEEP_ITEM_PARTIAL_REFUND" ||
        item.requestedResolution === "MISSING_PART"
      ) {
        continue;
      }
      await tx.orderReturnReceiptLine.upsert({
        where: {
          requestId_orderItemId: { requestId: request.id, orderItemId: item.orderItemId }
        },
        create: {
          requestId: request.id,
          orderItemId: item.orderItemId,
          qtyExpected: item.qtySelected,
          qtyReceived: item.qtySelected,
          receivedAt: now,
          receivedByUserId: opts.adminUserId ?? null
        },
        update: {
          qtyReceived: item.qtySelected,
          receivedAt: now,
          receivedByUserId: opts.adminUserId ?? null
        }
      });
    }
  });

  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: request.id,
    eventType: "ITEM_RECEIVED",
    message: "Warehouse received return",
    actor: { userId: opts.adminUserId, role: "ADMIN" }
  });

  logger.info("customer_return_received", {
    orderId: request.orderId,
    requestId: request.id,
    adminUserId: opts.adminUserId
  });

  return { alreadyReceived: false };
}

export async function setCustomerReturnDisposition(opts: {
  requestId: string;
  disposition: RtoDisposition;
  adminUserId?: string;
}): Promise<{ restockEvents: number; alreadySet: boolean }> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: opts.requestId },
    include: {
      returnShipment: true,
      items: true,
      order: { include: { items: true } }
    }
  });
  if (!request?.returnShipment) {
    throw Object.assign(new Error("Return shipment not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  const rs = request.returnShipment;
  if (!rs.receivedAt) {
    throw Object.assign(new Error("Mark return received before disposition"), {
      statusCode: 400,
      code: "NOT_RECEIVED"
    });
  }

  if (rs.disposition === opts.disposition) {
    return { restockEvents: 0, alreadySet: true };
  }
  if (rs.disposition && rs.disposition !== "NEEDS_REVIEW") {
    throw Object.assign(new Error("Disposition already set"), { statusCode: 409, code: "DISPOSITION_LOCKED" });
  }

  const restockDisposition = mapDispositionToRestock(opts.disposition);
  const sourceId = `${request.id}:return-disposition:${opts.disposition}`;

  const result = await prisma.$transaction(async (tx) => {
    let restockEvents: Awaited<ReturnType<typeof applyOrderInventoryRestockTx>> = [];

    if (restockDisposition) {
      const lines = request.items
        .filter((i) => i.requestedResolution !== "KEEP_ITEM_PARTIAL_REFUND")
        .map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.qtySelected,
          disposition: restockDisposition
        }));

      if (lines.length) {
        restockEvents = await applyOrderInventoryRestockTx(tx, {
          orderId: request.orderId,
          sourceType: OrderInventoryRestockSourceType.CUSTOMER_RETURN_RECEIPT,
          sourceId,
          reason: `Customer return disposition: ${opts.disposition}`,
          createdByUserId: opts.adminUserId,
          lines
        });
      }
    }

    await tx.orderReturnShipment.update({
      where: { id: rs.id },
      data: {
        disposition: opts.disposition,
        dispositionAt: new Date(),
        dispositionByUserId: opts.adminUserId ?? null,
        physicalStatus: "INSPECTED"
      }
    });

    await tx.orderServiceRequest.update({
      where: { id: request.id },
      data: {
        returnPhysicalStatus: "INSPECTED",
        resolutionStatus: request.resolutionStatus === "NONE" ? "REFUND_PENDING" : request.resolutionStatus
      }
    });

    return restockEvents;
  });

  logger.info("customer_return_disposition_set", {
    orderId: request.orderId,
    requestId: request.id,
    disposition: opts.disposition,
    restockLineCount: result.length
  });

  return { restockEvents: result.length, alreadySet: false };
}
