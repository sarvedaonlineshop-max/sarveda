import type { OrderServiceRequest, OrderServiceRequestPhoto, OrderStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../../config/db";
import { uploadAsset } from "../../config/s3";
import {
  cancelReasonLabel,
  refundReasonLabel,
  RETURN_WINDOW_DAYS,
  type CANCEL_BEFORE_DELIVERY_REASONS,
  type REFUND_AFTER_DELIVERY_REASONS
} from "./order-service-request.constants";
import {
  formatCustomerReasonsSummary,
  type CancellationCustomerReason
} from "./order-cancellation-info";
import {
  notifyServiceRequestReviewed,
  notifyServiceRequestSubmitted
} from "./order-service-request.emails";
import { pickCapturedPaymentForRefund } from "../payments/payment-selection";
import { initiateGatewayRefund, initiatePartialGatewayRefund } from "../payments/refund.service";
import { capRefundAmountToPolicy } from "./order-refund-calculator.service";
import { loadOrderRefundPreview } from "./order-refund-preview.service";
import {
  getCancellationEligibility,
  isAdjustmentCandidateReason,
  orderIsPaidForCancellation
} from "./cancellation-eligibility";
import { handlePaidOrderStatusChange } from "./orders.service";

export function customerReasonsFromApprovedCancel(
  requests: Array<{
    type: string;
    status: string;
    message: string | null;
    items?: Array<{ nameSnapshot: string; reasonLabel: string; message: string | null }>;
  }>
): CancellationCustomerReason[] | undefined {
  const approved = requests.find(
    (r) => r.status === "APPROVED" && r.type === "CANCEL_BEFORE_DELIVERY"
  );
  if (!approved?.items?.length) return undefined;
  return approved.items.map((i) => ({
    itemName: i.nameSnapshot,
    reasonLabel: i.reasonLabel,
    message: i.message
  }));
}

type OrderRow = {
  id?: string;
  orderNumber: string;
  email: string;
  status: OrderStatus;
  paymentStatus: string;
  customerId: string | null;
  payments?: Array<{ provider: string; status?: string; id?: string; createdAt?: Date }>;
  shipments?: Array<{
    status: import("@prisma/client").ShipmentStatus | string;
    deliveredAt?: Date | null;
  }>;
  deliveredAt?: Date | null;
};

export type ServiceRequestPublic = {
  id: string;
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY" | "ADJUST_BEFORE_DELIVERY";
  status:
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "NEEDS_DISCUSSION"
    | "MORE_INFO_REQUIRED"
    | "CONVERTED_TO_CANCELLATION";
  reasonLabel: string;
  message: string | null;
  createdAt: Date;
};

export function orderIsPaidForService(order: OrderRow): boolean {
  return orderIsPaidForCancellation(order);
}

export function resolveDeliveredAt(order: {
  status: string;
  shipments?: Array<{ deliveredAt?: Date | null }>;
  statusHistory?: Array<{ toStatus: string; createdAt: Date }>;
}): Date | null {
  if (order.status !== "DELIVERED") return null;
  const fromShip = (order.shipments ?? [])
    .map((s) => s.deliveredAt)
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (fromShip) return fromShip;
  const hist = (order.statusHistory ?? [])
    .filter((h) => h.toStatus === "DELIVERED")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  return hist?.createdAt ?? null;
}

export function returnWindowEnd(deliveredAt: Date): Date {
  return new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export function canRequestCancel(order: OrderRow): boolean {
  return getCancellationEligibility(order).customerCanRequest;
}

export function getCancelBlockReason(order: OrderRow): string | null {
  const eligibility = getCancellationEligibility(order);
  return eligibility.customerCanRequest ? null : (eligibility.customerMessage ?? null);
}

export function canRequestRefund(order: OrderRow & {
  statusHistory?: Array<{ toStatus: string; createdAt: Date }>;
}): boolean {
  if (order.status !== "DELIVERED") return false;
  if (!orderIsPaidForService(order)) return false;
  // Same canonical deliveredAt as return submission (shipment.deliveredAt or DELIVERED history).
  const deliveredAt = resolveDeliveredAt(order);
  if (!deliveredAt) return false;
  return Date.now() <= returnWindowEnd(deliveredAt).getTime();
}

export function serializeServiceRequest(
  row: OrderServiceRequest
): ServiceRequestPublic {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    reasonLabel: row.reasonLabel ?? "Request submitted",
    message: row.message,
    createdAt: row.createdAt
  };
}

export async function latestServiceRequestForOrder(
  orderId: string
): Promise<OrderServiceRequest | null> {
  return prisma.orderServiceRequest.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" }
  });
}

export async function pendingServiceRequestCount(): Promise<number> {
  return prisma.orderServiceRequest.count({
    where: { status: { in: ["PENDING_APPROVAL", "MORE_INFO_REQUIRED"] } }
  });
}

export type SubmitServiceRequestItem = {
  orderItemId: string;
  reasonCode: string;
  otherMessage?: string;
  message?: string;
  qty?: number;
  requestedResolution?: string;
  requestedVariantId?: string;
};

export function reasonLabelFor(
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY",
  reasonCode: string,
  otherMessage?: string
): string | undefined {
  const base =
    type === "CANCEL_BEFORE_DELIVERY"
      ? cancelReasonLabel(reasonCode)
      : refundReasonLabel(reasonCode);
  if (!base) return undefined;
  if (reasonCode === "other" && otherMessage?.trim()) {
    return `${base}: ${otherMessage.trim()}`;
  }
  return base;
}

export async function uploadRequestPhotos(
  requestId: string,
  files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>
) {
  const { assertEvidenceFileAllowed, mediaKindForMime } = await import("./return-case-evidence");
  const rows: Array<{
    s3Key: string;
    s3Url: string;
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    mediaKind: "IMAGE" | "VIDEO";
  }> = [];
  for (const file of files) {
    assertEvidenceFileAllowed(file);
    const mediaKind = mediaKindForMime(file.mimetype);
    const ext = file.originalname.split(".").pop()?.toLowerCase() || (mediaKind === "VIDEO" ? "mp4" : "jpg");
    const key = `order-requests/${requestId}/${randomUUID()}.${ext}`;
    const url = await uploadAsset(key, file.buffer, file.mimetype);
    if (!url) {
      throw Object.assign(new Error("Could not upload evidence. Please try again."), {
        statusCode: 500,
        code: "UPLOAD_FAILED"
      });
    }
    rows.push({
      s3Key: key,
      s3Url: url,
      fileName: file.originalname,
      fileSizeBytes: file.size,
      mimeType: file.mimetype,
      mediaKind
    });
  }
  return rows;
}

export async function submitServiceRequest(opts: {
  orderNumber: string;
  userId: string;
  userEmail: string;
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY";
  message?: string;
  items: SubmitServiceRequestItem[];
  photosByIndex: Map<number, Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>>;
}): Promise<OrderServiceRequest> {
  const email = opts.userEmail.trim().toLowerCase();
  const order = await prisma.order.findFirst({
    where: {
      orderNumber: opts.orderNumber,
      deletedAt: null,
      OR: [{ customerId: opts.userId }, { email }]
    },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      items: true,
      shipments: { select: { status: true, deliveredAt: true } },
      statusHistory: { select: { toStatus: true, createdAt: true } }
    }
  });

  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const existingPending = await prisma.orderServiceRequest.findFirst({
    where: { orderId: order.id, status: { in: ["PENDING_APPROVAL", "MORE_INFO_REQUIRED"] } }
  });
  if (existingPending) {
    throw Object.assign(new Error("A request is already waiting for approval on this order"), {
      statusCode: 409,
      code: "REQUEST_PENDING"
    });
  }

  if (opts.type === "CANCEL_BEFORE_DELIVERY") {
    const eligibility = getCancellationEligibility({
      status: order.status,
      paymentStatus: order.paymentStatus,
      payments: order.payments,
      shipments: order.shipments
    });
    if (!eligibility.customerCanRequest) {
      throw Object.assign(
        new Error(eligibility.customerMessage ?? "This order cannot be cancelled"),
        {
          statusCode: 400,
          code: eligibility.blockCode ?? "NOT_ELIGIBLE"
        }
      );
    }
  }
  if (opts.type === "REFUND_AFTER_DELIVERY" && !canRequestRefund({
    ...order,
    deliveredAt: resolveDeliveredAt(order)
  })) {
    throw Object.assign(new Error("This order is not eligible for return/refund"), {
      statusCode: 400,
      code: "NOT_ELIGIBLE"
    });
  }

  if (!opts.items.length) {
    throw Object.assign(new Error("Select at least one item"), {
      statusCode: 400,
      code: "ITEMS_REQUIRED"
    });
  }

  const orderItemMap = new Map(order.items.map((i) => [i.id, i]));
  const parsedItems: Array<{
    orderItemId: string;
    nameSnapshot: string;
    skuSnapshot: string;
    qtySelected: number;
    reasonCode: string;
    reasonLabel: string;
    otherMessage: string | null;
    message: string | null;
    photos: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
  }> = [];

  opts.items.forEach((item, index) => {
    const row = orderItemMap.get(item.orderItemId);
    if (!row) {
      throw Object.assign(new Error("Invalid item in request"), { statusCode: 400, code: "BAD_REQUEST" });
    }
    const reasonLabel = reasonLabelFor(opts.type, item.reasonCode, item.otherMessage);
    if (!reasonLabel) {
      throw Object.assign(new Error("Invalid reason for an item"), { statusCode: 400, code: "BAD_REQUEST" });
    }
    const photos = opts.photosByIndex.get(index) ?? [];
    if (opts.type === "REFUND_AFTER_DELIVERY" && !photos.length) {
      throw Object.assign(new Error(`Add at least one photo for ${row.nameSnapshot}`), {
        statusCode: 400,
        code: "PHOTOS_REQUIRED"
      });
    }
    parsedItems.push({
      orderItemId: row.id,
      nameSnapshot: row.nameSnapshot,
      skuSnapshot: row.skuSnapshot,
      qtySelected: row.qtyOrdered,
      reasonCode: item.reasonCode,
      reasonLabel,
      otherMessage: item.otherMessage?.trim() || null,
      message: item.message?.trim() || null,
      photos
    });
  });

  if (opts.type === "CANCEL_BEFORE_DELIVERY") {
    if (parsedItems.every((i) => isAdjustmentCandidateReason(i.reasonCode))) {
      throw Object.assign(
        new Error(
          "Address, item, and quantity changes use the order change request flow — not cancellation."
        ),
        { statusCode: 400, code: "USE_ADJUSTMENT_REQUEST" }
      );
    }
    if (parsedItems.some((i) => isAdjustmentCandidateReason(i.reasonCode))) {
      throw Object.assign(
        new Error("Mixing cancellation with order change reasons is not allowed. Submit separate requests."),
        { statusCode: 400, code: "MIXED_REQUEST_TYPES" }
      );
    }
  }

  const requestId = randomUUID();
  const summaryLabel =
    parsedItems.length === 1
      ? `${parsedItems[0].nameSnapshot} — ${parsedItems[0].reasonLabel}`
      : `${parsedItems.length} items — mixed reasons`;
  const summaryCode = parsedItems.length === 1 ? parsedItems[0].reasonCode : "multi";

  const { nextReturnCaseNumber } = await import("./return-case-number");
  const { appendCaseEvent } = await import("./return-case-events.service");
  const caseNumber = await nextReturnCaseNumber();

  const created = await prisma.orderServiceRequest.create({
    data: {
      id: requestId,
      caseNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: opts.userId,
      customerEmail: email,
      type: opts.type,
      channel: "WEBSITE",
      reasonCode: summaryCode,
      reasonLabel: summaryLabel,
      message: opts.message?.trim() || null,
      items: {
        create: await Promise.all(
          parsedItems.map(async (item) => {
            const itemId = randomUUID();
            const photoRows = await uploadRequestPhotos(requestId, item.photos);
            return {
              id: itemId,
              orderItemId: item.orderItemId,
              nameSnapshot: item.nameSnapshot,
              skuSnapshot: item.skuSnapshot,
              qtySelected: item.qtySelected,
              reasonCode: item.reasonCode,
              reasonLabel: item.reasonLabel,
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
    payloadJson: { type: opts.type, caseNumber },
    actor: { userId: opts.userId, email, role: "CUSTOMER" }
  });

  void notifyServiceRequestSubmitted({
    orderNumber: order.orderNumber,
    customerEmail: email,
    type: opts.type,
    reasonLabel: summaryLabel,
    message: opts.message
  });

  return created;
}

/**
 * Phase 1A: approve cancellation → controlled refund/cancel before dispatch only.
 * Online paid: full gateway refund (REFUNDED + restock via finalizeGatewayRefund).
 * COD: cancel + restock, no gateway refund.
 */
export async function executeApprovedCancellationRequest(opts: {
  orderId: string;
  reason: string;
  adjustmentCandidate?: boolean;
}): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: opts.orderId },
    include: {
      payments: { orderBy: { createdAt: "desc" } },
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

  if (!eligibility.adminCanApproveCancel) {
    throw Object.assign(
      new Error(
        eligibility.customerMessage ??
          "Cancellation cannot be approved after dispatch. Use the RTO / in-transit workflow."
      ),
      {
        statusCode: 400,
        code: eligibility.blockCode ?? "CANCELLATION_NOT_ALLOWED_AFTER_DISPATCH"
      }
    );
  }

  if (opts.adjustmentCandidate) {
    // Phase 1D will add RESOLVED_BY_ADJUSTMENT — for now approval proceeds as cancellation.
  }

  const isCod = order.payments.some((p) => p.provider === "COD");
  if (isCod) {
    await handlePaidOrderStatusChange(order.id, "CANCELLED", opts.reason);
    return;
  }

  const capturedPick = pickCapturedPaymentForRefund(order.payments);
  if (capturedPick.ok) {
    await initiateGatewayRefund(order.id, opts.reason);
    return;
  }

  if (capturedPick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED") {
    throw Object.assign(new Error(capturedPick.message), {
      statusCode: 409,
      code: "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED"
    });
  }

  await handlePaidOrderStatusChange(order.id, "CANCELLED", opts.reason);
}

export async function getServiceRequestPhotoForAdmin(
  orderId: string,
  photoId: string
): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
  const photo = await prisma.orderServiceRequestPhoto.findFirst({
    where: {
      id: photoId,
      request: { orderId }
    }
  });
  if (!photo) return null;
  const { downloadAssetFromS3, assetContentTypeForKey } = await import("../../config/s3");
  const buffer = await downloadAssetFromS3(photo.s3Key);
  if (!buffer) return null;
  return {
    buffer,
    contentType: assetContentTypeForKey(photo.s3Key),
    fileName: photo.fileName ?? `photo-${photo.id}.jpg`
  };
}

export async function reviewServiceRequest(opts: {
  orderId: string;
  requestId: string;
  approve: boolean;
  adminEmail: string;
  adminNote?: string;
}): Promise<OrderServiceRequest & { photos: OrderServiceRequestPhoto[] }> {
  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId },
    include: { photos: true, order: true, items: true }
  });

  if (!request) {
    throw Object.assign(new Error("Request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (!["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "NEEDS_DISCUSSION"].includes(request.status)) {
    throw Object.assign(new Error("Request already reviewed"), { statusCode: 409, code: "ALREADY_REVIEWED" });
  }

  const nextStatus = opts.approve ? "APPROVED" : "REJECTED";
  const customerReasonText = request.items.length
    ? formatCustomerReasonsSummary(
        request.items.map((i) => ({
          itemName: i.nameSnapshot,
          reasonLabel: i.reasonLabel,
          message: i.message
        })),
        request.message
      )
    : request.reasonLabel ?? "Customer request";

  if (opts.approve && request.type === "CANCEL_BEFORE_DELIVERY") {
    if (request.items.some((i) => isAdjustmentCandidateReason(i.reasonCode))) {
      throw Object.assign(
        new Error(
          "This request requires the adjustment workflow. Use Execute adjustment or Convert to cancellation."
        ),
        { statusCode: 409, code: "ADJUSTMENT_WORKFLOW_REQUIRED" }
      );
    }
    await executeApprovedCancellationRequest({
      orderId: request.orderId,
      reason: customerReasonText
    });
  }

  if (opts.approve && request.type === "ADJUST_BEFORE_DELIVERY") {
    throw Object.assign(
      new Error("Adjustment requests must be executed via the adjustment workflow — not standard approve."),
      { statusCode: 409, code: "USE_EXECUTE_ADJUSTMENT" }
    );
  }

  if (opts.approve && request.type === "REFUND_AFTER_DELIVERY") {
    const { approveReturnReplacementRequest } = await import("./return-replacement.service");
    const approved = await approveReturnReplacementRequest({
      orderId: request.orderId,
      requestId: request.id,
      adminEmail: opts.adminEmail,
      adminNote: opts.adminNote
    });
    void notifyServiceRequestReviewed({
      orderNumber: request.orderNumber,
      customerEmail: request.customerEmail,
      type: request.type,
      approved: true,
      adminNote: opts.adminNote
    });
    return { ...approved!, photos: approved!.photos ?? [] } as OrderServiceRequest & {
      photos: OrderServiceRequestPhoto[];
    };
  }

  const updated = await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: {
      status: nextStatus,
      reviewedAt: new Date(),
      reviewedByEmail: opts.adminEmail,
      adminNote: opts.adminNote?.trim() || null,
      slaPausedAt: null,
      ...(opts.approve ? { refundApprovedAt: request.type === "REFUND_AFTER_DELIVERY" ? new Date() : undefined } : {})
    },
    include: { photos: true, items: { include: { photos: true } } }
  });

  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: request.id,
    eventType: opts.approve ? "APPROVED" : "REJECTED",
    message: opts.adminNote?.trim() || (opts.approve ? "Approved" : "Rejected"),
    actor: { email: opts.adminEmail, role: "ADMIN" }
  });

  void notifyServiceRequestReviewed({
    orderNumber: request.orderNumber,
    customerEmail: request.customerEmail,
    type: request.type,
    approved: opts.approve,
    adminNote: opts.adminNote
  });

  return updated;
}

export type ProcessServiceRequestRefundItem = {
  requestItemId: string;
  amountInPaise: number;
};

export async function processServiceRequestRefund(opts: {
  orderId: string;
  requestId: string;
  adminEmail: string;
  items: ProcessServiceRequestRefundItem[];
  codRefundNote?: string;
}): Promise<{
  totalRefundedInPaise: number;
  message: string;
  refundId?: string;
}> {
  if (!opts.items.length) {
    throw Object.assign(new Error("Select at least one item to refund"), {
      statusCode: 400,
      code: "ITEMS_REQUIRED"
    });
  }

  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId },
    include: {
      items: true,
      order: {
        include: {
          items: true,
          payments: { orderBy: { createdAt: "desc" } }
        }
      }
    }
  });

  if (!request) {
    throw Object.assign(new Error("Request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (request.status !== "APPROVED") {
    throw Object.assign(new Error("Only approved requests can be refunded"), {
      statusCode: 400,
      code: "NOT_APPROVED"
    });
  }

  if (request.type === "REFUND_AFTER_DELIVERY") {
    throw Object.assign(
      new Error(
        "Post-delivery returns must use the return-case refund path (receipt + QC when physical return is required)"
      ),
      { statusCode: 400, code: "USE_RETURN_CASE_REFUND" }
    );
  }

  const order = request.order;
  const orderItemById = new Map(order.items.map((i) => [i.id, i]));
  const requestItemById = new Map(request.items.map((i) => [i.id, i]));

  let totalInPaise = 0;
  const itemUpdates: Array<{ id: string; amountInPaise: number }> = [];

  for (const row of opts.items) {
    const reqItem = requestItemById.get(row.requestItemId);
    if (!reqItem) {
      throw Object.assign(new Error("Invalid item in refund"), { statusCode: 400, code: "BAD_REQUEST" });
    }
    const amount = Math.round(row.amountInPaise);
    if (amount <= 0) {
      throw Object.assign(new Error(`Refund amount must be positive for ${reqItem.nameSnapshot}`), {
        statusCode: 400,
        code: "INVALID_AMOUNT"
      });
    }
    const orderItem = orderItemById.get(reqItem.orderItemId);
    const lineTotal = orderItem?.lineTotalInPaise ?? 0;
    const qtyOrdered = orderItem?.qtyOrdered ?? reqItem.qtySelected;
    const { caseMerchandiseCeilingPaise } = await import("./return-refund-calculator.service");
    const remaining = caseMerchandiseCeilingPaise(
      lineTotal,
      qtyOrdered,
      reqItem.qtySelected,
      reqItem.refundAmountInPaise ?? 0
    );
    if (amount > remaining) {
      throw Object.assign(
        new Error(
          `Refund for ${reqItem.nameSnapshot} cannot exceed ${remaining / 100} (approved case qty ${reqItem.qtySelected})`
        ),
        { statusCode: 400, code: "AMOUNT_TOO_HIGH" }
      );
    }
    totalInPaise += amount;
    itemUpdates.push({ id: reqItem.id, amountInPaise: amount });
  }

  const isCod = order.payments.some((p) => p.provider === "COD");
  const capturedPick = pickCapturedPaymentForRefund(order.payments);

  if (isCod) {
    const note = opts.codRefundNote?.trim();
    if (!note) {
      throw Object.assign(
        new Error("COD orders need manual refund details (UPI / bank account) saved for your records"),
        { statusCode: 400, code: "COD_NOTE_REQUIRED" }
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (const upd of itemUpdates) {
        const existing = requestItemById.get(upd.id)!;
        await tx.orderServiceRequestItem.update({
          where: { id: upd.id },
          data: {
            refundAmountInPaise: (existing.refundAmountInPaise ?? 0) + upd.amountInPaise,
            refundedAt: now,
            refundProviderId: "COD_MANUAL"
          }
        });
      }
      const prevNote = request.codRefundNote?.trim();
      const mergedNote = prevNote ? `${prevNote}\n---\n${note}` : note;
      await tx.orderServiceRequest.update({
        where: { id: request.id },
        data: {
          codRefundNote: mergedNote,
          refundProcessedAt: now,
          refundInitiatedAt: request.refundInitiatedAt ?? now,
          refundCompletedAt: now,
          refundProviderReference: "COD_MANUAL",
          refundTotalInPaise: (request.refundTotalInPaise ?? 0) + totalInPaise,
          resolutionStatus: "REFUNDED"
        }
      });
    });

    const { appendCaseEvent } = await import("./return-case-events.service");
    await appendCaseEvent({
      requestId: request.id,
      eventType: "REFUND_COMPLETED",
      message: `COD manual refund recorded: ${totalInPaise} paise`,
      payloadJson: { totalInPaise, provider: "COD_MANUAL" },
      actor: { email: opts.adminEmail, role: "ADMIN" }
    });

    return {
      totalRefundedInPaise: totalInPaise,
      message:
        "Manual refund required. COD refund note saved — transfer money to the customer using those details. No automatic payout."
    };
  }

  if (!capturedPick.ok) {
    if (capturedPick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED") {
      throw Object.assign(new Error(capturedPick.message), {
        statusCode: 409,
        code: "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED"
      });
    }
    throw Object.assign(new Error("No captured payment to refund"), {
      statusCode: 400,
      code: "NO_PAYMENT"
    });
  }

  const capturedPayment = capturedPick.payment;

  const alreadyRefundedOnPayment = capturedPayment.refundedInPaise ?? 0;
  const orderRemaining = order.grandTotalInPaise - alreadyRefundedOnPayment;
  if (totalInPaise > orderRemaining) {
    throw Object.assign(
      new Error(`Total refund cannot exceed ${orderRemaining / 100} remaining on this order`),
      { statusCode: 400, code: "AMOUNT_TOO_HIGH" }
    );
  }

  const preview = await loadOrderRefundPreview(opts.orderId, { policy: "auto" });
  if (!preview.ok) {
    if (preview.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED") {
      throw Object.assign(new Error(preview.message), {
        statusCode: 409,
        code: preview.code
      });
    }
  } else {
    if (totalInPaise > preview.breakdown.policyMaximumRefundableAmountPaise) {
      throw Object.assign(
        new Error(
          `Refund cannot exceed policy maximum of ${preview.breakdown.policyMaximumRefundableAmountPaise / 100} for ${preview.breakdown.policy}`
        ),
        { statusCode: 400, code: "AMOUNT_TOO_HIGH" }
      );
    }
    const capped = capRefundAmountToPolicy(preview.breakdown, totalInPaise);
    if (capped.allowedAmountPaise < totalInPaise) {
      throw Object.assign(
        new Error(
          `Refund amount exceeds allowed maximum of ${capped.allowedAmountPaise / 100} (remaining refundable / policy cap)`
        ),
        { statusCode: 400, code: "AMOUNT_TOO_HIGH" }
      );
    }
  }

  const reason = `Service request refund by ${opts.adminEmail}`;
  const gateway = await initiatePartialGatewayRefund(order.id, totalInPaise, reason);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const upd of itemUpdates) {
      const existing = requestItemById.get(upd.id)!;
      await tx.orderServiceRequestItem.update({
        where: { id: upd.id },
        data: {
          refundAmountInPaise: (existing.refundAmountInPaise ?? 0) + upd.amountInPaise,
          refundedAt: now,
          refundProviderId: gateway.refundId ?? null
        }
      });
    }
    await tx.orderServiceRequest.update({
      where: { id: request.id },
      data: {
        refundProcessedAt: now,
        refundInitiatedAt: request.refundInitiatedAt ?? now,
        refundCompletedAt: now,
        refundProviderReference: gateway.refundId ?? null,
        refundTotalInPaise: (request.refundTotalInPaise ?? 0) + totalInPaise,
        resolutionStatus: "REFUNDED"
      }
    });
  });

  const { appendCaseEvent: appendRefundEvent } = await import("./return-case-events.service");
  await appendRefundEvent({
    requestId: request.id,
    eventType: "REFUND_COMPLETED",
    message: `Refund completed: ${totalInPaise} paise`,
    payloadJson: { totalInPaise, providerRefundId: gateway.refundId ?? null },
    actor: { email: opts.adminEmail, role: "ADMIN" }
  });

  return {
    totalRefundedInPaise: totalInPaise,
    message: gateway.message,
    refundId: gateway.refundId
  };
}

export function isValidCancelReason(code: string): code is (typeof CANCEL_BEFORE_DELIVERY_REASONS)[number]["code"] {
  return !!cancelReasonLabel(code);
}

export function isValidRefundReason(code: string): code is (typeof REFUND_AFTER_DELIVERY_REASONS)[number]["code"] {
  return !!refundReasonLabel(code);
}
