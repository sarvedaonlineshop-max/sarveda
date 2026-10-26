import type { NextFunction, Request, Response } from "express";

import { CrmError, crmForbidden } from "./crm-errors";
import { requireUuidParam } from "./crm-params";
import * as accountService from "./account.service";
import * as activityService from "./activity.service";
import * as contactService from "./contact.service";
import * as customer360 from "./customer360.service";
import * as dealService from "./deal.service";
import * as leadService from "./lead.service";
import * as pipelineService from "./pipeline.service";
import * as taskService from "./task.service";
import * as summaryService from "./crm-summary.service";
import { canAssignChatOwner, canSeeAllCrm } from "./crm-team-access";
import * as salesQuote from "./sales-quote.service";
import * as chatPipeline from "./chat-pipeline.service";
import { prisma } from "../../config/db";
import {
  accountListQuerySchema,
  activityListQuerySchema,
  contactListQuerySchema,
  convertLeadSchema,
  createAccountSchema,
  createActivitySchema,
  createContactSchema,
  createDealSchema,
  createLeadSchema,
  createPipelineSchema,
  createStageSchema,
  createTaskSchema,
  dealListQuerySchema,
  dealProductSchema,
  leadListQuerySchema,
  linkOrderSchema,
  linkQuotationSchema,
  salesQuoteSchema,
  shareSalesQuoteSchema,
  chatPipelineStatusSchema,
  chatPipelineCategorySchema,
  chatPipelineOwnerSchema,
  chatPipelineCollaboratorsSchema,
  chatPipelineNoteSchema,
  taskListQuerySchema,
  updateAccountSchema,
  updateContactSchema,
  updateDealProductSchema,
  updateDealSchema,
  updateLeadSchema,
  updatePipelineSchema,
  updateStageSchema,
  updateTaskSchema
} from "./crm.schemas";

function actor(req: Request) {
  const u = req.authUser;
  if (!u?.id || !u.email) {
    throw new CrmError("Admin authentication required", "UNAUTHORIZED", 401);
  }
  return { id: u.id, email: u.email, name: u.name ?? null };
}

function parseOrThrow<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown; issues: Array<{ path: (string | number)[]; message: string }> } } },
  value: unknown
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const err = Object.assign(new Error("Validation failed"), {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      fields: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message
      }))
    });
    throw err;
  }
  return parsed.data;
}

export async function listPipelines(req: Request, res: Response, next: NextFunction) {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const data = await pipelineService.listPipelines({ includeInactive });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function seedDefaultPipeline(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await pipelineService.ensureDefaultSalesPipeline();
    res.status(data.created ? 201 : 200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createPipeline(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(createPipelineSchema, req.body);
    const data = await pipelineService.createPipeline(body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getPipeline(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await pipelineService.getPipeline(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updatePipeline(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(updatePipelineSchema, req.body);
    const data = await pipelineService.updatePipeline(requireUuidParam(req.params.id), body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createStage(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(createStageSchema, req.body);
    const data = await pipelineService.createStage(
      requireUuidParam(req.params.pipelineId, "pipelineId"),
      body
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateStage(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(updateStageSchema, req.body);
    const data = await pipelineService.updateStage(
      requireUuidParam(req.params.stageId, "stageId"),
      body
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteStage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await pipelineService.deleteStage(
      requireUuidParam(req.params.stageId, "stageId")
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

function scopedOwnerId(req: Request, requested?: string) {
  const user = req.authUser;
  if (!user?.id) return requested;
  if (canSeeAllCrm(user.email, user.role)) return requested;
  return user.id;
}

export async function listLeads(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseOrThrow(leadListQuerySchema, req.query);
    if (!query.enquiryThreadId) query.ownerUserId = scopedOwnerId(req, query.ownerUserId);
    const data = await leadService.listLeads(query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createLead(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(createLeadSchema, req.body);
    const data = await leadService.createLead(body, actor(req));
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getLead(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await leadService.getLead(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateLead(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(updateLeadSchema, req.body);
    const data = await leadService.updateLead(requireUuidParam(req.params.id), body, actor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteLead(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await leadService.deleteLead(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function convertLead(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(convertLeadSchema, req.body ?? {});
    const data = await leadService.convertLead(requireUuidParam(req.params.id), body, actor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseOrThrow(accountListQuerySchema, req.query);
    const data = await accountService.listAccounts(query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(createAccountSchema, req.body);
    const data = await accountService.createAccount(body, actor(req).id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await accountService.getAccount(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(updateAccountSchema, req.body);
    const data = await accountService.updateAccount(requireUuidParam(req.params.id), body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getAccount360(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await customer360.getAccount360(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listContacts(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseOrThrow(contactListQuerySchema, req.query);
    const data = await contactService.listContacts(query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createContact(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(createContactSchema, req.body);
    const data = await contactService.createContact(body, actor(req).id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getContact(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await contactService.getContact(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateContact(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(updateContactSchema, req.body);
    const data = await contactService.updateContact(requireUuidParam(req.params.id), body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getContact360(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await customer360.getContact360(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listDeals(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseOrThrow(dealListQuerySchema, req.query);
    query.ownerUserId = scopedOwnerId(req, query.ownerUserId);
    const data = await dealService.listDeals(query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(createDealSchema, req.body);
    const data = await dealService.createDeal(body, actor(req));
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await dealService.getDeal(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(updateDealSchema, req.body);
    const data = await dealService.updateDeal(requireUuidParam(req.params.id), body, actor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function addDealProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(dealProductSchema, req.body);
    const data = await dealService.addDealProduct(requireUuidParam(req.params.dealId, "dealId"), body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateDealProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(updateDealProductSchema, req.body);
    const data = await dealService.updateDealProduct(requireUuidParam(req.params.id), body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteDealProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await dealService.deleteDealProduct(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function myDesk(req: Request, res: Response, next: NextFunction) {
  try {
    const me = actor(req);
    const seeAll = canSeeAllCrm(me.email, req.authUser?.role);
    const everyone = seeAll && String(req.query.scope ?? "") === "all";
    const ownerUserId = everyone ? undefined : me.id;
    const [deals, leads, followUps] = await Promise.all([
      dealService.listDeals({ page: 1, limit: 100, ownerUserId, sortBy: "updatedAt", sortOrder: "desc" }),
      leadService.listLeads({
        page: 1,
        limit: 80,
        ownerUserId,
        sortBy: "updatedAt",
        sortOrder: "desc"
      }),
      prisma.enquiryFollowUp.findMany({
        where: {
          status: "OPEN",
          ...(ownerUserId ? { assignedAdminId: ownerUserId } : {})
        },
        orderBy: { dueAt: "asc" },
        take: 40,
        include: {
          thread: {
            select: { id: true, customerName: true, customerPhone: true, customerEmail: true }
          }
        }
      })
    ]);
    res.json({
      success: true,
      data: { canSeeAll: seeAll, deals: deals.items, leads: leads.items, followUps }
    });
  } catch (err) {
    next(err);
  }
}

export async function createSalesQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(salesQuoteSchema, req.body);
    const data = await salesQuote.createSalesQuote(body, actor(req));
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSalesQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await salesQuote.getSalesQuote(requireUuidParam(req.params.id));
    if (!data) {
      res.status(404).json({ success: false, error: "Quotation not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateSalesQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(salesQuoteSchema, req.body);
    const data = await salesQuote.updateSalesQuote(requireUuidParam(req.params.id), body);
    if (!data) {
      res.status(404).json({ success: false, error: "Quotation not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteSalesQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await salesQuote.deleteSalesQuote(requireUuidParam(req.params.id));
    if (!data) {
      res.status(404).json({ success: false, error: "Quotation not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function shareSalesQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(shareSalesQuoteSchema, req.body);
    const data = await salesQuote.shareSalesQuote(requireUuidParam(req.params.id), body.threadId, actor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function downloadSalesQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const { generateQuotePdfBuffer } = await import("../quotations/quotation.service");
    const { pdf, quoteNumber } = await generateQuotePdfBuffer(requireUuidParam(req.params.id));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${quoteNumber.replace(/\//g, "-")}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
}

export async function quoteCatalog(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const data = await salesQuote.searchSalesCatalog(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listSalesQuotes(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const data = await salesQuote.listSalesQuotes(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function linkQuotation(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(linkQuotationSchema, req.body);
    const quotationId =
      body.quotationId ??
      (
        await prismaQuoteId(body.quoteNumber)
      );
    const data = await dealService.linkQuotation(requireUuidParam(req.params.dealId, "dealId"), quotationId, actor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function linkOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(linkOrderSchema, req.body);
    const orderId = body.orderId ?? (await prismaOrderId(body.orderNumber));
    const data = await dealService.linkOrder(requireUuidParam(req.params.dealId, "dealId"), orderId, actor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function prismaQuoteId(quoteNumber: string | undefined): Promise<string> {
  const { prisma } = await import("../../config/db");
  const { crmNotFound } = await import("./crm-errors");
  const row = await prisma.quotation.findFirst({
    where: { quoteNumber: { equals: quoteNumber ?? "", mode: "insensitive" } },
    select: { id: true }
  });
  if (!row) throw crmNotFound("Quotation");
  return row.id;
}

async function prismaOrderId(orderNumber: string | undefined): Promise<string> {
  const { prisma } = await import("../../config/db");
  const { crmNotFound } = await import("./crm-errors");
  const row = await prisma.order.findFirst({
    where: { orderNumber: { equals: orderNumber ?? "", mode: "insensitive" }, deletedAt: null },
    select: { id: true }
  });
  if (!row) throw crmNotFound("Order");
  return row.id;
}

export async function crmSummary(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await summaryService.crmSummary() });
  } catch (err) {
    next(err);
  }
}

export async function crmReport(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await summaryService.crmReport() });
  } catch (err) {
    next(err);
  }
}

export async function crmAssignees(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await summaryService.crmAssignees() });
  } catch (err) {
    next(err);
  }
}

export async function createActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(createActivitySchema, req.body);
    const data = await activityService.createActivity(body, actor(req).id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listActivities(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseOrThrow(activityListQuerySchema, req.query);
    const data = await activityService.listActivities(query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listTasks(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseOrThrow(taskListQuerySchema, req.query);
    const data = await taskService.listTasks(query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createTask(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(createTaskSchema, req.body);
    const data = await taskService.createTask(body, actor(req).id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getTask(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await taskService.getTask(requireUuidParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateTask(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(updateTaskSchema, req.body);
    const data = await taskService.updateTask(requireUuidParam(req.params.id), body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function chatPipelineDesk(req: Request, res: Response, next: NextFunction) {
  try {
    const who = actor(req);
    const role = req.authUser?.role;
    const statusRaw = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "";
    const known = new Set([
      ...chatPipeline.CHAT_PIPELINE_STATUSES,
      "CONTACTED",
      "WON",
      "LOST",
      "FOLLOW_UP"
    ]);
    const status = known.has(statusRaw) ? chatPipeline.normalizeChatPipeline(statusRaw) : null;
    const from = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : null;
    const ownerId = typeof req.query.ownerId === "string" && req.query.ownerId ? req.query.ownerId : null;
    res.json({
      success: true,
      data: await chatPipeline.chatPipelineBoard({
        actorId: who.id,
        seeAll: canSeeAllCrm(who.email, role),
        status,
        ownerId,
        from: from && !Number.isNaN(from.getTime()) ? from : null,
        to: to && !Number.isNaN(to.getTime()) ? to : null
      })
    });
  } catch (err) {
    next(err);
  }
}

export async function getChatPipeline(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await chatPipeline.getChatPipeline(requireUuidParam(req.params.threadId));
    if (!data) {
      res.status(404).json({ success: false, error: "Chat not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchChatPipeline(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(chatPipelineStatusSchema, req.body);
    const data = await chatPipeline.setChatPipeline(
      requireUuidParam(req.params.threadId),
      body.status,
      actor(req).id
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchChatCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(chatPipelineCategorySchema, req.body);
    const threadId = requireUuidParam(req.params.threadId);
    const data = body.categories
      ? await chatPipeline.setChatCategories(threadId, body.categories)
      : await chatPipeline.setChatCategory(threadId, body.category ?? null);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchChatOwner(req: Request, res: Response, next: NextFunction) {
  try {
    const who = actor(req);
    if (!canAssignChatOwner(who.email)) {
      throw crmForbidden("Only Partha and Arjun can assign chats");
    }
    const body = parseOrThrow(chatPipelineOwnerSchema, req.body);
    const data = await chatPipeline.setChatOwner(
      requireUuidParam(req.params.threadId),
      body.ownerUserId,
      { id: who.id, name: who.name, email: who.email }
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchChatCollaborators(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(chatPipelineCollaboratorsSchema, req.body);
    const data = await chatPipeline.setChatCollaborators(
      requireUuidParam(req.params.threadId),
      body.userIds
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function postChatNote(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(chatPipelineNoteSchema, req.body);
    const data = await chatPipeline.addChatNote(
      requireUuidParam(req.params.threadId),
      body.body,
      actor(req).id
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
