import type {
  ReturnReplacementResolution,
  ReturnResolutionStatus,
  ReturnShippingRefundPolicy
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../../config/db";
import { executeAuthoritativePartialRefund } from "../payments/partial-refund-settlement.service";
import { pickCapturedPaymentForRefund } from "../payments/payment-selection";
import { getReturnEligibility } from "./return-eligibility.service";
import {
  allowedResolutionsForReason,
  evidenceRequiredForReason,
  physicalReturnRequiredForReason,
  shippingPolicyForReason,
  isReturnReasonCode
} from "./return-replacement.constants";
import { calculateReturnItemRefund } from "./return-refund-calculator.service";
import { reasonLabelFor, uploadRequestPhotos } from "./order-service-request.service";

export type SubmitReturnReplacementItem = {
  orderItemId: string;
  reasonCode: string;
  qty: number;
  requestedResolution: ReturnReplacementResolution;
  requestedVariantId?: string;
  otherMessage?: string;
  message?: string;
};

export type ReturnPayloadSnapshot = {
  deliveredAt: string;
  items: Array<{
    orderItemId: string;
    variantId: string;
    qtySelected: number;
    unitPriceInPaise: number;
    lineTotalInPaise: number;
    discountAllocationPaise: number;
    taxInPaise: number;
    skuSnapshot: string;
    nameSnapshot: string;
  }>;
};

function resolutionRequiresRefund(resolution: ReturnReplacementResolution): boolean {
  return ["RETURN_FOR_REFUND", "PARTIAL_REFUND", "KEEP_ITEM_PARTIAL_REFUND"].includes(resolution);
}

/**
 * Physical-return refunds require warehouse receipt + QC disposition.
 * No-return paths (KEEP_ITEM / reasons with requiresPhysicalReturn=false) skip this.
 */
export function assertReturnCaseRefundExecutable(request: {
  status: string;
  resolutionStatus?: string | null;
  refundProcessedAt?: Date | null;
  returnPhysicalStatus: string;
  items: Array<{ reasonCode: string; requestedResolution: string | null }>;
  returnShipment?: {
    receivedAt: Date | null;
    disposition: string | null;
  } | null;
}): void {
  if (request.status !== "APPROVED") {
    throw Object.assign(new Error("Request must be approved"), {
      statusCode: 400,
      code: "NOT_APPROVED"
    });
  }
  if (request.resolutionStatus === "REFUNDED" || request.refundProcessedAt) {
    throw Object.assign(new Error("Refund already completed for this return case"), {
      statusCode: 409,
      code: "ALREADY_REFUNDED"
    });
  }

  const needsPhysical = request.items.some(
    (i) =>
      i.requestedResolution !== "KEEP_ITEM_PARTIAL_REFUND" &&
      i.requestedResolution !== "MISSING_PART" &&
      physicalReturnRequiredForReason(i.reasonCode)
  );

  if (!needsPhysical) {
    // APPROVED_NO_RETURN / keep-item style — refund may proceed without physical receipt.
    return;
  }

  const rs = request.returnShipment;
  if (!rs?.receivedAt) {
    throw Object.assign(new Error("Return must be physically received before refund"), {
      statusCode: 400,
      code: "RETURN_NOT_RECEIVED"
    });
  }
  if (!rs.disposition || rs.disposition === "NEEDS_REVIEW") {
    throw Object.assign(
      new Error("Warehouse QC/disposition required before refund (receipt alone is not enough)"),
      { statusCode: 400, code: "QC_INCOMPLETE" }
    );
  }
}

function resolutionRequiresReplacement(resolution: ReturnReplacementResolution): boolean {
  return resolution === "REPLACEMENT";
}

export async function submitReturnReplacementRequest(opts: {
  orderNumber: string;
  userId: string;
  userEmail: string;
  message?: string;
  items: SubmitReturnReplacementItem[];
  photosByIndex: Map<number, Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>>;
}) {
  const email = opts.userEmail.trim().toLowerCase();
  const order = await prisma.order.findFirst({
    where: {
      orderNumber: opts.orderNumber,
      deletedAt: null,
      OR: [{ customerId: opts.userId }, { email }]
    },
    include: {
      payments: true,
      items: true,
      shipments: { select: { status: true, deliveredAt: true } },
      statusHistory: { select: { toStatus: true, createdAt: true } }
    }
  });

  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const existingPending = await prisma.orderServiceRequest.findFirst({
    where: {
      orderId: order.id,
      status: { in: ["PENDING_APPROVAL", "MORE_INFO_REQUIRED"] },
      type: "REFUND_AFTER_DELIVERY"
    }
  });
  if (existingPending) {
    throw Object.assign(new Error("A return or replacement request is already waiting for review"), {
      statusCode: 409,
      code: "REQUEST_PENDING"
    });
  }

  if (!opts.items.length) {
    throw Object.assign(new Error("Select at least one item"), { statusCode: 400, code: "ITEMS_REQUIRED" });
  }

  const orderItemMap = new Map(order.items.map((i) => [i.id, i]));
  const primaryReason = opts.items[0].reasonCode;
  const shippingPolicy = shippingPolicyForReason(primaryReason);

  for (const item of opts.items) {
    if (!isReturnReasonCode(item.reasonCode)) {
      throw Object.assign(new Error("Invalid reason"), { statusCode: 400, code: "BAD_REASON" });
    }
    const allowed = allowedResolutionsForReason(item.reasonCode);
    if (!allowed.includes(item.requestedResolution)) {
      throw Object.assign(new Error("Requested resolution not allowed for this reason"), {
        statusCode: 400,
        code: "RESOLUTION_NOT_ALLOWED"
      });
    }
    const eligibility = await getReturnEligibility({
      order,
      orderItemId: item.orderItemId,
      qtyRequested: item.qty,
      customerId: opts.userId,
      customerEmail: email
    });
    if (!eligibility.eligible) {
      throw Object.assign(new Error(eligibility.customerMessage ?? "Not eligible"), {
        statusCode: 400,
        code: eligibility.blockCode ?? "NOT_ELIGIBLE"
      });
    }
  }

  const requestId = randomUUID();
  const parsedItems: Array<{
    orderItemId: string;
    nameSnapshot: string;
    skuSnapshot: string;
    qtySelected: number;
    reasonCode: string;
    reasonLabel: string;
    requestedResolution: ReturnReplacementResolution;
    requestedVariantId: string | null;
    otherMessage: string | null;
    message: string | null;
    photos: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
  }> = [];

  opts.items.forEach((item, index) => {
    const row = orderItemMap.get(item.orderItemId)!;
    const reasonLabel = reasonLabelFor("REFUND_AFTER_DELIVERY", item.reasonCode, item.otherMessage)!;
    const photos = opts.photosByIndex.get(index) ?? [];
    if (evidenceRequiredForReason(item.reasonCode) && !photos.length) {
      throw Object.assign(new Error(`Add at least one photo for ${row.nameSnapshot}`), {
        statusCode: 400,
        code: "PHOTOS_REQUIRED"
      });
    }
    parsedItems.push({
      orderItemId: row.id,
      nameSnapshot: row.nameSnapshot,
      skuSnapshot: row.skuSnapshot,
      qtySelected: item.qty,
      reasonCode: item.reasonCode,
      reasonLabel,
      requestedResolution: item.requestedResolution,
      requestedVariantId: item.requestedVariantId ?? null,
      otherMessage: item.otherMessage?.trim() || null,
      message: item.message?.trim() || null,
      photos
    });
  });

  const deliveredAt =
    order.shipments.find((s) => s.deliveredAt)?.deliveredAt ??
    order.statusHistory.find((h) => h.toStatus === "DELIVERED")?.createdAt ??
    new Date();

  const returnPayload: ReturnPayloadSnapshot = {
    deliveredAt: deliveredAt.toISOString(),
    items: parsedItems.map((p) => {
      const row = orderItemMap.get(p.orderItemId)!;
      if (!row.variantId) {
        throw Object.assign(new Error("Digital purchases cannot be returned this way"), {
          statusCode: 400,
          code: "DIGITAL_LINE_NOT_RETURNABLE"
        });
      }
      return {
        orderItemId: p.orderItemId,
        variantId: row.variantId,
        qtySelected: p.qtySelected,
        unitPriceInPaise: row.unitPriceInPaise,
        lineTotalInPaise: row.lineTotalInPaise,
        discountAllocationPaise: 0,
        taxInPaise: row.taxInPaise,
        skuSnapshot: p.skuSnapshot,
        nameSnapshot: p.nameSnapshot
      };
    })
  };

  const needsPhysicalReturn = parsedItems.some(
    (p) =>
      physicalReturnRequiredForReason(p.reasonCode) &&
      p.requestedResolution !== "KEEP_ITEM_PARTIAL_REFUND"
  );

  const summaryLabel =
    parsedItems.length === 1
      ? `${parsedItems[0].nameSnapshot} — ${parsedItems[0].reasonLabel}`
      : `${parsedItems.length} items — return/replacement`;

  const { nextReturnCaseNumber } = await import("./return-case-number");
  const { appendCaseEvent } = await import("./return-case-events.service");
  const caseNumber = await nextReturnCaseNumber();

  const declarationsAcceptedAt = new Date();
  const declarationsJson = {
    unusedCondition: true,
    originalPackagingWhereApplicable: true,
    accurateEvidence: true,
    acceptedAt: declarationsAcceptedAt.toISOString()
  };

  const created = await prisma.orderServiceRequest.create({
    data: {
      id: requestId,
      caseNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: opts.userId,
      customerEmail: email,
      type: "REFUND_AFTER_DELIVERY",
      channel: "WEBSITE",
      requestIntent: "REFUND",
      reasonCode: parsedItems.length === 1 ? parsedItems[0].reasonCode : "multi",
      reasonLabel: summaryLabel,
      message: opts.message?.trim() || null,
      shippingRefundPolicy: shippingPolicy,
      returnPhysicalStatus: needsPhysicalReturn ? "AWAITING_RETURN" : "NOT_REQUIRED",
      resolutionStatus: "NONE",
      offeredResolution: parsedItems[0]?.requestedResolution ?? null,
      declarationsJson,
      declarationsAcceptedAt,
      returnPayload,
      items: {
        create: await Promise.all(
          parsedItems.map(async (item) => {
            const itemId = randomUUID();
            const photoRows = item.photos.length ? await uploadRequestPhotos(requestId, item.photos) : [];
            return {
              id: itemId,
              orderItemId: item.orderItemId,
              nameSnapshot: item.nameSnapshot,
              skuSnapshot: item.skuSnapshot,
              qtySelected: item.qtySelected,
              reasonCode: item.reasonCode,
              reasonLabel: item.reasonLabel,
              requestedResolution: item.requestedResolution,
              requestedVariantId: item.requestedVariantId,
              otherMessage: item.otherMessage,
              message: item.message,
              photos: {
                create: photoRows.map((p) => ({
                  requestId,
                  s3Key: p.s3Key,
                  s3Url: p.s3Url,
                  fileName: p.fileName,
                  fileSizeBytes: p.fileSizeBytes,
                  mimeType: p.mimeType,
                  mediaKind: p.mediaKind
                }))
              }
            };
          })
        )
      }
    },
    include: { items: { include: { photos: true } }, photos: true }
  });

  await appendCaseEvent({
    requestId: created.id,
    eventType: "CASE_CREATED",
    message: `Case ${caseNumber} created`,
    payloadJson: { type: "REFUND_AFTER_DELIVERY", caseNumber },
    actor: { userId: opts.userId, email, role: "CUSTOMER" }
  });
  if (parsedItems.some((p) => p.photos.length)) {
    await appendCaseEvent({
      requestId: created.id,
      eventType: "EVIDENCE_ADDED",
      message: "Customer evidence uploaded with request",
      actor: { userId: opts.userId, email, role: "CUSTOMER" }
    });
  }

  void (async () => {
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    await notifyReturnCaseEvent(created.id, "RETURN_REQUEST_SUBMITTED", {
      orderNumber: order.orderNumber,
      caseNumber,
      customerEmail: email,
      customerPhone: order.phone,
      itemSummary: parsedItems.map((p) => `${p.nameSnapshot} × ${p.qtySelected}`).join("; "),
      quantity: parsedItems.reduce((s, p) => s + p.qtySelected, 0),
      customerReason: summaryLabel,
      requestedResolution: parsedItems.map((p) => p.requestedResolution).join("; "),
      currency: order.currency
    });
  })();

  return created;
}

export async function approveReturnReplacementRequest(opts: {
  orderId: string;
  requestId: string;
  adminEmail: string;
  adminUserId?: string;
  adminNote?: string;
}) {
  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId },
    include: { items: true, order: { include: { payments: true } } }
  });

  if (!request) {
    throw Object.assign(new Error("Request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (!["PENDING_APPROVAL", "MORE_INFO_REQUIRED"].includes(request.status)) {
    throw Object.assign(new Error("Request already reviewed"), { statusCode: 409, code: "ALREADY_REVIEWED" });
  }
  if (request.type !== "REFUND_AFTER_DELIVERY") {
    throw Object.assign(new Error("Not a return/replacement request"), { statusCode: 400, code: "WRONG_TYPE" });
  }

  if (request.reasonCode === "extra_item") {
    throw Object.assign(
      new Error("Extra unsolicited item requires manual operational review before approval"),
      { statusCode: 409, code: "MANUAL_REVIEW_REQUIRED" }
    );
  }

  const needsPhysicalReturn = request.items.some(
    (i) =>
      i.requestedResolution !== "KEEP_ITEM_PARTIAL_REFUND" &&
      i.requestedResolution !== "MISSING_PART" &&
      physicalReturnRequiredForReason(i.reasonCode)
  );
  const hasReplacement = request.items.some((i) => resolutionRequiresReplacement(i.requestedResolution!));
  const hasRefund = request.items.some((i) => resolutionRequiresRefund(i.requestedResolution!));
  const hasMissingPart = request.items.some((i) => i.requestedResolution === "MISSING_PART");

  let resolutionStatus: ReturnResolutionStatus = "NONE";
  if (hasMissingPart && !hasRefund && !hasReplacement) resolutionStatus = "MISSING_PART_PENDING";
  else if (hasReplacement && !hasRefund) resolutionStatus = "REPLACEMENT_PENDING";
  else if (hasRefund) resolutionStatus = "REFUND_PENDING";

  const returnPhysicalStatus = needsPhysicalReturn ? "AWAITING_RETURN" : "NOT_REQUIRED";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.orderServiceRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedAt: now,
        reviewedByEmail: opts.adminEmail,
        reviewedByUserId: opts.adminUserId ?? null,
        adminNote: opts.adminNote?.trim() || null,
        returnPhysicalStatus,
        resolutionStatus,
        refundApprovedAt: hasRefund ? now : null,
        slaPausedAt: null,
        finalResolution: hasMissingPart
          ? "MISSING_PART"
          : hasReplacement
            ? "REPLACEMENT"
            : hasRefund
              ? "RETURN_FOR_REFUND"
              : null
      }
    });

    if (needsPhysicalReturn) {
      await tx.orderReturnShipment.create({
        data: {
          requestId: request.id,
          orderId: request.orderId,
          physicalStatus: "AWAITING_RETURN"
        }
      });
    }

    for (const item of request.items) {
      if (item.requestedResolution !== "REPLACEMENT") continue;
      const variantId = item.requestedVariantId ?? (
        await tx.orderItem.findUnique({ where: { id: item.orderItemId }, select: { variantId: true } })
      )?.variantId;
      if (!variantId) continue;

      await tx.orderReplacementFulfillment.create({
        data: {
          requestId: request.id,
          requestItemId: item.id,
          orderId: request.orderId,
          replacementVariantId: variantId,
          qty: item.qtySelected,
          status: "REPLACEMENT_PENDING"
        }
      });
    }
  });

  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: request.id,
    eventType: "APPROVED",
    message: opts.adminNote?.trim() || "Return case approved",
    payloadJson: { resolutionStatus, returnPhysicalStatus },
    actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
  });
  if (hasRefund) {
    await appendCaseEvent({
      requestId: request.id,
      eventType: "REFUND_APPROVED",
      message: "Refund approved (initiation may wait for warehouse/QC where required)",
      actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
    });
    const { setRefundSlaDueAfterApproval } = await import("./return-sla.service");
    await setRefundSlaDueAfterApproval(request.id);
  }
  if (hasReplacement) {
    await appendCaseEvent({
      requestId: request.id,
      eventType: "REPLACEMENT_INITIATED",
      message: "Replacement fulfillment pending",
      actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
    });
  }

  void (async () => {
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    const itemSummary = request.items.map((i) => `${i.nameSnapshot} × ${i.qtySelected}`).join("; ");
    const qty = request.items.reduce((s, i) => s + i.qtySelected, 0);
    const base = {
      orderNumber: request.orderNumber,
      caseNumber: request.caseNumber,
      customerEmail: request.customerEmail,
      itemSummary,
      quantity: qty,
      currency: undefined as string | undefined
    };
    if (hasReplacement) {
      await notifyReturnCaseEvent(request.id, "RETURN_REPLACEMENT_APPROVED", {
        ...base,
        replacementItem: itemSummary
      });
    }
    if (needsPhysicalReturn) {
      await notifyReturnCaseEvent(request.id, "RETURN_APPROVED_PHYSICAL", base);
    } else if (hasRefund) {
      await notifyReturnCaseEvent(request.id, "RETURN_APPROVED_NO_RETURN", base);
    }
  })();

  return prisma.orderServiceRequest.findUnique({
    where: { id: request.id },
    include: {
      photos: true,
      items: { include: { photos: true } },
      returnShipment: true,
      replacementFulfillments: true
    }
  });
}

export type ReturnCaseRefundLinePlan = {
  requestItemId: string;
  orderItemId: string;
  nameSnapshot: string;
  skuSnapshot: string;
  qtySelected: number;
  qtyOrdered: number;
  grossItemValuePaise: number;
  allocatedDiscountPaise: number;
  merchandiseRefundPaise: number;
  shippingRefundPaise: number;
  otherAdjustmentPaise: number;
  alreadyRefundedPaise: number;
  lineTotalRefundPaise: number;
  explanation: string;
};

export type ReturnCaseRefundPreview = {
  requestId: string;
  orderId: string;
  orderNumber: string;
  caseNumber: string | null;
  executable: boolean;
  blockCode?: string;
  blockMessage?: string;
  shippingPolicy: string;
  paymentProvider: string | null;
  refundDestinationLabel: string;
  currency: string;
  lines: ReturnCaseRefundLinePlan[];
  merchandiseRefundPaise: number;
  shippingRefundPaise: number;
  otherAdjustmentPaise: number;
  alreadyRefundedPaise: number;
  /** System-calculated total before admin override. */
  calculatedRefundPaise: number;
  /** Effective total to refund now (override if set, else calculated). */
  totalRefundNowPaise: number;
  remainingGatewayPaise: number;
  approvedQtySelected: number;
  orderedQtyOnLines: number;
  overrideActive: boolean;
  overrideDifferencePaise: number;
  overrideGoodwillPaise: number;
  overrideReason: string | null;
  /** Set when upward goodwill is present — tax treatment not invented. */
  complianceFlags: string[];
};

/**
 * Authoritative refund preview for a return case — same calculator as execution.
 * Safe to call without gateway side effects.
 */
export async function previewReturnReplacementRefund(
  requestId: string
): Promise<ReturnCaseRefundPreview> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: requestId },
    include: {
      items: true,
      returnShipment: true,
      order: { include: { payments: true, items: true } }
    }
  });

  if (!request || request.type !== "REFUND_AFTER_DELIVERY") {
    throw Object.assign(new Error("Request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  let executable = true;
  let blockCode: string | undefined;
  let blockMessage: string | undefined;
  try {
    assertReturnCaseRefundExecutable(request);
  } catch (err) {
    const e = err as Error & { code?: string };
    executable = false;
    blockCode = e.code ?? "NOT_EXECUTABLE";
    blockMessage = e.message;
  }

  const refundItems = request.items.filter((i) =>
    resolutionRequiresRefund(i.requestedResolution ?? "RETURN_FOR_REFUND")
  );
  if (!refundItems.length) {
    executable = false;
    blockCode = blockCode ?? "NO_REFUND";
    blockMessage = blockMessage ?? "No refund resolution on this request";
  }

  const shippingPolicy = request.shippingRefundPolicy ?? "SHIPPING_RETAINED";
  const orderItemById = new Map(request.order.items.map((i) => [i.id, i]));
  const capturedPick = pickCapturedPaymentForRefund(request.order.payments);
  const payment = capturedPick.ok ? capturedPick.payment : null;
  const remainingGatewayPaise = payment
    ? Math.max(0, payment.amountInPaise - (payment.refundedInPaise ?? 0))
    : 0;

  const isCod = request.order.payments.some((p) => p.provider === "COD");
  const paymentProvider = payment?.provider ?? (isCod ? "COD" : null);
  const refundDestinationLabel = isCod
    ? "Manual COD payout (bank/UPI details required)"
    : paymentProvider
      ? `Original ${paymentProvider} payment method`
      : "Original payment method";

  const lines: ReturnCaseRefundLinePlan[] = [];
  let merchandiseRefundPaise = 0;
  let shippingRefundPaise = 0;
  let otherAdjustmentPaise = 0;
  let alreadyRefundedPaise = 0;
  let plannedGross = 0;

  for (const item of refundItems) {
    const orderItem = orderItemById.get(item.orderItemId);
    const qtyOrdered = orderItem?.qtyOrdered ?? item.qtySelected;
    const already = item.refundAmountInPaise ?? 0;
    alreadyRefundedPaise += already;

    const calc = await calculateReturnItemRefund({
      orderId: request.orderId,
      orderItemId: item.orderItemId,
      qty: item.qtySelected,
      shippingPolicy,
      keepItem: item.requestedResolution === "KEEP_ITEM_PARTIAL_REFUND"
    });

    // Cap line "now" by what has not already been refunded on this case item.
    const uncappedLine = calc.totalRefundPaise;
    const lineTotalRefundPaise = Math.max(0, uncappedLine - already);
    const scale =
      uncappedLine > 0 && lineTotalRefundPaise < uncappedLine
        ? lineTotalRefundPaise / uncappedLine
        : 1;
    const lineMerch = Math.round(calc.merchandiseRefundPaise * scale);
    const lineShip = Math.round(calc.shippingRefundPaise * scale);
    const lineOther = Math.round(calc.otherAdjustmentPaise * scale);

    merchandiseRefundPaise += lineMerch;
    shippingRefundPaise += lineShip;
    otherAdjustmentPaise += lineOther;
    plannedGross += lineTotalRefundPaise;

    lines.push({
      requestItemId: item.id,
      orderItemId: item.orderItemId,
      nameSnapshot: item.nameSnapshot,
      skuSnapshot: item.skuSnapshot,
      qtySelected: item.qtySelected,
      qtyOrdered,
      grossItemValuePaise: Math.round(calc.grossItemValuePaise * scale),
      allocatedDiscountPaise: Math.round(calc.allocatedDiscountPaise * scale),
      merchandiseRefundPaise: lineMerch,
      shippingRefundPaise: lineShip,
      otherAdjustmentPaise: lineOther,
      alreadyRefundedPaise: already,
      lineTotalRefundPaise,
      explanation: calc.explanation
    });
  }

  let calculatedRefundPaise = plannedGross;
  if (calculatedRefundPaise > remainingGatewayPaise) {
    calculatedRefundPaise = remainingGatewayPaise;
  }

  const complianceFlags: string[] = [];
  let overrideActive = false;
  let overrideDifferencePaise = 0;
  let overrideGoodwillPaise = 0;
  let totalRefundNowPaise = calculatedRefundPaise;

  if (
    request.approvedOverrideRefundPaise != null &&
    request.approvedOverrideRefundPaise >= 0 &&
    request.overrideReason?.trim()
  ) {
    overrideActive = true;
    totalRefundNowPaise = Math.min(request.approvedOverrideRefundPaise, remainingGatewayPaise);
    overrideDifferencePaise = totalRefundNowPaise - calculatedRefundPaise;
    overrideGoodwillPaise = Math.max(0, overrideDifferencePaise);
    if (overrideGoodwillPaise > 0) {
      complianceFlags.push("COMPLIANCE_DECISION_REQUIRED");
      complianceFlags.push("GOODWILL_ADJUSTMENT_EXPLICIT");
    }
    // Persist calculated snapshot for audit if missing/stale.
    if (request.calculatedRefundPaise !== calculatedRefundPaise) {
      await prisma.orderServiceRequest.update({
        where: { id: request.id },
        data: { calculatedRefundPaise }
      });
    }
  }

  if (totalRefundNowPaise <= 0 && executable) {
    executable = false;
    blockCode = "NOTHING_TO_REFUND";
    blockMessage = "No remaining refundable amount on this return case";
  }

  return {
    requestId: request.id,
    orderId: request.orderId,
    orderNumber: request.orderNumber,
    caseNumber: request.caseNumber,
    executable,
    blockCode,
    blockMessage,
    shippingPolicy,
    paymentProvider,
    refundDestinationLabel,
    currency: request.order.currency,
    lines,
    merchandiseRefundPaise,
    shippingRefundPaise,
    otherAdjustmentPaise,
    alreadyRefundedPaise,
    calculatedRefundPaise,
    totalRefundNowPaise,
    remainingGatewayPaise,
    approvedQtySelected: lines.reduce((s, l) => s + l.qtySelected, 0),
    orderedQtyOnLines: lines.reduce((s, l) => s + l.qtyOrdered, 0),
    overrideActive,
    overrideDifferencePaise,
    overrideGoodwillPaise,
    overrideReason: request.overrideReason,
    complianceFlags
  };
}

/**
 * Persist a controlled refund override. Does not execute the gateway refund.
 * Downward: any admin. Upward (goodwill): SUPER_ADMIN only.
 */
export async function setReturnRefundOverride(opts: {
  requestId: string;
  overrideRefundPaise: number;
  reason: string;
  adminEmail: string;
  adminUserId?: string;
  adminRole?: string;
}): Promise<ReturnCaseRefundPreview> {
  const reason = opts.reason.trim();
  if (!reason) {
    throw Object.assign(new Error("Override reason is required"), {
      statusCode: 400,
      code: "OVERRIDE_REASON_REQUIRED"
    });
  }
  if (!Number.isFinite(opts.overrideRefundPaise) || opts.overrideRefundPaise < 0) {
    throw Object.assign(new Error("Override amount cannot be negative"), {
      statusCode: 400,
      code: "INVALID_OVERRIDE_AMOUNT"
    });
  }

  const preview = await previewReturnReplacementRefund(opts.requestId);
  const calculated = preview.calculatedRefundPaise;
  const override = Math.round(opts.overrideRefundPaise);

  if (override > preview.remainingGatewayPaise) {
    throw Object.assign(
      new Error(
        `Override cannot exceed remaining captured balance (${preview.remainingGatewayPaise / 100})`
      ),
      { statusCode: 400, code: "EXCEEDS_GATEWAY_BALANCE" }
    );
  }

  if (override > calculated) {
    const isSuper = opts.adminRole === "SUPER_ADMIN";
    if (!isSuper) {
      throw Object.assign(
        new Error(
          "Upward goodwill refund above the calculated amount requires SUPER_ADMIN approval"
        ),
        { statusCode: 403, code: "GOODWILL_REQUIRES_SUPER_ADMIN" }
      );
    }
  }

  const difference = override - calculated;
  const goodwill = Math.max(0, difference);
  const now = new Date();

  await prisma.orderServiceRequest.update({
    where: { id: opts.requestId },
    data: {
      calculatedRefundPaise: calculated,
      approvedOverrideRefundPaise: override,
      overrideDifferencePaise: difference,
      overrideReason: reason,
      overrideActorId: opts.adminUserId ?? null,
      overrideActorEmail: opts.adminEmail,
      overrideAt: now,
      overrideGoodwillPaise: goodwill
    }
  });

  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: opts.requestId,
    eventType: "NOTE_ADDED",
    message: `Refund override set: calculated ${calculated} → ${override} paise`,
    payloadJson: {
      kind: "REFUND_OVERRIDE",
      calculatedRefundPaise: calculated,
      approvedOverrideRefundPaise: override,
      overrideDifferencePaise: difference,
      overrideGoodwillPaise: goodwill,
      reason
    },
    actor: { email: opts.adminEmail, userId: opts.adminUserId, role: opts.adminRole ?? "ADMIN" }
  });

  return previewReturnReplacementRefund(opts.requestId);
}

export async function clearReturnRefundOverride(opts: {
  requestId: string;
  adminEmail: string;
  adminUserId?: string;
}): Promise<ReturnCaseRefundPreview> {
  await prisma.orderServiceRequest.update({
    where: { id: opts.requestId },
    data: {
      approvedOverrideRefundPaise: null,
      overrideDifferencePaise: null,
      overrideReason: null,
      overrideActorId: null,
      overrideActorEmail: null,
      overrideAt: null,
      overrideGoodwillPaise: null
    }
  });
  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: opts.requestId,
    eventType: "NOTE_ADDED",
    message: "Refund override cleared — using system-calculated amount",
    payloadJson: { kind: "REFUND_OVERRIDE_CLEARED" },
    actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
  });
  return previewReturnReplacementRefund(opts.requestId);
}

export async function executeReturnReplacementRefund(opts: {
  requestId: string;
  adminEmail: string;
  adminUserId?: string;
  codRefundNote?: string;
}): Promise<{
  totalRefundedInPaise: number;
  refundIds: string[];
  message: string;
  preview: ReturnCaseRefundPreview;
}> {
  // Revalidate at execution time (stale UI preview must not over-refund).
  const plan = await previewReturnReplacementRefund(opts.requestId);
  if (!plan.executable) {
    throw Object.assign(new Error(plan.blockMessage ?? "Refund not executable"), {
      statusCode: plan.blockCode === "ALREADY_REFUNDED" ? 409 : 400,
      code: plan.blockCode ?? "NOT_EXECUTABLE"
    });
  }

  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: opts.requestId },
    include: {
      items: true,
      returnShipment: true,
      order: { include: { payments: true } }
    }
  });
  if (!request) {
    throw Object.assign(new Error("Request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  // Hard gate again inside the same request lifecycle.
  assertReturnCaseRefundExecutable(request);

  const { assertHighValueApprovalIfRequired } = await import("./return-policy-config.service");
  await assertHighValueApprovalIfRequired({
    requestId: request.id,
    refundAmountPaise: plan.totalRefundNowPaise
  });

  const isCod = plan.paymentProvider === "COD";
  const itemById = new Map(request.items.map((i) => [i.id, i]));

  if (isCod) {
    const note = opts.codRefundNote?.trim();
    if (!note) {
      throw Object.assign(new Error("COD return requires manual refund details (bank/UPI)"), {
        statusCode: 400,
        code: "COD_NOTE_REQUIRED"
      });
    }
    const now = new Date();
    for (const line of plan.lines) {
      if (line.lineTotalRefundPaise <= 0) continue;
      await prisma.orderServiceRequestItem.update({
        where: { id: line.requestItemId },
        data: {
          refundAmountInPaise: (itemById.get(line.requestItemId)?.refundAmountInPaise ?? 0) + line.lineTotalRefundPaise,
          refundedAt: now,
          refundProviderId: "COD_MANUAL"
        }
      });
    }
    await prisma.orderServiceRequest.update({
      where: { id: request.id },
      data: {
        codRefundNote: note,
        refundProcessedAt: now,
        refundInitiatedAt: request.refundInitiatedAt ?? now,
        refundCompletedAt: now,
        refundTotalInPaise: (request.refundTotalInPaise ?? 0) + plan.totalRefundNowPaise,
        resolutionStatus: "REFUNDED"
      }
    });

    const { appendCaseEvent } = await import("./return-case-events.service");
    await appendCaseEvent({
      requestId: request.id,
      eventType: "REFUND_COMPLETED",
      message: `COD manual refund recorded: ${plan.totalRefundNowPaise} paise`,
      payloadJson: { totalInPaise: plan.totalRefundNowPaise },
      actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
    });

    void (async () => {
      const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
      await notifyReturnCaseEvent(request.id, "RETURN_REFUND_PROCESSED", {
        orderNumber: request.orderNumber,
        caseNumber: request.caseNumber,
        customerEmail: request.customerEmail,
        customerPhone: request.order.phone,
        itemSummary: request.items.map((i) => `${i.nameSnapshot} × ${i.qtySelected}`).join("; "),
        refundAmountInPaise: plan.totalRefundNowPaise,
        currency: request.order.currency,
        paymentProvider: "COD",
        completedAt: now
      });
    })();

    return {
      totalRefundedInPaise: plan.totalRefundNowPaise,
      refundIds: [],
      message: "COD manual refund recorded — transfer to customer using saved details.",
      preview: plan
    };
  }

  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: { resolutionStatus: "REFUND_PROCESSING", refundInitiatedAt: request.refundInitiatedAt ?? new Date() }
  });

  const refundIds: string[] = [];
  let totalRefunded = 0;

  // Apply override: scale down components OR attach goodwill to first line (never invent GST).
  const calculated = plan.calculatedRefundPaise;
  const target = plan.totalRefundNowPaise;
  const goodwillTotal = plan.overrideGoodwillPaise;
  const scaleDown =
    plan.overrideActive && target < calculated && calculated > 0 ? target / calculated : 1;

  let goodwillRemaining = goodwillTotal;
  const executableLines = plan.lines.filter((l) => l.lineTotalRefundPaise > 0);

  for (let idx = 0; idx < executableLines.length; idx++) {
    const line = executableLines[idx];
    const item = itemById.get(line.requestItemId)!;
    const merch = Math.round(line.merchandiseRefundPaise * scaleDown);
    const ship = Math.round(line.shippingRefundPaise * scaleDown);
    const goodwill =
      idx === executableLines.length - 1 ? goodwillRemaining : 0;
    if (idx === executableLines.length - 1) goodwillRemaining = 0;

    if (merch + ship + goodwill <= 0) continue;

    const result = await executeAuthoritativePartialRefund({
      orderId: request.orderId,
      sourceType: "SERVICE_REQUEST",
      sourceId: item.id,
      reason: plan.overrideActive
        ? `Return refund (override) — ${item.nameSnapshot} x${item.qtySelected} by ${opts.adminEmail}`
        : `Return refund — ${item.nameSnapshot} x${item.qtySelected} by ${opts.adminEmail}`,
      adjustmentMerchandiseRefundPaise: merch,
      adjustmentShippingRefundPaise: ship,
      goodwillAdjustmentPaise: goodwill > 0 ? goodwill : undefined,
      quantity: item.qtySelected,
      orderItemId: item.orderItemId
    });

    refundIds.push(result.refundId);
    totalRefunded += result.amountInPaise;

    await prisma.orderServiceRequestItem.update({
      where: { id: item.id },
      data: {
        refundAmountInPaise: result.amountInPaise,
        refundedAt: new Date(),
        refundProviderId: result.providerRefundId
      }
    });
  }

  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: {
      refundProcessedAt: new Date(),
      refundCompletedAt: new Date(),
      refundTotalInPaise: totalRefunded,
      resolutionStatus: "REFUNDED",
      refundProviderReference: refundIds[0] ?? null
    }
  });

  const { appendCaseEvent } = await import("./return-case-events.service");
  const initiatedAt = new Date();
  await appendCaseEvent({
    requestId: request.id,
    eventType: "REFUND_INITIATED",
    message: `Refund ${totalRefunded} paise initiated`,
    payloadJson: { totalRefundedInPaise: totalRefunded, refundIds },
    actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
  });

  void (async () => {
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    await notifyReturnCaseEvent(request.id, "RETURN_REFUND_INITIATED", {
      orderNumber: request.orderNumber,
      caseNumber: request.caseNumber,
      customerEmail: request.customerEmail,
      customerPhone: request.order.phone,
      itemSummary: request.items.map((i) => `${i.nameSnapshot} × ${i.qtySelected}`).join("; "),
      refundAmountInPaise: totalRefunded,
      currency: request.order.currency,
      paymentProvider: plan.paymentProvider,
      providerRefundId: refundIds[0] ?? null,
      initiatedAt
    });
  })();

  return {
    totalRefundedInPaise: totalRefunded,
    refundIds,
    message: `Refund of ${totalRefunded / 100} initiated to the original payment method (${refundIds.length} settlement(s)).`,
    preview: plan
  };
}

export function deriveCustomerReturnStatus(request: {
  status: string;
  returnPhysicalStatus: string;
  resolutionStatus: string;
  refundTotalInPaise?: number | null;
  items?: Array<{ requestedResolution?: string | null }>;
}): { label: string; detail?: string } {
  if (request.status === "PENDING_APPROVAL") {
    return { label: "Request submitted", detail: "Our team is reviewing your request." };
  }
  if (request.status === "REJECTED") {
    return { label: "Request declined", detail: "See email for details or contact support." };
  }
  if (request.status === "NEEDS_DISCUSSION") {
    return { label: "Under review", detail: "We need more information — check your email." };
  }
  if (request.resolutionStatus === "REFUND_PROCESSING") {
    return {
      label: "Refund processing",
      detail: "Your refund has been initiated to the original payment method. Bank credit may take a few business days."
    };
  }
  if (request.resolutionStatus === "REFUNDED") {
    const amount =
      request.refundTotalInPaise != null && request.refundTotalInPaise > 0
        ? ` ₹${(request.refundTotalInPaise / 100).toLocaleString("en-IN")}`
        : "";
    return {
      label: "Refund processed",
      detail: `Refund${amount} has been processed to your original payment method. Bank credit may take a few business days.`
    };
  }
  if (request.returnPhysicalStatus === "AWAITING_RETURN" || request.returnPhysicalStatus === "IN_TRANSIT") {
    return {
      label: "Return approved",
      detail: "Please ship the item using the instructions we sent. Refund follows after we receive and inspect it."
    };
  }
  if (request.returnPhysicalStatus === "RECEIVED") {
    return { label: "Return received", detail: "We are inspecting your return." };
  }
  if (request.returnPhysicalStatus === "INSPECTED") {
    return {
      label: "Inspection completed",
      detail:
        request.resolutionStatus === "REFUND_PENDING"
          ? "Inspection is complete. Your refund is being prepared."
          : "Inspection is complete."
    };
  }
  if (
    request.resolutionStatus === "REPLACEMENT_PENDING" ||
    request.resolutionStatus === "REPLACEMENT_SHIPPED"
  ) {
    return { label: "Replacement being prepared", detail: "We are preparing your replacement." };
  }
  if (request.resolutionStatus === "REPLACEMENT_DELIVERED" || request.resolutionStatus === "CLOSED") {
    return { label: "Replacement delivered", detail: "Your replacement has been delivered." };
  }
  if (request.status === "APPROVED" && request.returnPhysicalStatus === "NOT_REQUIRED") {
    return {
      label: "Refund approved",
      detail: "Your refund is being processed to the original payment method."
    };
  }
  if (request.status === "APPROVED") {
    return { label: "Request approved", detail: "We will update you on next steps." };
  }
  return { label: "Request submitted" };
}

/** Customer-facing approval copy for email / My Orders banners. */
export function returnApprovalCustomerMessage(opts: {
  physicalReturnRequired: boolean;
}): string {
  if (opts.physicalReturnRequired) {
    return "Your return/refund request has been approved. Your refund will be processed after we receive and inspect the returned item.";
  }
  return "Your return/refund request has been approved. Your refund is being processed.";
}

/** Expose allowed resolutions for customer UI. */
export function getReturnReplacementOptions(reasonCode: string) {
  return {
    allowedResolutions: allowedResolutionsForReason(reasonCode),
    evidenceRequired: evidenceRequiredForReason(reasonCode),
    shippingPolicy: shippingPolicyForReason(reasonCode)
  };
}

