import { Router } from "express";

import { requireAdmin } from "../../middleware/admin";
import { validateBody } from "../../middleware/validate";
import * as h from "./crm.handlers";
import {
  convertLeadSchema,
  createAccountSchema,
  createActivitySchema,
  createContactSchema,
  createDealSchema,
  createLeadSchema,
  createPipelineSchema,
  createStageSchema,
  createTaskSchema,
  dealProductSchema,
  linkOrderSchema,
  linkQuotationSchema,
  salesQuoteSchema,
  shareSalesQuoteSchema,
  quoteChargesSchema,
  quoteDecisionSchema,
  chatPipelineStatusSchema,
  chatPipelineCategorySchema,
  chatPipelineOwnerSchema,
  chatPipelineCollaboratorsSchema,
  chatPipelineNoteSchema,
  leadPaymentUpdateSchema,
  leadPaymentReceiptSchema,
  feedbackResponseSchema,
  feedbackConsentSchema,
  issueUpdateSchema,
  chatPipelineCustomerSchema,
  updateAccountSchema,
  updateContactSchema,
  updateDealProductSchema,
  updateDealSchema,
  updateLeadSchema,
  updatePipelineSchema,
  updateStageSchema,
  updateTaskSchema,
  chatOwnerSchema
} from "./crm.schemas";

/**
 * Mounted at /api/admin/crm.
 * Parent admin router already applies requireAdmin + logAdminMutations.
 * Re-apply requireAdmin here so crmAdminRoutes cannot become public if remounted elsewhere
 * (same defensive pattern as enquiries admin routes).
 */
const router = Router();
router.use(requireAdmin);

router.get("/summary", h.crmSummary);
router.get("/chat-pipeline", h.chatPipelineDesk);
router.get("/chat-pipeline/:threadId", h.getChatPipeline);
router.patch("/chat-pipeline/:threadId", validateBody(chatPipelineStatusSchema), h.patchChatPipeline);
router.patch("/chat-pipeline/:threadId/category", validateBody(chatPipelineCategorySchema), h.patchChatCategory);
router.patch("/chat-pipeline/:threadId/owner", validateBody(chatPipelineOwnerSchema), h.patchChatPipelineOwner);
router.patch("/chat-pipeline/:threadId/customer", validateBody(chatPipelineCustomerSchema), h.patchChatCustomer);
router.patch("/chat-pipeline/:threadId/collaborators", validateBody(chatPipelineCollaboratorsSchema), h.patchChatCollaborators);
router.post("/chat-pipeline/:threadId/notes", validateBody(chatPipelineNoteSchema), h.postChatNote);
router.get("/chat-pipeline/:threadId/payment", h.getLeadPayment);
router.patch("/chat-pipeline/:threadId/payment", validateBody(leadPaymentUpdateSchema), h.updateLeadPayment);
router.post("/chat-pipeline/:threadId/payment/receipts", validateBody(leadPaymentReceiptSchema), h.recordLeadReceipt);
router.post("/chat-pipeline/:threadId/payment/receipts/:receiptId/verify", h.verifyLeadReceipt);
router.post("/chat-pipeline/:threadId/payment/receipts/:receiptId/reject", h.rejectLeadReceipt);
router.post("/chat-pipeline/:threadId/payment/link", h.shareLeadPaymentLink);
router.get("/chat-pipeline/:threadId/order-desk", h.getOrderDesk);
router.post("/chat-pipeline/:threadId/order-desk/feedback/send", h.sendOrderFeedback);
router.post("/chat-pipeline/:threadId/order-desk/feedback/response", validateBody(feedbackResponseSchema), h.recordOrderFeedback);
router.post("/chat-pipeline/:threadId/order-desk/feedback/resolve", h.resolveOrderFeedback);
router.patch("/chat-pipeline/:threadId/order-desk/feedback/consent", validateBody(feedbackConsentSchema), h.setOrderFeedbackConsent);
router.patch("/chat-pipeline/:threadId/order-desk/issues/:issueId", validateBody(issueUpdateSchema), h.patchOrderIssue);
router.get("/report", h.crmReport);
router.get("/assignees", h.crmAssignees);
router.get("/chat-owner/:threadId", h.getChatOwner);
router.patch("/chat-owner/:threadId", validateBody(chatOwnerSchema), h.patchChatOwner);
router.get("/pipelines", h.listPipelines);
router.post("/pipelines/seed-default", h.seedDefaultPipeline);
router.post("/pipelines", validateBody(createPipelineSchema), h.createPipeline);
router.get("/pipelines/:id", h.getPipeline);
router.patch("/pipelines/:id", validateBody(updatePipelineSchema), h.updatePipeline);
router.post(
  "/pipelines/:pipelineId/stages",
  validateBody(createStageSchema),
  h.createStage
);
router.patch("/stages/:stageId", validateBody(updateStageSchema), h.updateStage);
router.delete("/stages/:stageId", h.deleteStage);

router.get("/leads", h.listLeads);
router.post("/leads", validateBody(createLeadSchema), h.createLead);
router.get("/leads/:id", h.getLead);
router.patch("/leads/:id", validateBody(updateLeadSchema), h.updateLead);
router.delete("/leads/:id", h.deleteLead);
router.post("/leads/:id/convert", validateBody(convertLeadSchema), h.convertLead);

router.get("/accounts", h.listAccounts);
router.post("/accounts", validateBody(createAccountSchema), h.createAccount);
router.get("/accounts/:id/360", h.getAccount360);
router.get("/accounts/:id", h.getAccount);
router.patch("/accounts/:id", validateBody(updateAccountSchema), h.updateAccount);

router.get("/contacts", h.listContacts);
router.post("/contacts", validateBody(createContactSchema), h.createContact);
router.get("/contacts/:id/360", h.getContact360);
router.get("/contacts/:id", h.getContact);
router.patch("/contacts/:id", validateBody(updateContactSchema), h.updateContact);

router.get("/desk", h.myDesk);
router.get("/quote-catalog", h.quoteCatalog);
router.get("/sales-quotes", h.listSalesQuotes);
router.get("/sales-quotes/approvals/count", h.countQuoteApprovals);
router.get("/sales-quotes/approvals", h.listQuoteApprovals);
router.post("/sales-quotes/charges", validateBody(quoteChargesSchema), h.suggestSalesQuoteCharges);
router.post("/sales-quotes", validateBody(salesQuoteSchema), h.createSalesQuote);
router.get("/sales-quotes/:id/pdf", h.downloadSalesQuote);
router.post("/sales-quotes/:id/share", validateBody(shareSalesQuoteSchema), h.shareSalesQuote);
router.post("/sales-quotes/:id/order", validateBody(shareSalesQuoteSchema), h.convertSalesQuote);
router.post("/sales-quotes/:id/submit", h.submitSalesQuote);
router.post("/sales-quotes/:id/decision", validateBody(quoteDecisionSchema), h.decideSalesQuote);
router.get("/sales-quotes/:id", h.getSalesQuote);
router.put("/sales-quotes/:id", validateBody(salesQuoteSchema), h.updateSalesQuote);
router.delete("/sales-quotes/:id", h.deleteSalesQuote);

router.get("/deals", h.listDeals);
router.post("/deals", validateBody(createDealSchema), h.createDeal);
router.get("/deals/:id", h.getDeal);
router.patch("/deals/:id", validateBody(updateDealSchema), h.updateDeal);
router.post("/deals/:dealId/products", validateBody(dealProductSchema), h.addDealProduct);
router.post(
  "/deals/:dealId/link-quotation",
  validateBody(linkQuotationSchema),
  h.linkQuotation
);
router.post("/deals/:dealId/link-order", validateBody(linkOrderSchema), h.linkOrder);

router.patch(
  "/deal-products/:id",
  validateBody(updateDealProductSchema),
  h.updateDealProduct
);
router.delete("/deal-products/:id", h.deleteDealProduct);

router.get("/activities", h.listActivities);
router.post("/activities", validateBody(createActivitySchema), h.createActivity);

router.get("/tasks", h.listTasks);
router.post("/tasks", validateBody(createTaskSchema), h.createTask);
router.get("/tasks/:id", h.getTask);
router.patch("/tasks/:id", validateBody(updateTaskSchema), h.updateTask);

export { router as crmAdminRoutes };
