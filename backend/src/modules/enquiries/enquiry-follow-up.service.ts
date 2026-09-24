import type { EnquiryFollowUpStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { sendPushNotification, isFirebaseConfigured } from "../../config/firebase";
import { logger } from "../../config/logger";

function siteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "https://sarveda.com";
  return raw.replace(/\/$/, "");
}

function adminSelect() {
  return { id: true, name: true, email: true, role: true } as const;
}

export async function listEnquiryAdmins() {
  return prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
      deletedAt: null
    },
    select: adminSelect(),
    orderBy: [{ name: "asc" }, { email: "asc" }]
  });
}

export async function listThreadFollowUps(threadId: string) {
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { id: true }
  });
  if (!thread) {
    throw Object.assign(new Error("Chat not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  return prisma.enquiryFollowUp.findMany({
    where: { threadId },
    orderBy: [{ dueAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      assignedAdmin: { select: adminSelect() },
      createdByAdmin: { select: adminSelect() },
      completedByAdmin: { select: adminSelect() }
    }
  });
}

export async function createThreadFollowUp(input: {
  threadId: string;
  notes: string;
  dueAt: Date;
  assignedAdminId: string;
  createdByAdminId: string;
}) {
  const notes = input.notes.trim();
  if (!notes) {
    throw Object.assign(new Error("Notes are required"), {
      statusCode: 400,
      code: "VALIDATION_ERROR"
    });
  }
  if (notes.length > 2000) {
    throw Object.assign(new Error("Notes are too long"), {
      statusCode: 400,
      code: "VALIDATION_ERROR"
    });
  }
  if (!(input.dueAt instanceof Date) || Number.isNaN(input.dueAt.getTime())) {
    throw Object.assign(new Error("Invalid follow-up date/time"), {
      statusCode: 400,
      code: "VALIDATION_ERROR"
    });
  }
  // Allow slight clock skew; reject clearly past times (>2 min ago).
  if (input.dueAt.getTime() < Date.now() - 2 * 60 * 1000) {
    throw Object.assign(new Error("Follow-up time must be in the future"), {
      statusCode: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const [thread, assignee, creator] = await Promise.all([
    prisma.enquiryThread.findUnique({ where: { id: input.threadId }, select: { id: true } }),
    prisma.user.findFirst({
      where: {
        id: input.assignedAdminId,
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
        deletedAt: null
      },
      select: { id: true }
    }),
    prisma.user.findFirst({
      where: {
        id: input.createdByAdminId,
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
        deletedAt: null
      },
      select: { id: true }
    })
  ]);

  if (!thread) {
    throw Object.assign(new Error("Chat not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (!assignee) {
    throw Object.assign(new Error("Select a valid admin"), {
      statusCode: 400,
      code: "VALIDATION_ERROR"
    });
  }
  if (!creator) {
    throw Object.assign(new Error("Not authorized"), { statusCode: 403, code: "FORBIDDEN" });
  }

  const row = await prisma.enquiryFollowUp.create({
    data: {
      threadId: input.threadId,
      notes,
      dueAt: input.dueAt,
      assignedAdminId: input.assignedAdminId,
      createdByAdminId: input.createdByAdminId,
      status: "OPEN"
    },
    include: {
      assignedAdmin: { select: adminSelect() },
      createdByAdmin: { select: adminSelect() },
      completedByAdmin: { select: adminSelect() }
    }
  });

  logger.info("enquiry_follow_up_created", {
    followUpId: row.id,
    threadId: row.threadId,
    dueAt: row.dueAt.toISOString(),
    assignedAdminId: row.assignedAdminId
  });

  return row;
}

/** Close every open follow-up on a thread (customer replied, or the chat was marked closed). */
export async function completeOpenFollowUpsForThread(
  threadId: string,
  reason: "customer_reply" | "thread_closed"
) {
  const result = await prisma.enquiryFollowUp.updateMany({
    where: { threadId, status: "OPEN" },
    data: { status: "CLOSED", completedAt: new Date() }
  });
  if (result.count > 0) {
    logger.info("enquiry_follow_ups_auto_completed", {
      threadId,
      reason,
      count: result.count
    });
  }
  return result.count;
}

export async function completeThreadFollowUp(followUpId: string, completedByAdminId: string) {
  const existing = await prisma.enquiryFollowUp.findUnique({
    where: { id: followUpId },
    select: { id: true, status: true }
  });
  if (!existing) {
    throw Object.assign(new Error("Follow-up not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (existing.status === "CLOSED") {
    return prisma.enquiryFollowUp.findUniqueOrThrow({
      where: { id: followUpId },
      include: {
        assignedAdmin: { select: adminSelect() },
        createdByAdmin: { select: adminSelect() },
        completedByAdmin: { select: adminSelect() }
      }
    });
  }

  const row = await prisma.enquiryFollowUp.update({
    where: { id: followUpId },
    data: {
      status: "CLOSED" satisfies EnquiryFollowUpStatus,
      completedAt: new Date(),
      completedByAdminId
    },
    include: {
      assignedAdmin: { select: adminSelect() },
      createdByAdmin: { select: adminSelect() },
      completedByAdmin: { select: adminSelect() }
    }
  });

  logger.info("enquiry_follow_up_completed", {
    followUpId: row.id,
    threadId: row.threadId,
    completedByAdminId
  });

  return row;
}

/**
 * Due OPEN follow-ups → push to assigned admin once (sets notifiedAt).
 */
export async function processDueEnquiryFollowUps(): Promise<number> {
  const now = new Date();
  const due = await prisma.enquiryFollowUp.findMany({
    where: {
      status: "OPEN",
      notifiedAt: null,
      dueAt: { lte: now }
    },
    take: 50,
    include: {
      thread: {
        select: {
          id: true,
          customerName: true,
          customerEmail: true,
          source: true
        }
      },
      assignedAdmin: {
        select: {
          id: true,
          email: true,
          name: true,
          fcmWebToken: true,
          pushNotificationsEnabled: true,
          deletedAt: true
        }
      }
    },
    orderBy: { dueAt: "asc" }
  });

  if (due.length === 0) return 0;

  let sent = 0;
  for (const row of due) {
    const claimed = await prisma.enquiryFollowUp.updateMany({
      where: { id: row.id, notifiedAt: null, status: "OPEN" },
      data: { notifiedAt: now }
    });
    if (claimed.count === 0) continue;

    const admin = row.assignedAdmin;
    const token = admin.fcmWebToken?.trim();
    const title = "Chat follow-up";
    const body = `${row.thread.customerName}: ${row.notes}`.slice(0, 180);
    const link = `${siteBaseUrl()}/admin/chats/${row.threadId}`;

    if (
      isFirebaseConfigured() &&
      token &&
      admin.pushNotificationsEnabled &&
      !admin.deletedAt
    ) {
      const ok = await sendPushNotification(
        token,
        title,
        body,
        {
          type: "chat_follow_up",
          chatId: row.threadId,
          followUpId: row.id,
          link
        },
        { platform: "web" }
      );
      if (ok) sent += 1;
      else {
        logger.warn("enquiry_follow_up_push_failed", {
          followUpId: row.id,
          adminId: admin.id
        });
      }
    } else {
      logger.warn("enquiry_follow_up_no_web_token", {
        followUpId: row.id,
        adminId: admin.id,
        email: admin.email
      });
    }
  }

  logger.info("enquiry_follow_up_due_processed", { due: due.length, sent });
  return sent;
}
