import { Router } from "express";
import multer from "multer";
import type { Request, Response } from "express";
import { z } from "zod";

import { prisma } from "../../config/db";
import { requireAdmin } from "../../middleware/admin";
import { validateBody } from "../../middleware/validate";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "./enquiries.constants";
import {
  getEnquiryThread,
  getEnquiryUnreadCount,
  listEnquiryThreads,
  patchEnquiryThreadStatus,
  replyToEnquiryThread,
  type EnquiryAttachmentInput
} from "./enquiries.service";

const router = Router();
router.use(requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS }
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

router.get("/unread-count", async (_req, res, next) => {
  try {
    const count = await getEnquiryUnreadCount();
    res.json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const unreadOnly = req.query.unreadOnly === "true";
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    const data = await listEnquiryThreads({
      page,
      limit,
      unreadOnly,
      source: source as Parameters<typeof listEnquiryThreads>[0]["source"]
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const thread = await getEnquiryThread(req.params.id);
    if (!thread) {
      res.status(404).json({ success: false, error: "Thread not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: thread });
  } catch (err) {
    next(err);
  }
});

const replySchema = z.object({
  message: z.string().min(1).max(8000)
});

router.post(
  "/:id/reply",
  upload.array("attachments", MAX_ATTACHMENTS),
  async (req, res, next) => {
    try {
      const parsed = replySchema.safeParse(
        typeof req.body.message === "string" ? { message: req.body.message } : req.body
      );
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid reply",
          code: "VALIDATION_ERROR"
        });
        return;
      }
      const adminUser = await prisma.user.findUnique({
        where: { id: req.authUser!.id },
        select: { id: true, email: true, name: true }
      });
      if (!adminUser) {
        res.status(401).json({ success: false, error: "Not authenticated", code: "UNAUTHORIZED" });
        return;
      }
      const message = await replyToEnquiryThread(
        req.params.id,
        adminUser,
        parsed.data.message,
        filesFromRequest(req)
      );
      if (!message) {
        res.status(404).json({ success: false, error: "Thread not found", code: "NOT_FOUND" });
        return;
      }
      res.json({ success: true, data: message });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/:id/status",
  validateBody(z.object({ status: z.enum(["OPEN", "CLOSED"]) })),
  async (req, res, next) => {
    try {
      const thread = await patchEnquiryThreadStatus(req.params.id, req.body.status);
      res.json({ success: true, data: thread });
    } catch (err) {
      next(err);
    }
  }
);

export const enquiriesAdminRoutes = router;
