import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import {
  getServiceRequestPhotoForAdmin,
  isValidCancelReason,
  isValidRefundReason,
  pendingServiceRequestCount,
  processServiceRequestRefund,
  reviewServiceRequest,
  submitServiceRequest,
  type SubmitServiceRequestItem
} from "./order-service-request.service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 48 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  }
});

export const serviceRequestUpload = upload.any();

function mapUploadedFiles(req: Request): Map<number, Express.Multer.File[]> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const byIndex = new Map<number, Express.Multer.File[]>();
  for (const file of files) {
    const match = /^photo_(\d+)$/.exec(file.fieldname);
    if (!match) continue;
    const index = Number.parseInt(match[1], 10);
    const list = byIndex.get(index) ?? [];
    list.push(file);
    byIndex.set(index, list);
  }
  return byIndex;
}

function parseItemsPayload(
  raw: unknown,
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY",
  lineQtyByItemId?: Map<string, number>
) {
  let parsed: unknown;
  if (typeof raw === "string") {
    parsed = JSON.parse(raw) as unknown;
  } else {
    parsed = raw;
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    throw Object.assign(new Error("Select at least one item"), { statusCode: 400, code: "ITEMS_REQUIRED" });
  }
  const items: SubmitServiceRequestItem[] = [];
  for (const row of parsed) {
    const entry = row as Record<string, unknown>;
    const orderItemId = String(entry.orderItemId ?? "").trim();
    const reasonCode = String(entry.reasonCode ?? "").trim();
    if (!orderItemId || !reasonCode) {
      throw Object.assign(new Error("Each item needs a reason"), { statusCode: 400, code: "BAD_REQUEST" });
    }
    const valid =
      type === "CANCEL_BEFORE_DELIVERY"
        ? isValidCancelReason(reasonCode)
        : isValidRefundReason(reasonCode);
    if (!valid) {
      throw Object.assign(new Error("Invalid reason for an item"), { statusCode: 400, code: "BAD_REQUEST" });
    }
    items.push({
      orderItemId,
      reasonCode,
      otherMessage: entry.otherMessage != null ? String(entry.otherMessage) : undefined,
      message: entry.message != null ? String(entry.message) : undefined,
      qty: entry.qty != null ? Number(entry.qty) : undefined,
      requestedResolution:
        entry.requestedResolution != null ? String(entry.requestedResolution) : undefined,
      requestedVariantId:
        entry.requestedVariantId != null ? String(entry.requestedVariantId) : undefined
    });
  }
  return items;
}

async function handleSubmit(
  req: Request,
  res: Response,
  next: NextFunction,
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY"
) {
  try {
    const user = req.authUser!;
    const { orderNumber } = req.params;
    const body = req.body as { items?: string; message?: string };
    const items = parseItemsPayload(body.items, type);
    const photosByIndex = mapUploadedFiles(req);
    const photosByIndexMapped = new Map<
      number,
      Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>
    >();
    for (const [index, files] of photosByIndex.entries()) {
      photosByIndexMapped.set(
        index,
        files.map((f) => ({
          buffer: f.buffer,
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size
        }))
      );
    }
    const created = await submitServiceRequest({
      orderNumber,
      userId: user.id,
      userEmail: user.email,
      type,
      message: body.message,
      items,
      photosByIndex: photosByIndexMapped
    });
    res.status(201).json({ success: true, data: { request: created } });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function submitCancelRequest(req: Request, res: Response, next: NextFunction) {
  return handleSubmit(req, res, next, "CANCEL_BEFORE_DELIVERY");
}

export async function submitRefundRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const { orderNumber } = req.params;
    const body = req.body as { items?: string; message?: string };
    const items = parseItemsPayload(body.items, "REFUND_AFTER_DELIVERY");
    const photosByIndex = mapUploadedFiles(req);
    const photosByIndexMapped = new Map<
      number,
      Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>
    >();
    for (const [index, files] of photosByIndex.entries()) {
      photosByIndexMapped.set(
        index,
        files.map((f) => ({
          buffer: f.buffer,
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size
        }))
      );
    }

    const { submitReturnReplacementRequest } = await import("./return-replacement.service");
    const { allowedResolutionsForReason } = await import("./return-replacement.constants");
    const created = await submitReturnReplacementRequest({
      orderNumber,
      userId: user.id,
      userEmail: user.email,
      message: body.message,
      items: items.map((item, index) => {
        const resolution = item.requestedResolution ?? "RETURN_FOR_REFUND";
        const allowed = allowedResolutionsForReason(item.reasonCode);
        if (!allowed.includes(resolution as (typeof allowed)[number])) {
          throw Object.assign(new Error("Invalid resolution for reason"), {
            statusCode: 400,
            code: "BAD_RESOLUTION"
          });
        }
        void index;
        return {
          orderItemId: item.orderItemId,
          reasonCode: item.reasonCode,
          qty: item.qty && item.qty > 0 ? Math.floor(item.qty) : 1,
          requestedResolution: resolution as import("@prisma/client").ReturnReplacementResolution,
          requestedVariantId: item.requestedVariantId,
          otherMessage: item.otherMessage,
          message: item.message
        };
      }),
      photosByIndex: photosByIndexMapped
    });
    res.status(201).json({ success: true, data: { request: created } });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function submitAdjustRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const { orderNumber } = req.params;
    const body = req.body as {
      reasonCode?: string;
      orderItemId?: string;
      message?: string;
      requestedAddress?: Record<string, string>;
      requestedVariantId?: string;
      requestedQty?: number;
    };
    const reasonCode = String(body.reasonCode ?? "").trim();
    if (!["change_address", "wrong_item", "change_quantity"].includes(reasonCode)) {
      res.status(400).json({ success: false, error: "Invalid adjustment reason", code: "BAD_REASON" });
      return;
    }
    const { submitAdjustmentRequest } = await import("./order-adjustment.service");
    const created = await submitAdjustmentRequest({
      orderNumber,
      userId: user.id,
      userEmail: user.email,
      reasonCode: reasonCode as "change_address" | "wrong_item" | "change_quantity",
      orderItemId: String(body.orderItemId ?? ""),
      message: body.message,
      requestedVariantId: body.requestedVariantId,
      requestedQty: body.requestedQty,
      requestedAddress: body.requestedAddress
        ? {
            fullName: String(body.requestedAddress.fullName ?? ""),
            phone: String(body.requestedAddress.phone ?? ""),
            line1: String(body.requestedAddress.line1 ?? ""),
            line2: body.requestedAddress.line2?.trim() || null,
            city: String(body.requestedAddress.city ?? ""),
            state: String(body.requestedAddress.state ?? ""),
            postalCode: String(body.requestedAddress.postalCode ?? ""),
            country: String(body.requestedAddress.country ?? "IN")
          }
        : undefined
    });
    res.status(201).json({ success: true, data: { request: created } });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function getAdjustmentOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const { orderNumber } = req.params;
    const orderItemId = String(req.query.orderItemId ?? "").trim();
    if (!orderItemId) {
      res.status(400).json({ success: false, error: "orderItemId is required", code: "BAD_QUERY" });
      return;
    }
    const { loadAdjustmentOptionsForOrderItem } = await import("./order-adjustment.service");
    const data = await loadAdjustmentOptionsForOrderItem({
      orderNumber,
      userId: user.id,
      userEmail: user.email,
      orderItemId
    });
    res.json({ success: true, data });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminAdjustmentPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const { requestId } = req.params;
    const { loadAdjustmentExecutionPreview } = await import("./order-adjustment.service");
    const preview = await loadAdjustmentExecutionPreview(requestId);
    if (!preview) {
      res.status(404).json({ success: false, error: "Not an adjustment request", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: preview });
  } catch (err) {
    next(err);
  }
}

export async function adminExecuteAdjustment(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const { adminNote } = req.body as { adminNote?: string };
    const { executeAdjustmentRequest } = await import("./order-adjustment.service");
    const result = await executeAdjustmentRequest({
      orderId,
      requestId,
      adminEmail: admin.email,
      adminUserId: admin.id,
      adminNote
    });
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminAdjustmentNeedsDiscussion(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const { adminNote } = req.body as { adminNote?: string };
    const { markAdjustmentNeedsDiscussion } = await import("./order-adjustment.service");
    await markAdjustmentNeedsDiscussion({
      orderId,
      requestId,
      adminEmail: admin.email,
      adminNote
    });
    res.json({ success: true });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function createSupplementaryPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const { orderNumber } = req.params;
    const { requestId } = req.body as { requestId: string };

    const { prisma } = await import("../../config/db");
    const order = await prisma.order.findFirst({
      where: { orderNumber, customerId: user.id }
    });
    if (!order) {
      res.status(404).json({ success: false, error: "Order not found", code: "NOT_FOUND" });
      return;
    }

    const { createSupplementaryPaymentSession } = await import("../payments/supplementary-payment.service");
    const session = await createSupplementaryPaymentSession({
      orderId: order.id,
      requestId
    });
    res.json({ success: true, data: session });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminConvertAdjustmentToCancellation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const { adminNote } = req.body as { adminNote?: string };
    const { convertAdjustmentToCancellation } = await import("./order-adjustment.service");
    await convertAdjustmentToCancellation({
      orderId,
      requestId,
      adminEmail: admin.email,
      adminNote
    });
    res.json({ success: true });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminPendingServiceRequestCount(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    void req;
    const count = await pendingServiceRequestCount();
    res.json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
}

export async function adminViewServiceRequestPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderId, photoId } = req.params;
    const asset = await getServiceRequestPhotoForAdmin(orderId, photoId);
    if (!asset) {
      res.status(404).json({ success: false, error: "Photo not found", code: "NOT_FOUND" });
      return;
    }
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(asset.buffer);
  } catch (err) {
    next(err);
  }
}

export async function adminDownloadServiceRequestPhoto(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { orderId, photoId } = req.params;
    const asset = await getServiceRequestPhotoForAdmin(orderId, photoId);
    if (!asset) {
      res.status(404).json({ success: false, error: "Photo not found", code: "NOT_FOUND" });
      return;
    }
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${asset.fileName.replace(/"/g, "")}"`);
    res.send(asset.buffer);
  } catch (err) {
    next(err);
  }
}

export async function adminApproveServiceRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const { adminNote } = req.body as { adminNote?: string };
    const updated = await reviewServiceRequest({
      orderId,
      requestId,
      approve: true,
      adminEmail: admin.email,
      adminNote
    });
    res.json({ success: true, data: { request: updated } });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminRejectServiceRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const { adminNote } = req.body as { adminNote?: string };
    const updated = await reviewServiceRequest({
      orderId,
      requestId,
      approve: false,
      adminEmail: admin.email,
      adminNote
    });
    res.json({ success: true, data: { request: updated } });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminProcessServiceRequestRefund(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const body = req.body as {
      items?: Array<{ requestItemId: string; amountInPaise: number }>;
      codRefundNote?: string;
    };

    const { prisma } = await import("../../config/db");
    const request = await prisma.orderServiceRequest.findFirst({
      where: { id: requestId, orderId },
      include: { items: true }
    });

    if (
      request?.type === "REFUND_AFTER_DELIVERY" &&
      request.items.some((i) => i.requestedResolution != null)
    ) {
      const { executeReturnReplacementRefund } = await import("./return-replacement.service");
      const result = await executeReturnReplacementRefund({
        requestId,
        adminEmail: admin.email,
        adminUserId: admin.id,
        codRefundNote: body.codRefundNote
      });
      res.json({ success: true, data: result });
      return;
    }

    const items = body.items ?? [];
    const result = await processServiceRequestRefund({
      orderId,
      requestId,
      adminEmail: admin.email,
      items,
      codRefundNote: body.codRefundNote
    });
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminGetReturnWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const { requestId } = req.params;
    const { loadCustomerReturnWorkflowState } = await import("./customer-return-workflow.service");
    const state = await loadCustomerReturnWorkflowState(requestId);
    if (!state) {
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: state });
  } catch (err) {
    next(err);
  }
}

export async function adminUpdateReturnShipment(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { requestId } = req.params;
    const body = req.body as {
      courier?: string;
      awb?: string;
      trackingUrl?: string;
      physicalStatus?: "AWAITING_RETURN" | "IN_TRANSIT";
    };
    const { upsertReturnShipmentTracking } = await import("./customer-return-workflow.service");
    await upsertReturnShipmentTracking({
      requestId,
      adminUserId: admin.id,
      ...body
    });
    res.json({ success: true });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminMarkReturnReceived(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { requestId } = req.params;
    const { markCustomerReturnReceived } = await import("./customer-return-workflow.service");
    const result = await markCustomerReturnReceived({ requestId, adminUserId: admin.id });
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminSetReturnDisposition(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { requestId } = req.params;
    const { disposition } = req.body as { disposition: "RESTOCKABLE" | "DAMAGED_NON_RESTOCKABLE" | "NEEDS_REVIEW" };
    const { setCustomerReturnDisposition } = await import("./customer-return-workflow.service");
    const result = await setCustomerReturnDisposition({
      requestId,
      disposition,
      adminUserId: admin.id
    });
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminMarkReplacementShipped(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { fulfillmentId } = req.params;
    const body = req.body as { awb?: string; courier?: string; trackingUrl?: string };
    const { markReplacementShipped } = await import("./replacement-workflow.service");
    await markReplacementShipped({ fulfillmentId, adminUserId: admin.id, ...body });
    res.json({ success: true });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function getReturnReplacementOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const reasonCode = String(req.query.reasonCode ?? "").trim();
    const { getReturnReplacementOptions } = await import("./return-replacement.service");
    res.json({ success: true, data: getReturnReplacementOptions(reasonCode) });
  } catch (err) {
    next(err);
  }
}
