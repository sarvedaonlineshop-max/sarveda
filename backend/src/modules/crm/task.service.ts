import type { CrmTaskPriority, CrmTaskStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { crmNotFound } from "./crm-errors";
import {
  assertAdminUserId,
  paginationMeta,
  parseDateTime,
  userSummarySelect
} from "./crm.utils";

export async function listTasks(query: {
  page: number;
  limit: number;
  assignedToUserId?: string;
  status?: CrmTaskStatus;
  priority?: CrmTaskPriority;
  dueFrom?: string | null;
  dueTo?: string | null;
  leadId?: string;
  dealId?: string;
  accountId?: string;
  contactId?: string;
  overdue?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const now = new Date();
  const where: Prisma.CrmTaskWhereInput = {
    AND: [
      query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {},
      query.status ? { status: query.status } : {},
      query.priority ? { priority: query.priority } : {},
      query.leadId ? { leadId: query.leadId } : {},
      query.dealId ? { dealId: query.dealId } : {},
      query.accountId ? { accountId: query.accountId } : {},
      query.contactId ? { contactId: query.contactId } : {},
      query.dueFrom || query.dueTo
        ? {
            dueAt: {
              ...(query.dueFrom ? { gte: parseDateTime(query.dueFrom)! } : {}),
              ...(query.dueTo ? { lte: parseDateTime(query.dueTo)! } : {})
            }
          }
        : {},
      query.overdue
        ? {
            dueAt: { lt: now },
            status: { in: ["OPEN", "IN_PROGRESS"] }
          }
        : {}
    ]
  };
  const sortable = new Set(["createdAt", "dueAt", "priority", "status", "updatedAt"]);
  const sortBy = query.sortBy && sortable.has(query.sortBy) ? query.sortBy : "dueAt";
  const skip = (query.page - 1) * query.limit;
  const [total, items] = await prisma.$transaction([
    prisma.crmTask.count({ where }),
    prisma.crmTask.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { [sortBy]: query.sortOrder ?? "asc" },
      include: {
        assignedTo: { select: userSummarySelect },
        createdBy: { select: userSummarySelect }
      }
    })
  ]);
  return { items, pagination: paginationMeta(query.page, query.limit, total) };
}

export async function getTask(id: string) {
  const task = await prisma.crmTask.findUnique({
    where: { id },
    include: {
      assignedTo: { select: userSummarySelect },
      createdBy: { select: userSummarySelect },
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, displayName: true } },
      lead: { select: { id: true, name: true, leadNumber: true } },
      deal: { select: { id: true, name: true, dealNumber: true } }
    }
  });
  if (!task) throw crmNotFound("Task");
  return task;
}

export async function createTask(
  input: {
    title: string;
    description?: string | null;
    status?: CrmTaskStatus;
    priority?: CrmTaskPriority;
    dueAt?: string | null;
    reminderAt?: string | null;
    assignedToUserId?: string | null;
    accountId?: string | null;
    contactId?: string | null;
    leadId?: string | null;
    dealId?: string | null;
  },
  createdByUserId: string
) {
  const assignedToUserId = await assertAdminUserId(input.assignedToUserId ?? createdByUserId);
  if (input.accountId && !(await prisma.crmAccount.findUnique({ where: { id: input.accountId } }))) {
    throw crmNotFound("Account");
  }
  if (input.contactId && !(await prisma.crmContact.findUnique({ where: { id: input.contactId } }))) {
    throw crmNotFound("Contact");
  }
  if (input.leadId && !(await prisma.crmLead.findUnique({ where: { id: input.leadId } }))) {
    throw crmNotFound("Lead");
  }
  if (input.dealId && !(await prisma.crmDeal.findUnique({ where: { id: input.dealId } }))) {
    throw crmNotFound("Deal");
  }

  const status = input.status ?? "OPEN";
  return prisma.crmTask.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? "MEDIUM",
      dueAt: parseDateTime(input.dueAt),
      reminderAt: parseDateTime(input.reminderAt),
      completedAt: status === "COMPLETED" ? new Date() : null,
      assignedToUserId,
      createdByUserId,
      accountId: input.accountId ?? null,
      contactId: input.contactId ?? null,
      leadId: input.leadId ?? null,
      dealId: input.dealId ?? null
    },
    include: {
      assignedTo: { select: userSummarySelect },
      createdBy: { select: userSummarySelect }
    }
  });
}

export async function updateTask(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    status?: CrmTaskStatus;
    priority?: CrmTaskPriority;
    dueAt?: string | null;
    reminderAt?: string | null;
    assignedToUserId?: string | null;
    accountId?: string | null;
    contactId?: string | null;
    leadId?: string | null;
    dealId?: string | null;
  }
) {
  const existing = await prisma.crmTask.findUnique({ where: { id } });
  if (!existing) throw crmNotFound("Task");

  const assignedToUserId =
    input.assignedToUserId === undefined
      ? undefined
      : await assertAdminUserId(input.assignedToUserId);

  let completedAt: Date | null | undefined = undefined;
  if (input.status === "COMPLETED" && existing.status !== "COMPLETED") {
    completedAt = new Date();
  } else if (
    input.status &&
    input.status !== "COMPLETED" &&
    existing.status === "COMPLETED"
  ) {
    completedAt = null;
  }

  return prisma.crmTask.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.dueAt !== undefined ? { dueAt: parseDateTime(input.dueAt) } : {}),
      ...(input.reminderAt !== undefined ? { reminderAt: parseDateTime(input.reminderAt) } : {}),
      ...(assignedToUserId !== undefined
        ? {
            assignedTo: assignedToUserId
              ? { connect: { id: assignedToUserId } }
              : { disconnect: true }
          }
        : {}),
      ...(input.accountId !== undefined
        ? {
            account: input.accountId
              ? { connect: { id: input.accountId } }
              : { disconnect: true }
          }
        : {}),
      ...(input.contactId !== undefined
        ? {
            contact: input.contactId
              ? { connect: { id: input.contactId } }
              : { disconnect: true }
          }
        : {}),
      ...(input.leadId !== undefined
        ? { lead: input.leadId ? { connect: { id: input.leadId } } : { disconnect: true } }
        : {}),
      ...(input.dealId !== undefined
        ? { deal: input.dealId ? { connect: { id: input.dealId } } : { disconnect: true } }
        : {}),
      ...(completedAt !== undefined ? { completedAt } : {})
    },
    include: {
      assignedTo: { select: userSummarySelect },
      createdBy: { select: userSummarySelect }
    }
  });
}
