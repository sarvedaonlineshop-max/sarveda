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

function isApprovedReturnStatus(status: string): boolean {
  return status === "APPROVED" || status === "PARTIALLY_APPROVED";
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
    isApprovedReturnStatus(request.status) &&
      physicalReady &&
      ["REFUND_PENDING", "NONE"].includes(request.resolutionStatus) &&
      !request.refundProcessedAt &&
      request.items.some(
        (i) =>
          i.reviewDecision === "APPROVED" &&
          (i.requestedResolution === "RETURN_FOR_REFUND" ||
            i.requestedResolution === "PARTIAL_REFUND" ||
            i.requestedResolution === "KEEP_ITEM_PARTIAL_REFUND")
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
  mode?: "MANUAL_RETURN_SHIPMENT" | "REVERSE_PICKUP";
}): Promise<void> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: opts.requestId },
    include: { returnShipment: true }
  });
  if (!request || request.type !== "REFUND_AFTER_DELIVERY") {
    throw Object.assign(new Error("Return request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (!isApprovedReturnStatus(request.status)) {
    throw Object.assign(new Error("Return must be approved first"), { statusCode: 400, code: "NOT_APPROVED" });
  }

  const data = {
    courier: opts.courier?.trim() || undefined,
    awb: opts.awb?.trim() || undefined,
    trackingUrl: opts.trackingUrl?.trim() || undefined,
    physicalStatus: opts.physicalStatus ?? undefined,
    mode: opts.mode
  };

  if (request.returnShipment) {
    await prisma.orderReturnShipment.update({
      where: { id: request.returnShipment.id },
      data
    });
    if (opts.physicalStatus) {
      await prisma.orderServiceRequest.update({
        where: { id: request.id },
        data: { returnPhysicalStatus: opts.physicalStatus }
      });
    }
  } else {
    await prisma.orderReturnShipment.create({
      data: {
        requestId: request.id,
        orderId: request.orderId,
        ...data,
        mode: opts.mode ?? "MANUAL_RETURN_SHIPMENT",
        physicalStatus: opts.physicalStatus ?? "AWAITING_RETURN"
      }
    });
    await prisma.orderServiceRequest.update({
      where: { id: request.id },
      data: { returnPhysicalStatus: opts.physicalStatus ?? "AWAITING_RETURN" }
    });
  }

  if (opts.courier?.trim() && opts.awb?.trim()) {
    const { appendCaseEvent } = await import("./return-case-events.service");
    await appendCaseEvent({
      requestId: request.id,
      eventType: "PICKUP_REQUESTED",
      message: `${opts.courier.trim()} / ${opts.awb.trim()}`,
      payloadJson: {
        courier: opts.courier.trim(),
        awb: opts.awb.trim(),
        trackingUrl: opts.trackingUrl?.trim() || null,
        mode: opts.mode ?? null
      },
      actor: { userId: opts.adminUserId, role: "ADMIN" }
    });
    void (async () => {
      const full = await prisma.orderServiceRequest.findUnique({
        where: { id: request.id },
        include: {
          items: true,
          order: { select: { phone: true, email: true } }
        }
      });
      const approved = (full?.items ?? []).filter((i) => i.reviewDecision === "APPROVED");
      const itemSummary =
        approved.length > 0
          ? approved.map((i) => `${i.nameSnapshot} × ${i.qtySelected}`).join("; ")
          : (full?.items ?? []).map((i) => `${i.nameSnapshot} × ${i.qtySelected}`).join("; ");
      const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
      await notifyReturnCaseEvent(request.id, "RETURN_PICKUP_CREATED", {
        orderNumber: request.orderNumber,
        caseNumber: request.caseNumber,
        customerEmail: request.customerEmail || full?.order.email || "",
        customerPhone: full?.order.phone ?? null,
        itemSummary,
        courier: opts.courier!.trim(),
        awb: opts.awb!.trim(),
        trackingUrl: opts.trackingUrl?.trim() || null
      });
    })();
  }
}

/**
 * Create a Delhivery reverse pickup (RVP) for an approved return case and
 * write courier + AWB onto OrderReturnShipment. Manual AWB entry stays unchanged.
 */
export async function scheduleDelhiveryReturnPickup(opts: {
  requestId: string;
  orderId: string;
  adminUserId?: string;
  adminEmail?: string;
}): Promise<{ courier: string; awb: string; trackingUrl: string; mode: "REVERSE_PICKUP" }> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: opts.requestId },
    include: {
      returnShipment: true,
      items: true,
      order: {
        include: {
          addresses: true,
          items: { include: { variant: true } },
          payments: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    }
  });

  if (!request || request.type !== "REFUND_AFTER_DELIVERY") {
    throw Object.assign(new Error("Return request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (request.orderId !== opts.orderId) {
    throw Object.assign(new Error("Return request does not belong to this order"), {
      statusCode: 400,
      code: "ORDER_MISMATCH"
    });
  }
  if (!isApprovedReturnStatus(request.status)) {
    throw Object.assign(new Error("Return must be approved first"), { statusCode: 400, code: "NOT_APPROVED" });
  }

  const rs = request.returnShipment;
  if (rs?.receivedAt || request.returnPhysicalStatus === "RECEIVED" || request.returnPhysicalStatus === "INSPECTED") {
    throw Object.assign(new Error("Return already received — cannot schedule a new pickup"), {
      statusCode: 409,
      code: "ALREADY_RECEIVED"
    });
  }
  if (rs?.awb?.trim()) {
    throw Object.assign(
      new Error(`Pickup already has AWB ${rs.awb.trim()}. Use manual update or clear tracking first.`),
      { statusCode: 409, code: "AWB_EXISTS" }
    );
  }

  const approvedItems = request.items.filter((i) => i.reviewDecision === "APPROVED");
  if (!approvedItems.length) {
    throw Object.assign(new Error("No approved items to pick up"), {
      statusCode: 400,
      code: "NO_APPROVED_ITEMS"
    });
  }

  const order = request.order;
  const shipAddr = order.addresses.find((a) => a.type === "SHIPPING") ?? order.addresses[0];
  if (!shipAddr) {
    throw Object.assign(new Error("Order is missing a shipping address for pickup"), {
      statusCode: 400,
      code: "MISSING_ADDRESS"
    });
  }

  const orderItemById = new Map(order.items.map((it) => [it.id, it]));
  let weightG = 0;
  const descParts: string[] = [];
  for (const item of approvedItems) {
    const oi = orderItemById.get(item.orderItemId);
    const unitG = oi?.variant?.weightGrams && oi.variant.weightGrams > 0 ? oi.variant.weightGrams : 500;
    weightG += unitG * item.qtySelected;
    const sku = oi?.skuSnapshot?.trim() || oi?.variant?.sku?.trim();
    descParts.push(
      sku
        ? `${item.nameSnapshot} [${sku}] × ${item.qtySelected}`
        : `${item.nameSnapshot} × ${item.qtySelected}`
    );
  }
  weightG = Math.max(50, weightG || 500);
  const productsDesc = descParts.join("; ").slice(0, 240);

  const { resolveDelhiveryPickupName } = await import("../shipping/router");
  const { createReversePickup } = await import("../shipping/delhivery");

  const delhiveryPickup = await resolveDelhiveryPickupName(order.id);
  const pickupRow =
    (await prisma.pickupLocation.findFirst({
      where: { isActive: true, isPrimary: true }
    })) ??
    (await prisma.pickupLocation.findFirst({ where: { isActive: true } }));

  // Delhivery "Reference / order" field — keep under 50 chars, no spaces.
  const casePart = (request.caseNumber ?? "RET").replace(/\s+/g, "");
  const reverseOrderId = `${order.orderNumber}-${casePart}-RVP`.slice(0, 50);

  const created = await createReversePickup({
    orderNumber: reverseOrderId,
    consigneeName: shipAddr.fullName,
    consigneePhone: shipAddr.phone || order.phone,
    address: [shipAddr.line1, shipAddr.line2].filter(Boolean).join(", "),
    city: shipAddr.city,
    state: shipAddr.state,
    pincode: shipAddr.postalCode,
    pickupLocation: delhiveryPickup,
    channel: "www.sarveda.com",
    productsDesc,
    weightGrams: weightG,
    shippingMode: "S",
    reason: productsDesc.slice(0, 120),
    ...(pickupRow
      ? {
          returnName: pickupRow.contactPerson ?? pickupRow.label,
          returnPhone: pickupRow.phone ?? shipAddr.phone,
          returnAddress: [pickupRow.line1, pickupRow.line2].filter(Boolean).join(", "),
          returnCity: pickupRow.city ?? "",
          returnState: pickupRow.state ?? "",
          returnPin: pickupRow.postalCode ?? ""
        }
      : {})
  });

  if (!created.success) {
    logger.warn("delhivery_return_pickup_failed", {
      requestId: request.id,
      caseNumber: request.caseNumber,
      orderId: order.id,
      code: created.code,
      error: created.error
    });
    throw Object.assign(new Error(created.error || "Delhivery reverse pickup failed"), {
      statusCode: created.code === "DELHIVERY_NOT_CONFIGURED" ? 503 : 400,
      code: created.code ?? "DELHIVERY_REVERSE"
    });
  }

  await upsertReturnShipmentTracking({
    requestId: request.id,
    adminUserId: opts.adminUserId,
    courier: "Delhivery",
    awb: created.data.waybill,
    trackingUrl: created.data.trackingUrl,
    physicalStatus: "IN_TRANSIT",
    mode: "REVERSE_PICKUP"
  });

  logger.info("delhivery_return_pickup_created", {
    requestId: request.id,
    caseNumber: request.caseNumber,
    orderId: order.id,
    awb: created.data.waybill,
    adminEmail: opts.adminEmail ?? null
  });

  return {
    courier: "Delhivery",
    awb: created.data.waybill,
    trackingUrl: created.data.trackingUrl,
    mode: "REVERSE_PICKUP"
  };
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
    for (const item of request.items) {
      if (
        item.reviewDecision !== "APPROVED" ||
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

  void (async () => {
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    await notifyReturnCaseEvent(request.id, "RETURN_RECEIVED", {
      orderNumber: request.orderNumber,
      caseNumber: request.caseNumber,
      customerEmail: request.customerEmail,
      customerPhone: request.order.phone,
      itemSummary: request.items
        .filter((i) => i.reviewDecision === "APPROVED")
        .map((i) => `${i.nameSnapshot} × ${i.qtySelected}`)
        .join("; "),
      receivedAt: now
    });
  })();

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
        .filter(
          (i) =>
            i.reviewDecision === "APPROVED" &&
            i.requestedResolution !== "KEEP_ITEM_PARTIAL_REFUND"
        )
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

        if (
          opts.disposition !== "RESTOCKABLE" &&
          restockEvents.some((event) => event.inventoryIncremented)
        ) {
          throw Object.assign(
            new Error("Non-restockable return attempted to increase sellable inventory"),
            { statusCode: 500, code: "NON_SELLABLE_RETURN_INCREMENT_ATTEMPT" }
          );
        }
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
    restockLineCount: result.length,
    inventoryIncrementedCount: result.filter((event) => event.inventoryIncremented).length
  });

  return { restockEvents: result.length, alreadySet: false };
}
