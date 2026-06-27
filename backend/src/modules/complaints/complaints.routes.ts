import type { ComplaintPriority, ComplaintStatus } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { uploadComplaintMedia, getSignedComplaintMediaUrl } from "../../config/s3-complaints";
import { requireAdmin } from "../../middleware/admin";
import { sendMail } from "../notifications/email";
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

function parseAssigneeEmails(body: Record<string, unknown>): string[] {
  const raw = body.assigneeEmails;
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(String).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map(String).map((e) => e.trim().toLowerCase()).filter(Boolean))];
      }
    } catch {
      return [...new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))];
    }
  }
  return [];
}

async function assigneeNameMap(emails: string[]): Promise<Map<string, string | null>> {
  if (emails.length === 0) return new Map();
  const rows = await prisma.complaintWhitelist.findMany({
    where: { email: { in: emails }, isActive: true },
    select: { email: true, name: true }
  });
  return new Map(rows.map((r) => [r.email.toLowerCase(), r.name]));
}

function tasksAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "http://localhost:3000";
  return `${raw.replace(/\/$/, "")}/complaints`;
}

function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
    const body = req.body as Record<string, unknown>;
    const { title, description, priority: priorityRaw, parentId } = body as {
      title?: string;
      description?: string;
      priority?: string;
      parentId?: string;
    };
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const assigneeEmails = parseAssigneeEmails(body);
    const dueDateRaw = typeof body.dueDate === "string" ? body.dueDate.trim() : undefined;
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;

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
        status: "OPEN",
        dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null
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

    if (assigneeEmails.length > 0) {
      const names = await assigneeNameMap(assigneeEmails);
      await prisma.taskAssignee.createMany({
        data: assigneeEmails.map((email) => ({
          taskId: complaint.id,
          assigneeEmail: email,
          assigneeName: names.get(email) ?? null
        }))
      });

      const actor = req.complaintUser!;
      await prisma.taskNotification.createMany({
        data: assigneeEmails
          .filter((e) => e !== actor.email)
          .map((email) => ({
            recipientEmail: email,
            taskId: complaint.id,
            taskTitle: complaint.title,
            type: "ASSIGNED",
            message: `${actor.name ?? actor.email} assigned you a task: "${complaint.title}"`
          }))
      });

      for (const email of assigneeEmails) {
        if (email === actor.email) continue;
        const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="background:#1e3a2f;padding:20px;border-radius:12px 12px 0 0">
            <h2 style="color:#f5d88a;margin:0">☸ Sarveda Tasks</h2>
          </div>
          <div style="background:#fff;padding:20px;border:1px solid #e0d8ce;border-top:none;border-radius:0 0 12px 12px">
            <p style="color:#2c2420">
              Hi, you have been assigned a new task by
              <strong>${actor.name ?? actor.email}</strong>:
            </p>
            <div style="background:#f0fdf4;border-left:4px solid #1e3a2f;padding:14px;border-radius:8px;margin:16px 0">
              <p style="font-size:16px;font-weight:700;color:#1a1614;margin:0 0 6px">${complaint.title}</p>
              ${
                complaint.description
                  ? `<p style="color:#4a3f38;font-size:14px;margin:0">${complaint.description}</p>`
                  : ""
              }
            </div>
            <p style="color:#8a7060;font-size:13px">Priority: <strong>${complaint.priority}</strong></p>
            <a href="${tasksAppUrl()}" style="display:inline-block;background:#1e3a2f;color:#f5d88a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">View Task →</a>
          </div>
        </div>`;
        void sendMail(
          email,
          `New task assigned: ${complaint.title}`,
          html,
          htmlToPlainText(html)
        ).catch((err) => logger.error("task_assignment_email_failed", { err, email }));
      }
    }

    const updated = await prisma.complaint.update({
      where: { id: complaint.id },
      data: {
        assignedByEmail: req.complaintUser!.email,
        assignedByName: req.complaintUser!.name ?? null
      },
      include: { assignees: true, attachments: true }
    });

    res.status(201).json({
      success: true,
      complaint: { ...updated, attachments: attachmentRecords.length ? attachmentRecords : updated.attachments }
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

router.get("/dashboard", verifyComplaintAuth, async (req, res, next) => {
  try {
    const email = req.complaintUser!.email;

    const tasks = await prisma.complaint.findMany({
      where: {
        OR: [
          { assignedByEmail: email },
          { assignees: { some: { assigneeEmail: email } } },
          { raisedByEmail: email }
        ]
      },
      include: {
        assignees: true,
        attachments: true,
        _count: { select: { events: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 50
    });

    const stats = {
      open: tasks.filter((t) => t.status === "OPEN").length,
      inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      resolved: tasks.filter((t) => t.status === "RESOLVED").length,
      total: tasks.length
    };

    res.json({ success: true, tasks, stats });
  } catch (err) {
    next(err);
  }
});

router.get("/assigned-to-me", verifyComplaintAuth, async (req, res, next) => {
  try {
    const email = req.complaintUser!.email;
    const tasks = await prisma.complaint.findMany({
      where: {
        assignees: { some: { assigneeEmail: email } }
      },
      include: {
        assignees: true,
        attachments: true,
        _count: { select: { events: true } }
      },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ success: true, tasks });
  } catch (err) {
    next(err);
  }
});

router.get("/assigned-by-me", verifyComplaintAuth, async (req, res, next) => {
  try {
    const email = req.complaintUser!.email;
    const tasks = await prisma.complaint.findMany({
      where: { assignedByEmail: email },
      include: {
        assignees: true,
        attachments: true,
        _count: { select: { events: true } }
      },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ success: true, tasks });
  } catch (err) {
    next(err);
  }
});

router.get("/team-members", verifyComplaintAuth, async (_req, res, next) => {
  try {
    const members = await prisma.complaintWhitelist.findMany({
      where: { isActive: true },
      select: { email: true, name: true },
      orderBy: { name: "asc" }
    });
    res.json({ success: true, members });
  } catch (err) {
    next(err);
  }
});

router.post("/check-whitelist", async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      res.status(400).json({ success: false, error: "Email required", code: "BAD_REQUEST" });
      return;
    }
    const found = await prisma.complaintWhitelist.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true }
    });
    res.status(found ? 200 : 403).json({ success: true, allowed: !!found });
  } catch (err) {
    next(err);
  }
});

router.get("/notifications", verifyComplaintAuth, async (req, res, next) => {
  try {
    const email = req.complaintUser!.email;
    const notifications = await prisma.taskNotification.findMany({
      where: { recipientEmail: email },
      orderBy: { createdAt: "desc" },
      take: 30
    });
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

router.patch("/notifications/read-all", verifyComplaintAuth, async (req, res, next) => {
  try {
    await prisma.taskNotification.updateMany({
      where: {
        recipientEmail: req.complaintUser!.email,
        isRead: false
      },
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

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

router.delete("/:id", verifyComplaintAuth, async (req, res, next) => {
  try {
    const email = req.complaintUser!.email;
    const task = await prisma.complaint.findFirst({
      where: {
        id: req.params.id,
        OR: [{ raisedByEmail: email }, { assignedByEmail: email }]
      }
    });
    if (!task) {
      res.status(403).json({ success: false, error: "Not authorized", code: "FORBIDDEN" });
      return;
    }
    await prisma.complaint.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", verifyComplaintAuth, async (req, res, next) => {
  try {
    const { priority } = req.body as { priority?: string };
    const email = req.complaintUser!.email;

    if (!priority || !PRIORITIES.has(priority as ComplaintPriority)) {
      res.status(400).json({ success: false, error: "Invalid priority", code: "BAD_REQUEST" });
      return;
    }

    const task = await prisma.complaint.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { assignedByEmail: email },
          { raisedByEmail: email },
          { assignees: { some: { assigneeEmail: email } } }
        ]
      }
    });

    if (!task) {
      res.status(403).json({ success: false, error: "Not authorized", code: "FORBIDDEN" });
      return;
    }

    const updated = await prisma.complaint.update({
      where: { id: req.params.id },
      data: { priority: priority as ComplaintPriority }
    });
    res.json({ success: true, task: updated });
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
        assignees: true,
        children: {
          orderBy: { createdAt: "asc" },
          include: { attachments: true, assignees: true }
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

    const task = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { assignees: true }
    });

    if (task) {
      const actor = req.complaintUser!;
      const notifyEmails = new Set(
        [task.assignedByEmail, task.raisedByEmail, ...task.assignees.map((a) => a.assigneeEmail)].filter(
          (e): e is string => !!e && e !== actor.email
        )
      );

      if (notifyEmails.size > 0) {
        await prisma.taskNotification.createMany({
          data: Array.from(notifyEmails).map((email) => ({
            recipientEmail: email,
            taskId: task.id,
            taskTitle: task.title,
            type: "REPLIED",
            message: `${actor.name ?? actor.email} replied on "${task.title}"`
          }))
        });

        const replyPreview = message?.trim() ?? "(attachment)";
        for (const email of notifyEmails) {
          const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="background:#1e3a2f;padding:20px;border-radius:12px 12px 0 0">
            <h2 style="color:#f5d88a;margin:0">☸ Sarveda Tasks</h2>
          </div>
          <div style="background:#fff;padding:20px;border:1px solid #e0d8ce;border-top:none;border-radius:0 0 12px 12px">
            <p style="color:#2c2420">
              <strong>${actor.name ?? actor.email.split("@")[0]}</strong>
              replied on a task you are involved in:
            </p>
            <div style="background:#f9f7f4;border-left:4px solid #c8960a;padding:14px;border-radius:8px;margin:16px 0">
              <p style="font-weight:700;color:#1a1614;margin:0 0 6px">${task.title}</p>
              <p style="color:#4a3f38;font-size:14px;margin:0">"${replyPreview}"</p>
            </div>
            <a href="${tasksAppUrl()}" style="display:inline-block;background:#1e3a2f;color:#f5d88a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">View Conversation →</a>
          </div>
        </div>`;
          void sendMail(
            email,
            `New reply on task: ${task.title}`,
            html,
            htmlToPlainText(html)
          ).catch((err) => logger.error("task_reply_email_failed", { err, email }));
        }
      }
    }

    res.json({ success: true, event });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/status", verifyComplaintAuth, async (req, res, next) => {
  try {
    const { status } = req.body as { status?: string };
    const email = req.complaintUser!.email;

    if (!status || !STATUSES.has(status as ComplaintStatus)) {
      res.status(400).json({ success: false, error: "Invalid status", code: "BAD_REQUEST" });
      return;
    }

    const task = await prisma.complaint.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { assignedByEmail: email },
          { raisedByEmail: email },
          { assignees: { some: { assigneeEmail: email } } }
        ]
      },
      include: { assignees: true }
    });

    if (!task) {
      res.status(403).json({ success: false, error: "Not authorized", code: "FORBIDDEN" });
      return;
    }

    const complaintStatus = status as ComplaintStatus;
    const updated = await prisma.complaint.update({
      where: { id: req.params.id },
      data: {
        status: complaintStatus,
        resolvedAt: complaintStatus === "RESOLVED" ? new Date() : null
      }
    });

    await prisma.complaintEvent.create({
      data: {
        complaintId: req.params.id,
        type: "STATUS_CHANGE",
        authorEmail: email,
        authorType: "MEMBER",
        message: `Status changed to ${complaintStatus}`
      }
    });

    if (complaintStatus === "RESOLVED") {
      const notifyEmails = new Set(
        [task.assignedByEmail, task.raisedByEmail, ...task.assignees.map((a) => a.assigneeEmail)].filter(
          (e): e is string => !!e && e !== email
        )
      );

      if (notifyEmails.size > 0) {
        await prisma.taskNotification.createMany({
          data: Array.from(notifyEmails).map((e) => ({
            recipientEmail: e,
            taskId: task.id,
            taskTitle: task.title,
            type: "CLOSED",
            message: `Task "${task.title}" was marked as resolved`
          }))
        });
      }
    }

    res.json({ success: true, task: updated });
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
