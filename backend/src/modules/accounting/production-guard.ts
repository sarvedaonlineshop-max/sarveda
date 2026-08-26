import {
  isAccountingPurchasesPostingEnabled,
  isAccountingRefundPostingEnabled,
  isAccountingSalesPostingEnabled,
  isAccountingSettlementPostingEnabled,
  isAccountingVendorPaymentPostingEnabled,
  isAccountingExpensePostingEnabled,
  isAccountingInventoryValuationEnabled,
  isAccountingPurchaseCapitalizationEnabled,
  isAccountingCogsPostingEnabled,
  isAccountingCogsReversalEnabled,
  isAccountingBankingEnabled,
  isAccountingBankReconciliationEnabled,
  isAccountingBankStatementImportEnabled,
  isAccountingOpeningBalanceEnabled
} from "./accounting-flag";
import {
  AccountingProductionGuardError,
  AccountingPurchasesPostingDisabledError,
  AccountingRefundPostingDisabledError,
  AccountingSalesPostingDisabledError,
  AccountingSettlementPostingDisabledError,
  AccountingVendorPaymentPostingDisabledError,
  AccountingExpensePostingDisabledError,
  AccountingInventoryValuationDisabledError,
  AccountingPurchaseCapitalizationDisabledError,
  AccountingCogsPostingDisabledError,
  AccountingCogsReversalDisabledError,
  AccountingBankingDisabledError,
  AccountingBankReconciliationDisabledError,
  AccountingBankStatementImportDisabledError,
  AccountingOpeningBalanceDisabledError
} from "./accounting-errors";

const PRODUCTION_ENV_MARKERS = [
  "production",
  "sarveda.com",
  "sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com",
  "13.204.112.165"
];

function databaseUrlLooksProduction(): boolean {
  const url = (process.env.DATABASE_URL ?? "").trim().toLowerCase();
  if (!url) return false;
  return PRODUCTION_ENV_MARKERS.some((m) => url.includes(m.toLowerCase()));
}

function nodeEnvIsProduction(): boolean {
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

export function isProductionLikeEnvironment(): boolean {
  return nodeEnvIsProduction() || databaseUrlLooksProduction();
}

function isProductionPostingOverrideEnabled(): boolean {
  const v = (process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Public read for admin status / UAT banner — defaults false. */
export function isAccountingProductionPostingAllowed(): boolean {
  return isProductionPostingOverrideEnabled();
}

export type BulkDiscoveryGuardInput = {
  orderId?: string;
  orderNumber?: string;
  refundId?: string;
  settlementId?: string;
  billId?: string;
  billNumber?: string;
  paymentId?: string;
  expenseId?: string;
  receiptId?: string;
  purchaseOrderId?: string;
  vendorBillId?: string;
  variantId?: string;
  restockEventId?: string;
  orderItemId?: string;
  limit: number;
  dryRun: boolean;
  persist: boolean;
};

/**
 * Prevent accidental bulk backfill on production-like environments.
 * Single-order/refund/settlement/bill/payment/expense preview/post by id is always allowed for controlled verification
 * of discovery *scope* — persistence still requires the relevant posting assert.
 */
export function assertBulkDiscoveryAllowed(input: BulkDiscoveryGuardInput): void {
  const singleOrderMode = Boolean(
    input.orderId?.trim() ||
      input.orderNumber?.trim() ||
      input.refundId?.trim() ||
      input.settlementId?.trim() ||
      input.billId?.trim() ||
      input.billNumber?.trim() ||
      input.paymentId?.trim() ||
      input.expenseId?.trim() ||
      input.receiptId?.trim() ||
      input.purchaseOrderId?.trim() ||
      input.vendorBillId?.trim() ||
      input.variantId?.trim() ||
      input.restockEventId?.trim() ||
      input.orderItemId?.trim()
  );

  if (singleOrderMode) {
    return;
  }

  if (input.limit > 1 && isProductionLikeEnvironment()) {
    const explicit =
      process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED === "1" ||
      process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED === "true";
    if (!explicit) {
      throw new AccountingProductionGuardError(
        "Bulk accounting discovery blocked on production-like environment. " +
          "Set ACCOUNTING_BULK_DISCOVERY_ALLOWED=1 only after explicit architectural approval, " +
          "or scope to a single orderId/orderNumber."
      );
    }
  }
}

/**
 * Fail-closed persistence gate for ORDER_PAID (and other sales) journals.
 *
 * Staging/dev: ACCOUNTING_SALES_POSTING_ENABLED=1 is sufficient.
 * Production-like: ALSO requires ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1
 *   (defaults absent/false). Preview remains read-only and does not call this.
 */
export function assertSalesPostingPersistenceAllowed(): void {
  if (!isAccountingSalesPostingEnabled()) {
    throw new AccountingSalesPostingDisabledError();
  }

  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like accounting persistence blocked. " +
        "Requires BOTH ACCOUNTING_SALES_POSTING_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1. Staging/dev does not need the production override."
    );
  }
}

export function resolveDiscoveryDryRun(requestedDryRun: boolean | undefined): boolean {
  if (requestedDryRun === true) return true;
  if (requestedDryRun === false && isAccountingSalesPostingEnabled()) return false;
  return true;
}

/**
 * Fail-closed persistence gate for ORDER_REFUNDED_FULL journals.
 *
 * Staging/dev: ACCOUNTING_REFUND_POSTING_ENABLED=1 is sufficient.
 * Production-like: ALSO requires ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1.
 */
export function assertRefundPostingPersistenceAllowed(): void {
  if (!isAccountingRefundPostingEnabled()) {
    throw new AccountingRefundPostingDisabledError();
  }

  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like refund posting blocked. " +
        "Requires BOTH ACCOUNTING_REFUND_POSTING_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1. Staging/dev does not need the production override."
    );
  }
}

export function resolveRefundDiscoveryDryRun(requestedDryRun: boolean | undefined): boolean {
  if (requestedDryRun === true) return true;
  if (requestedDryRun === false && isAccountingRefundPostingEnabled()) return false;
  return true;
}

/**
 * Fail-closed persistence gate for PAYMENT_GATEWAY_SETTLED journals.
 */
export function assertSettlementPostingPersistenceAllowed(): void {
  if (!isAccountingSettlementPostingEnabled()) {
    throw new AccountingSettlementPostingDisabledError();
  }

  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like settlement posting blocked. " +
        "Requires BOTH ACCOUNTING_SETTLEMENT_POSTING_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

export function resolveSettlementDiscoveryDryRun(requestedDryRun: boolean | undefined): boolean {
  if (requestedDryRun === true) return true;
  if (requestedDryRun === false && isAccountingSettlementPostingEnabled()) return false;
  return true;
}

/**
 * Fail-closed persistence gate for VENDOR_BILL_POSTED journals.
 */
export function assertPurchasesPostingPersistenceAllowed(): void {
  if (!isAccountingPurchasesPostingEnabled()) {
    throw new AccountingPurchasesPostingDisabledError();
  }

  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like purchases posting blocked. " +
        "Requires BOTH ACCOUNTING_PURCHASES_POSTING_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

export function resolvePurchasesDiscoveryDryRun(requestedDryRun: boolean | undefined): boolean {
  if (requestedDryRun === true) return true;
  if (requestedDryRun === false && isAccountingPurchasesPostingEnabled()) return false;
  return true;
}

export function assertVendorPaymentPostingPersistenceAllowed(): void {
  if (!isAccountingVendorPaymentPostingEnabled()) {
    throw new AccountingVendorPaymentPostingDisabledError();
  }

  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like vendor payment posting blocked. " +
        "Requires BOTH ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

export function resolveVendorPaymentDiscoveryDryRun(requestedDryRun: boolean | undefined): boolean {
  if (requestedDryRun === true) return true;
  if (requestedDryRun === false && isAccountingVendorPaymentPostingEnabled()) return false;
  return true;
}

export function assertExpensePostingPersistenceAllowed(): void {
  if (!isAccountingExpensePostingEnabled()) {
    throw new AccountingExpensePostingDisabledError();
  }

  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like expense posting blocked. " +
        "Requires BOTH ACCOUNTING_EXPENSE_POSTING_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

export function resolveExpenseDiscoveryDryRun(requestedDryRun: boolean | undefined): boolean {
  if (requestedDryRun === true) return true;
  if (requestedDryRun === false && isAccountingExpensePostingEnabled()) return false;
  return true;
}

/**
 * Fail-closed persistence gate for INVENTORY_OPENING_POSTED journals + cost layers.
 */
export function assertInventoryOpeningPostingPersistenceAllowed(): void {
  if (!isAccountingInventoryValuationEnabled()) {
    throw new AccountingInventoryValuationDisabledError();
  }

  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like inventory opening posting blocked. " +
        "Requires BOTH ACCOUNTING_INVENTORY_VALUATION_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

/**
 * Fail-closed persistence gate for INVENTORY_PURCHASE_CAPITALIZED journals + cost layers.
 */
export function assertPurchaseCapitalizationPersistenceAllowed(): void {
  if (!isAccountingInventoryValuationEnabled()) {
    throw new AccountingInventoryValuationDisabledError();
  }
  if (!isAccountingPurchaseCapitalizationEnabled()) {
    throw new AccountingPurchaseCapitalizationDisabledError();
  }

  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like purchase capitalization blocked. " +
        "Requires ACCOUNTING_INVENTORY_VALUATION_ENABLED=1, " +
        "ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED=1, AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

export function resolvePurchaseCapitalizationDiscoveryDryRun(requestedDryRun: boolean | undefined): boolean {
  if (requestedDryRun === true) return true;
  if (
    requestedDryRun === false &&
    isAccountingInventoryValuationEnabled() &&
    isAccountingPurchaseCapitalizationEnabled()
  ) {
    return false;
  }
  return true;
}

export function assertCogsPostingPersistenceAllowed(): void {
  if (!isAccountingInventoryValuationEnabled()) {
    throw new AccountingInventoryValuationDisabledError();
  }
  if (!isAccountingCogsPostingEnabled()) {
    throw new AccountingCogsPostingDisabledError();
  }
  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like COGS posting blocked. " +
        "Requires ACCOUNTING_INVENTORY_VALUATION_ENABLED=1, " +
        "ACCOUNTING_COGS_POSTING_ENABLED=1, AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

export function resolveCogsDiscoveryDryRun(requestedDryRun: boolean | undefined): boolean {
  if (requestedDryRun === true) return true;
  if (requestedDryRun === false && isAccountingInventoryValuationEnabled() && isAccountingCogsPostingEnabled()) {
    return false;
  }
  return true;
}

export function assertCogsReversalPostingPersistenceAllowed(): void {
  if (!isAccountingInventoryValuationEnabled()) {
    throw new AccountingInventoryValuationDisabledError();
  }
  if (!isAccountingCogsPostingEnabled()) {
    throw new AccountingCogsPostingDisabledError();
  }
  if (!isAccountingCogsReversalEnabled()) {
    throw new AccountingCogsReversalDisabledError();
  }
  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like COGS reversal posting blocked. " +
        "Requires ACCOUNTING_INVENTORY_VALUATION_ENABLED=1, " +
        "ACCOUNTING_COGS_POSTING_ENABLED=1, ACCOUNTING_COGS_REVERSAL_ENABLED=1, AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

export function resolveCogsReversalDiscoveryDryRun(requestedDryRun: boolean | undefined): boolean {
  if (requestedDryRun === true) return true;
  if (
    requestedDryRun === false &&
    isAccountingInventoryValuationEnabled() &&
    isAccountingCogsPostingEnabled() &&
    isAccountingCogsReversalEnabled()
  ) {
    return false;
  }
  return true;
}

export function assertBankingPersistenceAllowed(): void {
  if (!isAccountingBankingEnabled()) {
    throw new AccountingBankingDisabledError();
  }
  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like banking posting blocked. " +
        "Requires ACCOUNTING_BANKING_ENABLED=1 AND ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

export function assertBankStatementImportAllowed(): void {
  if (!isAccountingBankStatementImportEnabled()) {
    throw new AccountingBankStatementImportDisabledError();
  }
  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like bank statement import blocked. " +
        "Requires ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

export function assertBankReconciliationAllowed(): void {
  if (!isAccountingBankReconciliationEnabled()) {
    throw new AccountingBankReconciliationDisabledError();
  }
}

export function assertBankReconciliationPostingAllowed(): void {
  if (!isAccountingBankReconciliationEnabled()) {
    throw new AccountingBankReconciliationDisabledError();
  }
  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like bank charge/interest posting blocked. " +
        "Requires ACCOUNTING_BANK_RECONCILIATION_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}

/**
 * Fail-closed persistence gate for Phase 7B production opening balance posting.
 */
export function assertProductionOpeningPersistenceAllowed(): void {
  if (!isAccountingOpeningBalanceEnabled()) {
    throw new AccountingOpeningBalanceDisabledError();
  }

  if (isProductionLikeEnvironment() && !isProductionPostingOverrideEnabled()) {
    throw new AccountingProductionGuardError(
      "Production-like opening balance posting blocked. " +
        "Requires BOTH ACCOUNTING_OPENING_BALANCE_ENABLED=1 AND " +
        "ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1."
    );
  }
}
