import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { crmConflict, crmNotFound } from "./crm-errors";
import { nextCrmNumberInTx } from "./crm-number";
import {
  assertAdminUserId,
  assertAnyUserId,
  paginationMeta,
  toJson,
  userSummarySelect
} from "./crm.utils";

function contactSearchWhere(search?: string): Prisma.CrmContactWhereInput | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  return {
    OR: [
      { contactNumber: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { whatsappPhone: { contains: q, mode: "insensitive" } }
    ]
  };
}

export async function listContacts(query: {
  page: number;
  limit: number;
  search?: string;
  q?: string;
  accountId?: string;
  ownerUserId?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const where: Prisma.CrmContactWhereInput = {
    AND: [
      contactSearchWhere(query.search ?? query.q) ?? {},
      query.accountId ? { accountId: query.accountId } : {},
      query.ownerUserId ? { ownerUserId: query.ownerUserId } : {},
      query.isActive === undefined ? {} : { isActive: query.isActive }
    ]
  };
  const sortable = new Set(["createdAt", "displayName", "updatedAt"]);
  const sortBy = query.sortBy && sortable.has(query.sortBy) ? query.sortBy : "createdAt";
  const skip = (query.page - 1) * query.limit;
  const [total, items] = await prisma.$transaction([
    prisma.crmContact.count({ where }),
    prisma.crmContact.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { [sortBy]: query.sortOrder ?? "desc" },
      include: {
        owner: { select: userSummarySelect },
        account: { select: { id: true, name: true, accountNumber: true } },
        linkedUser: { select: userSummarySelect }
      }
    })
  ]);
  return { items, pagination: paginationMeta(query.page, query.limit, total) };
}

export async function getContact(id: string) {
  const contact = await prisma.crmContact.findUnique({
    where: { id },
    include: {
      owner: { select: userSummarySelect },
      account: true,
      linkedUser: { select: userSummarySelect },
      deals: { orderBy: { updatedAt: "desc" }, take: 20, include: { stage: true } },
      tasks: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: { dueAt: "asc" },
        take: 20
      },
      activities: { orderBy: { occurredAt: "desc" }, take: 20 }
    }
  });
  if (!contact) throw crmNotFound("Contact");
  return contact;
}

export async function createContact(
  input: {
    accountId?: string | null;
    linkedUserId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    displayName: string;
    email?: string | null;
    phone?: string | null;
    whatsappPhone?: string | null;
    designation?: string | null;
    department?: string | null;
    preferredLanguage?: string | null;
    ownerUserId?: string | null;
    source?: Prisma.EnumCrmLeadSourceFilter["equals"] | null;
    notes?: string | null;
    customFields?: unknown;
    isActive?: boolean;
  },
  actorId: string
) {
  if (input.accountId) {
    const acc = await prisma.crmAccount.findUnique({ where: { id: input.accountId } });
    if (!acc) throw crmNotFound("Account");
  }
  const linkedUserId = await assertAnyUserId(input.linkedUserId);
  if (linkedUserId) {
    const existing = await prisma.crmContact.findUnique({ where: { linkedUserId } });
    if (existing) throw crmConflict("User already linked to another CRM contact", "USER_ALREADY_LINKED");
  }
  const ownerUserId = await assertAdminUserId(input.ownerUserId ?? actorId);

  try {
    return await prisma.$transaction(async (tx) => {
      const contactNumber = await nextCrmNumberInTx(tx, "CON");
      return tx.crmContact.create({
        data: {
          contactNumber,
          accountId: input.accountId ?? null,
          linkedUserId,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          displayName: input.displayName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          whatsappPhone: input.whatsappPhone ?? null,
          designation: input.designation ?? null,
          department: input.department ?? null,
          preferredLanguage: input.preferredLanguage ?? null,
          ownerUserId,
          source: input.source ?? null,
          notes: input.notes ?? null,
          customFields: toJson(input.customFields) as Prisma.InputJsonValue | undefined,
          isActive: input.isActive ?? true
        },
        include: {
          owner: { select: userSummarySelect },
          account: { select: { id: true, name: true } },
          linkedUser: { select: userSummarySelect }
        }
      });
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw crmConflict("User already linked to another CRM contact", "USER_ALREADY_LINKED");
    }
    throw err;
  }
}

export async function updateContact(id: string, input: Record<string, unknown>) {
  const existing = await prisma.crmContact.findUnique({ where: { id } });
  if (!existing) throw crmNotFound("Contact");

  if (input.accountId) {
    const acc = await prisma.crmAccount.findUnique({ where: { id: input.accountId as string } });
    if (!acc) throw crmNotFound("Account");
  }

  let linkedUserId: string | null | undefined = undefined;
  if (input.linkedUserId !== undefined) {
    linkedUserId = await assertAnyUserId(input.linkedUserId as string | null);
    if (linkedUserId) {
      const clash = await prisma.crmContact.findFirst({
        where: { linkedUserId, NOT: { id } }
      });
      if (clash) throw crmConflict("User already linked to another CRM contact", "USER_ALREADY_LINKED");
    }
  }

  const ownerUserId =
    input.ownerUserId === undefined
      ? undefined
      : await assertAdminUserId(input.ownerUserId as string | null);

  try {
    return await prisma.crmContact.update({
      where: { id },
      data: {
        ...(input.accountId !== undefined
          ? {
              account: input.accountId
                ? { connect: { id: input.accountId as string } }
                : { disconnect: true }
            }
          : {}),
        ...(linkedUserId !== undefined
          ? {
              linkedUser: linkedUserId
                ? { connect: { id: linkedUserId } }
                : { disconnect: true }
            }
          : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName as string | null } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName as string | null } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName as string } : {}),
        ...(input.email !== undefined ? { email: input.email as string | null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone as string | null } : {}),
        ...(input.whatsappPhone !== undefined
          ? { whatsappPhone: input.whatsappPhone as string | null }
          : {}),
        ...(input.designation !== undefined
          ? { designation: input.designation as string | null }
          : {}),
        ...(input.department !== undefined ? { department: input.department as string | null } : {}),
        ...(input.preferredLanguage !== undefined
          ? { preferredLanguage: input.preferredLanguage as string | null }
          : {}),
        ...(ownerUserId !== undefined
          ? { owner: ownerUserId ? { connect: { id: ownerUserId } } : { disconnect: true } }
          : {}),
        ...(input.source !== undefined ? { source: input.source as never } : {}),
        ...(input.notes !== undefined ? { notes: input.notes as string | null } : {}),
        ...(input.customFields !== undefined
          ? { customFields: toJson(input.customFields) as Prisma.InputJsonValue }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive as boolean } : {})
      },
      include: {
        owner: { select: userSummarySelect },
        account: { select: { id: true, name: true } },
        linkedUser: { select: userSummarySelect }
      }
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw crmConflict("User already linked to another CRM contact", "USER_ALREADY_LINKED");
    }
    throw err;
  }
}
