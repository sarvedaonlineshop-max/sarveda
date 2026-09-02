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
import { notifyServiceRequestSubmitted } from "./order-service-request.emails";

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
    where: { orderId: order.id, status: "PENDING_APPROVAL", type: "REFUND_AFTER_DELIVERY" }
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

  const created = await prisma.orderServiceRequest.create({
    data: {
      id: requestId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: opts.userId,
      customerEmail: email,
      type: "REFUND_AFTER_DELIVERY",
      requestIntent: "REFUND",
      reasonCode: parsedItems.length === 1 ? parsedItems[0].reasonCode : "multi",
      reasonLabel: summaryLabel,
      message: opts.message?.trim() || null,
      shippingRefundPolicy: shippingPolicy,
      returnPhysicalStatus: needsPhysicalReturn ? "NOT_REQUIRED" : "NOT_REQUIRED",
      resolutionStatus: "NONE",
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
                  fileSizeBytes: p.fileSizeBytes
                }))
              }
            };
          })
        )
      }
    },
    include: { items: { include: { photos: true } }, photos: true }
  });

  void notifyServiceRequestSubmitted({
    orderNumber: order.orderNumber,
    customerEmail: email,
    type: "REFUND_AFTER_DELIVERY",
    reasonLabel: summaryLabel,
    message: opts.message
  });

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
  if (request.status !== "PENDING_APPROVAL") {
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
      physicalReturnRequiredForReason(i.reasonCode)
  );
  const hasReplacement = request.items.some((i) => resolutionRequiresReplacement(i.requestedResolution!));
  const hasRefund = request.items.some((i) => resolutionRequiresRefund(i.requestedResolution!));

  let resolutionStatus: ReturnResolutionStatus = "NONE";
  if (hasReplacement && !hasRefund) resolutionStatus = "REPLACEMENT_PENDING";
  else if (hasRefund) resolutionStatus = "REFUND_PENDING";

  const returnPhysicalStatus = needsPhysicalReturn ? "AWAITING_RETURN" : "NOT_REQUIRED";

  await prisma.$transaction(async (tx) => {
    await tx.orderServiceRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedByEmail: opts.adminEmail,
        reviewedByUserId: opts.adminUserId ?? null,
        adminNote: opts.adminNote?.trim() || null,
        returnPhysicalStatus,
        resolutionStatus
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

export async function executeReturnReplacementRefund(opts: {
  requestId: string;
  adminEmail: string;
  adminUserId?: string;
  codRefundNote?: string;
}): Promise<{ totalRefundedInPaise: number; refundIds: string[]; message: string }> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: opts.requestId },
    include: {
      items: true,
      returnShipment: true,
      order: { include: { payments: true } }
    }
  });

  if (!request || request.type !== "REFUND_AFTER_DELIVERY") {
    throw Object.assign(new Error("Request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (request.status !== "APPROVED") {
    throw Object.assign(new Error("Request must be approved"), { statusCode: 400, code: "NOT_APPROVED" });
  }

  const refundItems = request.items.filter((i) =>
    resolutionRequiresRefund(i.requestedResolution ?? "RETURN_FOR_REFUND")
  );
  if (!refundItems.length) {
    throw Object.assign(new Error("No refund resolution on this request"), { statusCode: 400, code: "NO_REFUND" });
  }

  const needsPhysical = request.items.some(
    (i) =>
      i.requestedResolution !== "KEEP_ITEM_PARTIAL_REFUND" &&
      physicalReturnRequiredForReason(i.reasonCode)
  );

  if (needsPhysical) {
    const rs = request.returnShipment;
    if (!rs?.receivedAt) {
      throw Object.assign(new Error("Return must be physically received before refund"), {
        statusCode: 400,
        code: "RETURN_NOT_RECEIVED"
      });
    }
    if (!rs.disposition || rs.disposition === "NEEDS_REVIEW") {
      throw Object.assign(new Error("Set return disposition before refund"), {
        statusCode: 400,
        code: "DISPOSITION_REQUIRED"
      });
    }
  }

  const shippingPolicy = request.shippingRefundPolicy ?? "SHIPPING_RETAINED";
  const isCod = request.order.payments.some((p) => p.provider === "COD");

  if (isCod) {
    const note = opts.codRefundNote?.trim();
    if (!note) {
      throw Object.assign(new Error("COD return requires manual refund details (bank/UPI)"), {
        statusCode: 400,
        code: "COD_NOTE_REQUIRED"
      });
    }
    let total = 0;
    const now = new Date();
    for (const item of refundItems) {
      const preview = await calculateReturnItemRefund({
        orderId: request.orderId,
        orderItemId: item.orderItemId,
        qty: item.qtySelected,
        shippingPolicy,
        keepItem: item.requestedResolution === "KEEP_ITEM_PARTIAL_REFUND"
      });
      total += preview.totalRefundPaise;
      await prisma.orderServiceRequestItem.update({
        where: { id: item.id },
        data: {
          refundAmountInPaise: preview.totalRefundPaise,
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
        refundTotalInPaise: total,
        resolutionStatus: "REFUNDED"
      }
    });
    return {
      totalRefundedInPaise: total,
      refundIds: [],
      message: "COD manual refund recorded — transfer to customer using saved details."
    };
  }

  const capturedPick = pickCapturedPaymentForRefund(request.order.payments);
  if (!capturedPick.ok) {
    throw Object.assign(new Error(capturedPick.message), {
      statusCode: capturedPick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED" ? 409 : 400,
      code: capturedPick.code
    });
  }

  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: { resolutionStatus: "REFUND_PROCESSING" }
  });

  const refundIds: string[] = [];
  let totalRefunded = 0;

  for (const item of refundItems) {
    const preview = await calculateReturnItemRefund({
      orderId: request.orderId,
      orderItemId: item.orderItemId,
      qty: item.qtySelected,
      shippingPolicy,
      keepItem: item.requestedResolution === "KEEP_ITEM_PARTIAL_REFUND"
    });

    if (preview.totalRefundPaise <= 0) continue;

    const result = await executeAuthoritativePartialRefund({
      orderId: request.orderId,
      sourceType: "SERVICE_REQUEST",
      sourceId: item.id,
      reason: `Return refund — ${item.nameSnapshot} x${item.qtySelected} by ${opts.adminEmail}`,
      adjustmentMerchandiseRefundPaise: preview.merchandiseRefundPaise + preview.shippingRefundPaise,
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
      refundTotalInPaise: totalRefunded,
      resolutionStatus: "REFUNDED"
    }
  });

  return {
    totalRefundedInPaise: totalRefunded,
    refundIds,
    message: `Refunded ${totalRefunded / 100} via gateway (${refundIds.length} settlement(s)).`
  };
}

export function deriveCustomerReturnStatus(request: {
  status: string;
  returnPhysicalStatus: string;
  resolutionStatus: string;
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
  if (request.returnPhysicalStatus === "AWAITING_RETURN" || request.returnPhysicalStatus === "IN_TRANSIT") {
    return { label: "Return approved", detail: "Please ship the item using the instructions we sent." };
  }
  if (request.returnPhysicalStatus === "RECEIVED") {
    return { label: "Return received", detail: "We are inspecting your return." };
  }
  if (request.resolutionStatus === "REFUND_PROCESSING") {
    return { label: "Refund initiated", detail: "Your refund is being processed." };
  }
  if (request.resolutionStatus === "REFUNDED") {
    return { label: "Refund completed", detail: "Refund has been processed to your original payment method." };
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
  if (request.status === "APPROVED") {
    return { label: "Request approved", detail: "We will update you on next steps." };
  }
  return { label: "Request submitted" };
}

/** Expose allowed resolutions for customer UI. */
export function getReturnReplacementOptions(reasonCode: string) {
  return {
    allowedResolutions: allowedResolutionsForReason(reasonCode),
    evidenceRequired: evidenceRequiredForReason(reasonCode),
    shippingPolicy: shippingPolicyForReason(reasonCode)
  };
}
