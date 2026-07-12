import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { requireAdmin } from "../../middleware/admin";
import { requireAuth } from "../../middleware/auth";
import {
  isValidCancelReason,
  isValidRefundReason,
  pendingServiceRequestCount,
  reviewServiceRequest,
  submitServiceRequest
} from "./order-service-request.service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  }
});

export const serviceRequestUpload = upload.array("photos", 8);

export async function submitCancelRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const { orderNumber } = req.params;
    const body = req.body as {
      reasonCode?: string;
      otherMessage?: string;
      message?: string;
    };
    const reasonCode = String(body.reasonCode ?? "").trim();
    if (!isValidCancelReason(reasonCode)) {
      res.status(400).json({ success: false, error: "Invalid cancellation reason", code: "BAD_REQUEST" });
      return;
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const created = await submitServiceRequest({
      orderNumber,
      userId: user.id,
      userEmail: user.email,
      type: "CANCEL_BEFORE_DELIVERY",
      reasonCode,
      otherMessage: body.otherMessage,
      message: body.message,
      photos: files.map((f) => ({
        buffer: f.buffer,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size
      }))
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

export async function submitRefundRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.authUser!;
    const { orderNumber } = req.params;
    const body = req.body as {
      reasonCode?: string;
      otherMessage?: string;
      message?: string;
    };
    const reasonCode = String(body.reasonCode ?? "").trim();
    if (!isValidRefundReason(reasonCode)) {
      res.status(400).json({ success: false, error: "Invalid refund reason", code: "BAD_REQUEST" });
      return;
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const created = await submitServiceRequest({
      orderNumber,
      userId: user.id,
      userEmail: user.email,
      type: "REFUND_AFTER_DELIVERY",
      reasonCode,
      otherMessage: body.otherMessage,
      message: body.message,
      photos: files.map((f) => ({
        buffer: f.buffer,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size
      }))
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

export const serviceRequestAuth = requireAuth;
export const serviceRequestAdmin = requireAdmin;
