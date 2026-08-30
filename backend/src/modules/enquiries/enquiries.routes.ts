import { Router } from "express";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { optionalAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB } from "./enquiries.constants";
import {
  createEnquiryThread,
  presignEnquiryUploads,
  type EnquiryAttachmentInput
} from "./enquiries.service";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS }
});

const enquiryBodySchema = z.object({
  source: z.enum(["CONTACT", "CORPORATE", "COURSE", "EVENT", "INSIGHTS"]),
  subjectCategory: z.enum(["ORDER", "PAYMENT", "PRODUCT", "COURSE", "CORPORATE", "OTHER"]).optional(),
  customSubject: z.string().max(200).optional(),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  message: z.string().min(1).max(5000),
  orderNumber: z.string().max(40).optional(),
  contextTitle: z.string().max(500).optional(),
  contextUrl: z.string().url().max(2000).optional(),
  attachmentRefs: z
    .array(
      z.object({
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(120),
        fileSizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
        s3Key: z.string().min(8).max(500),
        s3Url: z.string().url().max(2000)
      })
    )
    .max(MAX_ATTACHMENTS)
    .optional()
});

const presignSchema = z.object({
  files: z
    .array(
      z.object({
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(120),
        sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES)
      })
    )
    .min(1)
    .max(MAX_ATTACHMENTS)
});

function filesFromRequest(req: Request): EnquiryAttachmentInput[] {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  return files.map((f) => ({
    buffer: f.buffer,
    mimeType: f.mimetype,
    fileName: f.originalname,
    sizeBytes: f.size
  }));
}

function multerErrorResponse(err: unknown, res: Response): boolean {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        success: false,
        error: `Each file must be ${MAX_ATTACHMENT_MB} MB or smaller.`,
        code: "FILE_TOO_LARGE"
      });
      return true;
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({
        success: false,
        error: `Maximum ${MAX_ATTACHMENTS} files allowed.`,
        code: "TOO_MANY_FILES"
      });
      return true;
    }
    res.status(400).json({
      success: false,
      error: err.message || "Upload failed",
      code: err.code
    });
    return true;
  }
  return false;
}

async function handleCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const raw =
      typeof req.body.data === "string"
        ? (JSON.parse(req.body.data) as Record<string, unknown>)
        : req.body;
    const parsed = enquiryBodySchema.safeParse(raw);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid enquiry",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const data = parsed.data;
    const thread = await createEnquiryThread({
      source: data.source,
      subjectCategory: data.subjectCategory ?? null,
      customSubject: data.customSubject ?? null,
      customerName: data.name,
      customerEmail: data.email,
      customerPhone: data.phone ?? null,
      message: data.message,
      orderNumber: data.orderNumber ?? null,
      contextTitle: data.contextTitle ?? null,
      contextUrl: data.contextUrl ?? null,
      userId: req.authUser?.id ?? null,
      attachments: filesFromRequest(req),
      preUploadedAttachments: data.attachmentRefs?.map((a) => ({
        fileName: a.fileName,
        mimeType: a.mimeType,
        fileSizeBytes: a.fileSizeBytes,
        s3Key: a.s3Key,
        s3Url: a.s3Url
      }))
    });
    res.json({
      success: true,
      data: {
        id: thread.id,
        message: "Thank you — we received your message and will reply shortly."
      }
    });
  } catch (err) {
    next(err);
  }
}

router.post(
  "/presign",
  optionalAuth,
  validateBody(presignSchema),
  async (req, res, next) => {
    try {
      const data = await presignEnquiryUploads(req.body.files);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/",
  optionalAuth,
  (req, res, next) => {
    const contentType = req.headers["content-type"] ?? "";
    if (contentType.includes("multipart/form-data")) {
      upload.array("attachments", MAX_ATTACHMENTS)(req, res, (err) => {
        if (err) {
          if (multerErrorResponse(err, res)) return;
          next(err);
          return;
        }
        void handleCreate(req, res, next);
      });
      return;
    }
    void handleCreate(req, res, next);
  }
);

export const enquiriesRoutes = router;
