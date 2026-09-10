import type { NextFunction, Request, Response } from "express";

import { CrmError } from "./crm-errors";
import { requireUuidParam } from "./crm-params";
import * as accountService from "./account.service";
import * as activityService from "./activity.service";
import * as contactService from "./contact.service";
import * as customer360 from "./customer360.service";
import * as dealService from "./deal.service";
import * as leadService from "./lead.service";
import * as pipelineService from "./pipeline.service";
import * as taskService from "./task.service";
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

export async function listLeads(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseOrThrow(leadListQuerySchema, req.query);
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

export async function linkQuotation(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(linkQuotationSchema, req.body);
    const data = await dealService.linkQuotation(requireUuidParam(req.params.dealId, "dealId"), body.quotationId, actor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function linkOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseOrThrow(linkOrderSchema, req.body);
    const data = await dealService.linkOrder(requireUuidParam(req.params.dealId, "dealId"), body.orderId, actor(req));
    res.json({ success: true, data });
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
