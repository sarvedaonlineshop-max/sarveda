import type { ComplaintPriority, ComplaintStatus } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { uploadComplaintMedia, getSignedComplaintMediaUrl, deleteComplaintMedia } from "../../config/s3-complaints";
import { requireAdmin } from "../../middleware/admin";
import { sendMail } from "../notifications/email";
import { verifyAccessToken, signAccessToken } from "../../utils/jwt";
import {
  loginComplaintWithPassword,
  provisionWhitelistCredentials
} from "./whitelist-auth";

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
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime === "application/pdf" ||
    mime.includes("document") ||
    mime.includes("sheet") ||
    mime.startsWith("text/")
  ) {
    return "document";
  }
  return "file";
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
      select: { id: true, name: true, phone: true, avatarUrl: true }
    });

    req.complaintUser = {
      id: payload.sub,
      email,
      name: user?.name ?? whitelisted.name ?? undefined,
      phone: user?.phone ?? null,
      avatarUrl: user?.avatarUrl ?? whitelisted.avatarUrl ?? undefined,
      complaintRole: whitelisted.role
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: "Authentication failed", code: "UNAUTHORIZED" });
  }
}

async function findTaskForParticipant(taskId: string, email: string) {
  return prisma.complaint.findFirst({
    where: {
      id: taskId,
      OR: [
        { raisedByEmail: email },
        { assignedByEmail: email },
        { assignees: { some: { assigneeEmail: email } } }
      ]
    }
  });
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
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true, name: true }
  });
  const userNameMap = new Map(users.map((u) => [u.email.toLowerCase(), u.name]));
  return new Map(
    emails.map((email) => {
      const key = email.toLowerCase();
      const wl = rows.find((r) => r.email.toLowerCase() === key);
      return [key, wl?.name ?? userNameMap.get(key) ?? null] as const;
    })
  );
}

async function displayNameForEmail(email: string): Promise<string> {
  const map = await assigneeNameMap([email]);
  return map.get(email.toLowerCase()) ?? email.split("@")[0];
}

async function notifyTaskTeam(
  task: {
    id: string;
    title: string;
    assignedByEmail: string | null;
    raisedByEmail: string;
    assignees: { assigneeEmail: string }[];
  },
  actorEmail: string,
  message: string,
  type: string
) {
  const emails = new Set(
    [task.assignedByEmail, task.raisedByEmail, ...task.assignees.map((a) => a.assigneeEmail)].filter(
      (e): e is string => !!e && e.toLowerCase() !== actorEmail.toLowerCase()
    )
  );
  if (emails.size === 0) return;
  await prisma.taskNotification.createMany({
    data: Array.from(emails).map((e) => ({
      recipientEmail: e,
      taskId: task.id,
      taskTitle: task.title,
      type,
      message
    }))
  });
}

function ownerEmail(task: { raisedByEmail: string }): string {
  return task.raisedByEmail.toLowerCase();
}

function formatAssigneeList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, ${names.at(-1)}`;
}

function startPromptMessage(names: string[]): string {
  const prefix = names.length === 1 ? `Hi ${names[0]}` : `Hi ${formatAssigneeList(names)}`;
  const verb = names.length === 1 ? "is" : "are";
  return `${prefix}, you ${verb} added to the above new task. Please press Start button to proceed.`;
}

async function postSystemChat(
  complaintId: string,
  authorEmail: string,
  text: string
) {
  await prisma.complaintEvent.create({
    data: {
      complaintId,
      type: "COMMENT",
      authorEmail,
      authorType: "MEMBER",
      message: `@@SYSTEM@@${text}`
    }
  });
}

async function emailTaskTeam(
  task: {
    title: string;
    raisedByEmail: string;
    assignedByEmail: string | null;
    assignees: { assigneeEmail: string }[];
  },
  subject: string,
  bodyHtml: string,
  excludeEmail?: string
) {
  const emails = new Set(
    [task.raisedByEmail, task.assignedByEmail, ...task.assignees.map((a) => a.assigneeEmail)].filter(
      (e): e is string => !!e && e.toLowerCase() !== excludeEmail?.toLowerCase()
    )
  );
  for (const email of emails) {
    void sendMail(email, subject, bodyHtml, htmlToPlainText(bodyHtml)).catch((err) =>
      logger.error("task_team_email_failed", { err, email })
    );
  }
}

async function signedAvatarUrl(
  avatarUrl: string | null | undefined,
  avatarS3Key: string | null | undefined
): Promise<string | null> {
  if (avatarS3Key) {
    try {
      return await getSignedComplaintMediaUrl(avatarS3Key);
    } catch {
      return avatarUrl ?? null;
    }
  }
  return avatarUrl ?? null;
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

function whitelistPublic(entry: {
  id: string;
  email: string;
  name: string | null;
  avatarUrl?: string | null;
  avatarS3Key?: string | null;
  role: string;
  addedAt: Date;
  isActive: boolean;
}) {
  return {
    id: entry.id,
    email: entry.email,
    name: entry.name,
    avatarUrl: entry.avatarUrl ?? null,
    role: entry.role,
    addedAt: entry.addedAt,
    isActive: entry.isActive
  };
}

router.get("/admin/whitelist", requireAdmin, async (_req, res, next) => {
  try {
    const list = await prisma.complaintWhitelist.findMany({
      orderBy: { addedAt: "desc" }
    });
    res.json({ success: true, whitelist: list.map(whitelistPublic) });
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
    const normalized = email.toLowerCase().trim();
    const existing = await prisma.complaintWhitelist.findUnique({
      where: { email: normalized }
    });

    if (existing) {
      if (existing.isActive) {
        res.status(409).json({
          success: false,
          error: "This email is already on the whitelist",
          code: "ALREADY_EXISTS"
        });
        return;
      }
      const entry = await prisma.complaintWhitelist.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          ...(name?.trim() ? { name: name.trim() } : {})
        }
      });
      const provisioned = await provisionWhitelistCredentials(entry);
      res.status(200).json({ success: true, entry: whitelistPublic(provisioned), reactivated: true });
      return;
    }

    const entry = await prisma.complaintWhitelist.create({
      data: {
        email: normalized,
        name: name?.trim() || null,
        role: "ADMIN"
      }
    });
    const provisioned = await provisionWhitelistCredentials(entry);
    res.status(201).json({ success: true, entry: whitelistPublic(provisioned) });
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
    const actorEmail = req.complaintUser!.email.toLowerCase();
    const resolvedAssignees =
      assigneeEmails.length > 0 ? assigneeEmails : [actorEmail];
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
        message: null
      }
    });

    if (resolvedAssignees.length > 0) {
      const actor = req.complaintUser!;
      const names = await assigneeNameMap(resolvedAssignees);
      const assigneeDisplayNames = resolvedAssignees
        .filter((email) => email !== actor.email)
        .map((email) => names.get(email) ?? email.split("@")[0]);
      await prisma.taskAssignee.createMany({
        data: resolvedAssignees.map((email) => ({
          taskId: complaint.id,
          assigneeEmail: email,
          assigneeName: names.get(email) ?? null,
          responseStatus:
            email === actor.email.toLowerCase() ? "ACCEPTED" : "PENDING"
        }))
      });

      await prisma.taskNotification.createMany({
        data: resolvedAssignees
          .filter((e) => e !== actor.email)
          .map((email) => ({
            recipientEmail: email,
            taskId: complaint.id,
            taskTitle: complaint.title,
            type: "ASSIGNED",
            message: `${actor.name ?? actor.email} assigned you a task: "${complaint.title}"`
          }))
      });

      if (assigneeDisplayNames.length > 0) {
        await postSystemChat(complaint.id, actor.email, startPromptMessage(assigneeDisplayNames));
      }

      for (const email of resolvedAssignees) {
        if (email === actor.email) continue;
        const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="background:#1e3a2f;padding:20px;border-radius:12px 12px 0 0">
            <h2 style="color:#f5d88a;margin:0">Sarveda Tasks</h2>
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
            <a href="${tasksAppUrl()}" style="display:inline-block;background:#1e3a2f;color:#f5d88a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">Open task and press Start →</a>
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
        parentId: null,
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
        parentId: null,
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
      where: { assignedByEmail: email, parentId: null },
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
    const rows = await prisma.complaintWhitelist.findMany({
      where: { isActive: true },
      select: { email: true, name: true, avatarUrl: true, avatarS3Key: true },
      orderBy: { name: "asc" }
    });
    const emails = rows.map((r) => r.email.toLowerCase());
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, avatarUrl: true, avatarS3Key: true, name: true }
    });
    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u]));
    const members = await Promise.all(
      rows.map(async (r) => {
        const u = userMap.get(r.email.toLowerCase());
        const avatarS3Key = u?.avatarS3Key ?? r.avatarS3Key ?? null;
        const avatarUrl = await signedAvatarUrl(
          u?.avatarUrl ?? r.avatarUrl ?? null,
          avatarS3Key
        );
        return {
          email: r.email,
          name: r.name ?? u?.name ?? null,
          avatarUrl
        };
      })
    );
    res.json({ success: true, members });
  } catch (err) {
    next(err);
  }
});

router.post("/profile/avatar", verifyComplaintAuth, upload.single("avatar"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file || !file.mimetype.startsWith("image/")) {
      res.status(400).json({ success: false, error: "Image required", code: "BAD_REQUEST" });
      return;
    }
    const actor = req.complaintUser!;
    const { s3Key, s3Url } = await uploadComplaintMedia(
      file.buffer,
      file.mimetype,
      `avatar-${actor.email}.${file.originalname.split(".").pop() ?? "jpg"}`
    );
    await prisma.user.update({
      where: { id: actor.id },
      data: { avatarUrl: s3Url, avatarS3Key: s3Key }
    });
    await prisma.complaintWhitelist.updateMany({
      where: { email: actor.email },
      data: { avatarUrl: s3Url, avatarS3Key: s3Key }
    });
    const signed = await getSignedComplaintMediaUrl(s3Key);
    res.json({ success: true, avatarUrl: signed });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      res.status(400).json({
        success: false,
        error: "Email and password are required",
        code: "BAD_REQUEST"
      });
      return;
    }

    const { user, whitelist } = await loginComplaintWithPassword(email, password);
    const token = signAccessToken({
      sub: user.id,
      email: user.email,
      role: "CUSTOMER",
      complaintRole: whitelist.role
    });
    res.json({ success: true, data: { user, token } });
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

router.delete("/notifications", verifyComplaintAuth, async (req, res, next) => {
  try {
    const result = await prisma.taskNotification.deleteMany({
      where: { recipientEmail: req.complaintUser!.email }
    });
    res.json({ success: true, deleted: result.count });
  } catch (err) {
    next(err);
  }
});

router.delete("/notifications/:id", verifyComplaintAuth, async (req, res, next) => {
  try {
    await prisma.taskNotification.deleteMany({
      where: {
        id: req.params.id,
        recipientEmail: req.complaintUser!.email
      }
    });
    res.json({ success: true });
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
    const { priority, dueDate } = req.body as {
      priority?: string;
      dueDate?: string | null;
    };
    const email = req.complaintUser!.email;
    const actor = req.complaintUser!;

    if (priority === undefined && dueDate === undefined) {
      res.status(400).json({ success: false, error: "Nothing to update", code: "BAD_REQUEST" });
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

    const isOwner = ownerEmail(task) === email.toLowerCase();

    const data: { priority?: ComplaintPriority; dueDate?: Date | null } = {};

    if (priority !== undefined) {
      if (!isOwner) {
        res.status(403).json({ success: false, error: "Only the task owner can change priority", code: "FORBIDDEN" });
        return;
      }
      if (!PRIORITIES.has(priority as ComplaintPriority)) {
        res.status(400).json({ success: false, error: "Invalid priority", code: "BAD_REQUEST" });
        return;
      }
      data.priority = priority as ComplaintPriority;
    }

    let dueDateChanged = false;
    if (dueDate !== undefined) {
      if (!isOwner) {
        res.status(403).json({ success: false, error: "Only the task owner can set the deadline directly", code: "FORBIDDEN" });
        return;
      }
      if (dueDate === null || dueDate === "") {
        data.dueDate = null;
        dueDateChanged = task.dueDate !== null;
      } else {
        const parsed = new Date(dueDate);
        if (Number.isNaN(parsed.getTime())) {
          res.status(400).json({ success: false, error: "Invalid due date", code: "BAD_REQUEST" });
          return;
        }
        data.dueDate = parsed;
        dueDateChanged =
          !task.dueDate || task.dueDate.getTime() !== parsed.getTime();
      }
    }

    const updated = await prisma.complaint.update({
      where: { id: req.params.id },
      data,
      include: { assignees: true }
    });

    if (dueDateChanged) {
      const actorName = actor.name ?? actor.email.split("@")[0];
      const label = data.dueDate
        ? data.dueDate.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
          })
        : "removed";
      const sysMsg = `@@SYSTEM@@📅 ${actorName} updated the due date to ${label}`;
      await prisma.complaintEvent.create({
        data: {
          complaintId: task.id,
          type: "COMMENT",
          authorEmail: actor.email,
          authorType: "MEMBER",
          message: sysMsg
        }
      });
      await notifyTaskTeam(updated, actor.email, sysMsg.replace("@@SYSTEM@@", ""), "DUE_DATE_REMINDER");
    }

    res.json({ success: true, task: updated });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/assignees", verifyComplaintAuth, async (req, res, next) => {
  try {
    const { assigneeEmails } = req.body as { assigneeEmails?: string[] };
    if (!Array.isArray(assigneeEmails)) {
      res.status(400).json({ success: false, error: "assigneeEmails required", code: "BAD_REQUEST" });
      return;
    }
    const emails = [...new Set(assigneeEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const actor = req.complaintUser!;
    const email = actor.email;

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

    const existing = new Set(task.assignees.map((a) => a.assigneeEmail.toLowerCase()));
    const incoming = new Set(emails);
    const toAdd = emails.filter((e) => !existing.has(e));
    const toRemove = task.assignees
      .map((a) => a.assigneeEmail.toLowerCase())
      .filter((e) => !incoming.has(e));

    if (toRemove.length > 0) {
      await prisma.taskAssignee.deleteMany({
        where: {
          taskId: task.id,
          assigneeEmail: { in: toRemove }
        }
      });
    }

    if (toAdd.length > 0) {
      const names = await assigneeNameMap(toAdd);
      const addedDisplayNames = toAdd
        .filter((email) => email !== actor.email)
        .map((email) => names.get(email) ?? email.split("@")[0]);
      await prisma.taskAssignee.createMany({
        data: toAdd.map((e) => ({
          taskId: task.id,
          assigneeEmail: e,
          assigneeName: names.get(e) ?? null,
          responseStatus:
            e === actor.email.toLowerCase() ? "ACCEPTED" : "PENDING"
        }))
      });

      if (addedDisplayNames.length > 0) {
        await postSystemChat(task.id, actor.email, startPromptMessage(addedDisplayNames));
      }

      for (const e of toAdd) {
        if (e === actor.email) continue;
        await prisma.taskNotification.create({
          data: {
            recipientEmail: e,
            taskId: task.id,
            taskTitle: task.title,
            type: "ASSIGNED",
            message: `${actor.name ?? actor.email} added you to task "${task.title}"`
          }
        });
      }
    }

    const updated = await prisma.complaint.findUnique({
      where: { id: task.id },
      include: { assignees: true }
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
          where: { deletedAt: null },
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

router.post("/:id/attachments", verifyComplaintAuth, upload.array("files", 5), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ success: false, error: "No files", code: "BAD_REQUEST" });
      return;
    }

    const existing = await findTaskForParticipant(req.params.id, req.complaintUser!.email);
    if (!existing) {
      res.status(404).json({ success: false, error: "Not found or not authorized", code: "FORBIDDEN" });
      return;
    }

    const attachmentRecords = [];
    for (const file of files) {
      const { s3Key, s3Url } = await uploadComplaintMedia(
        file.buffer,
        file.mimetype,
        file.originalname
      );
      const attachment = await prisma.complaintAttachment.create({
        data: {
          complaintId: req.params.id,
          type: mediaType(file.mimetype),
          s3Key,
          s3Url,
          fileName: file.originalname,
          fileSizeBytes: file.size
        }
      });
      attachmentRecords.push(attachment);
    }

    const signed = await signAttachmentUrls(attachmentRecords);
    res.status(201).json({ success: true, attachments: signed });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/comment", verifyComplaintAuth, upload.array("files", 5), async (req, res, next) => {
  try {
    const { message } = req.body as { message?: string };
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const existing = await findTaskForParticipant(req.params.id, req.complaintUser!.email);
    if (!existing) {
      res.status(403).json({ success: false, error: "Not authorized to comment on this task", code: "FORBIDDEN" });
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
            <h2 style="color:#f5d88a;margin:0">Sarveda Tasks</h2>
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

router.delete("/:id/events/:eventId", verifyComplaintAuth, async (req, res, next) => {
  try {
    const actor = req.complaintUser!;
    const event = await prisma.complaintEvent.findFirst({
      where: {
        id: req.params.eventId,
        complaintId: req.params.id,
        deletedAt: null,
        type: "COMMENT"
      }
    });
    if (!event) {
      res.status(404).json({ success: false, error: "Message not found", code: "NOT_FOUND" });
      return;
    }
    if (event.authorEmail.toLowerCase() !== actor.email.toLowerCase()) {
      res.status(403).json({ success: false, error: "Not authorized", code: "FORBIDDEN" });
      return;
    }
    if (event.message?.startsWith("@@SYSTEM@@")) {
      res.status(403).json({ success: false, error: "Cannot delete system message", code: "FORBIDDEN" });
      return;
    }
    const ageMs = Date.now() - event.createdAt.getTime();
    if (ageMs > 15 * 60 * 1000) {
      res.status(403).json({
        success: false,
        error: "Messages can only be deleted within 15 minutes",
        code: "DELETE_WINDOW_EXPIRED"
      });
      return;
    }
    await prisma.complaintEvent.update({
      where: { id: event.id },
      data: { deletedAt: new Date() }
    });
    res.json({ success: true });
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
    const existing = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true }
    });
    if (!existing) {
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }

    const actor = req.complaintUser!;
    const complaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data: { status: "OPEN", resolvedAt: null }
    });
    await prisma.complaintEvent.create({
      data: {
        complaintId: req.params.id,
        type: "REOPENED",
        authorEmail: actor.email,
        authorType: "MEMBER",
        message: "Task reopened"
      }
    });
    await postSystemChat(
      req.params.id,
      actor.email,
      `🔄 ${actor.name ?? actor.email.split("@")[0]} reopened this task`
    );
    res.json({ success: true, complaint });
  } catch (err) {
    next(err);
  }
});

// ── Assignee accept / deny ───────────────────────────────────────────────────

router.post("/:id/assignees/me/start", verifyComplaintAuth, async (req, res, next) => {
  try {
    const actor = req.complaintUser!;
    const row = await prisma.taskAssignee.findFirst({
      where: { taskId: req.params.id, assigneeEmail: actor.email }
    });
    if (!row) {
      res.status(404).json({ success: false, error: "Not assigned to this task", code: "NOT_FOUND" });
      return;
    }

    await prisma.taskAssignee.update({
      where: { id: row.id },
      data: { responseStatus: "ACCEPTED" }
    });

    const task = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { assignees: true }
    });
    if (!task) {
      res.status(404).json({ success: false, error: "Task not found", code: "NOT_FOUND" });
      return;
    }

    let updatedTask = task;
    if (task.status === "OPEN" || task.status === "REOPENED") {
      updatedTask = await prisma.complaint.update({
        where: { id: task.id },
        data: { status: "IN_PROGRESS" },
        include: { assignees: true }
      });
      await prisma.complaintEvent.create({
        data: {
          complaintId: task.id,
          type: "STATUS_CHANGE",
          authorEmail: actor.email,
          authorType: "MEMBER",
          message: "Status changed to IN_PROGRESS"
        }
      });
    }

    const name = actor.name ?? actor.email.split("@")[0];
    const msg = `▶️ ${name} started working on this task`;
    await postSystemChat(task.id, actor.email, msg);
    await notifyTaskTeam(updatedTask, actor.email, msg, "ASSIGNED");
    res.json({ success: true, task: updatedTask });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/assignees/me/accept", verifyComplaintAuth, async (req, res, next) => {
  try {
    const actor = req.complaintUser!;
    const row = await prisma.taskAssignee.findFirst({
      where: { taskId: req.params.id, assigneeEmail: actor.email }
    });
    if (!row) {
      res.status(404).json({ success: false, error: "Not assigned to this task", code: "NOT_FOUND" });
      return;
    }
    await prisma.taskAssignee.update({
      where: { id: row.id },
      data: { responseStatus: "ACCEPTED" }
    });
    const task = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { assignees: true }
    });
    if (task) {
      const name = actor.name ?? actor.email.split("@")[0];
      const msg = `✅ ${name} accepted this task`;
      await postSystemChat(task.id, actor.email, msg);
      await notifyTaskTeam(task, actor.email, msg, "ASSIGNED");
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/assignees/me/deny", verifyComplaintAuth, async (req, res, next) => {
  try {
    const actor = req.complaintUser!;
    const row = await prisma.taskAssignee.findFirst({
      where: { taskId: req.params.id, assigneeEmail: actor.email }
    });
    if (!row) {
      res.status(404).json({ success: false, error: "Not assigned to this task", code: "NOT_FOUND" });
      return;
    }
    const task = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { assignees: true }
    });
    if (!task) {
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }
    await prisma.taskAssignee.update({
      where: { id: row.id },
      data: { responseStatus: "DENIED_AWAITING_OWNER" }
    });
    const ownerName = await displayNameForEmail(task.raisedByEmail);
    const name = actor.name ?? actor.email.split("@")[0];
    const msg = `❌ ${name} denied this task — waiting for approval from ${ownerName}`;
    await postSystemChat(task.id, actor.email, msg);
    await prisma.taskNotification.create({
      data: {
        recipientEmail: task.raisedByEmail,
        taskId: task.id,
        taskTitle: task.title,
        type: "DENIAL_PENDING",
        message: `${name} denied the task "${task.title}". Approve removal or reject the denial.`
      }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/assignees/:email/denial/approve", verifyComplaintAuth, async (req, res, next) => {
  try {
    const actor = req.complaintUser!;
    const task = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { assignees: true }
    });
    if (!task || ownerEmail(task) !== actor.email.toLowerCase()) {
      res.status(403).json({ success: false, error: "Only task owner can approve denial", code: "FORBIDDEN" });
      return;
    }
    const target = req.params.email.toLowerCase();
    const row = task.assignees.find((a) => a.assigneeEmail.toLowerCase() === target);
    if (!row || row.responseStatus !== "DENIED_AWAITING_OWNER") {
      res.status(400).json({ success: false, error: "No pending denial for this member", code: "BAD_REQUEST" });
      return;
    }
    await prisma.taskAssignee.delete({ where: { id: row.id } });
    const removedName = await displayNameForEmail(target);
    const ownerName = actor.name ?? actor.email.split("@")[0];
    const msg = `👤 ${ownerName} approved removal of ${removedName} from this task`;
    await postSystemChat(task.id, actor.email, msg);
    const updated = await prisma.complaint.findUnique({
      where: { id: task.id },
      include: { assignees: true }
    });
    if (updated) await notifyTaskTeam(updated, actor.email, msg, "ASSIGNED");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/assignees/:email/denial/reject", verifyComplaintAuth, async (req, res, next) => {
  try {
    const actor = req.complaintUser!;
    const task = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { assignees: true }
    });
    if (!task || ownerEmail(task) !== actor.email.toLowerCase()) {
      res.status(403).json({ success: false, error: "Only task owner can reject denial", code: "FORBIDDEN" });
      return;
    }
    const target = req.params.email.toLowerCase();
    const row = await prisma.taskAssignee.findFirst({
      where: {
        taskId: task.id,
        assigneeEmail: target,
        responseStatus: "DENIED_AWAITING_OWNER"
      }
    });
    if (!row) {
      res.status(400).json({ success: false, error: "No pending denial for this member", code: "BAD_REQUEST" });
      return;
    }
    await prisma.taskAssignee.update({
      where: { id: row.id },
      data: { responseStatus: "ACCEPTED" }
    });
    const memberName = await displayNameForEmail(target);
    const ownerName = actor.name ?? actor.email.split("@")[0];
    const msg = `✅ ${ownerName} rejected the denial — ${memberName} remains on this task`;
    await postSystemChat(task.id, actor.email, msg);
    const updated = await prisma.complaint.findUnique({
      where: { id: task.id },
      include: { assignees: true }
    });
    if (updated) await notifyTaskTeam(updated, actor.email, msg, "ASSIGNED");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Deadline extension ───────────────────────────────────────────────────────

router.post("/:id/deadline-extension", verifyComplaintAuth, async (req, res, next) => {
  try {
    const { requestedDate } = req.body as { requestedDate?: string };
    if (!requestedDate?.trim()) {
      res.status(400).json({ success: false, error: "requestedDate required", code: "BAD_REQUEST" });
      return;
    }
    const parsed = new Date(requestedDate);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ success: false, error: "Invalid date", code: "BAD_REQUEST" });
      return;
    }
    const actor = req.complaintUser!;
    const task = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { assignees: true }
    });
    if (!task) {
      res.status(404).json({ success: false, error: "Not found", code: "NOT_FOUND" });
      return;
    }
    if (ownerEmail(task) === actor.email.toLowerCase()) {
      res.status(400).json({
        success: false,
        error: "Task owner can set the deadline directly",
        code: "BAD_REQUEST"
      });
      return;
    }
    await prisma.complaint.update({
      where: { id: task.id },
      data: {
        pendingDeadlineDate: parsed,
        pendingDeadlineRequestedBy: actor.email
      }
    });
    const ownerName = await displayNameForEmail(task.raisedByEmail);
    const requesterName = actor.name ?? actor.email.split("@")[0];
    const label = parsed.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    const msg = `📅 ${requesterName} requested a deadline extension to ${label} — waiting for approval from ${ownerName}`;
    await postSystemChat(task.id, actor.email, msg);
    await prisma.taskNotification.create({
      data: {
        recipientEmail: task.raisedByEmail,
        taskId: task.id,
        taskTitle: task.title,
        type: "DEADLINE_EXTENSION",
        message: `${requesterName} requested deadline extension to ${label} on "${task.title}"`
      }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/deadline-extension/approve", verifyComplaintAuth, async (req, res, next) => {
  try {
    const actor = req.complaintUser!;
    const task = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { assignees: true }
    });
    if (!task || ownerEmail(task) !== actor.email.toLowerCase()) {
      res.status(403).json({ success: false, error: "Only task owner can approve extension", code: "FORBIDDEN" });
      return;
    }
    if (!task.pendingDeadlineDate || !task.pendingDeadlineRequestedBy) {
      res.status(400).json({ success: false, error: "No pending extension request", code: "BAD_REQUEST" });
      return;
    }
    const label = task.pendingDeadlineDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    const requesterName = await displayNameForEmail(task.pendingDeadlineRequestedBy);
    const ownerName = actor.name ?? actor.email.split("@")[0];
    const updated = await prisma.complaint.update({
      where: { id: task.id },
      data: {
        dueDate: task.pendingDeadlineDate,
        pendingDeadlineDate: null,
        pendingDeadlineRequestedBy: null
      },
      include: { assignees: true }
    });
    const msg = `✅ ${ownerName} approved the deadline extension to ${label} (requested by ${requesterName})`;
    await postSystemChat(task.id, actor.email, msg);
    await notifyTaskTeam(updated, actor.email, msg, "DUE_DATE_REMINDER");
    const html = `<div style="font-family:sans-serif"><p>${msg}</p><a href="${tasksAppUrl()}">Open task</a></div>`;
    await emailTaskTeam(updated, `Deadline updated: ${task.title}`, html, actor.email);
    res.json({ success: true, task: updated });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/deadline-extension/reject", verifyComplaintAuth, async (req, res, next) => {
  try {
    const actor = req.complaintUser!;
    const task = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { assignees: true }
    });
    if (!task || ownerEmail(task) !== actor.email.toLowerCase()) {
      res.status(403).json({ success: false, error: "Only task owner can reject extension", code: "FORBIDDEN" });
      return;
    }
    if (!task.pendingDeadlineDate) {
      res.status(400).json({ success: false, error: "No pending extension request", code: "BAD_REQUEST" });
      return;
    }
    await prisma.complaint.update({
      where: { id: task.id },
      data: {
        pendingDeadlineDate: null,
        pendingDeadlineRequestedBy: null
      }
    });
    const ownerName = actor.name ?? actor.email.split("@")[0];
    const msg = `❌ ${ownerName} declined the deadline extension request`;
    await postSystemChat(task.id, actor.email, msg);
    await notifyTaskTeam(task, actor.email, msg, "DUE_DATE_REMINDER");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as complaintsRoutes };
