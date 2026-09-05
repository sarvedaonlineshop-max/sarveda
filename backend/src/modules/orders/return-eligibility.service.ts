import type {
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReturnLineReviewDecision
} from "@prisma/client";

import { prisma } from "../../config/db";
import { orderHasActiveRtoShipment } from "./rto-workflow.service";
import { getReturnWindowDays } from "./return-replacement.constants";
import { getReturnedQuantityForOrderItem } from "./order-inventory-restock.service";
import { resolveDeliveredAt } from "./order-service-request.service";

export type ReturnEligibilityResult = {
  eligible: boolean;
  blockCode?: string;
  customerMessage?: string;
  deliveredAt?: Date;
  returnWindowEndsAt?: Date;
  returnWindowExpired?: boolean;
  maxReturnableQty?: number;
};

type OrderRow = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerId?: string | null;
  email: string;
  shipments: Array<{ status: string; deliveredAt: Date | null }>;
  statusHistory: Array<{ toStatus: string; createdAt: Date }>;
  payments: Array<{ provider: string; status: string }>;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Case statuses that can still hold per-line return commitments. */
const COMMITMENT_CASE_STATUSES = new Set([
  "PENDING_APPROVAL",
  "MORE_INFO_REQUIRED",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "NEEDS_DISCUSSION"
]);

export function resolveDeliveredAtFromOrder(order: {
  status: OrderStatus;
  shipments: Array<{ status: string; deliveredAt: Date | null }>;
  statusHistory: Array<{ toStatus: string; createdAt: Date }>;
}): Date | null {
  return resolveDeliveredAt(order);
}

function isPaidForReturn(paymentStatus: PaymentStatus, payments: OrderRow["payments"]): boolean {
  if (["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(paymentStatus)) return true;
  return payments.some((p) => p.provider === "COD" && p.status === "CAPTURED");
}

export type CustomerRelatedReturnCaseRef = {
  caseNumber: string;
  requestId: string;
  qtySelected: number;
  reviewDecision: string;
  caseStatus: string;
  reasonLabel: string | null;
  requestedResolution: string | null;
  customerFacingNote: string | null;
  createdAt: Date;
  returnPhysicalStatus: string;
  resolutionStatus: string;
  refundTotalInPaise: number | null;
  refundCompletedAt: Date | null;
  refundProcessedAt: Date | null;
  courier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  shipmentPhysicalStatus: string | null;
  replacementStatus: string | null;
  replacementCourier: string | null;
  replacementAwb: string | null;
  replacementTrackingUrl: string | null;
  replacementShippedAt: Date | null;
  replacementDeliveredAt: Date | null;
};

/**
 * Per-line qty that is unavailable for a new return request.
 * Uses reviewDecision (not case status alone). REJECTED is locked for launch.
 */
export function unavailableReturnQtyFromCaseLines(
  lines: Array<{
    qtySelected: number;
    reviewDecision: ReturnLineReviewDecision | string;
    caseStatus: string;
  }>
): number {
  let unavailable = 0;
  for (const line of lines) {
    const decision = line.reviewDecision;
    const status = line.caseStatus;

    if (decision === "REJECTED" || status === "REJECTED") {
      unavailable += line.qtySelected;
      continue;
    }

    if (!COMMITMENT_CASE_STATUSES.has(status)) continue;

    if (
      decision === "PENDING" ||
      decision === "MORE_INFO_REQUIRED" ||
      decision === "APPROVED"
    ) {
      unavailable += line.qtySelected;
    }
  }
  return unavailable;
}

async function caseUnavailableQtyForOrderItem(
  orderItemId: string,
  db: DbClient = prisma
): Promise<number> {
  const lines = await loadCaseLinesForOrderItem(orderItemId, db);
  return unavailableReturnQtyFromCaseLines(lines);
}

async function loadCaseLinesForOrderItem(
  orderItemId: string,
  db: DbClient = prisma
): Promise<
  Array<{
    qtySelected: number;
    reviewDecision: ReturnLineReviewDecision | string;
    caseStatus: string;
    caseNumber: string;
    requestId: string;
    reasonLabel: string | null;
    requestedResolution: string | null;
    customerFacingNote: string | null;
    createdAt: Date;
    returnPhysicalStatus: string;
    resolutionStatus: string;
    refundTotalInPaise: number | null;
    refundCompletedAt: Date | null;
    refundProcessedAt: Date | null;
    courier: string | null;
    awb: string | null;
    trackingUrl: string | null;
    shipmentPhysicalStatus: string | null;
    replacementStatus: string | null;
    replacementCourier: string | null;
    replacementAwb: string | null;
    replacementTrackingUrl: string | null;
    replacementShippedAt: Date | null;
    replacementDeliveredAt: Date | null;
  }>
> {
  const rows = await db.orderServiceRequestItem.findMany({
    where: {
      orderItemId,
      request: { type: "REFUND_AFTER_DELIVERY" }
    },
    select: {
      qtySelected: true,
      reviewDecision: true,
      reasonLabel: true,
      requestedResolution: true,
      customerFacingNote: true,
      replacementFulfillment: {
        select: {
          status: true,
          outboundShipmentId: true,
          shippedAt: true,
          deliveredAt: true
        }
      },
      request: {
        select: {
          status: true,
          caseNumber: true,
          id: true,
          createdAt: true,
          returnPhysicalStatus: true,
          resolutionStatus: true,
          refundTotalInPaise: true,
          refundCompletedAt: true,
          refundProcessedAt: true,
          returnShipment: {
            select: {
              courier: true,
              awb: true,
              trackingUrl: true,
              physicalStatus: true
            }
          }
        }
      }
    }
  });

  const outboundShipmentIds = rows
    .map((line) => line.replacementFulfillment?.outboundShipmentId)
    .filter((id): id is string => Boolean(id));
  const outboundShipments = outboundShipmentIds.length
    ? await db.shipment.findMany({
        where: { id: { in: outboundShipmentIds } },
        select: { id: true, courier: true, awb: true, trackingUrl: true }
      })
    : [];
  const outboundById = new Map(outboundShipments.map((shipment) => [shipment.id, shipment]));

  return rows.map((line) => {
    const replacement = line.replacementFulfillment;
    const outbound = replacement?.outboundShipmentId
      ? outboundById.get(replacement.outboundShipmentId)
      : undefined;
    return {
      qtySelected: line.qtySelected,
      reviewDecision: line.reviewDecision,
      caseStatus: line.request.status,
      caseNumber: line.request.caseNumber,
      requestId: line.request.id,
      reasonLabel: line.reasonLabel,
      requestedResolution: line.requestedResolution,
      customerFacingNote: line.customerFacingNote,
      createdAt: line.request.createdAt,
      returnPhysicalStatus: line.request.returnPhysicalStatus,
      resolutionStatus: line.request.resolutionStatus,
      refundTotalInPaise: line.request.refundTotalInPaise,
      refundCompletedAt: line.request.refundCompletedAt,
      refundProcessedAt: line.request.refundProcessedAt,
      courier: line.request.returnShipment?.courier ?? null,
      awb: line.request.returnShipment?.awb ?? null,
      trackingUrl: line.request.returnShipment?.trackingUrl ?? null,
      shipmentPhysicalStatus: line.request.returnShipment?.physicalStatus ?? null,
      replacementStatus: replacement?.status ?? null,
      replacementCourier: outbound?.courier ?? null,
      replacementAwb: outbound?.awb ?? null,
      replacementTrackingUrl: outbound?.trackingUrl ?? null,
      replacementShippedAt: replacement?.shippedAt ?? null,
      replacementDeliveredAt: replacement?.deliveredAt ?? null
    };
  });
}

/** Per-decision qty buckets for one order item (same rules as unavailableReturnQtyFromCaseLines). */
export function summarizeReturnCaseLineQtys(
  lines: Array<{
    qtySelected: number;
    reviewDecision: ReturnLineReviewDecision | string;
    caseStatus: string;
    caseNumber?: string;
    requestId?: string;
    reasonLabel?: string | null;
    requestedResolution?: string | null;
    customerFacingNote?: string | null;
    createdAt?: Date;
    returnPhysicalStatus?: string;
    resolutionStatus?: string;
    refundTotalInPaise?: number | null;
    refundCompletedAt?: Date | null;
    refundProcessedAt?: Date | null;
    courier?: string | null;
    awb?: string | null;
    trackingUrl?: string | null;
    shipmentPhysicalStatus?: string | null;
    replacementStatus?: string | null;
    replacementCourier?: string | null;
    replacementAwb?: string | null;
    replacementTrackingUrl?: string | null;
    replacementShippedAt?: Date | null;
    replacementDeliveredAt?: Date | null;
  }>
): {
  pendingQty: number;
  moreInfoQty: number;
  approvedQty: number;
  rejectedLockedQty: number;
  relatedCaseRefs: CustomerRelatedReturnCaseRef[];
} {
  let pendingQty = 0;
  let moreInfoQty = 0;
  let approvedQty = 0;
  let rejectedLockedQty = 0;
  const relatedCaseRefs: CustomerRelatedReturnCaseRef[] = [];

  for (const line of lines) {
    const decision = String(line.reviewDecision);
    const status = line.caseStatus;
    if (line.caseNumber && line.requestId && line.createdAt) {
      relatedCaseRefs.push({
        caseNumber: line.caseNumber,
        requestId: line.requestId,
        qtySelected: line.qtySelected,
        reviewDecision: decision,
        caseStatus: status,
        reasonLabel: line.reasonLabel ?? null,
        requestedResolution: line.requestedResolution ?? null,
        customerFacingNote: line.customerFacingNote ?? null,
        createdAt: line.createdAt,
        returnPhysicalStatus: line.returnPhysicalStatus ?? "NOT_REQUIRED",
        resolutionStatus: line.resolutionStatus ?? "NONE",
        refundTotalInPaise: line.refundTotalInPaise ?? null,
        refundCompletedAt: line.refundCompletedAt ?? null,
        refundProcessedAt: line.refundProcessedAt ?? null,
        courier: line.courier ?? null,
        awb: line.awb ?? null,
        trackingUrl: line.trackingUrl ?? null,
        shipmentPhysicalStatus: line.shipmentPhysicalStatus ?? null,
        replacementStatus: line.replacementStatus ?? null,
        replacementCourier: line.replacementCourier ?? null,
        replacementAwb: line.replacementAwb ?? null,
        replacementTrackingUrl: line.replacementTrackingUrl ?? null,
        replacementShippedAt: line.replacementShippedAt ?? null,
        replacementDeliveredAt: line.replacementDeliveredAt ?? null
      });
    }

    if (decision === "REJECTED" || status === "REJECTED") {
      rejectedLockedQty += line.qtySelected;
      continue;
    }
    if (!COMMITMENT_CASE_STATUSES.has(status)) continue;
    if (decision === "MORE_INFO_REQUIRED") moreInfoQty += line.qtySelected;
    else if (decision === "APPROVED") approvedQty += line.qtySelected;
    else if (decision === "PENDING") pendingQty += line.qtySelected;
  }

  return { pendingQty, moreInfoQty, approvedQty, rejectedLockedQty, relatedCaseRefs };
}

export type CustomerReturnLineEligibility = {
  orderItemId: string;
  nameSnapshot: string;
  skuSnapshot: string;
  orderedQty: number;
  pendingQty: number;
  moreInfoQty: number;
  approvedQty: number;
  rejectedLockedQty: number;
  alreadyInReturnQty: number;
  alreadyReturnedQty: number;
  remainingEligibleQty: number;
  maxReturnableQty: number;
  unavailableReason: string | null;
  relatedCaseRefs: CustomerRelatedReturnCaseRef[];
};

/**
 * Thin read model for customer return UI — same qty rules as getReturnEligibility / submit guard.
 * relatedCaseRefs intentionally carries customer-safe return history so the UI can show past
 * approvals, rejections, refund totals and pickup tracking without exposing admin-only fields.
 */
export async function getCustomerReturnEligibilitySnapshot(opts: {
  orderId: string;
  orderItems: Array<{ id: string; nameSnapshot: string; skuSnapshot: string; qtyOrdered: number }>;
}): Promise<CustomerReturnLineEligibility[]> {
  const lines: CustomerReturnLineEligibility[] = [];
  for (const item of opts.orderItems) {
    const caseLines = await loadCaseLinesForOrderItem(item.id);
    const summary = summarizeReturnCaseLineQtys(caseLines);
    const alreadyInReturnQty = summary.pendingQty + summary.moreInfoQty + summary.approvedQty;
    const caseUnavailable = unavailableReturnQtyFromCaseLines(caseLines);
    const alreadyReturnedQty = await getReturnedQuantityForOrderItem(prisma, item.id);
    const remainingEligibleQty = Math.max(
      0,
      item.qtyOrdered - Math.max(alreadyReturnedQty, caseUnavailable)
    );

    let unavailableReason: string | null = null;
    if (remainingEligibleQty <= 0) {
      if (summary.rejectedLockedQty > 0 && alreadyInReturnQty === 0) {
        unavailableReason = `${summary.rejectedLockedQty} unit(s) were not approved in a previous return request.`;
      } else if (alreadyInReturnQty > 0) {
        unavailableReason = "All eligible units are already part of an active or approved return case.";
      } else if (alreadyReturnedQty > 0) {
        unavailableReason = "These units have already been returned.";
      } else {
        unavailableReason = "No units are currently eligible for a new return request.";
      }
    }

    lines.push({
      orderItemId: item.id,
      nameSnapshot: item.nameSnapshot,
      skuSnapshot: item.skuSnapshot,
      orderedQty: item.qtyOrdered,
      pendingQty: summary.pendingQty,
      moreInfoQty: summary.moreInfoQty,
      approvedQty: summary.approvedQty,
      rejectedLockedQty: summary.rejectedLockedQty,
      alreadyInReturnQty,
      alreadyReturnedQty,
      remainingEligibleQty,
      maxReturnableQty: remainingEligibleQty,
      unavailableReason,
      relatedCaseRefs: summary.relatedCaseRefs
    });
  }
  return lines;
}

export function qtyExceedsAvailableMessage(remaining: number): string {
  if (remaining <= 0) return "No units are currently eligible for a new return request.";
  return remaining === 1
    ? "Only 1 unit is currently eligible for a new return request."
    : `Only ${remaining} units are currently eligible for a new return request.`;
}

export async function getReturnEligibility(opts: {
  order: OrderRow;
  orderItemId: string;
  qtyRequested: number;
  customerId?: string;
  customerEmail?: string;
  db?: DbClient;
}): Promise<ReturnEligibilityResult> {
  const db = opts.db ?? prisma;
  const deliveredAt =
    resolveDeliveredAtFromOrder(opts.order) ?? resolveDeliveredAt(opts.order as Parameters<typeof resolveDeliveredAt>[0]);

  if (opts.order.status !== "DELIVERED" || !deliveredAt) {
    return {
      eligible: false,
      blockCode: "NOT_DELIVERED",
      customerMessage: "Returns and replacements are available only after delivery."
    };
  }

  if (await orderHasActiveRtoShipment(opts.order.id)) {
    return {
      eligible: false,
      blockCode: "RTO_ACTIVE",
      customerMessage: "This order has an active return-to-origin shipment. Contact support."
    };
  }

  if (!isPaidForReturn(opts.order.paymentStatus, opts.order.payments)) {
    return {
      eligible: false,
      blockCode: "NOT_PAID",
      customerMessage: "This order is not eligible for return until payment is confirmed."
    };
  }

  const windowDays = getReturnWindowDays();
  const returnWindowEndsAt = new Date(deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const returnWindowExpired = Date.now() > returnWindowEndsAt.getTime();

  if (returnWindowExpired) {
    return {
      eligible: false,
      blockCode: "RETURN_WINDOW_EXPIRED",
      customerMessage: `The ${windowDays}-day return window after delivery has ended.`,
      deliveredAt,
      returnWindowEndsAt,
      returnWindowExpired: true
    };
  }

  const pending = await db.orderServiceRequest.findFirst({
    where: { orderId: opts.order.id, status: "PENDING_APPROVAL", type: "REFUND_AFTER_DELIVERY" }
  });
  if (pending) {
    return {
      eligible: false,
      blockCode: "REQUEST_PENDING",
      customerMessage: "A return or replacement request is already waiting for review.",
      deliveredAt,
      returnWindowEndsAt
    };
  }

  const item = await db.orderItem.findFirst({
    where: { id: opts.orderItemId, orderId: opts.order.id }
  });
  if (!item) {
    return {
      eligible: false,
      blockCode: "ITEM_NOT_FOUND",
      customerMessage: "Item not found on this order."
    };
  }

  const alreadyReturned = await getReturnedQuantityForOrderItem(db, opts.orderItemId);
  const caseUnavailable = await caseUnavailableQtyForOrderItem(opts.orderItemId, db);
  const maxReturnableQty = Math.max(0, item.qtyOrdered - Math.max(alreadyReturned, caseUnavailable));

  if (opts.qtyRequested <= 0 || opts.qtyRequested > maxReturnableQty) {
    return {
      eligible: false,
      blockCode: "QTY_EXCEEDS_AVAILABLE",
      customerMessage: `You can return or replace at most ${maxReturnableQty} unit(s) of this item.`,
      deliveredAt,
      returnWindowEndsAt,
      maxReturnableQty
    };
  }

  return {
    eligible: true,
    deliveredAt,
    returnWindowEndsAt,
    returnWindowExpired: false,
    maxReturnableQty
  };
}
