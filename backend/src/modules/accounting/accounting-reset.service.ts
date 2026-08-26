/**
 * Phase 7B — dependency-aware accounting-domain reset planner + executor.
 * NEVER expose as HTTP API — CLI / ops only.
 */
import { createHash } from "crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import {
  isAccountingOpeningBalanceEnabled,
  isNativeAccountingEnabled
} from "./accounting-flag";
import { TEST_IDENTIFIER_RE } from "./opening.constants";
import { isProductionLikeEnvironment } from "./production-guard";

/** Unit-testable token helpers */
export function extractDatabaseName(databaseUrl: string): string {
  const url = databaseUrl.trim();
  if (!url) return "unknown";
  try {
    const parsed = new URL(url.replace(/^postgresql:/, "postgres:"));
    const path = parsed.pathname.replace(/^\//, "");
    return path.split("?")[0] || "unknown";
  } catch {
    const m = url.match(/\/([^/?]+)(?:\?|$)/);
    return m?.[1] ?? "unknown";
  }
}

export function buildAccountingResetConfirmToken(dbName: string, backupRef: string): string {
  return createHash("sha256")
    .update(`ACCOUNTING-RESET|${dbName}|${backupRef}`)
    .digest("hex");
}

export function verifyAccountingResetConfirmToken(
  token: string,
  dbName: string,
  backupRef: string
): boolean {
  const expected = buildAccountingResetConfirmToken(dbName, backupRef);
  return token.trim().toLowerCase() === expected.toLowerCase();
}

export function isLocalhostDatabase(databaseUrl: string): boolean {
  const u = databaseUrl.toLowerCase();
  return (
    u.includes("localhost") ||
    u.includes("127.0.0.1") ||
    u.includes("@postgres:") ||
    u.includes("@db:5432")
  );
}

export type CommerceFingerprint = {
  orders: number;
  payments: number;
  refunds: number;
  products: number;
  productVariants: number;
  inventoryOnHandSum: number;
};

export type ResetManifestEntry = {
  table: string;
  rows_to_remove: number;
  rows_to_preserve: number;
  reason: string;
  dependency_order: number;
  commerce_impact: boolean;
  reversible_via_backup: boolean;
};

export type ResetManifest = {
  mode: "dry-run" | "execute";
  generatedAt: string;
  dbName: string;
  dbHostHint: string;
  operator?: string;
  backupRef?: string;
  dependency_order: string[];
  entries: ResetManifestEntry[];
  commerce_fingerprint_before: CommerceFingerprint;
  commerce_fingerprint_after?: CommerceFingerprint;
  blocking_reasons: string[];
  preserved_tables: string[];
  test_bank_gl_deactivation_candidates: Array<{
    glAccountCode: string;
    bankAccountId: string;
    name: string;
    wouldDeactivate: boolean;
  }>;
  execute_allowed: boolean;
};

type ResetDelegate = {
  deleteMany: (args?: unknown) => Promise<{ count: number }>;
};

type ResetModelKey =
  | "accountingBankStatementMatch"
  | "accountingBankStatementLine"
  | "accountingBankStatementImport"
  | "accountingBankReconciliation"
  | "accountingBankTransfer"
  | "accountingVendorPaymentAllocation"
  | "accountingVendorPayment"
  | "accountingGatewaySettlementLine"
  | "accountingGatewaySettlement"
  | "accountingInventoryCostConsumption"
  | "accountingInventoryCostLayer"
  | "accountingItcStatusHistory"
  | "accountingItcEvidence"
  | "accountingOpeningBatch"
  | "accountingInventoryOpeningBatchItem"
  | "accountingInventoryOpeningBatch"
  | "accountingDocumentLink"
  | "accountingJournalLine"
  | "accountingPostingEvent"
  | "accountingJournalEntry"
  | "accountingAuditLog"
  | "accountingExpenseAccountMapping"
  | "accountingExpensePaymentMapping"
  | "accountingBankAccount";

type TablePlan = {
  table: string;
  prismaModel: ResetModelKey;
  reason: string;
  commerce_impact: boolean;
  preserve?: boolean;
};

/** FK-safe delete order — children before parents. Verified against schema.prisma Aug 2026. */
const RESET_TABLE_PLAN: TablePlan[] = [
  {
    table: "AccountingBankStatementMatch",
    prismaModel: "accountingBankStatementMatch",
    reason: "Bank statement match candidates (depends on lines + journals)",
    commerce_impact: false
  },
  {
    table: "AccountingBankStatementLine",
    prismaModel: "accountingBankStatementLine",
    reason: "Imported bank statement evidence lines",
    commerce_impact: false
  },
  {
    table: "AccountingBankStatementImport",
    prismaModel: "accountingBankStatementImport",
    reason: "Committed bank statement imports",
    commerce_impact: false
  },
  {
    table: "AccountingBankReconciliation",
    prismaModel: "accountingBankReconciliation",
    reason: "Formal bank reconciliation periods",
    commerce_impact: false
  },
  {
    table: "AccountingBankTransfer",
    prismaModel: "accountingBankTransfer",
    reason: "Accounting-owned internal bank transfers",
    commerce_impact: false
  },
  {
    table: "AccountingVendorPaymentAllocation",
    prismaModel: "accountingVendorPaymentAllocation",
    reason: "AP payment allocations (accounting-owned; VendorBill preserved)",
    commerce_impact: false
  },
  {
    table: "AccountingVendorPayment",
    prismaModel: "accountingVendorPayment",
    reason: "Accounting-owned supplier payments",
    commerce_impact: false
  },
  {
    table: "AccountingGatewaySettlementLine",
    prismaModel: "accountingGatewaySettlementLine",
    reason: "Gateway settlement line items",
    commerce_impact: false
  },
  {
    table: "AccountingGatewaySettlement",
    prismaModel: "accountingGatewaySettlement",
    reason: "Gateway settlement batches",
    commerce_impact: false
  },
  {
    table: "AccountingInventoryCostConsumption",
    prismaModel: "accountingInventoryCostConsumption",
    reason: "FIFO consumption records",
    commerce_impact: false
  },
  {
    table: "AccountingInventoryCostLayer",
    prismaModel: "accountingInventoryCostLayer",
    reason: "FIFO cost layers (ops Inventory.onHand preserved)",
    commerce_impact: false
  },
  {
    table: "AccountingItcStatusHistory",
    prismaModel: "accountingItcStatusHistory",
    reason: "ITC status audit trail",
    commerce_impact: false
  },
  {
    table: "AccountingItcEvidence",
    prismaModel: "accountingItcEvidence",
    reason: "ITC evidence records",
    commerce_impact: false
  },
  {
    table: "AccountingOpeningBatch",
    prismaModel: "accountingOpeningBatch",
    reason: "Phase 7B production opening batches (+ staging children cascade)",
    commerce_impact: false
  },
  {
    table: "AccountingInventoryOpeningBatchItem",
    prismaModel: "accountingInventoryOpeningBatchItem",
    reason: "Phase 3D1 inventory opening batch items",
    commerce_impact: false
  },
  {
    table: "AccountingInventoryOpeningBatch",
    prismaModel: "accountingInventoryOpeningBatch",
    reason: "Phase 3D1 inventory opening batches",
    commerce_impact: false
  },
  {
    table: "AccountingDocumentLink",
    prismaModel: "accountingDocumentLink",
    reason: "Document ↔ journal links",
    commerce_impact: false
  },
  {
    table: "AccountingJournalLine",
    prismaModel: "accountingJournalLine",
    reason: "Journal lines (before journal entries)",
    commerce_impact: false
  },
  {
    table: "AccountingPostingEvent",
    prismaModel: "accountingPostingEvent",
    reason: "Idempotent posting events",
    commerce_impact: false
  },
  {
    table: "AccountingJournalEntry",
    prismaModel: "accountingJournalEntry",
    reason: "Native journal entries",
    commerce_impact: false
  },
  {
    table: "AccountingAuditLog",
    prismaModel: "accountingAuditLog",
    reason: "Accounting audit trail",
    commerce_impact: false
  },
  {
    table: "AccountingExpenseAccountMapping",
    prismaModel: "accountingExpenseAccountMapping",
    reason: "Expense → CoA mappings",
    commerce_impact: false
  },
  {
    table: "AccountingExpensePaymentMapping",
    prismaModel: "accountingExpensePaymentMapping",
    reason: "Expense paid-through → bank mappings",
    commerce_impact: false
  },
  {
    table: "AccountingBankAccount",
    prismaModel: "accountingBankAccount",
    reason: "Bank/cash registry (CoA codes preserved on AccountingAccount)",
    commerce_impact: false
  }
];

const PRESERVED_TABLES = [
  "AccountingAccount",
  "AccountingPeriod",
  "AccountingSequence",
  "Order",
  "OrderItem",
  "Payment",
  "Refund",
  "Product",
  "ProductVariant",
  "Inventory",
  "User",
  "Vendor",
  "VendorBill",
  "PurchaseOrder",
  "PurchaseReceipt",
  "Expense"
];

async function countModel(model: ResetModelKey): Promise<number> {
  try {
    const delegate = prisma[model] as { count: (args?: unknown) => Promise<number> };
    return await delegate.count();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) return 0;
    throw err;
  }
}

export async function collectCommerceFingerprint(): Promise<CommerceFingerprint> {
  const [orders, payments, refunds, products, productVariants, invAgg] = await Promise.all([
    prisma.order.count(),
    prisma.payment.count(),
    prisma.refund.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.inventory.aggregate({ _sum: { onHand: true } })
  ]);
  return {
    orders,
    payments,
    refunds,
    products,
    productVariants,
    inventoryOnHandSum: invAgg._sum.onHand ?? 0
  };
}

function dbHostHint(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl.replace(/^postgresql:/, "postgres:"));
    return parsed.hostname;
  } catch {
    return "unknown";
  }
}

async function findTestBankGlDeactivationCandidates(): Promise<
  ResetManifest["test_bank_gl_deactivation_candidates"]
> {
  const banks = await prisma.accountingBankAccount.findMany({
    where: {
      OR: [
        { name: { contains: "TEST", mode: "insensitive" } },
        { glAccountCode: { contains: "TEST" } }
      ]
    },
    select: { id: true, name: true, glAccountCode: true, isActive: true }
  });

  const candidates: ResetManifest["test_bank_gl_deactivation_candidates"] = [];
  for (const b of banks) {
    if (!TEST_IDENTIFIER_RE.test(b.name) && !TEST_IDENTIFIER_RE.test(b.glAccountCode)) continue;
    const journalUse = await prisma.accountingJournalLine.count({
      where: { account: { code: b.glAccountCode } }
    });
    candidates.push({
      glAccountCode: b.glAccountCode,
      bankAccountId: b.id,
      name: b.name,
      wouldDeactivate: journalUse === 0 && b.isActive
    });
  }
  return candidates;
}

async function collectBlockingReasons(): Promise<string[]> {
  const reasons: string[] = [];
  if (isNativeAccountingEnabled()) {
    reasons.push("NATIVE_ACCOUNTING_ENABLED is ON — all accounting flags must be OFF before reset");
  }
  if (isAccountingOpeningBalanceEnabled()) {
    reasons.push("ACCOUNTING_OPENING_BALANCE_ENABLED is ON — disable before reset");
  }
  const postedOpening = await prisma.accountingOpeningBatch
    .findFirst({
      where: { status: "POSTED" },
      select: { batchNumber: true }
    })
    .catch(() => null);
  if (postedOpening) {
    reasons.push(`POSTED production opening batch exists: ${postedOpening.batchNumber}`);
  }
  return reasons;
}

export type PlanAccountingResetInput = {
  databaseUrl?: string;
  operator?: string;
  backupRef?: string;
  confirmToken?: string;
  execute?: boolean;
  allowLocalhost?: boolean;
};

export async function planAccountingReset(
  input: PlanAccountingResetInput = {}
): Promise<ResetManifest> {
  const databaseUrl = input.databaseUrl ?? process.env.DATABASE_URL ?? "";
  const dbName = extractDatabaseName(databaseUrl);
  const mode = input.execute ? "execute" : "dry-run";
  const commerceBefore = await collectCommerceFingerprint();

  const entries: ResetManifestEntry[] = [];
  for (let i = 0; i < RESET_TABLE_PLAN.length; i++) {
    const plan = RESET_TABLE_PLAN[i]!;
    const rows = await countModel(plan.prismaModel);
    entries.push({
      table: plan.table,
      rows_to_remove: rows,
      rows_to_preserve: 0,
      reason: plan.reason,
      dependency_order: i + 1,
      commerce_impact: plan.commerce_impact,
      reversible_via_backup: true
    });
  }

  for (const preserved of PRESERVED_TABLES) {
    let rows = 0;
    switch (preserved) {
      case "Order":
        rows = await prisma.order.count();
        break;
      case "OrderItem":
        rows = await prisma.orderItem.count();
        break;
      case "Payment":
        rows = await prisma.payment.count();
        break;
      case "Refund":
        rows = await prisma.refund.count();
        break;
      case "Product":
        rows = await prisma.product.count();
        break;
      case "ProductVariant":
        rows = await prisma.productVariant.count();
        break;
      case "Inventory": {
        const agg = await prisma.inventory.aggregate({ _sum: { onHand: true } });
        rows = agg._sum.onHand ?? 0;
        break;
      }
      case "User":
        rows = await prisma.user.count();
        break;
      case "Vendor":
        rows = await prisma.vendor.count();
        break;
      case "VendorBill":
        rows = await prisma.vendorBill.count();
        break;
      case "PurchaseOrder":
        rows = await prisma.purchaseOrder.count();
        break;
      case "PurchaseReceipt":
        rows = await prisma.purchaseReceipt.count();
        break;
      case "Expense":
        rows = await prisma.expense.count();
        break;
      default:
        break;
    }
    entries.push({
      table: preserved,
      rows_to_remove: 0,
      rows_to_preserve: rows,
      reason: "Commerce or canonical CoA — never truncated by accounting reset",
      dependency_order: 0,
      commerce_impact: true,
      reversible_via_backup: false
    });
  }

  const coaCount = await prisma.accountingAccount.count();
  entries.push({
    table: "AccountingAccount",
    rows_to_remove: 0,
    rows_to_preserve: coaCount,
    reason: "Canonical system CoA — preserved; optional TEST bank GL deactivation flagged separately",
    dependency_order: 0,
    commerce_impact: false,
    reversible_via_backup: false
  });

  const blocking = await collectBlockingReasons();

  if (mode === "execute") {
    if (!input.backupRef?.trim()) blocking.push("backupRef is required for execute");
    if (!input.operator?.trim()) blocking.push("operator is required for execute");
    if (input.backupRef && input.confirmToken) {
      if (!verifyAccountingResetConfirmToken(input.confirmToken, dbName, input.backupRef)) {
        blocking.push("confirmToken does not match SHA256(ACCOUNTING-RESET|dbName|backupRef)");
      }
    } else if (input.execute) {
      blocking.push("confirmToken is required for execute");
    }
    if (isLocalhostDatabase(databaseUrl) && !input.allowLocalhost) {
      blocking.push("localhost database blocked unless allowLocalhost=true");
    }
    if (isProductionLikeEnvironment() && input.allowLocalhost !== true) {
      // production-like still allowed with proper token — no extra block
    }
  }

  const testCandidates = await findTestBankGlDeactivationCandidates();

  return {
    mode,
    generatedAt: new Date().toISOString(),
    dbName,
    dbHostHint: dbHostHint(databaseUrl),
    operator: input.operator,
    backupRef: input.backupRef,
    dependency_order: RESET_TABLE_PLAN.map((p) => p.table),
    entries,
    commerce_fingerprint_before: commerceBefore,
    blocking_reasons: blocking,
    preserved_tables: [...PRESERVED_TABLES, "AccountingAccount"],
    test_bank_gl_deactivation_candidates: testCandidates,
    execute_allowed: mode === "dry-run" ? blocking.length === 0 : blocking.length === 0
  };
}

/** Clear FK pointers from accounting entities before journal/posting deletion. */
async function clearAccountingJournalLinks(tx: Prisma.TransactionClient): Promise<void> {
  await tx.accountingOpeningInventoryLine.updateMany({
    where: { costLayerId: { not: null } },
    data: { costLayerId: null }
  });
  await tx.accountingInventoryOpeningBatchItem.updateMany({
    where: { costLayerId: { not: null } },
    data: { costLayerId: null }
  });
  await tx.accountingInventoryCostLayer.updateMany({
    where: { openingBatchItemId: { not: null } },
    data: { openingBatchItemId: null }
  });

  await tx.accountingOpeningBatch.updateMany({
    data: { journalEntryId: null, postingEventId: null }
  });
  await tx.accountingInventoryOpeningBatch.updateMany({
    data: { journalEntryId: null, postingEventId: null }
  });
  await tx.accountingGatewaySettlement.updateMany({
    data: { journalEntryId: null, postingEventId: null }
  });
  await tx.accountingVendorPayment.updateMany({
    data: { journalEntryId: null, postingEventId: null }
  });
  await tx.accountingBankTransfer.updateMany({
    data: { journalEntryId: null, postingEventId: null }
  });
  await tx.accountingItcEvidence.updateMany({
    data: { journalEntryId: null, postingEventId: null }
  });
  await tx.accountingPostingEvent.updateMany({
    data: { journalEntryId: null }
  });
  await tx.accountingJournalLine.updateMany({
    data: { documentLinkId: null }
  });
}

async function deactivateUnusedTestBankGlAccounts(
  tx: Prisma.TransactionClient,
  candidates: ResetManifest["test_bank_gl_deactivation_candidates"]
): Promise<number> {
  let n = 0;
  for (const c of candidates) {
    if (!c.wouldDeactivate) continue;
    await tx.accountingBankAccount.update({
      where: { id: c.bankAccountId },
      data: { isActive: false }
    });
    const acct = await tx.accountingAccount.findUnique({ where: { code: c.glAccountCode } });
    if (acct && !acct.isSystem) {
      await tx.accountingAccount.update({
        where: { id: acct.id },
        data: { isActive: false }
      });
    }
    n++;
  }
  return n;
}

export async function executeAccountingReset(
  input: PlanAccountingResetInput
): Promise<{ manifest: ResetManifest; deactivatedTestBanks: number }> {
  const manifest = await planAccountingReset({ ...input, execute: true });
  if (!manifest.execute_allowed) {
    throw new Error(`Accounting reset blocked: ${manifest.blocking_reasons.join("; ")}`);
  }

  const testCandidates = manifest.test_bank_gl_deactivation_candidates;

  await prisma.$transaction(async (tx) => {
    await clearAccountingJournalLinks(tx);

    // Unlink statement lines from reconciliations before recon delete
    await tx.accountingBankStatementLine.updateMany({
      data: { reconciliationId: null }
    });

    for (const plan of RESET_TABLE_PLAN) {
      const delegate = tx[plan.prismaModel] as ResetDelegate;
      const result = await delegate.deleteMany({});
      logger.info("accounting_reset_table_cleared", {
        table: plan.table,
        count: result.count,
        operator: input.operator,
        backupRef: input.backupRef
      });
    }
  });

  const deactivatedTestBanks = await prisma.$transaction(async (tx) =>
    deactivateUnusedTestBankGlAccounts(tx, testCandidates)
  );

  const commerceAfter = await collectCommerceFingerprint();
  manifest.commerce_fingerprint_after = commerceAfter;
  manifest.mode = "execute";

  const fpBefore = manifest.commerce_fingerprint_before;
  const fpAfter = commerceAfter;
  const commerceUnchanged =
    fpBefore.orders === fpAfter.orders &&
    fpBefore.payments === fpAfter.payments &&
    fpBefore.refunds === fpAfter.refunds &&
    fpBefore.products === fpAfter.products &&
    fpBefore.productVariants === fpAfter.productVariants &&
    fpBefore.inventoryOnHandSum === fpAfter.inventoryOnHandSum;

  if (!commerceUnchanged) {
    logger.error("accounting_reset_commerce_fingerprint_mismatch", {
      before: fpBefore,
      after: fpAfter,
      operator: input.operator
    });
    throw new Error("Commerce fingerprint changed after reset — abort reported for ops review");
  }

  logger.warn("accounting_reset_executed", {
    operator: input.operator,
    backupRef: input.backupRef,
    dbName: manifest.dbName,
    deactivatedTestBanks
  });

  return { manifest, deactivatedTestBanks };
}
