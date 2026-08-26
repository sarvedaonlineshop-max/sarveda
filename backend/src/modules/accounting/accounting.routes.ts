import { Router } from "express";
import multer from "multer";

import {
  ACCOUNTING_MODULE_DISABLED_MESSAGE,
  isNativeAccountingEnabled
} from "./accounting-flag";
import * as h from "./accounting.handlers";
import * as bankHandlers from "./bank.handlers";
import * as statementHandlers from "./bank-statement.handlers";
import * as reconHandlers from "./bank-reconciliation.handlers";
import * as gstHandlers from "./gst.handlers";
import * as itcHandlers from "./itc.handlers";
import * as gstReportHandlers from "./gst-reporting.handlers";
import * as financialReportHandlers from "./financial-reports.handlers";
import * as openingHandlers from "./opening.handlers";

const router = Router();

const openingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok =
      name.endsWith(".xlsx") ||
      name.endsWith(".csv") ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "text/csv";
    if (ok) cb(null, true);
    else cb(new Error("Only .xlsx or .csv files are allowed"));
  }
});

const statementUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok =
      name.endsWith(".csv") ||
      name.endsWith(".xlsx") ||
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (ok) cb(null, true);
    else cb(new Error("Only CSV or XLSX statement files are allowed"));
  }
});

router.get("/status", h.accountingStatus);

router.use((req, res, next) => {
  if (isNativeAccountingEnabled()) return next();
  res.status(503).json({
    success: false,
    code: "ACCOUNTING_MODULE_DISABLED",
    error: ACCOUNTING_MODULE_DISABLED_MESSAGE
  });
});

router.get("/dashboard", h.accountingDashboard);
router.get("/accounts", h.accountingAccountsList);
router.get("/journals", h.accountingJournalsList);
router.get("/journals/:id", h.accountingJournalDetail);
router.get("/health", h.accountingDiscoveryHealth);

router.post("/order-paid/preview", h.accountingOrderPaidPreview);
router.post("/order-paid/post", h.accountingOrderPaidPost);
router.post("/order-paid/discover", h.accountingOrderPaidDiscover);
router.get("/order-paid/reconciliation", h.accountingOrderPaidReconciliation);

router.post("/order-refunded-full/preview", h.accountingRefundedFullPreview);
router.post("/order-refunded-full/post", h.accountingRefundedFullPost);
router.post("/order-refunded-full/discover", h.accountingRefundedFullDiscover);
router.get("/reconciliation/v2", h.accountingReconciliationV2);
router.get("/reconciliation/v3", h.accountingReconciliationV3);

router.get("/settlements", h.accountingSettlementList);
router.get("/settlements/:settlementId", h.accountingSettlementDetail);
router.post("/settlements/preview", h.accountingSettlementPreview);
router.post("/settlements/import", h.accountingSettlementImport);
router.post("/settlements/post", h.accountingSettlementPost);
router.post("/settlements/discover", h.accountingSettlementDiscover);

router.post("/vendor-bills/preview", h.accountingVendorBillPreview);
router.post("/vendor-bills/post", h.accountingVendorBillPost);
router.post("/vendor-bills/discover", h.accountingVendorBillDiscover);
router.get("/reconciliation/v4", h.accountingReconciliationV4);
router.get("/reconciliation/v5", h.accountingReconciliationV5);
router.get("/reconciliation/purchases", h.accountingPurchaseReconciliation);
router.get("/dashboard/purchases", h.accountingPurchaseDashboard);

router.get("/vendor-payments", h.accountingVendorPaymentList);
router.get("/vendor-payments/open-bills", h.accountingVendorPaymentOpenBills);
router.post("/vendor-payments", h.accountingVendorPaymentCreate);
router.get("/vendor-payments/:id", h.accountingVendorPaymentGet);
router.patch("/vendor-payments/:id", h.accountingVendorPaymentUpdate);
router.delete("/vendor-payments/:id", h.accountingVendorPaymentDelete);
router.post("/vendor-payments/preview", h.accountingVendorPaymentPreview);
router.post("/vendor-payments/post", h.accountingVendorPaymentPost);

router.post("/expenses/preview", h.accountingExpensePreview);
router.post("/expenses/post", h.accountingExpensePost);
router.post("/expenses/discover", h.accountingExpenseDiscover);
router.get("/reconciliation/v5-expenses", h.accountingReconciliationV5Expenses);
router.get("/expense-mappings", h.accountingExpenseMappingsList);
router.post("/expense-mappings/accounts", h.accountingExpenseAccountMappingUpsert);
router.post("/expense-mappings/payments", h.accountingExpensePaymentMappingUpsert);
router.patch("/expense-mappings/accounts/:id", h.accountingExpenseAccountMappingPatch);
router.patch("/expense-mappings/payments/:id", h.accountingExpensePaymentMappingPatch);

router.get("/inventory/reconciliation", h.accountingInventoryReconciliation);
router.get("/inventory/reconciliation/v2", h.accountingInventoryReconciliationV2);
router.get("/inventory/reconciliation/v3", h.accountingInventoryReconciliationV3);
router.get("/inventory/reconciliation/v4", h.accountingInventoryReconciliationV4);
router.get("/inventory/classification-summary", h.accountingInventoryClassificationSummary);
router.get("/inventory/purchase-capitalization/clearing", h.accountingPurchaseCapitalizationClearing);
router.post("/inventory/purchase-capitalization/preview", h.accountingPurchaseCapitalizationPreview);
router.post("/inventory/purchase-capitalization/post", h.accountingPurchaseCapitalizationPost);
router.post("/inventory/purchase-capitalization/discover", h.accountingPurchaseCapitalizationDiscover);
router.post("/inventory/cogs/preview", h.accountingInventoryCogsPreview);
router.post("/inventory/cogs/post", h.accountingInventoryCogsPost);
router.post("/inventory/cogs/discover", h.accountingInventoryCogsDiscover);
router.post("/inventory/cogs-reversal/preview", h.accountingInventoryCogsReversalPreview);
router.post("/inventory/cogs-reversal/post", h.accountingInventoryCogsReversalPost);
router.post("/inventory/cogs-reversal/discover", h.accountingInventoryCogsReversalDiscover);
router.get("/inventory/opening/template", h.accountingInventoryOpeningTemplate);
router.post(
  "/inventory/opening/preview",
  openingUpload.single("file"),
  h.accountingInventoryOpeningPreview
);
router.post("/inventory/opening/draft", h.accountingInventoryOpeningSaveDraft);
router.post("/inventory/opening/preview-post", h.accountingInventoryOpeningPreviewPost);
router.post("/inventory/opening/post", h.accountingInventoryOpeningPost);
router.get("/inventory/opening/batches", h.accountingInventoryOpeningBatchList);
router.get("/inventory/opening/batches/:batchId", h.accountingInventoryOpeningBatchDetail);

router.get("/banking/dashboard", bankHandlers.accountingBankingDashboard);
router.get("/bank-accounts", bankHandlers.accountingBankAccountList);
router.get("/bank-accounts/:id", bankHandlers.accountingBankAccountGet);
router.post("/bank-accounts", bankHandlers.accountingBankAccountCreate);
router.patch("/bank-accounts/:id", bankHandlers.accountingBankAccountUpdate);
router.post("/bank-accounts/:id/deactivate", bankHandlers.accountingBankAccountDeactivate);

router.get("/bank-transfers", bankHandlers.accountingBankTransferList);
router.post("/bank-transfers", bankHandlers.accountingBankTransferCreate);
router.patch("/bank-transfers/:id", bankHandlers.accountingBankTransferUpdate);
router.delete("/bank-transfers/:id", bankHandlers.accountingBankTransferDelete);
router.get("/bank-transfers/:id/preview", bankHandlers.accountingBankTransferPreview);
router.post("/bank-transfers/preview", bankHandlers.accountingBankTransferPreview);
router.post("/bank-transfers/post", bankHandlers.accountingBankTransferPost);

router.post("/bank-opening/preview", bankHandlers.accountingBankOpeningPreview);
router.post("/bank-opening/post", bankHandlers.accountingBankOpeningPost);

router.get("/bank-statements/status", statementHandlers.bankStatementImportStatus);
router.post(
  "/bank-statements/preview",
  statementUpload.single("file"),
  statementHandlers.bankStatementPreview
);
router.post(
  "/bank-statements/commit",
  statementUpload.single("file"),
  statementHandlers.bankStatementCommit
);
router.get("/bank-statements/imports", statementHandlers.bankStatementImportList);
router.get("/bank-statements/imports/:importId", statementHandlers.bankStatementImportDetail);
router.post(
  "/bank-statements/imports/:importId/rerun-matching",
  statementHandlers.bankStatementRerunMatching
);
router.get("/bank-statements/lines", statementHandlers.bankStatementLineList);
router.get("/bank-statements/lines/:lineId/candidates", statementHandlers.bankStatementLineCandidates);
router.post("/bank-statements/match/confirm", statementHandlers.bankStatementMatchConfirm);
router.post("/bank-statements/match/unmatch", statementHandlers.bankStatementUnmatch);
router.post("/bank-statements/match/reject", statementHandlers.bankStatementRejectCandidate);

router.get("/bank-reconciliations/status", reconHandlers.bankReconciliationStatus);
router.get("/bank-reconciliations", reconHandlers.bankReconciliationList);
router.post("/bank-reconciliations", reconHandlers.bankReconciliationCreate);
router.get("/bank-reconciliations/:id", reconHandlers.bankReconciliationDetail);
router.post("/bank-reconciliations/:id/recompute", reconHandlers.bankReconciliationRecompute);
router.post("/bank-reconciliations/:id/reconcile", reconHandlers.bankReconciliationReconcile);
router.post("/bank-reconciliations/:id/reopen", reconHandlers.bankReconciliationReopen);
router.patch("/bank-reconciliations/:id/balances", reconHandlers.bankReconciliationUpdateBalances);

router.post("/bank-statements/categorize/charge", reconHandlers.bankStatementCategorizeCharge);
router.post("/bank-statements/categorize/interest", reconHandlers.bankStatementCategorizeInterest);
router.post("/bank-statements/categorize/ignore", reconHandlers.bankStatementIgnore);
router.post("/bank-statements/categorize/unknown", reconHandlers.bankStatementMarkUnknown);

router.get("/gateway-clearing/controls", reconHandlers.gatewayClearingControls);

router.get("/gst/status", gstHandlers.gstStatus);
router.get("/gst/overview", gstHandlers.gstOverview);
router.get("/gst/ledger", gstHandlers.gstLedger);
router.get("/gst/reconciliation", gstHandlers.gstReconciliation);
router.get("/gst/data-gaps", gstHandlers.gstDataGaps);

router.get("/gst/itc/summary", itcHandlers.itcSummary);
router.get("/gst/itc", itcHandlers.itcList);
router.get("/gst/itc/:id", itcHandlers.itcGet);
router.post("/gst/itc/discover", itcHandlers.itcDiscover);
router.post("/gst/itc/:id/verify", itcHandlers.itcVerify);
router.post("/gst/itc/:id/block", itcHandlers.itcBlock);
router.post("/gst/itc/:id/data-gap", itcHandlers.itcMarkDataGap);

router.get("/gst/reports/overview", gstReportHandlers.gstReportsOverview);
router.get("/gst/reports/outward", gstReportHandlers.gstReportsOutward);
router.get("/gst/reports/b2b", gstReportHandlers.gstReportsB2b);
router.get("/gst/reports/b2c", gstReportHandlers.gstReportsB2c);
router.get("/gst/reports/credit-notes", gstReportHandlers.gstReportsCreditNotes);
router.get("/gst/reports/hsn", gstReportHandlers.gstReportsHsn);
router.get("/gst/reports/rates", gstReportHandlers.gstReportsRates);
router.get("/gst/reports/3b-summary", gstReportHandlers.gstReports3bSummary);
router.get("/gst/reports/integrity", gstReportHandlers.gstReportsIntegrity);
router.get("/gst/reports/place-of-supply", gstReportHandlers.gstReportsPos);
router.get("/gst/reports/data-gaps", gstReportHandlers.gstReportsDataGaps);
router.get("/gst/export", gstReportHandlers.gstReportsExport);

/** Phase 6B — financial reports (TB / GL). Requires ACCOUNTING_REPORTS_ENABLED. */
router.get("/reports/trial-balance", financialReportHandlers.financialReportsTrialBalance);
router.get("/reports/general-ledger", financialReportHandlers.financialReportsGeneralLedger);
router.get("/reports/accounts", financialReportHandlers.financialReportsAccounts);
router.get("/reports/financial-year", financialReportHandlers.financialReportsFinancialYear);
router.get("/reports/profit-loss", financialReportHandlers.financialReportsProfitLoss);
router.get("/reports/balance-sheet", financialReportHandlers.financialReportsBalanceSheet);
router.get("/reports/dashboard", financialReportHandlers.financialReportsDashboard);
router.get("/reports/integrity", financialReportHandlers.financialReportsIntegrity);
router.get("/reports/test-fixtures", financialReportHandlers.financialReportsTestFixtures);
router.get("/reports/export/xlsx", financialReportHandlers.financialReportsExportXlsx);
router.get("/reports/export/gl-xlsx", financialReportHandlers.financialReportsExportGlXlsx);
router.get("/reports/export/pdf", financialReportHandlers.financialReportsExportPdf);

/** Phase 7B — production opening balance (after native accounting gate). */
router.get("/opening/status", openingHandlers.openingStatus);
router.get("/opening/batches", openingHandlers.openingBatchList);
router.post("/opening/batches", openingHandlers.openingBatchCreate);
router.get("/opening/batches/:id", openingHandlers.openingBatchGet);
router.put("/opening/batches/:id/staging", openingHandlers.openingBatchStaging);
router.post("/opening/batches/:id/validate", openingHandlers.openingBatchValidate);
router.post("/opening/batches/:id/preview", openingHandlers.openingBatchPreview);
router.post("/opening/batches/:id/post", openingHandlers.openingBatchPost);
router.get("/opening/templates/:kind", openingHandlers.openingTemplateGet);
router.post(
  "/opening/batches/:id/import/:kind",
  openingUpload.single("file"),
  openingHandlers.openingBatchImport
);
router.get("/opening/batches/:id/export/review", openingHandlers.openingBatchExportReview);

export { router as accountingAdminRoutes };
