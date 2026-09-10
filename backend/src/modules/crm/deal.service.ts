import type { CrmDealStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { writeAdminActivity } from "../../middleware/adminActivity";
import { crmBadRequest, crmNotFound } from "./crm-errors";
import { nextCrmNumberInTx } from "./crm-number";
import {
  assertAdminUserId,
  paginationMeta,
  parseDateOnly,
  toJson,
  userSummarySelect
} from "./crm.utils";

function dealSearchWhere(search?: string): Prisma.CrmDealWhereInput | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  return {
    OR: [
      { dealNumber: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } }
    ]
  };
}

function closureFieldsForStageType(
  stageType: "OPEN" | "WON" | "LOST",
  lostReason?: string | null
): {
  status: CrmDealStatus;
  wonAt: Date | null;
  lostAt: Date | null;
  closedAt: Date | null;
  lostReason?: string | null;
} {
  const now = new Date();
  if (stageType === "WON") {
    return {
      status: "WON",
      wonAt: now,
      closedAt: now,
      lostAt: null,
      lostReason: null
    };
  }
  if (stageType === "LOST") {
    return {
      status: "LOST",
      lostAt: now,
      closedAt: now,
      wonAt: null,
      ...(lostReason !== undefined ? { lostReason } : {})
    };
  }
  return {
    status: "OPEN",
    wonAt: null,
    lostAt: null,
    closedAt: null
  };
}

export async function listDeals(query: {
  page: number;
  limit: number;
  search?: string;
  q?: string;
  pipelineId?: string;
  stageId?: string;
  status?: CrmDealStatus;
  ownerUserId?: string;
  accountId?: string;
  contactId?: string;
  expectedCloseFrom?: string | null;
  expectedCloseTo?: string | null;
  minAmountInPaise?: number | null;
  maxAmountInPaise?: number | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const where: Prisma.CrmDealWhereInput = {
    AND: [
      dealSearchWhere(query.search ?? query.q) ?? {},
      query.pipelineId ? { pipelineId: query.pipelineId } : {},
      query.stageId ? { stageId: query.stageId } : {},
      query.status ? { status: query.status } : {},
      query.ownerUserId ? { ownerUserId: query.ownerUserId } : {},
      query.accountId ? { accountId: query.accountId } : {},
      query.contactId ? { contactId: query.contactId } : {},
      query.expectedCloseFrom || query.expectedCloseTo
        ? {
            expectedCloseDate: {
              ...(query.expectedCloseFrom
                ? { gte: parseDateOnly(query.expectedCloseFrom)! }
                : {}),
              ...(query.expectedCloseTo ? { lte: parseDateOnly(query.expectedCloseTo)! } : {})
            }
          }
        : {},
      query.minAmountInPaise != null || query.maxAmountInPaise != null
        ? {
            amountInPaise: {
              ...(query.minAmountInPaise != null ? { gte: query.minAmountInPaise } : {}),
              ...(query.maxAmountInPaise != null ? { lte: query.maxAmountInPaise } : {})
            }
          }
        : {}
    ]
  };
  const sortable = new Set(["createdAt", "updatedAt", "amountInPaise", "expectedCloseDate", "name"]);
  const sortBy = query.sortBy && sortable.has(query.sortBy) ? query.sortBy : "createdAt";
  const skip = (query.page - 1) * query.limit;
  const [total, items] = await prisma.$transaction([
    prisma.crmDeal.count({ where }),
    prisma.crmDeal.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { [sortBy]: query.sortOrder ?? "desc" },
      include: {
        owner: { select: userSummarySelect },
        pipeline: { select: { id: true, name: true } },
        stage: true,
        account: { select: { id: true, name: true, accountNumber: true } },
        contact: { select: { id: true, displayName: true, contactNumber: true } }
      }
    })
  ]);
  return { items, pagination: paginationMeta(query.page, query.limit, total) };
}

export async function getDeal(id: string) {
  const deal = await prisma.crmDeal.findUnique({
    where: { id },
    include: {
      owner: { select: userSummarySelect },
      pipeline: true,
      stage: true,
      account: true,
      contact: true,
      sourceLead: {
        select: { id: true, leadNumber: true, name: true, status: true, source: true }
      },
      products: { orderBy: { sortOrder: "asc" } },
      quotation: {
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          grandTotalInPaise: true,
          currency: true
        }
      },
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          grandTotalInPaise: true,
          currency: true
        }
      },
      activities: { orderBy: { occurredAt: "desc" }, take: 20 },
      tasks: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: { dueAt: "asc" },
        take: 20
      }
    }
  });
  if (!deal) throw crmNotFound("Deal");
  return deal;
}

export async function createDeal(
  input: {
    name: string;
    pipelineId: string;
    stageId: string;
    accountId?: string | null;
    contactId?: string | null;
    sourceLeadId?: string | null;
    ownerUserId?: string | null;
    amountInPaise?: number;
    currency?: string;
    probabilityPercent?: number | null;
    expectedCloseDate?: string | null;
    notes?: string | null;
    customFields?: unknown;
    lostReason?: string | null;
  },
  actor: { id: string; email: string; name?: string | null }
) {
  const stage = await prisma.crmPipelineStage.findFirst({
    where: { id: input.stageId, pipelineId: input.pipelineId }
  });
  if (!stage) throw crmBadRequest("stageId does not belong to pipelineId");
  const ownerUserId = await assertAdminUserId(input.ownerUserId ?? actor.id);
  if (input.accountId) {
    if (!(await prisma.crmAccount.findUnique({ where: { id: input.accountId } }))) {
      throw crmNotFound("Account");
    }
  }
  if (input.contactId) {
    if (!(await prisma.crmContact.findUnique({ where: { id: input.contactId } }))) {
      throw crmNotFound("Contact");
    }
  }
  if (input.sourceLeadId) {
    if (!(await prisma.crmLead.findUnique({ where: { id: input.sourceLeadId } }))) {
      throw crmNotFound("Lead");
    }
  }

  const deal = await prisma.$transaction(async (tx) => {
    const dealNumber = await nextCrmNumberInTx(tx, "DEAL");
    const closure = closureFieldsForStageType(stage.stageType, input.lostReason);
    return tx.crmDeal.create({
      data: {
        dealNumber,
        name: input.name,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        accountId: input.accountId ?? null,
        contactId: input.contactId ?? null,
        sourceLeadId: input.sourceLeadId ?? null,
        ownerUserId,
        amountInPaise: input.amountInPaise ?? 0,
        currency: input.currency ?? "INR",
        probabilityPercent: input.probabilityPercent ?? stage.probabilityPercent,
        expectedCloseDate: parseDateOnly(input.expectedCloseDate),
        notes: input.notes ?? null,
        customFields: toJson(input.customFields) as Prisma.InputJsonValue | undefined,
        status: (closure.status as CrmDealStatus) ?? "OPEN",
        wonAt: (closure.wonAt as Date | null) ?? null,
        lostAt: (closure.lostAt as Date | null) ?? null,
        closedAt: (closure.closedAt as Date | null) ?? null,
        lostReason: (closure.lostReason as string | null) ?? input.lostReason ?? null
      },
      include: {
        stage: true,
        pipeline: true,
        owner: { select: userSummarySelect }
      }
    });
  });

  await prisma.crmActivity.create({
    data: {
      type: "SYSTEM",
      subject: "Deal created",
      body: `Deal ${deal.dealNumber} created`,
      actorUserId: actor.id,
      dealId: deal.id,
      accountId: deal.accountId,
      contactId: deal.contactId,
      leadId: deal.sourceLeadId
    }
  });

  return deal;
}

export async function updateDeal(
  id: string,
  input: {
    name?: string;
    pipelineId?: string;
    stageId?: string;
    accountId?: string | null;
    contactId?: string | null;
    ownerUserId?: string | null;
    amountInPaise?: number;
    currency?: string;
    probabilityPercent?: number | null;
    expectedCloseDate?: string | null;
    notes?: string | null;
    customFields?: unknown;
    lostReason?: string | null;
    status?: CrmDealStatus;
  },
  actor: { id: string; email: string; name?: string | null }
) {
  const existing = await prisma.crmDeal.findUnique({
    where: { id },
    include: { stage: true }
  });
  if (!existing) throw crmNotFound("Deal");

  const pipelineId = input.pipelineId ?? existing.pipelineId;
  const stageId = input.stageId ?? existing.stageId;
  const stage = await prisma.crmPipelineStage.findFirst({
    where: { id: stageId, pipelineId }
  });
  if (!stage) throw crmBadRequest("stageId does not belong to pipelineId");

  const ownerUserId =
    input.ownerUserId === undefined
      ? undefined
      : await assertAdminUserId(input.ownerUserId);

  const stageChanged = stageId !== existing.stageId;
  const closure = stageChanged
    ? closureFieldsForStageType(stage.stageType, input.lostReason)
    : input.status
      ? closureFieldsForStageType(
          input.status === "WON" ? "WON" : input.status === "LOST" ? "LOST" : "OPEN",
          input.lostReason
        )
      : {};

  const deal = await prisma.$transaction(async (tx) => {
    const data: Prisma.CrmDealUncheckedUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      pipelineId,
      stageId,
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      ...(ownerUserId !== undefined ? { ownerUserId } : {}),
      ...(input.amountInPaise !== undefined ? { amountInPaise: input.amountInPaise } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.probabilityPercent !== undefined
        ? { probabilityPercent: input.probabilityPercent }
        : stageChanged
          ? { probabilityPercent: stage.probabilityPercent }
          : {}),
      ...(input.expectedCloseDate !== undefined
        ? { expectedCloseDate: parseDateOnly(input.expectedCloseDate) }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.customFields !== undefined
        ? { customFields: toJson(input.customFields) as Prisma.InputJsonValue }
        : {}),
      ...closure,
      ...(input.lostReason !== undefined && !stageChanged
        ? { lostReason: input.lostReason }
        : {})
    };

    const updated = await tx.crmDeal.update({
      where: { id },
      data,
      include: {
        stage: true,
        pipeline: true,
        owner: { select: userSummarySelect }
      }
    });

    if (stageChanged) {
      await tx.crmActivity.create({
        data: {
          type: "STATUS_CHANGE",
          subject: `Deal stage ${existing.stage.name} → ${stage.name}`,
          actorUserId: actor.id,
          dealId: id,
          accountId: updated.accountId,
          contactId: updated.contactId,
          metadata: {
            fromStageId: existing.stageId,
            toStageId: stage.id,
            status: updated.status
          }
        }
      });
    }

    return updated;
  });

  if (stageChanged) {
    await writeAdminActivity({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorName: actor.name ?? null,
      action: "UPDATE",
      resource: "crm",
      summary: `CRM deal stage changed ${deal.dealNumber ?? deal.id}`,
      method: "PATCH",
      path: `/api/admin/crm/deals/${id}`,
      entityId: id
    });
  }

  return deal;
}

function lineTotal(qty: number, unit: number, discount: number) {
  return Math.max(0, qty * unit - discount);
}

export async function addDealProduct(
  dealId: string,
  input: {
    variantId?: string | null;
    productName?: string;
    sku?: string | null;
    quantity?: number;
    unitPriceInPaise?: number;
    discountInPaise?: number;
    sortOrder?: number;
  }
) {
  const deal = await prisma.crmDeal.findUnique({ where: { id: dealId } });
  if (!deal) throw crmNotFound("Deal");

  let productName = input.productName;
  let sku = input.sku ?? null;
  let unitPriceInPaise = input.unitPriceInPaise ?? 0;

  if (input.variantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { productRel: { select: { name: true } } }
    });
    if (!variant) throw crmNotFound("ProductVariant");
    productName = productName ?? variant.productRel.name;
    sku = sku ?? variant.sku;
    if (input.unitPriceInPaise === undefined) unitPriceInPaise = variant.saleInPaise;
  }
  if (!productName?.trim()) throw crmBadRequest("productName is required when variantId is omitted");

  const quantity = input.quantity ?? 1;
  const discountInPaise = input.discountInPaise ?? 0;

  return prisma.crmDealProduct.create({
    data: {
      dealId,
      variantId: input.variantId ?? null,
      productName: productName.trim(),
      sku,
      quantity,
      unitPriceInPaise,
      discountInPaise,
      lineTotalInPaise: lineTotal(quantity, unitPriceInPaise, discountInPaise),
      sortOrder: input.sortOrder ?? 0
    }
  });
}

export async function updateDealProduct(
  id: string,
  input: {
    variantId?: string | null;
    productName?: string;
    sku?: string | null;
    quantity?: number;
    unitPriceInPaise?: number;
    discountInPaise?: number;
    sortOrder?: number;
  }
) {
  const existing = await prisma.crmDealProduct.findUnique({ where: { id } });
  if (!existing) throw crmNotFound("DealProduct");

  let productName = input.productName;
  let sku = input.sku;
  let unitPriceInPaise = input.unitPriceInPaise;
  let variantId = input.variantId;

  if (input.variantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { productRel: { select: { name: true } } }
    });
    if (!variant) throw crmNotFound("ProductVariant");
    productName = productName ?? variant.productRel.name;
    sku = sku ?? variant.sku;
    if (unitPriceInPaise === undefined) unitPriceInPaise = variant.saleInPaise;
  }

  const quantity = input.quantity ?? existing.quantity;
  const unit = unitPriceInPaise ?? existing.unitPriceInPaise;
  const discount = input.discountInPaise ?? existing.discountInPaise;

  return prisma.crmDealProduct.update({
    where: { id },
    data: {
      ...(variantId !== undefined ? { variantId } : {}),
      ...(productName !== undefined ? { productName } : {}),
      ...(sku !== undefined ? { sku } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(unitPriceInPaise !== undefined ? { unitPriceInPaise } : {}),
      ...(input.discountInPaise !== undefined ? { discountInPaise: input.discountInPaise } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      lineTotalInPaise: lineTotal(quantity, unit, discount)
    }
  });
}

export async function deleteDealProduct(id: string) {
  const existing = await prisma.crmDealProduct.findUnique({ where: { id } });
  if (!existing) throw crmNotFound("DealProduct");
  await prisma.crmDealProduct.delete({ where: { id } });
  return { deleted: true, id };
}

export async function linkQuotation(
  dealId: string,
  quotationId: string,
  actor: { id: string; email: string; name?: string | null }
) {
  const deal = await prisma.crmDeal.findUnique({ where: { id: dealId } });
  if (!deal) throw crmNotFound("Deal");
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      grandTotalInPaise: true,
      currency: true
    }
  });
  if (!quotation) throw crmNotFound("Quotation");

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.crmDeal.update({
      where: { id: dealId },
      data: { quotationId },
      include: {
        quotation: {
          select: {
            id: true,
            quoteNumber: true,
            status: true,
            grandTotalInPaise: true,
            currency: true
          }
        }
      }
    });
    await tx.crmActivity.create({
      data: {
        type: "QUOTATION",
        subject: `Quotation ${quotation.quoteNumber} linked`,
        body: `Status ${quotation.status}; ${quotation.currency} ${quotation.grandTotalInPaise} paise`,
        actorUserId: actor.id,
        dealId,
        quotationId,
        accountId: d.accountId,
        contactId: d.contactId,
        metadata: {
          quoteNumber: quotation.quoteNumber,
          status: quotation.status,
          grandTotalInPaise: quotation.grandTotalInPaise
        }
      }
    });
    return d;
  });

  return { deal: updated, quotation };
}

export async function linkOrder(
  dealId: string,
  orderId: string,
  actor: { id: string; email: string; name?: string | null }
) {
  const deal = await prisma.crmDeal.findUnique({ where: { id: dealId } });
  if (!deal) throw crmNotFound("Deal");
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      grandTotalInPaise: true,
      currency: true
    }
  });
  if (!order) throw crmNotFound("Order");

  // Link only — never mutate order lifecycle / payments / accounting.
  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.crmDeal.update({
      where: { id: dealId },
      data: { orderId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            grandTotalInPaise: true,
            currency: true
          }
        }
      }
    });
    await tx.crmActivity.create({
      data: {
        type: "SYSTEM",
        subject: `Order ${order.orderNumber} linked`,
        actorUserId: actor.id,
        dealId,
        orderId,
        accountId: d.accountId,
        contactId: d.contactId,
        metadata: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus
        }
      }
    });
    return d;
  });

  await writeAdminActivity({
    actorUserId: actor.id,
    actorEmail: actor.email,
    actorName: actor.name ?? null,
    action: "UPDATE",
    resource: "crm",
    summary: `CRM deal linked to order ${order.orderNumber}`,
    method: "POST",
    path: `/api/admin/crm/deals/${dealId}/link-order`,
    entityId: dealId
  });

  return { deal: updated, order };
}
