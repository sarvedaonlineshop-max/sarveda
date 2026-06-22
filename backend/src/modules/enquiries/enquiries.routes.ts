import { Router } from "express";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { optionalAuth } from "../../middleware/auth";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "./enquiries.constants";
import { createEnquiryThread, type EnquiryAttachmentInput } from "./enquiries.service";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS }
});

const enquiryBodySchema = z.object({
  source: z.enum(["CONTACT", "CORPORATE", "COURSE", "EVENT", "INSIGHTS"]),
  subjectCategory: z.enum(["ORDER", "PAYMENT", "COURSE", "CORPORATE", "OTHER"]).optional(),
  customSubject: z.string().max(200).optional(),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  message: z.string().min(1).max(5000),
  orderNumber: z.string().max(40).optional(),
  contextTitle: z.string().max(500).optional(),
  contextUrl: z.string().url().max(2000).optional()
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
      attachments: filesFromRequest(req)
    });
    res.json({
      success: true,
      data: {
        id: thread.id,
        message: "Thank you — we received your message and will reply within 1–2 business days."
      }
    });
  } catch (err) {
    next(err);
  }
}

router.post("/", optionalAuth, upload.array("attachments", MAX_ATTACHMENTS), handleCreate);

export const enquiriesRoutes = router;
