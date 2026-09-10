import type { CrmActivityType, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { crmBadRequest, crmNotFound } from "./crm-errors";
import { paginationMeta, parseDateTime, toJson } from "./crm.utils";

export async function createActivity(
  input: {
    type: CrmActivityType;
    subject?: string | null;
    body?: string | null;
    occurredAt?: string | null;
    accountId?: string | null;
    contactId?: string | null;
    leadId?: string | null;
    dealId?: string | null;
    enquiryThreadId?: string | null;
    quotationId?: string | null;
    orderId?: string | null;
    externalProvider?: string | null;
    externalRef?: string | null;
    metadata?: unknown;
  },
  actorUserId: string
) {
  if (
    !input.accountId &&
    !input.contactId &&
    !input.leadId &&
    !input.dealId &&
    !input.enquiryThreadId
  ) {
    throw crmBadRequest("Activity must reference at least one CRM/enquiry entity");
  }

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
  if (
    input.enquiryThreadId &&
    !(await prisma.enquiryThread.findUnique({ where: { id: input.enquiryThreadId } }))
  ) {
    throw crmNotFound("EnquiryThread");
  }
  if (input.quotationId && !(await prisma.quotation.findUnique({ where: { id: input.quotationId } }))) {
    throw crmNotFound("Quotation");
  }
  if (
    input.orderId &&
    !(await prisma.order.findFirst({ where: { id: input.orderId, deletedAt: null } }))
  ) {
    throw crmNotFound("Order");
  }

  return prisma.crmActivity.create({
    data: {
      type: input.type,
      subject: input.subject ?? null,
      body: input.body ?? null,
      occurredAt: parseDateTime(input.occurredAt) ?? new Date(),
      actorUserId,
      accountId: input.accountId ?? null,
      contactId: input.contactId ?? null,
      leadId: input.leadId ?? null,
      dealId: input.dealId ?? null,
      enquiryThreadId: input.enquiryThreadId ?? null,
      quotationId: input.quotationId ?? null,
      orderId: input.orderId ?? null,
      externalProvider: input.externalProvider ?? null,
      externalRef: input.externalRef ?? null,
      metadata: toJson(input.metadata) as Prisma.InputJsonValue | undefined
    }
  });
}

export async function listActivities(query: {
  page: number;
  limit: number;
  accountId?: string;
  contactId?: string;
  leadId?: string;
  dealId?: string;
  type?: CrmActivityType;
  sortOrder?: "asc" | "desc";
}) {
  const where: Prisma.CrmActivityWhereInput = {
    AND: [
      query.accountId ? { accountId: query.accountId } : {},
      query.contactId ? { contactId: query.contactId } : {},
      query.leadId ? { leadId: query.leadId } : {},
      query.dealId ? { dealId: query.dealId } : {},
      query.type ? { type: query.type } : {}
    ]
  };
  const skip = (query.page - 1) * query.limit;
  const [total, items] = await prisma.$transaction([
    prisma.crmActivity.count({ where }),
    prisma.crmActivity.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { occurredAt: query.sortOrder ?? "desc" },
      include: {
        actor: { select: { id: true, name: true, email: true } }
      }
    })
  ]);
  return { items, pagination: paginationMeta(query.page, query.limit, total) };
}
