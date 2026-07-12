import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import {
  getServiceRequestPhotoForAdmin,
  isValidCancelReason,
  isValidRefundReason,
  pendingServiceRequestCount,
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

function parseItemsPayload(raw: unknown, type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY") {
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
      message: entry.message != null ? String(entry.message) : undefined
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
  return handleSubmit(req, res, next, "REFUND_AFTER_DELIVERY");
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
