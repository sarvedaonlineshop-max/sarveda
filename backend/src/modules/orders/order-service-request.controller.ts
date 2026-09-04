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
  limits: { fileSize: 80 * 1024 * 1024, files: 48 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || "").toLowerCase();
    if (mime.startsWith("image/") || mime.startsWith("video/mp4") || mime === "video/quicktime" || mime === "video/webm") {
      cb(null, true);
      return;
    }
    cb(new Error("Only image or allowed video files are permitted"));
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

export async function adminReviewReturnCaseLine(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId, itemId } = req.params;
    const body = req.body as {
      decision?: "APPROVED" | "REJECTED" | "MORE_INFO_REQUIRED";
      customerFacingNote?: string;
      internalNote?: string;
      moreInfoPrompt?: string;
    };
    if (!body.decision || !["APPROVED", "REJECTED", "MORE_INFO_REQUIRED"].includes(body.decision)) {
      res.status(400).json({
        success: false,
        error: "decision must be APPROVED, REJECTED, or MORE_INFO_REQUIRED",
        code: "BAD_DECISION"
      });
      return;
    }
    const { reviewReturnCaseLine } = await import("./return-line-review.service");
    await reviewReturnCaseLine({
      orderId,
      requestId,
      itemId,
      decision: body.decision,
      customerFacingNote: body.customerFacingNote,
      internalNote: body.internalNote,
      moreInfoPrompt: body.moreInfoPrompt,
      adminEmail: admin.email,
      adminUserId: admin.id
    });
    const { prisma } = await import("../../config/db");
    const request = await prisma.orderServiceRequest.findFirst({
      where: { id: requestId, orderId },
      include: { items: { include: { photos: true } }, returnShipment: true, photos: true }
    });
    res.json({ success: true, data: { request } });
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

    if (request?.type === "REFUND_AFTER_DELIVERY") {
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

export async function adminPreviewReturnRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderId, requestId } = req.params;
    const { prisma } = await import("../../config/db");
    const request = await prisma.orderServiceRequest.findFirst({
      where: { id: requestId, orderId, type: "REFUND_AFTER_DELIVERY" },
      select: { id: true }
    });
    if (!request) {
      res.status(404).json({ success: false, error: "Return case not found", code: "NOT_FOUND" });
      return;
    }
    const { previewReturnReplacementRefund } = await import("./return-replacement.service");
    const data = await previewReturnReplacementRefund(requestId);
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

export async function adminRecordReturnReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { requestId } = req.params;
    const body = req.body as {
      lines: Array<{ orderItemId: string; qtyReceived: number; note?: string }>;
    };
    const { recordReturnReceipt } = await import("./return-qc.service");
    await recordReturnReceipt({
      requestId,
      adminUserId: admin.id,
      lines: body.lines ?? []
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

export async function adminPerformReturnQc(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { requestId } = req.params;
    const body = req.body as { lines: import("./return-qc.service").ReturnQcLineInput[] };
    const { performReturnQc } = await import("./return-qc.service");
    const result = await performReturnQc({
      requestId,
      adminUserId: admin.id,
      adminEmail: admin.email,
      lines: body.lines ?? []
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

export async function adminReleaseRepack(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { requestId, qcLineId } = req.params;
    const { releaseRepackToSellable } = await import("./return-qc.service");
    await releaseRepackToSellable({
      requestId,
      qcLineId,
      adminUserId: admin.id
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

export async function adminGetReturnEconomics(req: Request, res: Response, next: NextFunction) {
  try {
    const { requestId } = req.params;
    const { getReturnCaseEconomicsView } = await import("./return-economics.service");
    const data = await getReturnCaseEconomicsView(requestId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function adminUpsertReturnEconomics(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { requestId } = req.params;
    const { upsertReturnCaseEconomics } = await import("./return-economics.service");
    const row = await upsertReturnCaseEconomics({
      requestId,
      data: req.body,
      adminUserId: admin.id,
      adminEmail: admin.email
    });
    res.json({ success: true, data: row });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminOpenCourierClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { requestId } = req.params;
    const { openCourierClaim } = await import("./return-economics.service");
    const claim = await openCourierClaim({
      requestId,
      ...(req.body as {
        reason: string;
        claimedAmountPaise: number;
        courierName?: string;
        reference?: string;
        notes?: string;
      }),
      adminUserId: admin.id,
      adminEmail: admin.email
    });
    res.status(201).json({ success: true, data: claim });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminUpdateCourierClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { claimId } = req.params;
    const { updateCourierClaim } = await import("./return-economics.service");
    const claim = await updateCourierClaim({
      claimId,
      ...(req.body as {
        status?: import("@prisma/client").ReturnClaimStatus;
        recoveredAmountPaise?: number;
        reference?: string;
        notes?: string;
      }),
      adminUserId: admin.id,
      adminEmail: admin.email
    });
    res.json({ success: true, data: claim });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminOpenVendorClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { requestId } = req.params;
    const { openVendorClaim } = await import("./return-economics.service");
    const claim = await openVendorClaim({
      requestId,
      ...(req.body as {
        reason: string;
        claimedAmountPaise: number;
        vendorId?: string;
        vendorNameSnapshot?: string;
        reference?: string;
        notes?: string;
      }),
      adminUserId: admin.id,
      adminEmail: admin.email
    });
    res.status(201).json({ success: true, data: claim });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, error: e.message, code: e.code ?? "ERROR" });
      return;
    }
    next(err);
  }
}

export async function adminUpdateVendorClaim(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { claimId } = req.params;
    const { updateVendorClaim } = await import("./return-economics.service");
    const claim = await updateVendorClaim({
      claimId,
      ...(req.body as {
        status?: import("@prisma/client").ReturnClaimStatus;
        recoveredAmountPaise?: number;
        reference?: string;
        notes?: string;
      }),
      adminUserId: admin.id,
      adminEmail: admin.email
    });
    res.json({ success: true, data: claim });
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

export async function adminMarkReplacementDelivered(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { fulfillmentId } = req.params;
    const { markReplacementDelivered } = await import("./replacement-workflow.service");
    await markReplacementDelivered({ fulfillmentId, adminUserId: admin.id });
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

export async function adminListReturnCases(req: Request, res: Response, next: NextFunction) {
  try {
    const { listReturnCases } = await import("./return-case.service");
    const data = await listReturnCases({
      status: req.query.status ? (String(req.query.status) as never) : undefined,
      stage: req.query.stage ? (String(req.query.stage) as never) : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      channel: req.query.channel ? (String(req.query.channel) as never) : undefined,
      rootCause: req.query.rootCause ? (String(req.query.rootCause) as never) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 25
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function adminGetReturnCaseByNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const caseNumber = String(req.params.caseNumber ?? "").trim();
    if (!caseNumber) {
      res.status(400).json({ success: false, error: "Case number required", code: "BAD_REQUEST" });
      return;
    }
    const { getAdminReturnCaseByCaseNumber } = await import("./return-case.service");
    const data = await getAdminReturnCaseByCaseNumber(caseNumber);
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

export async function adminSetReturnRefundOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const body = req.body as { overrideRefundPaise?: number; reason?: string };
    const { prisma } = await import("../../config/db");
    const request = await prisma.orderServiceRequest.findFirst({
      where: { id: requestId, orderId, type: "REFUND_AFTER_DELIVERY" },
      select: { id: true }
    });
    if (!request) {
      res.status(404).json({ success: false, error: "Return case not found", code: "NOT_FOUND" });
      return;
    }
    const { setReturnRefundOverride } = await import("./return-replacement.service");
    const data = await setReturnRefundOverride({
      requestId,
      overrideRefundPaise: Number(body.overrideRefundPaise),
      reason: body.reason ?? "",
      adminEmail: admin.email,
      adminUserId: admin.id,
      adminRole: admin.role
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

export async function adminClearReturnRefundOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const { prisma } = await import("../../config/db");
    const request = await prisma.orderServiceRequest.findFirst({
      where: { id: requestId, orderId, type: "REFUND_AFTER_DELIVERY" },
      select: { id: true }
    });
    if (!request) {
      res.status(404).json({ success: false, error: "Return case not found", code: "NOT_FOUND" });
      return;
    }
    const { clearReturnRefundOverride } = await import("./return-replacement.service");
    const data = await clearReturnRefundOverride({
      requestId,
      adminEmail: admin.email,
      adminUserId: admin.id
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

export async function adminSetReturnCaseRootCause(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const body = req.body as {
      rootCause: import("@prisma/client").ReturnRootCause;
      rootCauseNote?: string;
      responsibleTeam?: import("@prisma/client").ReturnResponsibleTeam;
      responsibleUserEmail?: string;
      secondaryReasonCode?: string;
      secondaryReasonLabel?: string;
    };
    const { setReturnCaseRootCause } = await import("./return-case.service");
    await setReturnCaseRootCause({
      orderId,
      requestId,
      rootCause: body.rootCause,
      rootCauseNote: body.rootCauseNote,
      responsibleTeam: body.responsibleTeam,
      responsibleUserEmail: body.responsibleUserEmail,
      secondaryReasonCode: body.secondaryReasonCode,
      secondaryReasonLabel: body.secondaryReasonLabel,
      adminEmail: admin.email,
      adminUserId: admin.id
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

export async function adminRequestMoreInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const { prompt } = req.body as { prompt?: string };
    const { requestMoreInfo } = await import("./return-case.service");
    await requestMoreInfo({
      orderId,
      requestId,
      prompt: prompt ?? "",
      adminEmail: admin.email,
      adminUserId: admin.id
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

export async function adminMarkMissingPartShipped(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = req.authUser!;
    const { orderId, requestId } = req.params;
    const body = req.body as { accessoryDescription?: string; courier?: string; awb?: string };
    const { markMissingPartShipped } = await import("./return-case.service");
    await markMissingPartShipped({
      orderId,
      requestId,
      accessoryDescription: body.accessoryDescription ?? "",
      courier: body.courier,
      awb: body.awb,
      adminEmail: admin.email,
      adminUserId: admin.id
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

export async function adminListCaseEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const { requestId } = req.params;
    const { listCaseEvents } = await import("./return-case-events.service");
    const events = await listCaseEvents(requestId);
    res.json({ success: true, data: { events } });
  } catch (err) {
    next(err);
  }
}

export async function customerGetReturnCase(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const { orderNumber, requestId } = req.params;
    const { getCustomerReturnCase } = await import("./return-case.service");
    const data = await getCustomerReturnCase({
      orderNumber,
      requestId,
      userId: user.id,
      userEmail: user.email
    });
    if (!data) {
      res.status(404).json({ success: false, error: "Case not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function customerProvideMoreInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const { orderNumber, requestId } = req.params;
    const body = req.body as { response?: string };
    const photosByIndex = mapUploadedFiles(req);
    const photos = [...photosByIndex.values()].flat().map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
      mimetype: f.mimetype,
      size: f.size
    }));
    const { provideMoreInfo } = await import("./return-case.service");
    await provideMoreInfo({
      orderNumber,
      requestId,
      userId: user.id,
      userEmail: user.email,
      response: body.response ?? "",
      photos
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

export async function customerSubmitSelfShip(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const { orderNumber, requestId } = req.params;
    const body = req.body as { courier?: string; awb?: string; trackingUrl?: string; shippedAt?: string };
    const { submitCustomerSelfShip } = await import("./return-case.service");
    await submitCustomerSelfShip({
      orderNumber,
      requestId,
      userId: user.id,
      userEmail: user.email,
      courier: body.courier ?? "",
      awb: body.awb ?? "",
      trackingUrl: body.trackingUrl,
      shippedAt: body.shippedAt ? new Date(body.shippedAt) : undefined
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

export async function getReturnReplacementOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const reasonCode = String(req.query.reasonCode ?? "").trim();
    const { getReturnReplacementOptions } = await import("./return-replacement.service");
    res.json({ success: true, data: getReturnReplacementOptions(reasonCode) });
  } catch (err) {
    next(err);
  }
}
