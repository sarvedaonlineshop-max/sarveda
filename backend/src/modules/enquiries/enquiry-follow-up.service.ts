import type { EnquiryFollowUpStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { sendPushToAdminUser } from "../../config/firebase";
import { logger } from "../../config/logger";
import { markChatPipelineFollowup } from "../crm/chat-pipeline.service";

function adminSelect() {
  return { id: true, name: true, email: true, role: true } as const;
}

function followUpWhen(dueAt: Date): string {
  return dueAt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata"
  });
}

async function assignedOwnerIds(threadId: string): Promise<string[]> {
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: {
      crmOwnerUserId: true,
      crmCollaborators: { select: { userId: true } }
    }
  });
  if (!thread) return [];
  const ids = new Set<string>();
  if (thread.crmOwnerUserId) ids.add(thread.crmOwnerUserId);
  for (const row of thread.crmCollaborators) ids.add(row.userId);
  return [...ids];
}

/** Push to the lead owner and category collaborators. Chat-notification opt-out is respected. */
async function notifyFollowUpOwners(input: {
  threadId: string;
  customerName: string;
  dueAt: Date;
  followUpId: string;
  kind: "set" | "due";
  fallbackAdminId?: string | null;
}) {
  const ids = new Set(await assignedOwnerIds(input.threadId));
  if (ids.size === 0 && input.fallbackAdminId) ids.add(input.fallbackAdminId);
  if (ids.size === 0) return;

  const people = await prisma.user.findMany({
    where: {
      id: { in: [...ids] },
      deletedAt: null,
      adminChatNotificationsEnabled: true
    },
    select: { id: true, name: true, email: true }
  });
  if (people.length === 0) return;

  const title = input.kind === "set" ? "Follow-up scheduled" : "Follow-up due";
  const body = `${input.customerName.trim() || "Customer"} · ${followUpWhen(input.dueAt)}`.slice(0, 180);
  await Promise.all(
    people.map((person) =>
      sendPushToAdminUser(person.id, title, body, {
        type: "chat",
        chatId: input.threadId,
        followUpId: input.followUpId,
        link: `/admin/chats/${input.threadId}`
      }).catch((err: unknown) => {
        logger.warn("enquiry_follow_up_owner_push_failed", {
          followUpId: input.followUpId,
          adminId: person.id,
          email: person.email,
          error: err instanceof Error ? err.message : String(err)
        });
      })
    )
  );
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
    prisma.enquiryThread.findUnique({
      where: { id: input.threadId },
      select: { id: true, customerName: true, crmOwnerUserId: true }
    }),
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
      assignedAdminId: thread.crmOwnerUserId || input.assignedAdminId,
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
  await markChatPipelineFollowup(row.threadId);
  await notifyFollowUpOwners({
    threadId: row.threadId,
    customerName: thread.customerName,
    dueAt: row.dueAt,
    followUpId: row.id,
    kind: "set",
    fallbackAdminId: row.assignedAdminId
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

/** Marks one follow-up Done. The admin route then closes the chat so it leaves Follow-up / Ongoing. */
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
          customerName: true
        }
      },
      assignedAdmin: {
        select: { id: true }
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

    await notifyFollowUpOwners({
      threadId: row.threadId,
      customerName: row.thread.customerName,
      dueAt: row.dueAt,
      followUpId: row.id,
      kind: "due",
      fallbackAdminId: row.assignedAdmin.id
    });
    sent += 1;
  }

  logger.info("enquiry_follow_up_due_processed", { due: due.length, sent });
  return sent;
}
