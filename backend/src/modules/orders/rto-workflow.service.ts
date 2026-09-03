import {
  OrderInventoryRestockDisposition,
  OrderInventoryRestockSourceType,
  type RtoDisposition,
  type RtoRefundWorkflowStatus,
  type Shipment
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { tryPostCodOrderCancelledAccounting } from "../accounting/order-cancelled-posting.service";

import { loadOrderRefundPreview } from "./order-refund-preview.service";
import {
  applyOrderInventoryRestockTx,
  listOrderInventoryRestocks
} from "./order-inventory-restock.service";
import { handlePaidOrderStatusChange } from "./orders.service";
import { executeAuthoritativePartialRefund } from "../payments/partial-refund-settlement.service";
import { pickCapturedPaymentForRefund } from "../payments/payment-selection";

export const rtoDispositionBodySchema = z.object({
  disposition: z.enum(["RESTOCKABLE", "DAMAGED_NON_RESTOCKABLE", "NEEDS_REVIEW"])
});

export type RtoWorkflowShipmentView = {
  id: string;
  awb: string | null;
  courier: string;
  status: string;
  rtoAt: Date | null;
  rtoReceivedAt: Date | null;
  rtoReceivedByUserId: string | null;
  rtoDisposition: RtoDisposition | null;
  rtoDispositionAt: Date | null;
  rtoDispositionByUserId: string | null;
  rtoRefundWorkflowStatus: RtoRefundWorkflowStatus | null;
  rtoRefundLastError: string | null;
};

export type RtoWorkflowState = {
  shipments: RtoWorkflowShipmentView[];
  hasCarrierRto: boolean;
  anyReceived: boolean;
  restockEvents: Awaited<ReturnType<typeof listOrderInventoryRestocks>>;
  refundPreview: Awaited<ReturnType<typeof loadOrderRefundPreview>> | null;
  canMarkReceived: boolean;
  canSetDisposition: boolean;
  refundExecutionEnabled: boolean;
};

function isOnlineCapturedOrder(payments: Array<{ provider: string; status: string }>): boolean {
  return payments.some(
    (p) =>
      p.provider !== "COD" && ["CAPTURED", "PARTIALLY_REFUNDED"].includes(p.status)
  );
}

function initialRtoRefundStatus(
  payments: Array<{ provider: string; status: string }>
): RtoRefundWorkflowStatus {
  if (!isOnlineCapturedOrder(payments)) {
    return "NOT_APPLICABLE";
  }
  return "READY_FOR_REFUND";
}

function mapDispositionToRestock(
  disposition: RtoDisposition
): OrderInventoryRestockDisposition | null {
  if (disposition === "RESTOCKABLE") return OrderInventoryRestockDisposition.SELLABLE;
  if (disposition === "DAMAGED_NON_RESTOCKABLE") {
    return OrderInventoryRestockDisposition.NON_RESTOCKABLE;
  }
  return null;
}

export function serializeRtoShipment(s: Shipment): RtoWorkflowShipmentView {
  return {
    id: s.id,
    awb: s.awb,
    courier: s.courier,
    status: s.status,
    rtoAt: s.rtoAt,
    rtoReceivedAt: s.rtoReceivedAt,
    rtoReceivedByUserId: s.rtoReceivedByUserId,
    rtoDisposition: s.rtoDisposition,
    rtoDispositionAt: s.rtoDispositionAt,
    rtoDispositionByUserId: s.rtoDispositionByUserId,
    rtoRefundWorkflowStatus: s.rtoRefundWorkflowStatus,
    rtoRefundLastError: s.rtoRefundLastError
  };
}

export async function loadRtoWorkflowState(orderId: string): Promise<RtoWorkflowState | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      shipments: { orderBy: { createdAt: "desc" } },
      payments: true
    }
  });
  if (!order) return null;

  const rtoShipments = order.shipments.filter((s) => s.status === "RTO" || s.rtoAt != null);
  const hasCarrierRto = rtoShipments.length > 0;
  const anyReceived = rtoShipments.some((s) => s.rtoReceivedAt != null);

  let refundPreview: Awaited<ReturnType<typeof loadOrderRefundPreview>> | null = null;
  if (hasCarrierRto && anyReceived) {
    refundPreview = await loadOrderRefundPreview(orderId, { policy: "RTO_SHIPPING_RETAINED" });
  }

  const primaryRto = rtoShipments[0];
  const canMarkReceived = Boolean(
    primaryRto && primaryRto.status === "RTO" && !primaryRto.rtoReceivedAt
  );
  const canSetDisposition = Boolean(
    primaryRto &&
      primaryRto.rtoReceivedAt &&
      (!primaryRto.rtoDisposition || primaryRto.rtoDisposition === "NEEDS_REVIEW")
  );

  const restockEvents = await listOrderInventoryRestocks(orderId);

  const primaryRtoShipment = rtoShipments[0];
  let refundExecutionEnabled = false;
  if (hasCarrierRto && anyReceived && primaryRtoShipment?.rtoDisposition && primaryRtoShipment.rtoDisposition !== "NEEDS_REVIEW") {
    const pick = pickCapturedPaymentForRefund(order.payments);
    if (pick.ok && refundPreview?.ok) {
      refundExecutionEnabled =
        primaryRtoShipment.rtoRefundWorkflowStatus === "READY_FOR_REFUND" ||
        primaryRtoShipment.rtoRefundWorkflowStatus === "FAILED";
    }
  }

  return {
    shipments: rtoShipments.map(serializeRtoShipment),
    hasCarrierRto,
    anyReceived,
    restockEvents,
    refundPreview,
    canMarkReceived,
    canSetDisposition,
    refundExecutionEnabled
  };
}

export async function markRtoReceived(opts: {
  shipmentId: string;
  adminUserId?: string;
}): Promise<{ shipment: RtoWorkflowShipmentView; alreadyReceived: boolean }> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: opts.shipmentId },
    include: { order: { include: { payments: true } } }
  });

  if (!shipment) {
    throw Object.assign(new Error("Shipment not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (shipment.status !== "RTO") {
    throw Object.assign(new Error("Shipment is not in carrier RTO state"), {
      statusCode: 400,
      code: "NOT_RTO_SHIPMENT"
    });
  }

  if (shipment.rtoReceivedAt) {
    return { shipment: serializeRtoShipment(shipment), alreadyReceived: true };
  }

  const refundStatus = initialRtoRefundStatus(shipment.order.payments);

  const updated = await prisma.shipment.update({
    where: { id: opts.shipmentId },
    data: {
      rtoReceivedAt: new Date(),
      rtoReceivedByUserId: opts.adminUserId ?? null,
      rtoRefundWorkflowStatus: refundStatus
    }
  });

  const note = `RTO parcel physically received at Sarveda — AWB ${shipment.awb ?? "n/a"}`;
  const order = shipment.order;
  await prisma.order.update({
    where: { id: order.id },
    data: {
      notes: order.notes ? `${order.notes}\n${note}` : note
    }
  });

  logger.info("rto_physical_receipt_recorded", {
    orderId: order.id,
    shipmentId: opts.shipmentId,
    awb: shipment.awb,
    adminUserId: opts.adminUserId
  });

  return { shipment: serializeRtoShipment(updated), alreadyReceived: false };
}

export async function setRtoDisposition(opts: {
  shipmentId: string;
  disposition: RtoDisposition;
  adminUserId?: string;
}): Promise<{
  shipment: RtoWorkflowShipmentView;
  restockEvents: Awaited<ReturnType<typeof applyOrderInventoryRestockTx>>;
  alreadySet: boolean;
}> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: opts.shipmentId },
    include: {
      order: {
        include: {
          items: { select: { id: true, qtyOrdered: true } },
          payments: true
        }
      }
    }
  });

  if (!shipment) {
    throw Object.assign(new Error("Shipment not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (!shipment.rtoReceivedAt) {
    throw Object.assign(new Error("Mark RTO received before setting disposition"), {
      statusCode: 400,
      code: "RTO_NOT_RECEIVED"
    });
  }

  if (shipment.rtoDisposition === opts.disposition) {
    return {
      shipment: serializeRtoShipment(shipment),
      restockEvents: [],
      alreadySet: true
    };
  }

  if (shipment.rtoDisposition && shipment.rtoDisposition !== opts.disposition) {
    if (shipment.rtoDisposition !== "NEEDS_REVIEW") {
      throw Object.assign(new Error("Disposition already set and cannot be changed"), {
        statusCode: 409,
        code: "DISPOSITION_LOCKED"
      });
    }
  }

  const restockDisposition = mapDispositionToRestock(opts.disposition);
  const sourceId = `${opts.shipmentId}:rto-disposition:${opts.disposition}`;

  const result = await prisma.$transaction(async (tx) => {
    let restockEvents: Awaited<ReturnType<typeof applyOrderInventoryRestockTx>> = [];

    if (restockDisposition) {
      restockEvents = await applyOrderInventoryRestockTx(tx, {
        orderId: shipment.orderId,
        sourceType: OrderInventoryRestockSourceType.RTO_PHYSICAL_RECEIPT,
        sourceId,
        reason: `RTO disposition: ${opts.disposition}`,
        createdByUserId: opts.adminUserId,
        lines: shipment.order.items.map((item) => ({
          orderItemId: item.id,
          quantity: item.qtyOrdered,
          disposition: restockDisposition
        }))
      });
    }

    const isCod = shipment.order.payments.some((p) => p.provider === "COD");
    const codClosure =
      isCod &&
      !["CANCELLED", "REFUNDED"].includes(shipment.order.status) &&
      opts.disposition !== "NEEDS_REVIEW";

    const updated = await tx.shipment.update({
      where: { id: opts.shipmentId },
      data: {
        rtoDisposition: opts.disposition,
        rtoDispositionAt: shipment.rtoDispositionAt ?? new Date(),
        rtoDispositionByUserId: opts.adminUserId ?? shipment.rtoDispositionByUserId,
        ...(codClosure && isCod
          ? { rtoRefundWorkflowStatus: "NOT_APPLICABLE" as RtoRefundWorkflowStatus }
          : {})
      }
    });

    // COD order closure + ORDER_CANCELLED accounting happen after this transaction
    // via handlePaidOrderStatusChange — never a raw status update here.

    return { updated, restockEvents, codClosure };
  });

  if (result.codClosure) {
    const fresh = await prisma.order.findUnique({
      where: { id: shipment.orderId },
      select: { status: true }
    });
    if (fresh && !["CANCELLED", "REFUNDED"].includes(fresh.status)) {
      await handlePaidOrderStatusChange(
        shipment.orderId,
        "CANCELLED",
        `COD RTO — disposition ${opts.disposition}`
      );
    } else {
      // Already cancelled (retry) — ensure accounting posts exactly once.
      await tryPostCodOrderCancelledAccounting(shipment.orderId);
    }
  }

  logger.info("rto_disposition_set", {
    orderId: shipment.orderId,
    shipmentId: opts.shipmentId,
    disposition: opts.disposition,
    restockLineCount: result.restockEvents.length,
    sellableIncremented: result.restockEvents.filter((e) => e.inventoryIncremented).length
  });

  return {
    shipment: serializeRtoShipment(result.updated),
    restockEvents: result.restockEvents,
    alreadySet: Boolean(shipment.rtoDisposition === opts.disposition)
  };
}

export async function orderHasActiveRtoShipment(orderId: string): Promise<boolean> {
  const count = await prisma.shipment.count({
    where: {
      orderId,
      OR: [{ status: "RTO" }, { rtoAt: { not: null } }]
    }
  });
  return count > 0;
}

/** Execute RTO merchandise refund (shipping retained) via Phase 1E partial settlement. */
export async function executeRtoRefund(opts: {
  shipmentId: string;
  adminUserId?: string;
}): Promise<{ refundId: string; amountInPaise: number }> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: opts.shipmentId },
    include: { order: { include: { payments: true } } }
  });
  if (!shipment) {
    throw Object.assign(new Error("Shipment not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (!shipment.rtoReceivedAt) {
    throw Object.assign(new Error("RTO must be physically received first"), {
      statusCode: 400,
      code: "RTO_NOT_RECEIVED"
    });
  }
  if (!shipment.rtoDisposition || shipment.rtoDisposition === "NEEDS_REVIEW") {
    throw Object.assign(new Error("Set RTO disposition before refund"), {
      statusCode: 400,
      code: "DISPOSITION_REQUIRED"
    });
  }

  const preview = await loadOrderRefundPreview(shipment.orderId, { policy: "RTO_SHIPPING_RETAINED" });
  if (!preview.ok || !preview.breakdown?.proposedRefundAmountPaise) {
    throw Object.assign(new Error(!preview.ok ? preview.message : "Refund not available"), {
      statusCode: 422,
      code: !preview.ok ? preview.code : "REFUND_UNAVAILABLE"
    });
  }

  await prisma.shipment.update({
    where: { id: opts.shipmentId },
    data: { rtoRefundWorkflowStatus: "PROCESSING", rtoRefundLastError: null }
  });

  try {
    const result = await executeAuthoritativePartialRefund({
      orderId: shipment.orderId,
      sourceType: "RTO",
      sourceId: opts.shipmentId,
      reason: `RTO refund — AWB ${shipment.awb ?? "n/a"}`,
      policy: "RTO_SHIPPING_RETAINED"
    });

    await prisma.shipment.update({
      where: { id: opts.shipmentId },
      data: { rtoRefundWorkflowStatus: "REFUNDED" }
    });

    logger.info("rto_refund_executed", {
      orderId: shipment.orderId,
      shipmentId: opts.shipmentId,
      refundId: result.refundId,
      amountInPaise: result.amountInPaise
    });

    return { refundId: result.refundId, amountInPaise: result.amountInPaise };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.shipment.update({
      where: { id: opts.shipmentId },
      data: { rtoRefundWorkflowStatus: "FAILED", rtoRefundLastError: msg }
    });
    throw err;
  }
}

/** Customer-facing RTO status derived from shipment workflow fields. */
export function deriveCustomerRtoStatus(input: {
  shipments: Array<{
    status: string;
    rtoAt?: Date | null;
    rtoReceivedAt?: Date | null;
    rtoDisposition?: RtoDisposition | null;
    rtoRefundWorkflowStatus?: RtoRefundWorkflowStatus | null;
  }>;
  paymentStatus: string;
  payments?: Array<{ provider: string }>;
}): { inRto: boolean; label: string; detail?: string } | null {
  const rtoShipment = input.shipments.find((s) => s.status === "RTO" || s.rtoAt);
  if (!rtoShipment) return null;

  const isOnline = input.payments?.some((p) => p.provider !== "COD") ?? false;

  if (!rtoShipment.rtoReceivedAt) {
    return {
      inRto: true,
      label: "Return in transit",
      detail: "Your shipment is returning to us."
    };
  }

  if (rtoShipment.rtoRefundWorkflowStatus === "REFUNDED" || input.paymentStatus === "REFUNDED") {
    return {
      inRto: true,
      label: "Return processed",
      detail: isOnline
        ? "We received your return and your refund has been processed."
        : "We received your returned shipment."
    };
  }

  if (rtoShipment.rtoReceivedAt) {
    return {
      inRto: true,
      label: "Return received",
      detail: isOnline
        ? "We received your return. Refund will be processed after review (typically 5–7 business days)."
        : "We received your returned shipment."
    };
  }

  return {
    inRto: true,
    label: "Return in transit",
    detail: "Your shipment is returning to us."
  };
}
