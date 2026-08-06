import { Router } from "express";
import multer from "multer";
import type { Request, Response } from "express";
import { z } from "zod";

import { prisma } from "../../config/db";
import { requireAdmin } from "../../middleware/admin";
import { validateBody } from "../../middleware/validate";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "./enquiries.constants";
import { getWhatsAppAgentSessionStats } from "../whatsapp/whatsapp-agent-session.service";
import {
  setAdminTyping,
  subscribeToEnquiryEvents
} from "./enquiry-realtime";
import {
  getEnquiryThread,
  getEnquiryUnreadCount,
  listEnquiryThreads,
  patchEnquiryThreadStatus,
  replyToEnquiryThread,
  startWhatsAppChatByPhone,
  type EnquiryAttachmentInput
} from "./enquiries.service";

const router = Router();
router.use(requireAdmin);
let activeSseConnections = 0;
const MAX_SSE_CONNECTIONS = 100;

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

router.get("/whatsapp-agent-stats", async (_req, res, next) => {
  try {
    const data = await getWhatsAppAgentSessionStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const startWhatsAppChatSchema = z.object({
  countryDialCode: z
    .string()
    .trim()
    .min(1)
    .max(5)
    .regex(/^\+?\d{1,4}$/, "Invalid country code"),
  phone: z.string().trim().min(4).max(20),
  customerName: z.string().trim().max(120).optional().nullable(),
  message: z.string().trim().max(4096).optional().nullable()
});

router.post(
  "/whatsapp/start",
  validateBody(startWhatsAppChatSchema),
  async (req, res, next) => {
    try {
      const adminUser = await prisma.user.findUnique({
        where: { id: req.authUser!.id },
        select: { id: true, email: true, name: true }
      });
      if (!adminUser) {
        res.status(401).json({ success: false, error: "Not authenticated", code: "UNAUTHORIZED" });
        return;
      }
      const data = await startWhatsAppChatByPhone({
        countryDialCode: req.body.countryDialCode,
        phone: req.body.phone,
        customerName: req.body.customerName,
        message: req.body.message,
        admin: adminUser
      });
      res.json({ success: true, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("valid mobile") ||
        message.includes("24-hour") ||
        message.includes("Attachments are not supported")
      ) {
        res.status(400).json({ success: false, error: message, code: "VALIDATION_ERROR" });
        return;
      }
      next(err);
    }
  }
);

router.get("/stream", (req, res) => {
  const parsed = z.string().uuid().safeParse(req.query.threadId);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Valid threadId is required",
      code: "VALIDATION_ERROR"
    });
    return;
  }
  if (activeSseConnections >= MAX_SSE_CONNECTIONS) {
    res.status(503).json({
      success: false,
      error: "Too many live chat connections",
      code: "CONNECTION_LIMIT"
    });
    return;
  }

  const threadId = parsed.data;
  activeSseConnections += 1;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ threadId })}\n\n`);

  const unsubscribe = subscribeToEnquiryEvents((event) => {
    if (event.threadId !== threadId) return;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20_000);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    unsubscribe();
    activeSseConnections = Math.max(0, activeSseConnections - 1);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
});

router.post(
  "/:id/typing",
  validateBody(z.object({ typing: z.boolean() })),
  (req, res) => {
    const adminName =
      req.authUser!.name?.trim() || req.authUser!.email.split("@")[0] || "Admin";
    setAdminTyping({
      threadId: req.params.id,
      adminId: req.authUser!.id,
      adminName,
      typing: req.body.typing
    });
    res.json({ success: true, data: { typing: req.body.typing } });
  }
);

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
