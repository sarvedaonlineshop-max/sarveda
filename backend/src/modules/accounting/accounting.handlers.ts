import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { prisma } from "../../config/db";

import { AccountingError } from "./accounting-errors";
import {
  ACCOUNTING_MODULE_DISABLED_MESSAGE,
  isAccountingExpensePostingEnabled,
  isAccountingPurchasesPostingEnabled,
  isAccountingRefundPostingEnabled,
  isAccountingReportsEnabled,
  isAccountingSalesPostingEnabled,
  isAccountingSettlementPostingEnabled,
  isAccountingVendorPaymentPostingEnabled,
  isAccountingInventoryValuationEnabled,
  isAccountingPurchaseCapitalizationEnabled,
  isAccountingCogsPostingEnabled,
  isAccountingCogsReversalEnabled,
  isAccountingBankingEnabled,
  isAccountingBankReconciliationEnabled,
  isAccountingBankStatementImportEnabled,
  isAccountingGstEnabled,
  isAccountingGstReconciliationEnabled,
  isAccountingItcVerificationEnabled,
  isAccountingGstReportingEnabled,
  isNativeAccountingEnabled
} from "./accounting-flag";
import { SHIPPING_GST_POLICY } from "./gst.constants";
import { runOrderPaidDiscovery, scanPaidOrdersForMissingAccountingEvents } from "./discovery-worker";
import { getJournalEntryById, listJournalEntries } from "./journal.service";
import {
  postOrderPaidByIdentifier,
  previewOrderPaidByIdentifier
} from "./order-paid-posting.service";
import {
  postOrderRefundedFullByIdentifier,
  previewOrderRefundedFullByIdentifier
} from "./order-refunded-full-posting.service";
import { loadOrderPaidSnapshot, findOrderDiscoveryCandidates } from "./order-snapshot.service";
import { runOrderRefundedFullDiscovery } from "./refund-discovery-worker";
import {
  buildReconciliationReport,
  buildReconciliationV2Report,
  buildReconciliationV3Report,
  buildReconciliationV4Report,
  buildReconciliationV5ExpenseReport,
  buildSettlementBatchReconciliation
} from "./reconciliation.service";
import {
  buildPurchaseAccountingDashboard,
  buildPurchaseReconciliationReport,
  buildVendorPaymentReconciliationRow
} from "./purchase-reconciliation.service";
import { getCutoverConfigSummary } from "./accounting-cutover";
import { listAccountingAccounts } from "./seed-coa";
import { ORDER_PAID_CALC_VERSION } from "./order-paid.constants";
import { ORDER_REFUNDED_FULL_CALC_VERSION } from "./order-refunded-full.constants";
import { PAYMENT_GATEWAY_SETTLED_CALC_VERSION } from "./settlement.constants";
import { runRazorpaySettlementDiscovery } from "./settlement-discovery-worker";
import {
  importRazorpaySettlementEvidence,
  postRazorpaySettlement,
  previewRazorpaySettlement
} from "./settlement-posting.service";
import {
  postVendorBillByIdentifier,
  previewVendorBillByIdentifier
} from "./vendor-bill-posting.service";
import { runVendorBillDiscovery } from "./vendor-bill-discovery-worker";
import { VENDOR_BILL_POSTED_CALC_VERSION } from "./vendor-bill.constants";
import { INVENTORY_PURCHASE_CAPITALIZED_CALC_VERSION } from "./purchase-capitalization.constants";
import {
  postPurchaseCapitalization,
  previewPurchaseCapitalization
} from "./purchase-capitalization-posting.service";
import { runPurchaseCapitalizationDiscovery } from "./purchase-capitalization-discovery-worker";
import { buildPurchaseCapitalizationClearingReport } from "./purchase-capitalization-clearing.service";
import { INVENTORY_COGS_RECOGNIZED_CALC_VERSION } from "./inventory-cogs.constants";
import { runInventoryCogsDiscovery } from "./inventory-cogs-discovery-worker";
import { postInventoryCogs, previewInventoryCogs } from "./inventory-cogs-posting.service";
import { INVENTORY_COGS_REVERSED_CALC_VERSION } from "./inventory-cogs-reversal.constants";
import {
  BANK_OPENING_BALANCE_CALC_VERSION,
  BANK_TRANSFER_MADE_CALC_VERSION
} from "./bank-account.constants";
import { runInventoryCogsReversalDiscovery } from "./inventory-cogs-reversal-discovery-worker";
import {
  postInventoryCogsReversal,
  previewInventoryCogsReversal
} from "./inventory-cogs-reversal-posting.service";
import { findVendorBillDiscoveryCandidates } from "./vendor-bill-snapshot.service";
import { VENDOR_PAYMENT_MADE_CALC_VERSION } from "./vendor-payment.constants";
import {
  createVendorPaymentDraft,
  deleteVendorPaymentDraft,
  listVendorPayments,
  updateVendorPaymentDraft
} from "./vendor-payment.service";
import { postVendorPayment, previewVendorPayment } from "./vendor-payment-posting.service";
import { listOpenBillsWithNativeOutstanding } from "./vendor-payment-outstanding";
import { EXPENSE_RECORDED_CALC_VERSION } from "./expense.constants";
import { postExpenseById, previewExpenseById } from "./expense-posting.service";
import { runExpenseDiscovery } from "./expense-discovery-worker";
import { findExpenseDiscoveryCandidates } from "./expense-snapshot.service";
import {
  listExpenseAccountMappings,
  listExpensePaymentMappings,
  listUnmappedExpenseAccounts,
  listUnmappedPaidThrough,
  seedDefaultExpensePaymentMappings,
  setExpenseAccountMappingActive,
  setExpensePaymentMappingActive,
  upsertExpenseAccountMapping,
  upsertExpensePaymentMapping
} from "./expense-mapping.service";
import {
  buildInventoryClassificationSummary,
  buildInventoryReconciliationV1,
  buildInventoryReconciliationV2,
  buildInventoryReconciliationV3,
  buildInventoryReconciliationV4
} from "./inventory-reconciliation.service";
import {
  generateOpeningTemplateXlsx,
  hashOpeningPayload,
  parseOpeningInventoryXlsx,
  validateOpeningImportRows
} from "./opening-inventory-import.service";
import {
  getOpeningBatchById,
  listOpeningBatches,
  saveOpeningBatchDraft
} from "./opening-inventory-batch.service";
import {
  postOpeningInventoryBatch,
  previewOpeningInventoryPost
} from "./opening-inventory-posting.service";

function handleAccountingError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof AccountingError) {
    res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    return;
  }
  next(err);
}

const orderIdentifierSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    orderNumber: z.string().min(1).max(64).optional()
  })
  .refine((v) => Boolean(v.orderId || v.orderNumber), {
    message: "orderId or orderNumber required"
  });

const refundIdentifierSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    orderNumber: z.string().min(1).max(64).optional(),
    refundId: z.string().uuid().optional()
  })
  .refine((v) => Boolean(v.orderId || v.orderNumber || v.refundId), {
    message: "orderId, orderNumber, or refundId required"
  });

const discoverSchema = z.object({
  orderId: z.string().uuid().optional(),
  orderNumber: z.string().min(1).max(64).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  dryRun: z.boolean().optional()
});

const refundDiscoverSchema = z.object({
  orderId: z.string().uuid().optional(),
  orderNumber: z.string().min(1).max(64).optional(),
  refundId: z.string().uuid().optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  dryRun: z.boolean().optional()
});

export async function accountingStatus(_req: Request, res: Response) {
  res.json({
    success: true,
    data: {
      nativeAccountingEnabled: isNativeAccountingEnabled(),
      salesPostingEnabled: isAccountingSalesPostingEnabled(),
      refundPostingEnabled: isAccountingRefundPostingEnabled(),
      settlementPostingEnabled: isAccountingSettlementPostingEnabled(),
      purchasesPostingEnabled: isAccountingPurchasesPostingEnabled(),
      vendorPaymentPostingEnabled: isAccountingVendorPaymentPostingEnabled(),
      expensePostingEnabled: isAccountingExpensePostingEnabled(),
      inventoryValuationEnabled: isAccountingInventoryValuationEnabled(),
      purchaseCapitalizationEnabled: isAccountingPurchaseCapitalizationEnabled(),
      cogsPostingEnabled: isAccountingCogsPostingEnabled(),
      cogsReversalEnabled: isAccountingCogsReversalEnabled(),
      bankingEnabled: isAccountingBankingEnabled(),
      bankStatementImportEnabled: isAccountingBankStatementImportEnabled(),
      bankReconciliationEnabled: isAccountingBankReconciliationEnabled(),
      gstEnabled: isAccountingGstEnabled(),
      gstReconciliationEnabled: isAccountingGstReconciliationEnabled(),
      itcVerificationEnabled: isAccountingItcVerificationEnabled(),
      gstReportingEnabled: isAccountingGstReportingEnabled(),
      shippingGstPolicy: SHIPPING_GST_POLICY,
      reportsEnabled: isAccountingReportsEnabled(),
      cutover: getCutoverConfigSummary(),
      mode: "shadow_order_paid_refund_settlement_vendor_bill_vendor_payment_expense_inventory_opening_capitalization_cogs_reversal_v1",
      discoveryWorkerActive: isNativeAccountingEnabled(),
      calcVersions: {
        orderPaid: ORDER_PAID_CALC_VERSION,
        orderRefundedFull: ORDER_REFUNDED_FULL_CALC_VERSION,
        paymentGatewaySettled: PAYMENT_GATEWAY_SETTLED_CALC_VERSION,
        vendorBillPosted: VENDOR_BILL_POSTED_CALC_VERSION,
        vendorPaymentMade: VENDOR_PAYMENT_MADE_CALC_VERSION,
        expenseRecorded: EXPENSE_RECORDED_CALC_VERSION,
        inventoryPurchaseCapitalized: INVENTORY_PURCHASE_CAPITALIZED_CALC_VERSION,
        inventoryCogsRecognized: INVENTORY_COGS_RECOGNIZED_CALC_VERSION,
        inventoryCogsReversed: INVENTORY_COGS_REVERSED_CALC_VERSION,
        bankTransfer: BANK_TRANSFER_MADE_CALC_VERSION,
        bankOpeningBalance: BANK_OPENING_BALANCE_CALC_VERSION
      }
    }
  });
}

export async function accountingDashboard(_req: Request, res: Response) {
  const [
    accountCount,
    journalList,
    postedCount,
    pendingEvents,
    failedEvents,
    orderPaidPosted,
    orderRefundedFullPosted
  ] = await Promise.all([
    listAccountingAccounts().then((rows) => rows.length),
    listJournalEntries({ limit: 1 }),
    prisma.accountingJournalEntry.count({ where: { status: "POSTED" } }),
    prisma.accountingPostingEvent.count({ where: { status: "PENDING" } }),
    prisma.accountingPostingEvent.count({ where: { status: "FAILED" } }),
    prisma.accountingPostingEvent.count({
      where: { eventType: "ORDER_PAID", status: "POSTED" }
    }),
    prisma.accountingPostingEvent.count({
      where: { eventType: "ORDER_REFUNDED_FULL", status: "POSTED" }
    })
  ]);

  res.json({
    success: true,
    data: {
      accountCount,
      journalCount: journalList.total,
      postedJournalCount: postedCount,
      pendingPostingEvents: pendingEvents,
      failedPostingEvents: failedEvents,
      orderPaidPostedCount: orderPaidPosted,
      orderRefundedFullPostedCount: orderRefundedFullPosted,
      banner: "Native Accounting — Shadow / Development (Zoho remains authoritative)"
    }
  });
}

export async function accountingAccountsList(_req: Request, res: Response) {
  const accounts = await listAccountingAccounts();
  res.json({ success: true, data: { accounts } });
}

export async function accountingJournalsList(req: Request, res: Response) {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const data = await listJournalEntries({ limit, offset });
  res.json({ success: true, data });
}

export async function accountingJournalDetail(req: Request, res: Response) {
  const entry = await getJournalEntryById(req.params.id);
  if (!entry) {
    res.status(404).json({ success: false, error: "Journal not found", code: "NOT_FOUND" });
    return;
  }
  res.json({ success: true, data: entry });
}

export async function accountingDiscoveryHealth(_req: Request, res: Response) {
  const scan = await scanPaidOrdersForMissingAccountingEvents({ limit: 25 });
  res.json({
    success: true,
    data: {
      ...scan,
      message: scan.skipped
        ? ACCOUNTING_MODULE_DISABLED_MESSAGE
        : "ORDER_PAID discovery health — read-only scan"
    }
  });
}

export async function accountingOrderPaidPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = orderIdentifierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }

    const preview = await previewOrderPaidByIdentifier(parsed.data);
    res.json({ success: true, data: preview });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingOrderPaidPost(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = orderIdentifierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }

    const postedByUserId = req.authUser?.id;
    const result = await postOrderPaidByIdentifier(parsed.data, { postedByUserId });
    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingOrderPaidDiscover(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = discoverSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }

    const result = await runOrderPaidDiscovery({
      orderId: parsed.data.orderId,
      orderNumber: parsed.data.orderNumber,
      since: parsed.data.since ? new Date(parsed.data.since) : undefined,
      until: parsed.data.until ? new Date(parsed.data.until) : undefined,
      limit: parsed.data.limit,
      dryRun: parsed.data.dryRun,
      postedByUserId: req.authUser?.id
    });

    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingOrderPaidReconciliation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
    const orderNumber = typeof req.query.orderNumber === "string" ? req.query.orderNumber : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 500);

    if (orderId || orderNumber) {
      const snapshot = await loadOrderPaidSnapshot({ orderId, orderNumber });
      const report = await buildReconciliationReport([snapshot]);
      res.json({ success: true, data: report });
      return;
    }

    const since = req.query.since
      ? new Date(String(req.query.since))
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const until = req.query.until ? new Date(String(req.query.until)) : new Date();

    const candidates = await findOrderDiscoveryCandidates({ since, until, limit });
    const snapshots = [];
    for (const c of candidates) {
      snapshots.push(await loadOrderPaidSnapshot({ orderId: c.orderId }));
    }
    const report = await buildReconciliationReport(snapshots);
    res.json({ success: true, data: report });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingRefundedFullPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = refundIdentifierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }

    const preview = await previewOrderRefundedFullByIdentifier(parsed.data);
    res.json({ success: true, data: preview });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingRefundedFullPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = refundIdentifierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }

    const result = await postOrderRefundedFullByIdentifier(parsed.data, {
      postedByUserId: req.authUser?.id
    });
    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingRefundedFullDiscover(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = refundDiscoverSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }

    const result = await runOrderRefundedFullDiscovery({
      orderId: parsed.data.orderId,
      orderNumber: parsed.data.orderNumber,
      refundId: parsed.data.refundId,
      since: parsed.data.since ? new Date(parsed.data.since) : undefined,
      until: parsed.data.until ? new Date(parsed.data.until) : undefined,
      limit: parsed.data.limit,
      dryRun: parsed.data.dryRun,
      postedByUserId: req.authUser?.id
    });

    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingReconciliationV2(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
    const orderNumber = typeof req.query.orderNumber === "string" ? req.query.orderNumber : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 500);

    if (orderId || orderNumber) {
      const snapshot = await loadOrderPaidSnapshot({ orderId, orderNumber });
      const report = await buildReconciliationV2Report([snapshot.orderId]);
      res.json({ success: true, data: report });
      return;
    }

    const since = req.query.since
      ? new Date(String(req.query.since))
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const until = req.query.until ? new Date(String(req.query.until)) : new Date();

    const candidates = await findOrderDiscoveryCandidates({ since, until, limit });
    const report = await buildReconciliationV2Report(candidates.map((c) => c.orderId));
    res.json({ success: true, data: report });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

const settlementIdSchema = z.object({
  settlementId: z.string().min(3).max(64),
  targetBankAccountId: z.string().uuid().nullable().optional()
});

const settlementDiscoverSchema = z.object({
  settlementId: z.string().min(3).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  dryRun: z.boolean().optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional()
});

export async function accountingSettlementPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = settlementIdSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }
    const data = await previewRazorpaySettlement(parsed.data.settlementId, {
      targetBankAccountId: parsed.data.targetBankAccountId
    });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingSettlementImport(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = settlementIdSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }
    const data = await importRazorpaySettlementEvidence(parsed.data.settlementId);
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingSettlementPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = settlementIdSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }
    const data = await postRazorpaySettlement(parsed.data.settlementId, {
      postedByUserId: req.authUser?.id,
      targetBankAccountId: parsed.data.targetBankAccountId
    });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingSettlementDiscover(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = settlementDiscoverSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, code: "VALIDATION_ERROR" });
      return;
    }
    const data = await runRazorpaySettlementDiscovery({
      settlementId: parsed.data.settlementId,
      limit: parsed.data.limit,
      dryRun: parsed.data.dryRun,
      from: parsed.data.from,
      to: parsed.data.to,
      postedByUserId: req.authUser?.id
    });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingSettlementDetail(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const settlementId = String(req.params.settlementId ?? "");
    const data = await buildSettlementBatchReconciliation(settlementId);
    if (!data) {
      res.status(404).json({ success: false, error: "Settlement not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingSettlementList(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
    const rows = await prisma.accountingGatewaySettlement.findMany({
      orderBy: { settledAt: "desc" },
      take: limit,
      include: {
        _count: { select: { lines: true } },
        journalEntry: { select: { entryNumber: true, status: true } }
      }
    });
    res.json({
      success: true,
      data: {
        rows: rows.map((r) => ({
          id: r.id,
          providerSettlementId: r.providerSettlementId,
          settledAt: r.settledAt,
          utr: r.utr,
          currency: r.currency,
          grossInPaise: r.grossInPaise,
          feeInPaise: r.feeInPaise,
          taxInPaise: r.taxInPaise,
          netInPaise: r.netInPaise,
          status: r.status,
          gstItcStatus: r.gstItcStatus,
          lineCount: r._count.lines,
          journalEntryNumber: r.journalEntry?.entryNumber ?? null
        })),
        count: rows.length
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingReconciliationV3(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
    const orderNumber = typeof req.query.orderNumber === "string" ? req.query.orderNumber : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 500);

    if (orderId || orderNumber) {
      const snapshot = await loadOrderPaidSnapshot({ orderId, orderNumber });
      const report = await buildReconciliationV3Report([snapshot.orderId]);
      res.json({ success: true, data: report });
      return;
    }

    const since = req.query.since
      ? new Date(String(req.query.since))
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const until = req.query.until ? new Date(String(req.query.until)) : new Date();
    const candidates = await findOrderDiscoveryCandidates({ since, until, limit });
    const report = await buildReconciliationV3Report(candidates.map((c) => c.orderId));
    res.json({ success: true, data: report });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

const vendorBillIdentifierSchema = z
  .object({
    billId: z.string().uuid().optional(),
    billNumber: z.string().min(1).max(64).optional()
  })
  .refine((v) => Boolean(v.billId || v.billNumber), {
    message: "billId or billNumber required"
  });

const vendorBillDiscoverSchema = z.object({
  billId: z.string().uuid().optional(),
  billNumber: z.string().min(1).max(64).optional(),
  vendorId: z.string().uuid().optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  dryRun: z.boolean().optional()
});

export async function accountingVendorBillPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = vendorBillIdentifierSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const preview = await previewVendorBillByIdentifier(parsed.data);
    res.json({
      success: true,
      data: {
        snapshot: {
          ...preview.snapshot,
          billDate: preview.snapshot.billDate.toISOString(),
          dueDate: preview.snapshot.dueDate?.toISOString() ?? null,
          updatedAt: preview.snapshot.updatedAt.toISOString()
        },
        eligibility: preview.eligibility,
        proposal: preview.proposal
          ? {
              ...preview.proposal,
              accountingDate: preview.proposal.accountingDate.toISOString()
            }
          : null,
        buildError: preview.buildError ?? null,
        postingEvent: preview.postingEvent,
        sourceChangedAfterPost: preview.sourceChangedAfterPost
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingVendorBillPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = vendorBillIdentifierSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const result = await postVendorBillByIdentifier(parsed.data, {
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({
      success: true,
      data: {
        duplicate: result.duplicate,
        event: result.event,
        journal: result.journal,
        proposal: {
          ...result.proposal,
          accountingDate: result.proposal.accountingDate.toISOString()
        }
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingVendorBillDiscover(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = vendorBillDiscoverSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const result = await runVendorBillDiscovery({
      billId: parsed.data.billId,
      billNumber: parsed.data.billNumber,
      vendorId: parsed.data.vendorId,
      since: parsed.data.since ? new Date(parsed.data.since) : undefined,
      until: parsed.data.until ? new Date(parsed.data.until) : undefined,
      limit: parsed.data.limit,
      dryRun: parsed.data.dryRun,
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingReconciliationV4(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const billId = typeof req.query.billId === "string" ? req.query.billId : undefined;
    const billNumber = typeof req.query.billNumber === "string" ? req.query.billNumber : undefined;
    const vendorId = typeof req.query.vendorId === "string" ? req.query.vendorId : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 500);

    if (billId || billNumber) {
      const { loadVendorBillSnapshot } = await import("./vendor-bill-snapshot.service");
      const snapshot = await loadVendorBillSnapshot({ billId, billNumber });
      const report = await buildReconciliationV4Report([snapshot.billId]);
      res.json({ success: true, data: report });
      return;
    }

    const since = req.query.since
      ? new Date(String(req.query.since))
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const until = req.query.until ? new Date(String(req.query.until)) : new Date();
    const candidates = await findVendorBillDiscoveryCandidates({
      vendorId,
      since,
      until,
      limit
    });
    const report = await buildReconciliationV4Report(candidates.map((c) => c.id));
    res.json({ success: true, data: report });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingReconciliationV5(
  req: Request,
  res: Response,
  next: NextFunction
) {
  return accountingReconciliationV4(req, res, next);
}

export async function accountingPurchaseDashboard(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await buildPurchaseAccountingDashboard();
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingPurchaseReconciliation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const billId = typeof req.query.billId === "string" ? req.query.billId : undefined;
    const expenseId = typeof req.query.expenseId === "string" ? req.query.expenseId : undefined;
    const paymentId = typeof req.query.paymentId === "string" ? req.query.paymentId : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 500);
    const since = req.query.since ? new Date(String(req.query.since)) : undefined;
    const until = req.query.until ? new Date(String(req.query.until)) : undefined;

    if (paymentId && !billId && !expenseId) {
      const row = await buildVendorPaymentReconciliationRow(paymentId);
      res.json({ success: true, data: { version: "purchase-recon-v5", payments: [row] } });
      return;
    }

    const report = await buildPurchaseReconciliationReport({
      billIds: billId ? [billId] : undefined,
      expenseIds: expenseId ? [expenseId] : undefined,
      paymentIds: paymentId ? [paymentId] : undefined,
      since,
      until,
      limit
    });
    res.json({ success: true, data: report });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

const paymentMethodSchema = z.enum(["BANK_TRANSFER", "UPI", "CHEQUE", "CASH"]);

const allocationSchema = z.object({
  vendorBillId: z.string().uuid(),
  amountInPaise: z.number().int().positive()
});

const vendorPaymentCreateSchema = z.object({
  vendorId: z.string().uuid(),
  paymentDate: z.string().min(1),
  amountInPaise: z.number().int().positive(),
  currency: z.string().min(1).max(8).optional(),
  paymentMethod: paymentMethodSchema,
  utr: z.string().max(128).nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  allocations: z.array(allocationSchema).min(1)
});

const vendorPaymentUpdateSchema = z.object({
  paymentDate: z.string().min(1).optional(),
  amountInPaise: z.number().int().positive().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  utr: z.string().max(128).nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  allocations: z.array(allocationSchema).min(1).optional()
});

function serializePaymentRow(p: {
  id: string;
  paymentNumber: string;
  vendorId: string;
  paymentDate: Date;
  amountInPaise: number;
  currency: string;
  paymentMethod: string;
  paidAccountCode: string;
  utr: string | null;
  notes: string | null;
  status: string;
  sourcePayloadHash: string;
  postingEventId: string | null;
  journalEntryId: string | null;
  createdAt: Date;
  updatedAt: Date;
  vendor?: { id: string; name: string };
  allocations?: Array<{ vendorBillId: string; amountInPaise: number }>;
  journalEntry?: { entryNumber: string; status: string } | null;
}) {
  return {
    ...p,
    paymentDate: p.paymentDate.toISOString().slice(0, 10),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString()
  };
}

export async function accountingVendorPaymentList(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const vendorId = typeof req.query.vendorId === "string" ? req.query.vendorId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const rows = await listVendorPayments({ vendorId, status, limit });
    res.json({ success: true, data: { payments: rows.map(serializePaymentRow) } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingVendorPaymentOpenBills(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const vendorId = typeof req.query.vendorId === "string" ? req.query.vendorId : undefined;
    if (!vendorId) {
      res.status(400).json({
        success: false,
        error: "vendorId required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const bills = await listOpenBillsWithNativeOutstanding(vendorId);
    res.json({
      success: true,
      data: {
        bills: bills.map((b) => ({
          ...b,
          billDate: b.billDate.toISOString().slice(0, 10),
          dueDate: b.dueDate?.toISOString().slice(0, 10) ?? null
        }))
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingVendorPaymentCreate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = vendorPaymentCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const payment = await createVendorPaymentDraft({
      ...parsed.data,
      paymentDate: new Date(parsed.data.paymentDate),
      createdByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.status(201).json({ success: true, data: { payment: serializePaymentRow(payment) } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingVendorPaymentUpdate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const paymentId = String(req.params.id ?? "");
    const parsed = vendorPaymentUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const payment = await updateVendorPaymentDraft(paymentId, {
      ...parsed.data,
      paymentDate: parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : undefined
    });
    res.json({ success: true, data: { payment: serializePaymentRow(payment) } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingVendorPaymentDelete(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const paymentId = String(req.params.id ?? "");
    await deleteVendorPaymentDraft(paymentId);
    res.json({ success: true, data: { deleted: true, paymentId } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingVendorPaymentGet(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const paymentId = String(req.params.id ?? "");
    const preview = await previewVendorPayment(paymentId);
    res.json({
      success: true,
      data: {
        snapshot: {
          ...preview.snapshot,
          paymentDate: preview.snapshot.paymentDate.toISOString().slice(0, 10),
          updatedAt: preview.snapshot.updatedAt.toISOString()
        },
        proposal: preview.proposal
          ? {
              ...preview.proposal,
              accountingDate: preview.proposal.accountingDate.toISOString().slice(0, 10)
            }
          : null,
        buildError: preview.buildError ?? null,
        postingEvent: preview.postingEvent,
        sourceChangedAfterPost: preview.sourceChangedAfterPost
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingVendorPaymentPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const paymentId =
      typeof req.body?.paymentId === "string"
        ? req.body.paymentId
        : typeof req.params.id === "string"
          ? req.params.id
          : "";
    if (!paymentId) {
      res.status(400).json({
        success: false,
        error: "paymentId required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const preview = await previewVendorPayment(paymentId);
    res.json({
      success: true,
      data: {
        snapshot: {
          ...preview.snapshot,
          paymentDate: preview.snapshot.paymentDate.toISOString().slice(0, 10),
          updatedAt: preview.snapshot.updatedAt.toISOString()
        },
        proposal: preview.proposal
          ? {
              ...preview.proposal,
              accountingDate: preview.proposal.accountingDate.toISOString().slice(0, 10)
            }
          : null,
        buildError: preview.buildError ?? null,
        postingEvent: preview.postingEvent,
        sourceChangedAfterPost: preview.sourceChangedAfterPost
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingVendorPaymentPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = z
      .object({ paymentId: z.string().uuid() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "paymentId required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const result = await postVendorPayment(parsed.data.paymentId, {
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({
      success: true,
      data: {
        duplicate: result.duplicate,
        event: result.event,
        journal: result.journal,
        proposal: {
          ...result.proposal,
          accountingDate: result.proposal.accountingDate.toISOString().slice(0, 10)
        }
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

const expenseIdSchema = z.object({
  expenseId: z.string().uuid(),
  acknowledgePossibleDuplicate: z.boolean().optional()
});

const expenseDiscoverSchema = z.object({
  expenseId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  dryRun: z.boolean().optional(),
  acknowledgePossibleDuplicate: z.boolean().optional()
});

export async function accountingExpensePreview(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = expenseIdSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "expenseId required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const preview = await previewExpenseById(parsed.data.expenseId, {
      acknowledgePossibleDuplicate: parsed.data.acknowledgePossibleDuplicate
    });
    res.json({
      success: true,
      data: {
        snapshot: {
          ...preview.snapshot,
          expenseDate: preview.snapshot.expenseDate.toISOString().slice(0, 10),
          updatedAt: preview.snapshot.updatedAt.toISOString()
        },
        eligibility: preview.eligibility,
        proposal: preview.proposal
          ? {
              ...preview.proposal,
              accountingDate: preview.proposal.accountingDate.toISOString().slice(0, 10)
            }
          : null,
        buildError: preview.buildError ?? null,
        postingEvent: preview.postingEvent,
        sourceChangedAfterPost: preview.sourceChangedAfterPost,
        duplicate: preview.duplicate
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingExpensePost(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = expenseIdSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "expenseId required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const result = await postExpenseById(parsed.data.expenseId, {
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id,
      acknowledgePossibleDuplicate: parsed.data.acknowledgePossibleDuplicate
    });
    res.json({
      success: true,
      data: {
        duplicate: result.duplicate,
        event: result.event,
        journal: result.journal,
        proposal: {
          ...result.proposal,
          accountingDate: result.proposal.accountingDate.toISOString().slice(0, 10)
        }
      }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingExpenseDiscover(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = expenseDiscoverSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const result = await runExpenseDiscovery({
      expenseId: parsed.data.expenseId,
      vendorId: parsed.data.vendorId,
      since: parsed.data.since ? new Date(parsed.data.since) : undefined,
      until: parsed.data.until ? new Date(parsed.data.until) : undefined,
      limit: parsed.data.limit,
      dryRun: parsed.data.dryRun,
      acknowledgePossibleDuplicate: parsed.data.acknowledgePossibleDuplicate,
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data: result });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingReconciliationV5Expenses(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const expenseId = typeof req.query.expenseId === "string" ? req.query.expenseId : undefined;
    const vendorId = typeof req.query.vendorId === "string" ? req.query.vendorId : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 500);

    if (expenseId) {
      const report = await buildReconciliationV5ExpenseReport([expenseId]);
      res.json({ success: true, data: report });
      return;
    }

    const since = req.query.since
      ? new Date(String(req.query.since))
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const until = req.query.until ? new Date(String(req.query.until)) : new Date();
    const candidates = await findExpenseDiscoveryCandidates({
      vendorId,
      since,
      until,
      limit
    });
    const report = await buildReconciliationV5ExpenseReport(candidates.map((c) => c.id));
    res.json({ success: true, data: report });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingExpenseMappingsList(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await seedDefaultExpensePaymentMappings();
    const [accounts, payments, unmappedAccounts, unmappedPayments] = await Promise.all([
      listExpenseAccountMappings(),
      listExpensePaymentMappings(),
      listUnmappedExpenseAccounts(),
      listUnmappedPaidThrough()
    ]);
    res.json({
      success: true,
      data: { accounts, payments, unmappedAccounts, unmappedPayments }
    });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingExpenseAccountMappingUpsert(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = z
      .object({
        sourceName: z.string().min(1).max(200),
        accountingAccountCode: z.string().min(1).max(16),
        isActive: z.boolean().optional()
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const row = await upsertExpenseAccountMapping(parsed.data);
    res.json({ success: true, data: { mapping: row } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingExpensePaymentMappingUpsert(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = z
      .object({
        sourceName: z.string().min(1).max(200),
        paidAccountCode: z.enum(["1000", "1010"]).optional(),
        bankAccountId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional()
      })
      .refine((v) => Boolean(v.paidAccountCode || v.bankAccountId), {
        message: "paidAccountCode or bankAccountId required"
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const row = await upsertExpensePaymentMapping(parsed.data);
    res.json({ success: true, data: { mapping: row } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingExpenseAccountMappingPatch(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = String(req.params.id ?? "");
    const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "isActive required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const row = await setExpenseAccountMappingActive(id, parsed.data.isActive);
    res.json({ success: true, data: { mapping: row } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingExpensePaymentMappingPatch(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = String(req.params.id ?? "");
    const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "isActive required",
        code: "VALIDATION_ERROR"
      });
      return;
    }
    const row = await setExpensePaymentMappingActive(id, parsed.data.isActive);
    res.json({ success: true, data: { mapping: row } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

const openingPreviewMetaSchema = z.object({
  effectiveDate: z.string().min(1),
  valuationSource: z.string().min(1).max(256),
  sourceDocumentRef: z.string().max(256).optional(),
  preparedBy: z.string().max(128).optional(),
  reviewedBy: z.string().max(128).optional(),
  allowQuantityMismatch: z.coerce.boolean().optional()
});

const openingBatchIdSchema = z.object({
  batchId: z.string().uuid()
});

export async function accountingInventoryReconciliation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const sku = typeof req.query.sku === "string" ? req.query.sku : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 500), 1), 2000);
    const physicalOnly = req.query.physicalOnly === "1" || req.query.physicalOnly === "true";
    const data = await buildInventoryReconciliationV1({ sku, limit, physicalOnly });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryClassificationSummary(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await buildInventoryClassificationSummary();
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryOpeningTemplate(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const buf = await generateOpeningTemplateXlsx();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="sarveda-opening-inventory-template.xlsx"'
    );
    res.send(buf);
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryOpeningPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file?.buffer) {
      res.status(400).json({ success: false, error: "XLSX file required", code: "VALIDATION_ERROR" });
      return;
    }

    const metaParsed = openingPreviewMetaSchema.safeParse(req.body ?? {});
    if (!metaParsed.success) {
      res.status(400).json({
        success: false,
        error: metaParsed.error.issues[0]?.message ?? "Invalid metadata",
        code: "VALIDATION_ERROR"
      });
      return;
    }

    const rows = await parseOpeningInventoryXlsx(file.buffer);
    const preview = await validateOpeningImportRows({
      rows,
      ...metaParsed.data,
      sourceFileName: file.originalname,
      sourcePayloadHash: hashOpeningPayload(rows)
    });
    res.json({ success: true, data: preview });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryOpeningSaveDraft(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const bodySchema = openingPreviewMetaSchema.extend({
      batchId: z.string().uuid().optional(),
      rows: z.array(
        z.object({
          sku: z.string(),
          variantId: z.string().uuid(),
          openingQuantity: z.number().int().nonnegative(),
          unitCostInPaise: z.number().int().positive(),
          totalCostInPaise: z.number().int().nonnegative(),
          operationalOnHand: z.number().int(),
          quantityMismatch: z.boolean(),
          classification: z.enum([
            "PHYSICAL_INVENTORY",
            "NON_INVENTORY",
            "COURSE_DIGITAL_PLACEHOLDER",
            "UNKNOWN"
          ]),
          excluded: z.boolean(),
          productName: z.string(),
          rowNumber: z.number().int(),
          notes: z.string().optional()
        })
      )
    });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
        code: "VALIDATION_ERROR"
      });
      return;
    }

    const eligible = parsed.data.rows.filter((r) => !r.excluded);
    const preview = {
      effectiveDate: parsed.data.effectiveDate,
      valuationSource: parsed.data.valuationSource,
      sourceDocumentRef: parsed.data.sourceDocumentRef,
      preparedBy: parsed.data.preparedBy,
      reviewedBy: parsed.data.reviewedBy,
      allowQuantityMismatch: Boolean(parsed.data.allowQuantityMismatch),
      sourcePayloadHash: hashOpeningPayload(
        eligible.map((r) => ({
          sku: r.sku,
          openingQty: r.openingQuantity,
          unitCostInPaise: r.unitCostInPaise,
          rowNumber: r.rowNumber
        }))
      ),
      rows: parsed.data.rows,
      errors: [],
      totals: {
        quantity: eligible.reduce((s, r) => s + r.openingQuantity, 0),
        valueInPaise: eligible.reduce((s, r) => s + r.totalCostInPaise, 0),
        physicalSkuCount: eligible.length,
        excludedSkuCount: parsed.data.rows.length - eligible.length
      },
      canSaveDraft: eligible.length > 0,
      canPost: eligible.length > 0
    };

    const batch = await saveOpeningBatchDraft({
      preview,
      batchId: parsed.data.batchId,
      createdByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data: { batch } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryOpeningPreviewPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = openingBatchIdSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "batchId required", code: "VALIDATION_ERROR" });
      return;
    }
    const data = await previewOpeningInventoryPost(parsed.data.batchId);
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryOpeningPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = openingBatchIdSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "batchId required", code: "VALIDATION_ERROR" });
      return;
    }
    const data = await postOpeningInventoryBatch(parsed.data.batchId, {
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryOpeningBatchList(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
    const batches = await listOpeningBatches(limit);
    res.json({ success: true, data: { batches } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryOpeningBatchDetail(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const batchId = String(req.params.batchId ?? "");
    const batch = await getOpeningBatchById(batchId);
    if (!batch) {
      res.status(404).json({ success: false, error: "Batch not found", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { batch } });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

const purchaseCapitalizationPreviewSchema = z.object({
  receiptLineId: z.string().uuid()
});

const purchaseCapitalizationDiscoverSchema = z.object({
  receiptId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  vendorBillId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  dryRun: z.coerce.boolean().optional()
});

export async function accountingInventoryReconciliationV2(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const sku = typeof req.query.sku === "string" ? req.query.sku : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 500), 1), 2000);
    const physicalOnly = req.query.physicalOnly === "1" || req.query.physicalOnly === "true";
    const data = await buildInventoryReconciliationV2({ sku, limit, physicalOnly });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryReconciliationV3(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const sku = typeof req.query.sku === "string" ? req.query.sku : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 500), 1), 2000);
    const physicalOnly = req.query.physicalOnly === "1" || req.query.physicalOnly === "true";
    const data = await buildInventoryReconciliationV3({ sku, limit, physicalOnly });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryReconciliationV4(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const sku = typeof req.query.sku === "string" ? req.query.sku : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 500), 1), 2000);
    const physicalOnly = req.query.physicalOnly === "1" || req.query.physicalOnly === "true";
    const data = await buildInventoryReconciliationV4({ sku, limit, physicalOnly });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingPurchaseCapitalizationPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = purchaseCapitalizationPreviewSchema.parse(req.body);
    const data = await previewPurchaseCapitalization(parsed.receiptLineId);
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingPurchaseCapitalizationPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = purchaseCapitalizationPreviewSchema.parse(req.body);
    const data = await postPurchaseCapitalization(parsed.receiptLineId, {
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingPurchaseCapitalizationDiscover(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = purchaseCapitalizationDiscoverSchema.parse(req.body);
    const data = await runPurchaseCapitalizationDiscovery(parsed);
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingPurchaseCapitalizationClearing(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const vendorBillId = typeof req.query.vendorBillId === "string" ? req.query.vendorBillId : undefined;
    const purchaseOrderId =
      typeof req.query.purchaseOrderId === "string" ? req.query.purchaseOrderId : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
    const data = await buildPurchaseCapitalizationClearingReport({ vendorBillId, purchaseOrderId, limit });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

const inventoryCogsPreviewSchema = z.object({
  orderId: z.string().uuid().optional(),
  orderNumber: z.string().min(1).optional()
});

const inventoryCogsDiscoverSchema = z.object({
  orderId: z.string().uuid().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  variantId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  dryRun: z.coerce.boolean().optional()
});

export async function accountingInventoryCogsPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = inventoryCogsPreviewSchema.parse(req.body);
    const data = await previewInventoryCogs(parsed);
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryCogsPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = inventoryCogsPreviewSchema.parse(req.body);
    const data = await postInventoryCogs(parsed, {
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryCogsDiscover(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = inventoryCogsDiscoverSchema.parse(req.body);
    const data = await runInventoryCogsDiscovery({
      orderId: parsed.orderId,
      since: parsed.since ? new Date(parsed.since) : undefined,
      until: parsed.until ? new Date(parsed.until) : undefined,
      variantId: parsed.variantId,
      limit: parsed.limit,
      dryRun: parsed.dryRun,
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

const inventoryCogsReversalPreviewSchema = z.object({
  restockEventId: z.string().uuid()
});

const inventoryCogsReversalDiscoverSchema = z.object({
  restockEventId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  orderItemId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  dryRun: z.coerce.boolean().optional()
});

export async function accountingInventoryCogsReversalPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = inventoryCogsReversalPreviewSchema.parse(req.body);
    const data = await previewInventoryCogsReversal(parsed.restockEventId);
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryCogsReversalPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = inventoryCogsReversalPreviewSchema.parse(req.body);
    const data = await postInventoryCogsReversal(parsed.restockEventId, {
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}

export async function accountingInventoryCogsReversalDiscover(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = inventoryCogsReversalDiscoverSchema.parse(req.body);
    const data = await runInventoryCogsReversalDiscovery({
      restockEventId: parsed.restockEventId,
      orderId: parsed.orderId,
      orderItemId: parsed.orderItemId,
      variantId: parsed.variantId,
      since: parsed.since ? new Date(parsed.since) : undefined,
      until: parsed.until ? new Date(parsed.until) : undefined,
      limit: parsed.limit,
      dryRun: parsed.dryRun,
      postedByUserId: (req as { authUser?: { id?: string } }).authUser?.id
    });
    res.json({ success: true, data });
  } catch (err) {
    handleAccountingError(err, res, next);
  }
}
