import type { CrmLeadStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { writeAdminActivity } from "../../middleware/adminActivity";
import { crmBadRequest, crmConflict, crmNotFound } from "./crm-errors";
import { nextCrmNumberInTx } from "./crm-number";
import type { ConvertLeadInput, CreateLeadInput, UpdateLeadInput } from "./crm.schemas";
import {
  assertAdminUserId,
  paginationMeta,
  parseDateOnly,
  parseDateTime,
  toJson,
  userSummarySelect
} from "./crm.utils";
import { requireDefaultPipelineStage } from "./pipeline.service";

function leadSearchWhere(search?: string): Prisma.CrmLeadWhereInput | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  return {
    OR: [
      { leadNumber: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { whatsappPhone: { contains: q, mode: "insensitive" } }
    ]
  };
}

export async function listLeads(query: {
  page: number;
  limit: number;
  search?: string;
  q?: string;
  status?: CrmLeadStatus;
  source?: Prisma.EnumCrmLeadSourceFilter["equals"];
  ownerUserId?: string;
  createdFrom?: string | null;
  createdTo?: string | null;
  nextFollowUpFrom?: string | null;
  nextFollowUpTo?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const where: Prisma.CrmLeadWhereInput = {
    AND: [
      leadSearchWhere(query.search ?? query.q) ?? {},
      query.status ? { status: query.status } : {},
      query.source ? { source: query.source } : {},
      query.ownerUserId ? { ownerUserId: query.ownerUserId } : {},
      query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: parseDateTime(query.createdFrom)! } : {}),
              ...(query.createdTo ? { lte: parseDateTime(query.createdTo)! } : {})
            }
          }
        : {},
      query.nextFollowUpFrom || query.nextFollowUpTo
        ? {
            nextFollowUpAt: {
              ...(query.nextFollowUpFrom ? { gte: parseDateTime(query.nextFollowUpFrom)! } : {}),
              ...(query.nextFollowUpTo ? { lte: parseDateTime(query.nextFollowUpTo)! } : {})
            }
          }
        : {}
    ]
  };

  const sortable = new Set([
    "createdAt",
    "updatedAt",
    "name",
    "status",
    "nextFollowUpAt",
    "estimatedValueInPaise"
  ]);
  const sortBy = query.sortBy && sortable.has(query.sortBy) ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ?? "desc";
  const skip = (query.page - 1) * query.limit;

  const [total, items] = await prisma.$transaction([
    prisma.crmLead.count({ where }),
    prisma.crmLead.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        owner: { select: userSummarySelect },
        enquiryThread: {
          select: { id: true, customerName: true, customerEmail: true, status: true, source: true }
        }
      }
    })
  ]);

  return { items, pagination: paginationMeta(query.page, query.limit, total) };
}

export async function getLead(id: string) {
  const lead = await prisma.crmLead.findUnique({
    where: { id },
    include: {
      owner: { select: userSummarySelect },
      enquiryThread: {
        select: {
          id: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          status: true,
          source: true,
          lastMessageAt: true
        }
      },
      convertedAccount: { select: { id: true, accountNumber: true, name: true } },
      convertedContact: { select: { id: true, contactNumber: true, displayName: true } },
      convertedDeal: { select: { id: true, dealNumber: true, name: true, status: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 20 },
      tasks: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: { dueAt: "asc" },
        take: 20
      }
    }
  });
  if (!lead) throw crmNotFound("Lead");
  return lead;
}

export async function createLead(
  input: CreateLeadInput,
  actor: { id: string; email: string; name?: string | null }
) {
  const ownerUserId = await assertAdminUserId(input.ownerUserId ?? actor.id);
  if (input.enquiryThreadId) {
    const thread = await prisma.enquiryThread.findUnique({ where: { id: input.enquiryThreadId } });
    if (!thread) throw crmNotFound("EnquiryThread");
    const existing = await prisma.crmLead.findUnique({
      where: { enquiryThreadId: input.enquiryThreadId }
    });
    if (existing) throw crmConflict("Enquiry thread already linked to a lead", "ENQUIRY_LINKED");
  }

  const lead = await prisma.$transaction(async (tx) => {
    const leadNumber = await nextCrmNumberInTx(tx, "LEAD");
    return tx.crmLead.create({
      data: {
        leadNumber,
        name: input.name,
        companyName: input.companyName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        whatsappPhone: input.whatsappPhone ?? null,
        designation: input.designation ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? "IN",
        source: input.source ?? "OTHER",
        status: input.status && input.status !== "CONVERTED" ? input.status : "NEW",
        ownerUserId,
        estimatedValueInPaise: input.estimatedValueInPaise ?? null,
        currency: input.currency ?? "INR",
        expectedCloseDate: parseDateOnly(input.expectedCloseDate),
        interestSummary: input.interestSummary ?? null,
        attributionJson: toJson(input.attributionJson) as Prisma.InputJsonValue | undefined,
        customFields: toJson(input.customFields) as Prisma.InputJsonValue | undefined,
        enquiryThreadId: input.enquiryThreadId ?? null,
        nextFollowUpAt: parseDateTime(input.nextFollowUpAt),
        lastContactedAt: input.status === "CONTACTED" ? new Date() : null
      },
      include: { owner: { select: userSummarySelect } }
    });
  });

  await writeAdminActivity({
    actorUserId: actor.id,
    actorEmail: actor.email,
    actorName: actor.name ?? null,
    action: "CREATE",
    resource: "crm",
    summary: `CRM lead created ${lead.leadNumber ?? lead.id}`,
    method: "POST",
    path: "/api/admin/crm/leads",
    entityId: lead.id
  });

  await prisma.crmActivity.create({
    data: {
      type: "SYSTEM",
      subject: "Lead created",
      body: `Lead ${lead.leadNumber} created`,
      actorUserId: actor.id,
      leadId: lead.id
    }
  });

  return lead;
}

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
  actor: { id: string; email: string; name?: string | null }
) {
  const existing = await prisma.crmLead.findUnique({ where: { id } });
  if (!existing) throw crmNotFound("Lead");
  if (input.status === "CONVERTED") {
    throw crmBadRequest("Use POST /leads/:id/convert to convert a lead", "USE_CONVERT_ENDPOINT");
  }
  if (existing.status === "CONVERTED" && input.status) {
    throw crmConflict("Converted leads cannot change status via patch", "LEAD_CONVERTED");
  }
  if (input.enquiryThreadId) {
    const thread = await prisma.enquiryThread.findUnique({ where: { id: input.enquiryThreadId } });
    if (!thread) throw crmNotFound("EnquiryThread");
    const linked = await prisma.crmLead.findFirst({
      where: { enquiryThreadId: input.enquiryThreadId, NOT: { id } }
    });
    if (linked) throw crmConflict("Enquiry thread already linked to a lead", "ENQUIRY_LINKED");
  }

  const ownerUserId =
    input.ownerUserId === undefined
      ? undefined
      : await assertAdminUserId(input.ownerUserId);

  const data: Prisma.CrmLeadUpdateInput = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.whatsappPhone !== undefined ? { whatsappPhone: input.whatsappPhone } : {}),
    ...(input.designation !== undefined ? { designation: input.designation } : {}),
    ...(input.city !== undefined ? { city: input.city } : {}),
    ...(input.state !== undefined ? { state: input.state } : {}),
    ...(input.country !== undefined ? { country: input.country } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(ownerUserId !== undefined ? { owner: ownerUserId ? { connect: { id: ownerUserId } } : { disconnect: true } } : {}),
    ...(input.estimatedValueInPaise !== undefined
      ? { estimatedValueInPaise: input.estimatedValueInPaise }
      : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.expectedCloseDate !== undefined
      ? { expectedCloseDate: parseDateOnly(input.expectedCloseDate) }
      : {}),
    ...(input.interestSummary !== undefined ? { interestSummary: input.interestSummary } : {}),
    ...(input.attributionJson !== undefined
      ? { attributionJson: toJson(input.attributionJson) as Prisma.InputJsonValue }
      : {}),
    ...(input.customFields !== undefined
      ? { customFields: toJson(input.customFields) as Prisma.InputJsonValue }
      : {}),
    ...(input.enquiryThreadId !== undefined
      ? {
          enquiryThread: input.enquiryThreadId
            ? { connect: { id: input.enquiryThreadId } }
            : { disconnect: true }
        }
      : {}),
    ...(input.nextFollowUpAt !== undefined
      ? { nextFollowUpAt: parseDateTime(input.nextFollowUpAt) }
      : {}),
    ...(input.lostReason !== undefined ? { lostReason: input.lostReason } : {}),
    ...(input.lastContactedAt !== undefined
      ? { lastContactedAt: parseDateTime(input.lastContactedAt) }
      : {})
  };

  if (input.status) {
    data.status = input.status;
    if (input.status === "CONTACTED" && !input.lastContactedAt) {
      data.lastContactedAt = new Date();
    }
    if (input.status === "LOST" && !input.lostReason && !existing.lostReason) {
      // allow empty but encourage reason via activity
    }
  }

  const lead = await prisma.crmLead.update({
    where: { id },
    data,
    include: { owner: { select: userSummarySelect } }
  });

  if (input.status && input.status !== existing.status) {
    await prisma.crmActivity.create({
      data: {
        type: "STATUS_CHANGE",
        subject: `Lead status ${existing.status} → ${input.status}`,
        actorUserId: actor.id,
        leadId: id,
        metadata: { from: existing.status, to: input.status }
      }
    });
  }

  await writeAdminActivity({
    actorUserId: actor.id,
    actorEmail: actor.email,
    actorName: actor.name ?? null,
    action: "UPDATE",
    resource: "crm",
    summary: `CRM lead updated ${lead.leadNumber ?? lead.id}`,
    method: "PATCH",
    path: `/api/admin/crm/leads/${id}`,
    entityId: id
  });

  return lead;
}

export async function deleteLead(id: string) {
  const existing = await prisma.crmLead.findUnique({ where: { id } });
  if (!existing) throw crmNotFound("Lead");
  if (existing.status === "CONVERTED") {
    throw crmConflict("Converted leads cannot be deleted", "LEAD_CONVERTED");
  }
  const dealCount = await prisma.crmDeal.count({ where: { sourceLeadId: id } });
  if (dealCount > 0) {
    throw crmConflict("Lead has related deals — archive via status LOST instead", "LEAD_HAS_DEALS");
  }
  await prisma.$transaction(async (tx) => {
    await tx.crmActivity.deleteMany({ where: { leadId: id } });
    await tx.crmTask.deleteMany({ where: { leadId: id } });
    await tx.crmLead.delete({ where: { id } });
  });
  return { deleted: true, id };
}

export async function convertLead(
  id: string,
  input: ConvertLeadInput,
  actor: { id: string; email: string; name?: string | null }
) {
  const lead = await prisma.crmLead.findUnique({ where: { id } });
  if (!lead) throw crmNotFound("Lead");
  if (lead.status === "CONVERTED" || lead.convertedAt) {
    throw crmConflict("Lead already converted", "LEAD_ALREADY_CONVERTED");
  }

  const result = await prisma.$transaction(async (tx) => {
    let accountId = input.existingAccountId ?? null;
    let contactId = input.existingContactId ?? null;
    let dealId: string | null = null;

    if (input.createAccount !== false && !accountId) {
      const accountNumber = await nextCrmNumberInTx(tx, "ACC");
      const account = await tx.crmAccount.create({
        data: {
          accountNumber,
          kind: input.account?.kind ?? "ORGANIZATION",
          name: input.account?.name ?? lead.companyName ?? lead.name,
          displayName: input.account?.displayName ?? lead.companyName ?? lead.name,
          email: input.account?.email ?? lead.email,
          phone: input.account?.phone ?? lead.phone,
          whatsappPhone: input.account?.whatsappPhone ?? lead.whatsappPhone,
          ownerUserId: lead.ownerUserId,
          source: lead.source,
          notes: input.account?.notes ?? null,
          industry: input.account?.industry ?? null,
          website: input.account?.website ?? null,
          gstin: input.account?.gstin ?? null
        }
      });
      accountId = account.id;
    } else if (accountId) {
      const acc = await tx.crmAccount.findUnique({ where: { id: accountId } });
      if (!acc) throw crmNotFound("Account");
    }

    if (input.createContact !== false && !contactId) {
      const contactNumber = await nextCrmNumberInTx(tx, "CON");
      const contact = await tx.crmContact.create({
        data: {
          contactNumber,
          accountId,
          displayName:
            input.contact?.displayName ??
            ([input.contact?.firstName, input.contact?.lastName].filter(Boolean).join(" ") ||
              lead.name),
          firstName: input.contact?.firstName ?? null,
          lastName: input.contact?.lastName ?? null,
          email: input.contact?.email ?? lead.email,
          phone: input.contact?.phone ?? lead.phone,
          whatsappPhone: input.contact?.whatsappPhone ?? lead.whatsappPhone,
          designation: input.contact?.designation ?? lead.designation,
          ownerUserId: lead.ownerUserId,
          source: lead.source
        }
      });
      contactId = contact.id;
    } else if (contactId) {
      const c = await tx.crmContact.findUnique({ where: { id: contactId } });
      if (!c) throw crmNotFound("Contact");
    }

    if (input.createDeal !== false) {
      const stage = await requireDefaultPipelineStage(
        tx,
        input.deal?.pipelineId,
        input.deal?.stageId
      );
      const dealNumber = await nextCrmNumberInTx(tx, "DEAL");
      const deal = await tx.crmDeal.create({
        data: {
          dealNumber,
          name: input.deal?.name ?? lead.name,
          status: "OPEN",
          pipelineId: stage.pipelineId,
          stageId: stage.id,
          accountId,
          contactId,
          sourceLeadId: lead.id,
          ownerUserId: lead.ownerUserId,
          amountInPaise: input.deal?.amountInPaise ?? lead.estimatedValueInPaise ?? 0,
          currency: input.deal?.currency ?? lead.currency,
          probabilityPercent: input.deal?.probabilityPercent ?? stage.probabilityPercent,
          expectedCloseDate:
            input.deal?.expectedCloseDate !== undefined
              ? parseDateOnly(input.deal.expectedCloseDate)
              : lead.expectedCloseDate,
          notes: input.deal?.notes ?? null
        }
      });
      dealId = deal.id;
    }

    const updated = await tx.crmLead.update({
      where: { id: lead.id },
      data: {
        status: "CONVERTED",
        convertedAt: new Date(),
        convertedAccountId: accountId,
        convertedContactId: contactId,
        convertedDealId: dealId
      },
      include: {
        convertedAccount: true,
        convertedContact: true,
        convertedDeal: true
      }
    });

    await tx.crmActivity.create({
      data: {
        type: "STATUS_CHANGE",
        subject: "Lead converted",
        body: `Lead converted to account/contact/deal`,
        actorUserId: actor.id,
        leadId: lead.id,
        accountId,
        contactId,
        dealId,
        metadata: { accountId, contactId, dealId }
      }
    });

    return updated;
  });

  await writeAdminActivity({
    actorUserId: actor.id,
    actorEmail: actor.email,
    actorName: actor.name ?? null,
    action: "UPDATE",
    resource: "crm",
    summary: `CRM lead converted ${result.leadNumber ?? result.id}`,
    method: "POST",
    path: `/api/admin/crm/leads/${id}/convert`,
    entityId: id,
    metadata: {
      accountId: result.convertedAccountId,
      contactId: result.convertedContactId,
      dealId: result.convertedDealId
    }
  });

  return result;
}
