import type { CrmChatCategory, CrmChatPipeline, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

export const CHAT_PIPELINE_STATUSES = [
  "NEW",
  "ONGOING",
  "QUOTATION_SENT",
  "FOLLOWUP",
  "COMPLETED",
  "NOT_INTERESTED",
  "UNQUALIFIED"
] as const;

const LEGACY_PIPELINE: Record<string, CrmChatPipeline> = {
  CONTACTED: "ONGOING",
  WON: "COMPLETED",
  LOST: "NOT_INTERESTED",
  FOLLOW_UP: "FOLLOWUP"
};

const CATEGORY_ROUTING: Record<
  CrmChatCategory,
  { ownerEmail: string | null; collaboratorEmails: string[] }
> = {
  PRODUCTS: { ownerEmail: null, collaboratorEmails: [] },
  COURSES: { ownerEmail: null, collaboratorEmails: [] },
  DELIVERY: { ownerEmail: "shiva@sarveda.com", collaboratorEmails: [] },
  PAYMENT: { ownerEmail: "sowmya@sarveda.com", collaboratorEmails: [] },
  REFUND: { ownerEmail: "sowmya@sarveda.com", collaboratorEmails: ["shiva@sarveda.com"] },
  B2B: { ownerEmail: "prem@sarveda.com", collaboratorEmails: [] },
  OTHERS: { ownerEmail: "arjun@sarveda.com", collaboratorEmails: [] }
};

const ownerSelect = { id: true, name: true, email: true } as const;

function fail(message: string, statusCode: number) {
  const err = new Error(message) as Error & { statusCode: number; code: string };
  err.statusCode = statusCode;
  err.code = statusCode === 404 ? "NOT_FOUND" : "VALIDATION_ERROR";
  return err;
}

export function normalizeChatPipeline(status: string | null | undefined): CrmChatPipeline {
  const raw = (status ?? "NEW").toUpperCase();
  if (LEGACY_PIPELINE[raw]) return LEGACY_PIPELINE[raw];
  if ((CHAT_PIPELINE_STATUSES as readonly string[]).includes(raw)) {
    return raw as CrmChatPipeline;
  }
  return "NEW";
}

export function canSetChatPipeline(_from: CrmChatPipeline, to: CrmChatPipeline | string) {
  return Boolean(normalizeChatPipeline(to));
}

async function findStaffByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase(), role: { in: ["ADMIN", "SUPER_ADMIN"] }, deletedAt: null },
    select: { id: true }
  });
}

function present<T extends { crmPipeline: CrmChatPipeline; crmCategory: CrmChatCategory | null; crmCategories?: CrmChatCategory[] }>(
  row: T
) {
  const categories =
    row.crmCategories && row.crmCategories.length > 0
      ? row.crmCategories
      : row.crmCategory
        ? [row.crmCategory]
        : [];
  return {
    ...row,
    crmPipeline: normalizeChatPipeline(row.crmPipeline),
    crmCategories: categories
  };
}

/** Keep the current owner. First admin to take charge fills an empty chat. */
export function nextChatOwner(input: {
  currentOwnerId: string | null | undefined;
  claimantId: string | null | undefined;
}): string | null {
  if (input.currentOwnerId) return input.currentOwnerId;
  return input.claimantId ?? null;
}

export async function claimChatOwnerIfEmpty(threadId: string, ownerUserId?: string | null) {
  if (!ownerUserId) return;
  await prisma.enquiryThread.updateMany({
    where: { id: threadId, crmOwnerUserId: null },
    data: { crmOwnerUserId: ownerUserId, crmOwnerAssigned: false }
  });
}

/** @deprecated First reply no longer moves New → Contacted. Kept as an owner claim. */
export async function markChatPipelineContacted(threadId: string, ownerUserId?: string | null) {
  await claimChatOwnerIfEmpty(threadId, ownerUserId);
}

export async function markChatPipelineFollowup(threadId: string) {
  await prisma.enquiryThread.updateMany({
    where: {
      id: threadId,
      crmPipeline: { notIn: ["COMPLETED", "NOT_INTERESTED", "UNQUALIFIED", "WON", "LOST"] }
    },
    data: { crmPipeline: "FOLLOWUP" }
  });
}

export async function markChatPipelineQuotationSent(threadId: string) {
  await prisma.enquiryThread.updateMany({
    where: {
      id: threadId,
      crmPipeline: { in: ["NEW", "CONTACTED", "ONGOING"] }
    },
    data: { crmPipeline: "QUOTATION_SENT" }
  });
}

const pipelineSelect = {
  id: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  waPhone: true,
  orderNumber: true,
  source: true,
  crmPipeline: true,
  crmCategory: true,
  crmCategories: true,
  crmOwnerAssigned: true,
  crmOwner: { select: ownerSelect },
  crmCollaborators: {
    select: { user: { select: ownerSelect } }
  },
  crmNotes: {
    orderBy: { createdAt: "desc" as const },
    take: 40,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true } }
    }
  }
};

export async function getChatPipeline(threadId: string) {
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: pipelineSelect
  });
  if (!thread) return null;
  return {
    ...present(thread),
    crmCollaborators: thread.crmCollaborators.map((row) => row.user)
  };
}

export async function setChatPipeline(threadId: string, status: CrmChatPipeline | string, actorId?: string | null) {
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { id: true, crmOwnerUserId: true }
  });
  if (!thread) throw fail("Chat not found", 404);
  const next = normalizeChatPipeline(status);
  const ownerId = nextChatOwner({
    currentOwnerId: thread.crmOwnerUserId,
    claimantId: actorId
  });
  await prisma.enquiryThread.update({
    where: { id: threadId },
    data: {
      crmPipeline: next,
      ...(ownerId ? { crmOwnerUserId: ownerId } : {})
    }
  });
  return getChatPipeline(threadId);
}

async function applyCategoryRouting(threadId: string, categories: CrmChatCategory[]) {
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { crmOwnerUserId: true }
  });
  if (!thread) return;
  const extraIds = new Set<string>();
  let ownerId = thread.crmOwnerUserId;
  for (const category of categories) {
    const route = CATEGORY_ROUTING[category];
    if (!route) continue;
    if (route.ownerEmail) {
      const owner = await findStaffByEmail(route.ownerEmail);
      if (owner) {
        if (!ownerId) ownerId = owner.id;
        else if (owner.id !== ownerId) extraIds.add(owner.id);
      }
    }
    for (const email of route.collaboratorEmails) {
      const user = await findStaffByEmail(email);
      if (user && user.id !== ownerId) extraIds.add(user.id);
    }
  }
  await prisma.enquiryThread.update({
    where: { id: threadId },
    data: { crmOwnerUserId: ownerId }
  });
  if (extraIds.size === 0) return;
  await prisma.crmChatCollaborator.createMany({
    data: [...extraIds].map((userId) => ({ threadId, userId })),
    skipDuplicates: true
  });
}

export async function setChatCategories(threadId: string, categories: CrmChatCategory[]) {
  const unique = [...new Set(categories)];
  const updated = await prisma.enquiryThread
    .update({
      where: { id: threadId },
      data: {
        crmCategories: unique,
        crmCategory: unique[0] ?? null
      },
      select: { id: true }
    })
    .catch(() => null);
  if (!updated) throw fail("Chat not found", 404);
  await applyCategoryRouting(threadId, unique);
  return getChatPipeline(threadId);
}

export async function setChatCategory(threadId: string, category: CrmChatCategory | null) {
  if (!category) return setChatCategories(threadId, []);
  const current = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { crmCategories: true, crmCategory: true }
  });
  if (!current) throw fail("Chat not found", 404);
  const existing =
    current.crmCategories.length > 0
      ? current.crmCategories
      : current.crmCategory
        ? [current.crmCategory]
        : [];
  const next = existing.includes(category)
    ? existing.filter((item) => item !== category)
    : [...existing, category];
  return setChatCategories(threadId, next);
}

export async function setChatOwner(
  threadId: string,
  ownerUserId: string | null,
  actor?: { id: string; name?: string | null; email?: string | null }
) {
  if (ownerUserId) {
    const owner = await prisma.user.findFirst({
      where: { id: ownerUserId, role: { in: ["ADMIN", "SUPER_ADMIN"] }, deletedAt: null },
      select: { id: true, name: true, email: true }
    });
    if (!owner) throw fail("Select a valid admin", 400);
  }
  const updated = await prisma.enquiryThread
    .update({
      where: { id: threadId },
      data: {
        crmOwnerUserId: ownerUserId,
        crmOwnerAssigned: Boolean(ownerUserId)
      },
      select: { id: true, customerName: true }
    })
    .catch(() => null);
  if (!updated) throw fail("Chat not found", 404);
  if (ownerUserId) {
    await prisma.crmChatCollaborator.deleteMany({
      where: { threadId, userId: ownerUserId }
    });
  }
  const card = await getChatPipeline(threadId);
  if (ownerUserId && ownerUserId !== actor?.id) {
    const assignee =
      card?.crmOwner?.name?.trim() ||
      card?.crmOwner?.email?.split("@")[0] ||
      "you";
    const customer = updated.customerName.trim() || "a customer";
    const by =
      actor?.name?.trim() ||
      actor?.email?.split("@")[0] ||
      "Admin";
    void import("../../config/firebase")
      .then(({ sendPushToAdminUser }) =>
        sendPushToAdminUser(
          ownerUserId,
          "Chat assigned to you",
          `${customer} — assigned by ${by}`,
          {
            type: "chat_assigned",
            chatId: threadId,
            link: `/admin/chats/${threadId}`
          }
        )
      )
      .catch((err: unknown) =>
        logger.warn("chat_assign_push_failed", {
          threadId,
          assignee,
          error: err instanceof Error ? err.message : String(err)
        })
      );
  }
  return card;
}

export async function setChatCollaborators(threadId: string, userIds: string[]) {
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { id: true, crmOwnerUserId: true }
  });
  if (!thread) throw fail("Chat not found", 404);
  const unique = [...new Set(userIds)].filter((id) => id !== thread.crmOwnerUserId);
  const staff = unique.length
    ? await prisma.user.findMany({
        where: { id: { in: unique }, role: { in: ["ADMIN", "SUPER_ADMIN"] }, deletedAt: null },
        select: { id: true }
      })
    : [];
  const allowed = new Set(staff.map((row) => row.id));
  await prisma.$transaction([
    prisma.crmChatCollaborator.deleteMany({ where: { threadId } }),
    ...(allowed.size
      ? [
          prisma.crmChatCollaborator.createMany({
            data: [...allowed].map((userId) => ({ threadId, userId }))
          })
        ]
      : [])
  ]);
  return getChatPipeline(threadId);
}

export async function addChatNote(threadId: string, body: string, authorUserId: string) {
  const text = body.trim();
  if (!text) throw fail("Write a note first", 400);
  if (text.length > 4000) throw fail("Note is too long", 400);
  const thread = await prisma.enquiryThread.findUnique({ where: { id: threadId }, select: { id: true } });
  if (!thread) throw fail("Chat not found", 404);
  await prisma.crmChatNote.create({
    data: { threadId, body: text, authorUserId }
  });
  return getChatPipeline(threadId);
}

export async function chatPipelineBoard(input: {
  actorId: string;
  seeAll: boolean;
  status?: CrmChatPipeline | null;
  ownerId?: string | null;
  from?: Date | null;
  to?: Date | null;
}) {
  const scope: Prisma.EnquiryThreadWhereInput = input.seeAll
    ? input.ownerId
      ? { crmOwnerUserId: input.ownerId }
      : {}
    : { OR: [{ crmOwnerUserId: input.actorId }, { crmOwnerUserId: null }] };
  const createdAt =
    input.from || input.to
      ? { gte: input.from ?? undefined, lte: input.to ?? undefined }
      : undefined;
  const scoped: Prisma.EnquiryThreadWhereInput = { ...scope, ...(createdAt ? { createdAt } : {}) };
  const wanted = input.status ? normalizeChatPipeline(input.status) : null;
  const statusWhere: Prisma.EnquiryThreadWhereInput = wanted
    ? {
        crmPipeline: {
          in: Object.entries(LEGACY_PIPELINE)
            .filter(([, mapped]) => mapped === wanted)
            .map(([legacy]) => legacy as CrmChatPipeline)
            .concat(wanted)
        }
      }
    : {};
  const [counts, followUps, rows, owners] = await Promise.all([
    prisma.enquiryThread.groupBy({ by: ["crmPipeline"], where: scoped, _count: { _all: true } }),
    prisma.enquiryFollowUp.findMany({
      where: { status: "OPEN", thread: scoped },
      orderBy: { dueAt: "asc" },
      take: 40,
      select: {
        id: true,
        notes: true,
        dueAt: true,
        thread: {
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            crmPipeline: true,
            crmOwner: { select: ownerSelect }
          }
        }
      }
    }),
    prisma.enquiryThread.findMany({
      where: { ...scoped, ...statusWhere },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        waPhone: true,
        crmPipeline: true,
        createdAt: true,
        crmOwner: { select: ownerSelect }
      }
    }),
    input.seeAll
      ? prisma.user.findMany({
          where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, deletedAt: null },
          select: ownerSelect,
          orderBy: [{ name: "asc" }, { email: "asc" }]
        })
      : Promise.resolve([])
  ]);
  const byStatus = Object.fromEntries(CHAT_PIPELINE_STATUSES.map((status) => [status, 0])) as Record<
    string,
    number
  >;
  for (const row of counts) {
    const key = normalizeChatPipeline(row.crmPipeline);
    byStatus[key] = (byStatus[key] ?? 0) + row._count._all;
  }
  return {
    seeAll: input.seeAll,
    byStatus,
    followUps: followUps.map((row) => ({
      ...row,
      thread: { ...row.thread, crmPipeline: normalizeChatPipeline(row.thread.crmPipeline) }
    })),
    rows: rows.map((row) => ({
      id: row.id,
      customerName: row.customerName,
      phone: row.waPhone || row.customerPhone,
      crmPipeline: normalizeChatPipeline(row.crmPipeline),
      createdAt: row.createdAt,
      owner: row.crmOwner
    })),
    owners
  };
}

export async function chatPipelineDesk() {
  return chatPipelineBoard({
    actorId: "",
    seeAll: true
  });
}
