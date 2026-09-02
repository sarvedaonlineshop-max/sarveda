import {
  OrderInventoryRestockDisposition,
  OrderInventoryRestockSourceType,
  OrderServiceRequestExecutionStatus,
  OrderServiceRequestIntent,
  type Prisma
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import {
  assertFulfillmentAllowed,
  getVariantFulfillmentAvailability,
  variantFulfillmentInputFromVariant
} from "../inventory/variant-fulfillment-availability";
import { orderItemWarehouseUnits } from "../inventory/order-item-fulfillment";

import { calculateAdjustmentCommercialDelta, reasonCodeToIntent } from "./order-adjustment-calculator.service";
import { cancelReasonLabel } from "./order-service-request.constants";
import type {
  AddressSnapshot,
  AdjustmentPayload,
  AdjustmentExecutionPreview,
  CommercialClassification,
  LineItemSnapshot
} from "./order-adjustment.types";
import { getCancellationEligibility } from "./cancellation-eligibility";
import { applyOrderInventoryRestockTx } from "./order-inventory-restock.service";
import { executeApprovedCancellationRequest } from "./order-service-request.service";
import { executeAuthoritativePartialRefund } from "../payments/partial-refund-settlement.service";

export { reasonCodeToIntent } from "./order-adjustment-calculator.service";

export function isAdjustmentReasonCode(code: string): boolean {
  return reasonCodeToIntent(code) != null;
}

function addressFromOrderRow(row: {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}): AddressSnapshot {
  return {
    fullName: row.fullName,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country
  };
}

function lineSnapshotFromItem(item: {
  id: string;
  variantId: string;
  skuSnapshot: string;
  nameSnapshot: string;
  qtyOrdered: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
}): LineItemSnapshot {
  return {
    orderItemId: item.id,
    variantId: item.variantId,
    skuSnapshot: item.skuSnapshot,
    nameSnapshot: item.nameSnapshot,
    qtyOrdered: item.qtyOrdered,
    unitPriceInPaise: item.unitPriceInPaise,
    lineTotalInPaise: item.lineTotalInPaise
  };
}

export function buildAdjustmentPayload(opts: {
  intent: OrderServiceRequestIntent;
  orderItem: {
    id: string;
    variantId: string;
    skuSnapshot: string;
    nameSnapshot: string;
    qtyOrdered: number;
    unitPriceInPaise: number;
    lineTotalInPaise: number;
  };
  shippingAddress?: AddressSnapshot;
  requested: AdjustmentPayload["requested"];
}): AdjustmentPayload {
  return {
    intent: opts.intent,
    before: {
      ...(opts.shippingAddress ? { shippingAddress: opts.shippingAddress } : {}),
      line: lineSnapshotFromItem(opts.orderItem)
    },
    requested: opts.requested,
    submittedAt: new Date().toISOString()
  };
}

export async function loadAdjustmentExecutionPreview(
  requestId: string
): Promise<AdjustmentExecutionPreview | null> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: requestId },
    include: {
      order: {
        include: {
          items: true,
          addresses: true,
          shipments: { select: { status: true } },
          payments: { orderBy: { createdAt: "desc" } }
        }
      }
    }
  });
  if (!request || request.type !== "ADJUST_BEFORE_DELIVERY" || !request.adjustmentPayload) {
    return null;
  }

  const payload = request.adjustmentPayload as AdjustmentPayload;
  const eligibility = getCancellationEligibility({
    status: request.order.status,
    paymentStatus: request.order.paymentStatus,
    payments: request.order.payments,
    shipments: request.order.shipments
  });

  const inventoryWarnings: string[] = [];
  let requestedVariant: {
    id: string;
    saleInPaise: number;
    status: string;
    dropShipEnabled: boolean;
    inventory: { onHand: number; reserved: number } | null;
  } | null = null;

  if (payload.intent === "CHANGE_ITEM_VARIANT" && payload.requested.variantId) {
    requestedVariant = await prisma.productVariant.findUnique({
      where: { id: payload.requested.variantId },
      select: { id: true, saleInPaise: true, status: true, dropShipEnabled: true, inventory: true }
    });
    if (!requestedVariant || requestedVariant.status !== "ACTIVE") {
      inventoryWarnings.push("Requested variant is not available");
    } else {
      const qty = payload.before.line?.qtyOrdered ?? 1;
      try {
        assertFulfillmentAllowed(variantFulfillmentInputFromVariant(requestedVariant), qty);
      } catch {
        inventoryWarnings.push("Insufficient stock for requested variant");
      }
    }
  }

  if (payload.intent === "CHANGE_QUANTITY" && payload.before.line) {
    const newQty = payload.requested.qtyOrdered ?? payload.before.line.qtyOrdered;
    const delta = newQty - payload.before.line.qtyOrdered;
    if (delta > 0) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: payload.before.line.variantId },
        select: { dropShipEnabled: true, inventory: true }
      });
      if (variant) {
        try {
          assertFulfillmentAllowed(variantFulfillmentInputFromVariant(variant), newQty);
        } catch {
          inventoryWarnings.push("Insufficient stock for quantity increase");
        }
      }
    }
  }

  const delta = calculateAdjustmentCommercialDelta({
    order: request.order,
    items: request.order.items,
    payload,
    requestedVariant
  });

  if (!eligibility.adminCanApproveCancel) {
    return {
      ...delta,
      eligible: false,
      blockCode: eligibility.blockCode ?? "CANCELLATION_NOT_ALLOWED_AFTER_DISPATCH",
      blockMessage:
        eligibility.customerMessage ??
        "Order is no longer eligible for adjustment — it may have been dispatched.",
      inventoryWarnings
    };
  }

  if (inventoryWarnings.length) {
    return {
      ...delta,
      eligible: false,
      blockCode: "INSUFFICIENT_STOCK",
      blockMessage: inventoryWarnings.join("; "),
      inventoryWarnings
    };
  }

  return {
    ...delta,
    eligible: delta.canExecuteAutomatically,
    inventoryWarnings
  };
}

function executionStatusFromClassification(
  classification: CommercialClassification,
  dispatched: boolean
): OrderServiceRequestExecutionStatus {
  if (dispatched) return "BLOCKED_AFTER_DISPATCH";
  switch (classification) {
    case "NO_PAYMENT_CHANGE":
      return "PENDING";
    case "ADDITIONAL_PAYMENT_REQUIRED":
      return "ADDITIONAL_PAYMENT_REQUIRED";
    case "REFUND_REQUIRED":
      return "REFUND_REQUIRED";
    case "COMMERCIAL_REVIEW_REQUIRED":
      return "COMMERCIAL_REVIEW_REQUIRED";
    case "ACCOUNTING_REVIEW_REQUIRED":
      return "ACCOUNTING_REVIEW_REQUIRED";
    default:
      return "PENDING";
  }
}

async function applyAddressChangeTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  address: AddressSnapshot
): Promise<void> {
  await tx.orderAddress.updateMany({
    where: { orderId, type: "SHIPPING" },
    data: {
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country
    }
  });
}

async function applyVariantSwapTx(
  tx: Prisma.TransactionClient,
  opts: {
    orderId: string;
    orderItemId: string;
    oldVariantId: string;
    newVariantId: string;
    qty: number;
    newVariant: { sku: string; saleInPaise: number; productRel: { name: string } };
    sourceId: string;
    adminUserId?: string;
  }
): Promise<void> {
  await applyOrderInventoryRestockTx(tx, {
    orderId: opts.orderId,
    sourceType: OrderInventoryRestockSourceType.ORDER_ADJUSTMENT,
    sourceId: `${opts.sourceId}:release`,
    reason: "Adjustment variant swap — release old",
    createdByUserId: opts.adminUserId,
    lines: [
      {
        orderItemId: opts.orderItemId,
        quantity: opts.qty,
        disposition: OrderInventoryRestockDisposition.SELLABLE
      }
    ]
  });

  const inv = await tx.inventory.findUnique({ where: { variantId: opts.newVariantId } });
  const variantRow = await tx.productVariant.findUnique({
    where: { id: opts.newVariantId },
    include: { inventory: true, productRel: true }
  });
  if (!variantRow) {
    throw Object.assign(new Error("Variant not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  const allocation = assertFulfillmentAllowed(
    variantFulfillmentInputFromVariant(variantRow),
    opts.qty
  );
  if (inv && allocation.warehouseFulfillmentQty > 0) {
    const available = inv.onHand - inv.reserved;
    if (available < allocation.warehouseFulfillmentQty) {
      throw Object.assign(new Error("Insufficient stock for new variant"), {
        statusCode: 409,
        code: "INSUFFICIENT_STOCK"
      });
    }
    await tx.inventory.update({
      where: { id: inv.id },
      data: { onHand: { decrement: allocation.warehouseFulfillmentQty } }
    });
  }

  const lineTotal = opts.newVariant.saleInPaise * opts.qty;
  await tx.orderItem.update({
    where: { id: opts.orderItemId },
    data: {
      variantId: opts.newVariantId,
      skuSnapshot: opts.newVariant.sku,
      nameSnapshot: opts.newVariant.productRel.name,
      unitPriceInPaise: opts.newVariant.saleInPaise,
      lineTotalInPaise: lineTotal,
      qtyOrdered: opts.qty,
      warehouseFulfillmentQty: allocation.warehouseFulfillmentQty,
      dropShipFulfillmentQty: allocation.dropShipFulfillmentQty
    }
  });
}

async function applyQuantityChangeTx(
  tx: Prisma.TransactionClient,
  opts: {
    orderId: string;
    orderItemId: string;
    variantId: string;
    oldQty: number;
    newQty: number;
    unitPriceInPaise: number;
    sourceId: string;
    adminUserId?: string;
  }
): Promise<void> {
  const delta = opts.newQty - opts.oldQty;
  const variant = await tx.productVariant.findUnique({
    where: { id: opts.variantId },
    include: { inventory: true }
  });
  const allocation = assertFulfillmentAllowed(
    variantFulfillmentInputFromVariant(variant ?? { inventory: null }),
    opts.newQty
  );
  const current = await tx.orderItem.findUnique({
    where: { id: opts.orderItemId },
    select: {
      qtyOrdered: true,
      warehouseFulfillmentQty: true,
      dropShipFulfillmentQty: true
    }
  });
  const oldWarehouseQty = current ? orderItemWarehouseUnits(current) : opts.oldQty;
  const whDelta = allocation.warehouseFulfillmentQty - oldWarehouseQty;

  if (whDelta > 0) {
    const inv = variant?.inventory ?? null;
    if (inv) {
      const available = inv.onHand - inv.reserved;
      if (available < whDelta) {
        throw Object.assign(new Error("Insufficient stock for quantity increase"), {
          statusCode: 409,
          code: "INSUFFICIENT_STOCK"
        });
      }
      await tx.inventory.update({
        where: { id: inv.id },
        data: { onHand: { decrement: whDelta } }
      });
    }
  } else if (whDelta < 0) {
    await applyOrderInventoryRestockTx(tx, {
      orderId: opts.orderId,
      sourceType: OrderInventoryRestockSourceType.ORDER_ADJUSTMENT,
      sourceId: `${opts.sourceId}:qty-decrease`,
      reason: "Adjustment quantity decrease",
      createdByUserId: opts.adminUserId,
      lines: [
        {
          orderItemId: opts.orderItemId,
          quantity: Math.abs(whDelta),
          disposition: OrderInventoryRestockDisposition.SELLABLE
        }
      ]
    });
  }

  await tx.orderItem.update({
    where: { id: opts.orderItemId },
    data: {
      qtyOrdered: opts.newQty,
      warehouseFulfillmentQty: allocation.warehouseFulfillmentQty,
      dropShipFulfillmentQty: allocation.dropShipFulfillmentQty,
      lineTotalInPaise: opts.unitPriceInPaise * opts.newQty
    }
  });
}

async function recomputeOrderTotalsTx(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });
  if (!order) return;
  const subtotal = order.items.reduce((s, i) => s + i.lineTotalInPaise, 0);
  const grandTotal = subtotal - order.discountInPaise + order.shippingInPaise + order.taxInPaise;
  await tx.order.update({
    where: { id: orderId },
    data: { subtotalInPaise: subtotal, grandTotalInPaise: grandTotal }
  });
}

/**
 * Execute a pre-dispatch adjustment — idempotent on request.executionSourceId.
 * Re-checks dispatch eligibility at execution time.
 */
export async function executeAdjustmentRequest(opts: {
  orderId: string;
  requestId: string;
  adminEmail: string;
  adminUserId?: string;
  adminNote?: string;
}): Promise<{ executionStatus: OrderServiceRequestExecutionStatus; message: string }> {
  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId },
    include: {
      order: {
        include: {
          items: true,
          addresses: true,
          shipments: { select: { status: true } },
          payments: { orderBy: { createdAt: "desc" } }
        }
      }
    }
  });

  if (!request) {
    throw Object.assign(new Error("Request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (request.type !== "ADJUST_BEFORE_DELIVERY") {
    throw Object.assign(new Error("Not an adjustment request"), { statusCode: 400, code: "NOT_ADJUSTMENT" });
  }
  if (request.executionStatus === "EXECUTED") {
    return { executionStatus: "EXECUTED", message: "Adjustment already executed (idempotent)" };
  }
  if (!["PENDING_APPROVAL", "NEEDS_DISCUSSION"].includes(request.status)) {
    throw Object.assign(new Error("Request is not pending execution"), {
      statusCode: 409,
      code: "INVALID_REQUEST_STATE"
    });
  }

  const payload = request.adjustmentPayload as AdjustmentPayload | null;
  if (!payload) {
    throw Object.assign(new Error("Missing adjustment payload"), { statusCode: 400, code: "BAD_PAYLOAD" });
  }

  const preview = await loadAdjustmentExecutionPreview(request.id);
  if (!preview) {
    throw Object.assign(new Error("Could not compute adjustment preview"), { statusCode: 400, code: "PREVIEW_FAILED" });
  }

  const eligibility = getCancellationEligibility({
    status: request.order.status,
    paymentStatus: request.order.paymentStatus,
    payments: request.order.payments,
    shipments: request.order.shipments
  });

  if (!eligibility.adminCanApproveCancel) {
    await prisma.orderServiceRequest.update({
      where: { id: request.id },
      data: {
        executionStatus: "BLOCKED_AFTER_DISPATCH",
        executionError: eligibility.customerMessage ?? "Order dispatched"
      }
    });
    throw Object.assign(
      new Error(eligibility.customerMessage ?? "Order was dispatched — adjustment blocked"),
      { statusCode: 409, code: "BLOCKED_AFTER_DISPATCH" }
    );
  }

  if (!preview.canExecuteAutomatically || !preview.eligible) {
    if (
      preview.classification === "REFUND_REQUIRED" &&
      preview.deltaPaise < 0 &&
      eligibility.adminCanApproveCancel
    ) {
      return executeAdjustmentWithRefund({
        ...opts,
        request,
        payload,
        preview,
        sourceId: request.executionSourceId ?? request.id
      });
    }
    if (preview.classification === "ADDITIONAL_PAYMENT_REQUIRED") {
      throw Object.assign(
        new Error(
          "Additional payment required — create supplementary payment before executing this adjustment."
        ),
        { statusCode: 409, code: "ADDITIONAL_PAYMENT_REQUIRED" }
      );
    }
    const execStatus = executionStatusFromClassification(
      preview.classification,
      !eligibility.adminCanApproveCancel
    );
    await prisma.orderServiceRequest.update({
      where: { id: request.id },
      data: {
        executionStatus: execStatus,
        commercialDeltaPaise: preview.deltaPaise,
        commercialClassification: preview.classification,
        executionError: preview.warnings.join("; ") || preview.blockMessage || null
      }
    });
    throw Object.assign(
      new Error(
        preview.blockMessage ??
          preview.warnings[0] ??
          `Adjustment requires ${preview.classification} — cannot auto-execute`
      ),
      { statusCode: 409, code: preview.classification }
    );
  }

  const sourceId = request.executionSourceId ?? request.id;

  await applyAdjustmentMutation({
    requestId: request.id,
    orderId: request.orderId,
    payload,
    sourceId,
    adminEmail: opts.adminEmail,
    adminUserId: opts.adminUserId,
    adminNote: opts.adminNote,
    preview
  });

  logger.info("adjustment_executed", {
    orderId: opts.orderId,
    requestId: opts.requestId,
    intent: payload.intent
  });

  return {
    executionStatus: "EXECUTED",
    message: "Adjustment applied successfully"
  };
}

export async function applyAdjustmentMutation(opts: {
  requestId: string;
  orderId: string;
  payload: AdjustmentPayload;
  sourceId: string;
  adminEmail: string;
  adminUserId?: string;
  adminNote?: string;
  preview: Awaited<ReturnType<typeof loadAdjustmentExecutionPreview>>;
  executionStatus?: OrderServiceRequestExecutionStatus;
  markApproved?: boolean;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.orderServiceRequest.findUnique({ where: { id: opts.requestId } });
    if (locked?.executionStatus === "EXECUTED") return;

    if (opts.payload.intent === "CHANGE_ADDRESS" && opts.payload.requested.shippingAddress) {
      await applyAddressChangeTx(tx, opts.orderId, opts.payload.requested.shippingAddress);
    }

    if (opts.payload.intent === "CHANGE_ITEM_VARIANT" && opts.payload.before.line && opts.payload.requested.variantId) {
      const newVariant = await tx.productVariant.findUnique({
        where: { id: opts.payload.requested.variantId },
        include: { productRel: { select: { name: true } }, inventory: true }
      });
      if (!newVariant) {
        throw Object.assign(new Error("Variant not found"), { statusCode: 400, code: "VARIANT_NOT_FOUND" });
      }
      await applyVariantSwapTx(tx, {
        orderId: opts.orderId,
        orderItemId: opts.payload.before.line.orderItemId,
        oldVariantId: opts.payload.before.line.variantId,
        newVariantId: newVariant.id,
        qty: opts.payload.before.line.qtyOrdered,
        newVariant,
        sourceId: opts.sourceId,
        adminUserId: opts.adminUserId
      });
      await recomputeOrderTotalsTx(tx, opts.orderId);
    }

    if (opts.payload.intent === "CHANGE_QUANTITY" && opts.payload.before.line && opts.payload.requested.qtyOrdered) {
      await applyQuantityChangeTx(tx, {
        orderId: opts.orderId,
        orderItemId: opts.payload.before.line.orderItemId,
        variantId: opts.payload.before.line.variantId,
        oldQty: opts.payload.before.line.qtyOrdered,
        newQty: opts.payload.requested.qtyOrdered,
        unitPriceInPaise: opts.payload.before.line.unitPriceInPaise,
        sourceId: opts.sourceId,
        adminUserId: opts.adminUserId
      });
      await recomputeOrderTotalsTx(tx, opts.orderId);
    }

    if (opts.markApproved !== false) {
      await tx.orderServiceRequest.update({
        where: { id: opts.requestId },
        data: {
          status: "APPROVED",
          executionStatus: opts.executionStatus ?? "EXECUTED",
          executionSourceId: opts.sourceId,
          executedAt: opts.executionStatus === "EXECUTED" || !opts.executionStatus ? new Date() : undefined,
          reviewedAt: new Date(),
          reviewedByEmail: opts.adminEmail,
          reviewedByUserId: opts.adminUserId ?? null,
          adminNote: opts.adminNote?.trim() || null,
          commercialDeltaPaise: opts.preview!.deltaPaise,
          commercialClassification: opts.preview!.classification,
          executionError: null
        }
      });
    }
  });
}

async function executeAdjustmentWithRefund(opts: {
  orderId: string;
  requestId: string;
  adminEmail: string;
  adminUserId?: string;
  adminNote?: string;
  request: { id: string; executionSourceId: string | null };
  payload: AdjustmentPayload;
  preview: NonNullable<Awaited<ReturnType<typeof loadAdjustmentExecutionPreview>>>;
  sourceId: string;
}): Promise<{ executionStatus: OrderServiceRequestExecutionStatus; message: string }> {
  const refundPaise = Math.abs(opts.preview.deltaPaise);
  const orderItemId = opts.payload.before.line?.orderItemId;

  await prisma.orderServiceRequest.update({
    where: { id: opts.requestId },
    data: { executionStatus: "REFUND_PROCESSING" }
  });

  try {
    await applyAdjustmentMutation({
      requestId: opts.requestId,
      orderId: opts.orderId,
      payload: opts.payload,
      sourceId: opts.sourceId,
      adminEmail: opts.adminEmail,
      adminUserId: opts.adminUserId,
      adminNote: opts.adminNote,
      preview: opts.preview,
      executionStatus: "REFUND_PROCESSING",
      markApproved: false
    });

    await executeAuthoritativePartialRefund({
      orderId: opts.orderId,
      sourceType: "ORDER_ADJUSTMENT",
      sourceId: opts.requestId,
      reason: `Order adjustment refund — request ${opts.requestId.slice(0, 8)}`,
      adjustmentMerchandiseRefundPaise: refundPaise,
      orderItemId
    });

    await prisma.orderServiceRequest.update({
      where: { id: opts.requestId },
      data: {
        status: "APPROVED",
        executionStatus: "EXECUTED",
        executionSourceId: opts.sourceId,
        executedAt: new Date(),
        reviewedAt: new Date(),
        reviewedByEmail: opts.adminEmail,
        reviewedByUserId: opts.adminUserId ?? null,
        adminNote: opts.adminNote?.trim() || null,
        commercialDeltaPaise: opts.preview.deltaPaise,
        commercialClassification: opts.preview.classification,
        executionError: null
      }
    });

    return {
      executionStatus: "EXECUTED",
      message: "Adjustment applied and partial refund initiated"
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.orderServiceRequest.update({
      where: { id: opts.requestId },
      data: {
        executionStatus: "FAILED",
        executionError: `Mutation/refund failed: ${msg}`
      }
    });
    throw err;
  }
}

export async function markAdjustmentNeedsDiscussion(opts: {
  orderId: string;
  requestId: string;
  adminEmail: string;
  adminNote?: string;
}): Promise<void> {
  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId, type: "ADJUST_BEFORE_DELIVERY" }
  });
  if (!request || request.status !== "PENDING_APPROVAL") {
    throw Object.assign(new Error("Request not found or not pending"), { statusCode: 409, code: "INVALID_STATE" });
  }
  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: {
      status: "NEEDS_DISCUSSION",
      reviewedAt: new Date(),
      reviewedByEmail: opts.adminEmail,
      adminNote: opts.adminNote?.trim() || null,
      executionStatus: "PENDING"
    }
  });
}

export async function convertAdjustmentToCancellation(opts: {
  orderId: string;
  requestId: string;
  adminEmail: string;
  adminNote?: string;
}): Promise<void> {
  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId, type: "ADJUST_BEFORE_DELIVERY" },
    include: { items: true }
  });
  if (!request) {
    throw Object.assign(new Error("Request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (!["PENDING_APPROVAL", "NEEDS_DISCUSSION"].includes(request.status)) {
    throw Object.assign(new Error("Request cannot be converted"), { statusCode: 409, code: "INVALID_STATE" });
  }

  const customerReasonText = request.reasonLabel ?? "Converted from adjustment request";
  await executeApprovedCancellationRequest({
    orderId: request.orderId,
    reason: customerReasonText
  });

  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: {
      status: "CONVERTED_TO_CANCELLATION",
      reviewedAt: new Date(),
      reviewedByEmail: opts.adminEmail,
      adminNote: opts.adminNote?.trim() || "Converted to cancellation",
      executionStatus: "NOT_APPLICABLE"
    }
  });
}

export async function loadShippingAddressSnapshot(orderId: string): Promise<AddressSnapshot | null> {
  const row = await prisma.orderAddress.findFirst({
    where: { orderId, type: "SHIPPING" }
  });
  return row ? addressFromOrderRow(row) : null;
}

export type SubmitAdjustmentInput = {
  orderNumber: string;
  userId: string;
  userEmail: string;
  reasonCode: "change_address" | "wrong_item" | "change_quantity";
  orderItemId: string;
  message?: string;
  requestedAddress?: AddressSnapshot;
  requestedVariantId?: string;
  requestedQty?: number;
};

export async function submitAdjustmentRequest(opts: SubmitAdjustmentInput) {
  const intent = reasonCodeToIntent(opts.reasonCode);
  if (!intent) {
    throw Object.assign(new Error("Invalid adjustment reason"), { statusCode: 400, code: "BAD_REASON" });
  }

  const email = opts.userEmail.trim().toLowerCase();
  const order = await prisma.order.findFirst({
    where: {
      orderNumber: opts.orderNumber,
      deletedAt: null,
      OR: [{ customerId: opts.userId }, { email }]
    },
    include: {
      items: true,
      addresses: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      shipments: { select: { status: true } }
    }
  });

  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const existingPending = await prisma.orderServiceRequest.findFirst({
    where: { orderId: order.id, status: "PENDING_APPROVAL" }
  });
  if (existingPending) {
    throw Object.assign(new Error("A request is already waiting for approval on this order"), {
      statusCode: 409,
      code: "REQUEST_PENDING"
    });
  }

  const eligibility = getCancellationEligibility({
    status: order.status,
    paymentStatus: order.paymentStatus,
    payments: order.payments,
    shipments: order.shipments
  });
  if (!eligibility.customerCanRequest) {
    throw Object.assign(
      new Error(
        eligibility.customerMessage ??
          "This order cannot be changed online — it may already be dispatched."
      ),
      { statusCode: 400, code: eligibility.blockCode ?? "NOT_ELIGIBLE" }
    );
  }

  const orderItem = order.items.find((i) => i.id === opts.orderItemId);
  if (!orderItem) {
    throw Object.assign(new Error("Invalid order item"), { statusCode: 400, code: "BAD_ITEM" });
  }

  if (intent === "CHANGE_ADDRESS") {
    if (!opts.requestedAddress) {
      throw Object.assign(new Error("Proposed shipping address is required"), {
        statusCode: 400,
        code: "ADDRESS_REQUIRED"
      });
    }
  }
  if (intent === "CHANGE_ITEM_VARIANT") {
    if (!opts.requestedVariantId) {
      throw Object.assign(new Error("Requested variant is required"), {
        statusCode: 400,
        code: "VARIANT_REQUIRED"
      });
    }
    const currentVariant = await prisma.productVariant.findUnique({
      where: { id: orderItem.variantId },
      select: { productId: true }
    });
    const requestedVariant = await prisma.productVariant.findUnique({
      where: { id: opts.requestedVariantId },
      select: { productId: true, status: true }
    });
    if (!currentVariant || !requestedVariant || requestedVariant.productId !== currentVariant.productId) {
      throw Object.assign(new Error("Requested variant is not valid for this product"), {
        statusCode: 400,
        code: "INVALID_VARIANT"
      });
    }
    if (requestedVariant.status !== "ACTIVE") {
      throw Object.assign(new Error("Requested variant is not available"), {
        statusCode: 400,
        code: "VARIANT_INACTIVE"
      });
    }
  }
  if (intent === "CHANGE_QUANTITY") {
    if (!opts.requestedQty || !Number.isInteger(opts.requestedQty) || opts.requestedQty <= 0) {
      throw Object.assign(new Error("Requested quantity must be a positive integer"), {
        statusCode: 400,
        code: "INVALID_QTY"
      });
    }
    if (opts.requestedQty > 99) {
      throw Object.assign(new Error("Requested quantity exceeds limit"), {
        statusCode: 400,
        code: "QTY_TOO_HIGH"
      });
    }
  }

  const shippingSnapshot =
    intent === "CHANGE_ADDRESS" ? await loadShippingAddressSnapshot(order.id) : null;
  if (intent === "CHANGE_ADDRESS" && !shippingSnapshot) {
    throw Object.assign(new Error("Shipping address not found on order"), {
      statusCode: 400,
      code: "NO_SHIPPING_ADDRESS"
    });
  }

  const payload = buildAdjustmentPayload({
    intent,
    orderItem,
    shippingAddress: shippingSnapshot ?? undefined,
    requested: {
      ...(opts.requestedAddress ? { shippingAddress: opts.requestedAddress } : {}),
      ...(opts.requestedVariantId ? { variantId: opts.requestedVariantId } : {}),
      ...(opts.requestedQty ? { qtyOrdered: opts.requestedQty } : {})
    }
  });

  const reasonLabel = cancelReasonLabel(opts.reasonCode) ?? opts.reasonCode;
  const requestId = randomUUID();

  const created = await prisma.orderServiceRequest.create({
    data: {
      id: requestId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: opts.userId,
      customerEmail: email,
      type: "ADJUST_BEFORE_DELIVERY",
      requestIntent: intent,
      reasonCode: opts.reasonCode,
      reasonLabel: `${orderItem.nameSnapshot} — ${reasonLabel}`,
      message: opts.message?.trim() || null,
      adjustmentPayload: payload as unknown as Prisma.InputJsonValue,
      executionStatus: "PENDING",
      items: {
        create: {
          orderItemId: orderItem.id,
          nameSnapshot: orderItem.nameSnapshot,
          skuSnapshot: orderItem.skuSnapshot,
          qtySelected: orderItem.qtyOrdered,
          reasonCode: opts.reasonCode,
          reasonLabel,
          message: opts.message?.trim() || null
        }
      }
    },
    include: { items: true }
  });

  const { notifyServiceRequestSubmitted } = await import("./order-service-request.emails");
  void notifyServiceRequestSubmitted({
    orderNumber: order.orderNumber,
    customerEmail: email,
    type: "ADJUST_BEFORE_DELIVERY",
    reasonLabel: created.reasonLabel ?? reasonLabel,
    message: opts.message
  });

  logger.info("adjustment_request_submitted", {
    orderId: order.id,
    requestId,
    intent
  });

  return created;
}

export async function loadAdjustmentOptionsForOrderItem(opts: {
  orderNumber: string;
  userId: string;
  userEmail: string;
  orderItemId: string;
}) {
  const email = opts.userEmail.trim().toLowerCase();
  const order = await prisma.order.findFirst({
    where: {
      orderNumber: opts.orderNumber,
      deletedAt: null,
      OR: [{ customerId: opts.userId }, { email }]
    },
    include: {
      items: true,
      addresses: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      shipments: { select: { status: true } }
    }
  });

  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const eligibility = getCancellationEligibility({
    status: order.status,
    paymentStatus: order.paymentStatus,
    payments: order.payments,
    shipments: order.shipments
  });
  if (!eligibility.customerCanRequest) {
    throw Object.assign(
      new Error(
        eligibility.customerMessage ??
          "This order cannot be changed online — it may already be dispatched."
      ),
      { statusCode: 400, code: eligibility.blockCode ?? "NOT_ELIGIBLE" }
    );
  }

  const orderItem = order.items.find((i) => i.id === opts.orderItemId);
  if (!orderItem) {
    throw Object.assign(new Error("Invalid order item"), { statusCode: 400, code: "BAD_ITEM" });
  }

  const currentVariant = await prisma.productVariant.findUnique({
    where: { id: orderItem.variantId },
    include: {
      productRel: { select: { name: true } },
      attributeValues: {
        include: {
          attributeValue: {
            include: { attribute: true }
          }
        }
      }
    }
  });
  if (!currentVariant) {
    throw Object.assign(new Error("Variant not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const siblings = await prisma.productVariant.findMany({
    where: { productId: currentVariant.productId, status: "ACTIVE" },
    orderBy: [{ isDefault: "desc" }, { sku: "asc" }],
    include: {
      inventory: true,
      attributeValues: {
        include: {
          attributeValue: {
            include: { attribute: true }
          }
        }
      }
    }
  });

  const shippingRow = order.addresses.find((a) => a.type === "SHIPPING");
  const shippingAddress = shippingRow ? addressFromOrderRow(shippingRow) : null;

  return {
    orderItemId: orderItem.id,
    productName: currentVariant.productRel.name,
    currentVariantId: orderItem.variantId,
    currentQty: orderItem.qtyOrdered,
    shippingAddress,
    variants: siblings.map((v) => {
      const attrs = v.attributeValues
        .map((av) => `${av.attributeValue.attribute.name}: ${av.attributeValue.value}`)
        .join(", ");
      const available = v.inventory ? v.inventory.onHand - v.inventory.reserved : 0;
      return {
        id: v.id,
        sku: v.sku,
        label: attrs || v.sku,
        saleInPaise: v.saleInPaise,
        inStock: available > 0,
        isCurrent: v.id === orderItem.variantId
      };
    })
  };
}
