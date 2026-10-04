import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { crmNotFound } from "./crm-errors";
import { nextCrmNumberInTx } from "./crm-number";
import {
  assertAdminUserId,
  paginationMeta,
  toJson,
  userSummarySelect
} from "./crm.utils";

function accountSearchWhere(search?: string): Prisma.CrmAccountWhereInput | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  return {
    OR: [
      { accountNumber: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { gstin: { contains: q, mode: "insensitive" } }
    ]
  };
}

export async function listAccounts(query: {
  page: number;
  limit: number;
  search?: string;
  q?: string;
  ownerUserId?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const where: Prisma.CrmAccountWhereInput = {
    AND: [
      accountSearchWhere(query.search ?? query.q) ?? {},
      query.ownerUserId ? { ownerUserId: query.ownerUserId } : {},
      query.isActive === undefined ? {} : { isActive: query.isActive }
    ]
  };
  const sortable = new Set(["createdAt", "name", "updatedAt"]);
  const sortBy = query.sortBy && sortable.has(query.sortBy) ? query.sortBy : "createdAt";
  const skip = (query.page - 1) * query.limit;
  const [total, items] = await prisma.$transaction([
    prisma.crmAccount.count({ where }),
    prisma.crmAccount.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { [sortBy]: query.sortOrder ?? "desc" },
      include: { owner: { select: userSummarySelect }, _count: { select: { contacts: true, deals: true } } }
    })
  ]);
  return { items, pagination: paginationMeta(query.page, query.limit, total) };
}

export async function getAccount(id: string) {
  const account = await prisma.crmAccount.findUnique({
    where: { id },
    include: {
      owner: { select: userSummarySelect },
      contacts: { where: { isActive: true }, orderBy: { displayName: "asc" }, take: 50 },
      deals: {
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: { stage: true, pipeline: true }
      },
      tasks: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: { dueAt: "asc" },
        take: 20
      },
      activities: { orderBy: { occurredAt: "desc" }, take: 20 }
    }
  });
  if (!account) throw crmNotFound("Account");

  const emails = [
    account.email,
    ...account.contacts.map((c) => c.email).filter(Boolean)
  ].filter((e): e is string => Boolean(e));

  let commercialSummary: {
    orderCount: number;
    totalSalesInPaise: number;
    lastOrderAt: Date | null;
  } | null = null;

  if (emails.length) {
    const orders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        email: { in: emails, mode: "insensitive" },
        status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] }
      },
      select: { grandTotalInPaise: true, placedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    commercialSummary = {
      orderCount: orders.length,
      totalSalesInPaise: orders.reduce((s, o) => s + o.grandTotalInPaise, 0),
      lastOrderAt: orders[0]?.placedAt ?? orders[0]?.createdAt ?? null
    };
  }

  return { ...account, commercialSummary };
}

export async function createAccount(
  input: {
    kind?: "ORGANIZATION" | "INDIVIDUAL";
    name: string;
    displayName?: string | null;
    industry?: string | null;
    website?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsappPhone?: string | null;
    gstin?: string | null;
    billingAddress?: unknown;
    shippingAddress?: unknown;
    ownerUserId?: string | null;
    source?: Prisma.EnumCrmLeadSourceFilter["equals"] | null;
    notes?: string | null;
    customFields?: unknown;
    isActive?: boolean;
  },
  actorId: string
) {
  const ownerUserId = await assertAdminUserId(input.ownerUserId ?? actorId);
  return prisma.$transaction(async (tx) => {
    const accountNumber = await nextCrmNumberInTx(tx, "ACC");
    return tx.crmAccount.create({
      data: {
        accountNumber,
        kind: input.kind ?? "ORGANIZATION",
        name: input.name,
        displayName: input.displayName ?? input.name,
        industry: input.industry ?? null,
        website: input.website ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        whatsappPhone: input.whatsappPhone ?? null,
        gstin: input.gstin ?? null,
        billingAddress: toJson(input.billingAddress) as Prisma.InputJsonValue | undefined,
        shippingAddress: toJson(input.shippingAddress) as Prisma.InputJsonValue | undefined,
        ownerUserId,
        source: input.source ?? null,
        notes: input.notes ?? null,
        customFields: toJson(input.customFields) as Prisma.InputJsonValue | undefined,
        isActive: input.isActive ?? true
      },
      include: { owner: { select: userSummarySelect } }
    });
  });
}

export async function updateAccount(
  id: string,
  input: Record<string, unknown>
) {
  const existing = await prisma.crmAccount.findUnique({ where: { id } });
  if (!existing) throw crmNotFound("Account");
  const ownerUserId =
    input.ownerUserId === undefined
      ? undefined
      : await assertAdminUserId(input.ownerUserId as string | null);

  return prisma.crmAccount.update({
    where: { id },
    data: {
      ...(input.kind !== undefined ? { kind: input.kind as never } : {}),
      ...(input.name !== undefined ? { name: input.name as string } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName as string | null } : {}),
      ...(input.industry !== undefined ? { industry: input.industry as string | null } : {}),
      ...(input.website !== undefined ? { website: input.website as string | null } : {}),
      ...(input.email !== undefined ? { email: input.email as string | null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone as string | null } : {}),
      ...(input.whatsappPhone !== undefined
        ? { whatsappPhone: input.whatsappPhone as string | null }
        : {}),
      ...(input.gstin !== undefined ? { gstin: input.gstin as string | null } : {}),
      ...(input.billingAddress !== undefined
        ? { billingAddress: toJson(input.billingAddress) as Prisma.InputJsonValue }
        : {}),
      ...(input.shippingAddress !== undefined
        ? { shippingAddress: toJson(input.shippingAddress) as Prisma.InputJsonValue }
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
    include: { owner: { select: userSummarySelect } }
  });
}
