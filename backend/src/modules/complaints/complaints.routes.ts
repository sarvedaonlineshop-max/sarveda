import type { ComplaintPriority, ComplaintStatus } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";
import { uploadComplaintMedia, getSignedComplaintMediaUrl } from "../../config/s3-complaints";
import { requireAdmin } from "../../middleware/admin";
import { verifyAccessToken } from "../../utils/jwt";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const PRIORITIES = new Set<ComplaintPriority>(["LOW", "MEDIUM", "HIGH"]);
const STATUSES = new Set<ComplaintStatus>(["OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED"]);

function mediaType(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "audio";
}

async function verifyComplaintAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!raw) {
      res.status(401).json({ success: false, error: "No token", code: "UNAUTHORIZED" });
      return;
    }
    const payload = verifyAccessToken(raw);
    const email = payload.email.toLowerCase();
    const whitelisted = await prisma.complaintWhitelist.findFirst({
      where: { email, isActive: true }
    });
    if (!whitelisted) {
      res.status(403).json({
        success: false,
        error: "Your email is not authorized to use this app. Contact admin.",
        code: "FORBIDDEN"
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, phone: true }
    });

    req.complaintUser = {
      id: payload.sub,
      email,
      name: user?.name ?? whitelisted.name ?? undefined,
      phone: user?.phone ?? null
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: "Authentication failed", code: "UNAUTHORIZED" });
  }
}

async function signAttachmentUrls<T extends { s3Key: string; s3Url: string }>(rows: T[]): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      s3Url: await getSignedComplaintMediaUrl(row.s3Key)
    }))
  );
}

type ComplaintWithMedia = {
  attachments: Array<{ s3Key: string; s3Url: string }>;
  events: Array<{
    attachments: Array<{ s3Key: string; s3Url: string }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

async function complaintWithSignedMedia<T extends ComplaintWithMedia>(complaint: T): Promise<T> {
  return {
    ...complaint,
    attachments: await signAttachmentUrls(complaint.attachments),
    events: await Promise.all(
      complaint.events.map(async (event) => ({
        ...event,
        attachments: await signAttachmentUrls(event.attachments)
      }))
    )
  };
}

async function phoneForEmail(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { phone: true }
  });
  return user?.phone ?? null;
}

async function enrichComplaintList<
  T extends {
    raisedByEmail: string;
    raisedByName: string | null;
    children?: Array<{ id: string }>;
    _count?: { children: number };
  }
>(rows: T[]) {
  const emails = [...new Set(rows.map((r) => r.raisedByEmail.toLowerCase()))];
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true, phone: true }
  });
  const phoneMap = new Map(users.map((u) => [u.email.toLowerCase(), u.phone]));
  return rows.map((row) => ({
    ...row,
    raisedByPhone: phoneMap.get(row.raisedByEmail.toLowerCase()) ?? null,
    childCount: row._count?.children ?? row.children?.length ?? 0
  }));
}

// ─── ADMIN ROUTES (before /:id) ─────────────────────────────────────────────

router.get("/admin/all", requireAdmin, async (req, res, next) => {
  try {
    const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
    const priorityRaw = typeof req.query.priority === "string" ? req.query.priority : undefined;
    const status =
      statusRaw && STATUSES.has(statusRaw as ComplaintStatus) ? (statusRaw as ComplaintStatus) : undefined;
    const priority =
      priorityRaw && PRIORITIES.has(priorityRaw as ComplaintPriority)
        ? (priorityRaw as ComplaintPriority)
        : undefined;

    const complaints = await prisma.complaint.findMany({
      where: { status, priority },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { attachments: true }
    });
    res.json({ success: true, complaints });
  } catch (err) {
    next(err);
  }
});

router.get("/admin/whitelist", requireAdmin, async (_req, res, next) => {
  try {
    const list = await prisma.complaintWhitelist.findMany({
      orderBy: { addedAt: "desc" }
    });
    res.json({ success: true, whitelist: list });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/whitelist", requireAdmin, async (req, res, next) => {
  try {
    const { email, name } = req.body as { email?: string; name?: string };
    if (!email?.trim()) {
      res.status(400).json({ success: false, error: "Email is required", code: "BAD_REQUEST" });
      return;
    }
    const entry = await prisma.complaintWhitelist.create({
      data: { email: email.toLowerCase().trim(), name: name?.trim() || null }
    });
    res.status(201).json({ success: true, entry });
  } catch (err) {
    next(err);
  }
});

router.delete("/admin/whitelist/:id", requireAdmin, async (req, res, next) => {
  try {
    await prisma.complaintWhitelist.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/admin/:id", requireAdmin, async (req, res, next) => {
  try {
    const complaint = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        attachments: true,
        events: {
          orderBy: { createdAt: "asc" },
          include: { attachments: true }
        }
      }
    });
    if (!complaint) {
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, complaint: await complaintWithSignedMedia(complaint) });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/:id/reply", requireAdmin, async (req, res, next) => {
  try {
    const { message, newStatus } = req.body as { message?: string; newStatus?: string };
    const adminEmail = req.authUser?.email ?? "admin";

    if (message?.trim()) {
      await prisma.complaintEvent.create({
        data: {
          complaintId: req.params.id,
          type: "COMMENT",
          authorEmail: adminEmail,
          authorType: "ADMIN",
          message: message.trim()
        }
      });
    }

    if (newStatus && STATUSES.has(newStatus as ComplaintStatus)) {
      const status = newStatus as ComplaintStatus;
      await prisma.complaintEvent.create({
        data: {
          complaintId: req.params.id,
          type: "STATUS_CHANGE",
          authorEmail: adminEmail,
          authorType: "ADMIN",
          message: `Status changed to ${status}`
        }
      });
      await prisma.complaint.update({
        where: { id: req.params.id },
        data: {
          status,
          resolvedAt: status === "RESOLVED" ? new Date() : null
        }
      });
    }

    const updated = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        attachments: true,
        events: { orderBy: { createdAt: "asc" }, include: { attachments: true } }
      }
    });
    if (!updated) {
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, complaint: await complaintWithSignedMedia(updated) });
  } catch (err) {
    next(err);
  }
});

// ─── MEMBER ROUTES (Google ID token + whitelist) ────────────────────────────

router.post("/", verifyComplaintAuth, upload.array("files", 5), async (req, res, next) => {
  try {
    const { title, description, priority: priorityRaw, parentId } = req.body as {
      title?: string;
      description?: string;
      priority?: string;
      parentId?: string;
    };
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (!title?.trim()) {
      res.status(400).json({ success: false, error: "Title is required", code: "BAD_REQUEST" });
      return;
    }

    const priority =
      priorityRaw && PRIORITIES.has(priorityRaw as ComplaintPriority)
        ? (priorityRaw as ComplaintPriority)
        : "MEDIUM";

    if (parentId) {
      const parent = await prisma.complaint.findUnique({
        where: { id: parentId },
        select: { id: true }
      });
      if (!parent) {
        res.status(404).json({ success: false, error: "Parent task not found", code: "NOT_FOUND" });
        return;
      }
    }

    const complaint = await prisma.complaint.create({
      data: {
        parentId: parentId ?? null,
        raisedByEmail: req.complaintUser!.email,
        raisedByName: req.complaintUser!.name ?? null,
        title: title.trim(),
        description: description?.trim() ?? null,
        priority,
        status: "OPEN"
      }
    });

    const attachmentRecords = [];
    for (const file of files) {
      const { s3Key, s3Url } = await uploadComplaintMedia(
        file.buffer,
        file.mimetype,
        file.originalname
      );
      const attachment = await prisma.complaintAttachment.create({
        data: {
          complaintId: complaint.id,
          type: mediaType(file.mimetype),
          s3Key,
          s3Url,
          fileName: file.originalname,
          fileSizeBytes: file.size
        }
      });
      attachmentRecords.push(attachment);
    }

    await prisma.complaintEvent.create({
      data: {
        complaintId: complaint.id,
        type: "CREATED",
        authorEmail: req.complaintUser!.email,
        authorType: "MEMBER",
        message: description?.trim() ?? null
      }
    });

    res.status(201).json({
      success: true,
      complaint: { ...complaint, attachments: attachmentRecords }
    });
  } catch (err) {
    next(err);
  }
});

function statusFilterFromTab(tab: string | undefined): ComplaintStatus[] | undefined {
  if (tab === "open") return ["OPEN", "REOPENED"];
  if (tab === "in_progress") return ["IN_PROGRESS"];
  if (tab === "closed") return ["RESOLVED"];
  return undefined;
}

router.get("/all", verifyComplaintAuth, async (req, res, next) => {
  try {
    const tab = typeof req.query.tab === "string" ? req.query.tab : undefined;
    const statuses = statusFilterFromTab(tab);
    const complaints = await prisma.complaint.findMany({
      where: {
        parentId: null,
        ...(statuses ? { status: { in: statuses } } : {})
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: {
        attachments: true,
        _count: { select: { children: true } }
      }
    });
    res.json({ success: true, complaints: await enrichComplaintList(complaints) });
  } catch (err) {
    next(err);
  }
});

router.get("/my", verifyComplaintAuth, async (req, res, next) => {
  try {
    const tab = typeof req.query.tab === "string" ? req.query.tab : undefined;
    const statuses = statusFilterFromTab(tab);
    const complaints = await prisma.complaint.findMany({
      where: {
        raisedByEmail: req.complaintUser!.email,
        parentId: null,
        ...(statuses ? { status: { in: statuses } } : {})
      },
      orderBy: { createdAt: "desc" },
      include: {
        attachments: true,
        _count: { select: { children: true } }
      }
    });
    res.json({ success: true, complaints: await enrichComplaintList(complaints) });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", verifyComplaintAuth, async (req, res, next) => {
  try {
    const complaint = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        attachments: true,
        children: {
          orderBy: { createdAt: "asc" },
          include: { attachments: true }
        },
        events: {
          orderBy: { createdAt: "asc" },
          include: { attachments: true }
        }
      }
    });
    if (!complaint) {
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }
    const raisedByPhone = await phoneForEmail(complaint.raisedByEmail);
    const children = await enrichComplaintList(complaint.children);
    const signed = await complaintWithSignedMedia(complaint);
    res.json({
      success: true,
      complaint: { ...signed, raisedByPhone, children }
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/comment", verifyComplaintAuth, upload.array("files", 5), async (req, res, next) => {
  try {
    const { message } = req.body as { message?: string };
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const existing = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });
    if (!existing) {
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }

    const event = await prisma.complaintEvent.create({
      data: {
        complaintId: req.params.id,
        type: "COMMENT",
        authorEmail: req.complaintUser!.email,
        authorType: "MEMBER",
        message: message?.trim() ?? null
      }
    });

    for (const file of files) {
      const { s3Key, s3Url } = await uploadComplaintMedia(
        file.buffer,
        file.mimetype,
        file.originalname
      );
      await prisma.complaintAttachment.create({
        data: {
          eventId: event.id,
          type: mediaType(file.mimetype),
          s3Key,
          s3Url,
          fileName: file.originalname,
          fileSizeBytes: file.size
        }
      });
    }

    res.json({ success: true, event });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reopen", verifyComplaintAuth, async (req, res, next) => {
  try {
    const { reason } = req.body as { reason?: string };
    const existing = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });
    if (!existing) {
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }

    const complaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data: { status: "REOPENED", resolvedAt: null }
    });
    await prisma.complaintEvent.create({
      data: {
        complaintId: req.params.id,
        type: "REOPENED",
        authorEmail: req.complaintUser!.email,
        authorType: "MEMBER",
        message: reason?.trim() ?? "Reopened by member"
      }
    });
    res.json({ success: true, complaint });
  } catch (err) {
    next(err);
  }
});

export { router as complaintsRoutes };
