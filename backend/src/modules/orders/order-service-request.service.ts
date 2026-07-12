import type { OrderServiceRequest, OrderServiceRequestPhoto, OrderStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma } from "../../config/db";
import { uploadAsset } from "../../config/s3";
import {
  cancelReasonLabel,
  refundReasonLabel,
  type CANCEL_BEFORE_DELIVERY_REASONS,
  type REFUND_AFTER_DELIVERY_REASONS
} from "./order-service-request.constants";
import {
  notifyServiceRequestReviewed,
  notifyServiceRequestSubmitted
} from "./order-service-request.emails";

type OrderRow = {
  id?: string;
  orderNumber: string;
  email: string;
  status: OrderStatus;
  paymentStatus: string;
  customerId: string | null;
  payments?: Array<{ provider: string }>;
};

export type ServiceRequestPublic = {
  id: string;
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY";
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  reasonLabel: string;
  message: string | null;
  createdAt: Date;
};

export function orderIsPaidForService(order: OrderRow): boolean {
  const provider = order.payments?.[0]?.provider;
  const isCod = provider === "COD";
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID") return true;
  if (isCod) {
    return !["PENDING_PAYMENT", "CANCELLED", "REFUNDED"].includes(order.status);
  }
  return false;
}

export function canRequestCancel(order: OrderRow): boolean {
  if (["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) return false;
  return orderIsPaidForService(order);
}

export function canRequestRefund(order: OrderRow): boolean {
  if (order.status !== "DELIVERED") return false;
  return orderIsPaidForService(order);
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
    where: { status: "PENDING_APPROVAL" }
  });
}

export type SubmitServiceRequestItem = {
  orderItemId: string;
  reasonCode: string;
  otherMessage?: string;
  message?: string;
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

async function uploadRequestPhotos(
  requestId: string,
  files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>
) {
  const rows: Array<{
    s3Key: string;
    s3Url: string;
    fileName: string;
    fileSizeBytes: number;
  }> = [];
  for (const file of files) {
    const ext = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
    const key = `order-requests/${requestId}/${randomUUID()}.${ext}`;
    const url = await uploadAsset(key, file.buffer, file.mimetype);
    if (!url) {
      throw Object.assign(new Error("Could not upload photos. Please try again."), {
        statusCode: 500,
        code: "UPLOAD_FAILED"
      });
    }
    rows.push({
      s3Key: key,
      s3Url: url,
      fileName: file.originalname,
      fileSizeBytes: file.size
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
      items: true
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

  if (opts.type === "CANCEL_BEFORE_DELIVERY" && !canRequestCancel(order)) {
    throw Object.assign(new Error("This order cannot be cancelled"), {
      statusCode: 400,
      code: "NOT_ELIGIBLE"
    });
  }
  if (opts.type === "REFUND_AFTER_DELIVERY" && !canRequestRefund(order)) {
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
    if (!photos.length) {
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

  const requestId = randomUUID();
  const summaryLabel =
    parsedItems.length === 1
      ? `${parsedItems[0].nameSnapshot} — ${parsedItems[0].reasonLabel}`
      : `${parsedItems.length} items — mixed reasons`;
  const summaryCode = parsedItems.length === 1 ? parsedItems[0].reasonCode : "multi";

  const created = await prisma.orderServiceRequest.create({
    data: {
      id: requestId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: opts.userId,
      customerEmail: email,
      type: opts.type,
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
    type: opts.type,
    reasonLabel: summaryLabel,
    message: opts.message
  });

  return created;
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
    include: { photos: true, order: true }
  });

  if (!request) {
    throw Object.assign(new Error("Request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (request.status !== "PENDING_APPROVAL") {
    throw Object.assign(new Error("Request already reviewed"), { statusCode: 409, code: "ALREADY_REVIEWED" });
  }

  const nextStatus = opts.approve ? "APPROVED" : "REJECTED";
  const nextOrderStatus =
    opts.approve && request.type === "CANCEL_BEFORE_DELIVERY"
      ? "CANCELLED"
      : opts.approve && request.type === "REFUND_AFTER_DELIVERY"
        ? "REFUNDED"
        : null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.orderServiceRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        reviewedAt: new Date(),
        reviewedByEmail: opts.adminEmail,
        adminNote: opts.adminNote?.trim() || null
      },
      include: { photos: true }
    });

    if (nextOrderStatus) {
      await tx.order.update({
        where: { id: request.orderId },
        data: {
          status: nextOrderStatus,
          ...(nextOrderStatus === "REFUNDED" ? { paymentStatus: "REFUNDED" } : {})
        }
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: request.orderId,
          fromStatus: request.order.status,
          toStatus: nextOrderStatus,
          reason: opts.approve
            ? `Service request approved by ${opts.adminEmail}`
            : `Service request rejected by ${opts.adminEmail}`,
          changedBy: null
        }
      });
    }

    return row;
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

export function isValidCancelReason(code: string): code is (typeof CANCEL_BEFORE_DELIVERY_REASONS)[number]["code"] {
  return !!cancelReasonLabel(code);
}

export function isValidRefundReason(code: string): code is (typeof REFUND_AFTER_DELIVERY_REASONS)[number]["code"] {
  return !!refundReasonLabel(code);
}
