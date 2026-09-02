export class AccountingError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = "AccountingError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class UnbalancedJournalError extends AccountingError {
  constructor(debit: number, credit: number) {
    super(
      `Journal is unbalanced: debits=${debit} paise, credits=${credit} paise`,
      "JOURNAL_UNBALANCED"
    );
  }
}

export class InvalidJournalLineError extends AccountingError {
  constructor(message: string) {
    super(message, "JOURNAL_LINE_INVALID");
  }
}

export class PostedJournalImmutableError extends AccountingError {
  constructor(action: string) {
    super(`Posted journal entries cannot be ${action}`, "JOURNAL_POSTED_IMMUTABLE", 409);
  }
}

export class DuplicatePostingEventError extends AccountingError {
  constructor(uniqueKey: string) {
    super(`Posting event already exists: ${uniqueKey}`, "POSTING_EVENT_DUPLICATE", 409);
  }
}

export class ZeroValueJournalError extends AccountingError {
  constructor() {
    super("Journal must have total debits greater than zero", "JOURNAL_ZERO_VALUE");
  }
}

export class InvalidPostingEventTransitionError extends AccountingError {
  constructor(from: string, to: string) {
    super(`Invalid posting event transition: ${from} → ${to}`, "POSTING_EVENT_INVALID_TRANSITION", 409);
  }
}

export class ClosedAccountingPeriodError extends AccountingError {
  constructor(periodName: string) {
    super(`Accounting period "${periodName}" is closed`, "ACCOUNTING_PERIOD_CLOSED", 409);
  }
}

export class SystemAccountProtectedError extends AccountingError {
  constructor(action: string) {
    super(`System account cannot be ${action}`, "SYSTEM_ACCOUNT_PROTECTED", 409);
  }
}

export class PostingEventAlreadyPostedError extends AccountingError {
  constructor(uniqueKey: string) {
    super(`Posting event already POSTED: ${uniqueKey}`, "POSTING_EVENT_ALREADY_POSTED", 409);
  }
}

export class OrderPaidJournalImbalanceError extends AccountingError {
  constructor(debit: number, credit: number, imbalance: number) {
    super(
      `ORDER_PAID journal imbalance: debits=${debit}, credits=${credit}, diff=${imbalance} paise (max 2 allowed)`,
      "ORDER_PAID_JOURNAL_IMBALANCE",
      422
    );
  }
}

export class OrderNotEligibleForPostingError extends AccountingError {
  constructor(reason: string, code = "ORDER_NOT_ELIGIBLE") {
    super(reason, code, 422);
  }
}

export class AccountingProductionGuardError extends AccountingError {
  constructor(message: string) {
    super(message, "ACCOUNTING_PRODUCTION_GUARD", 403);
  }
}

export class OrderSnapshotNotFoundError extends AccountingError {
  constructor(identifier: string) {
    super(`Order not found: ${identifier}`, "ORDER_SNAPSHOT_NOT_FOUND", 404);
  }
}

export class AccountingSalesPostingDisabledError extends AccountingError {
  constructor() {
    super(
      "Sales posting is disabled. Set ACCOUNTING_SALES_POSTING_ENABLED=1 for shadow journal persistence.",
      "ACCOUNTING_SALES_POSTING_DISABLED",
      403
    );
  }
}

export class OrderRefundedFullJournalImbalanceError extends AccountingError {
  constructor(debit: number, credit: number, imbalance: number) {
    super(
      `ORDER_REFUNDED_FULL journal imbalance: debits=${debit}, credits=${credit}, diff=${imbalance} paise (max 2 allowed)`,
      "ORDER_REFUNDED_FULL_JOURNAL_IMBALANCE",
      422
    );
  }
}

export class OrderRefundedPartialJournalImbalanceError extends AccountingError {
  constructor(debit: number, credit: number, imbalance: number) {
    super(
      `ORDER_REFUNDED_PARTIAL journal imbalance: debits=${debit}, credits=${credit}, diff=${imbalance} paise (max 2 allowed)`,
      "ORDER_REFUNDED_PARTIAL_JOURNAL_IMBALANCE",
      422
    );
  }
}

export class PartialRefundTaxBreakdownUnavailableError extends AccountingError {
  constructor(reason: string) {
    super(reason, "PARTIAL_REFUND_TAX_BREAKDOWN_UNAVAILABLE", 422);
  }
}

export class RefundNotEligibleForPostingError extends AccountingError {
  constructor(reason: string, code = "REFUND_NOT_ELIGIBLE") {
    super(reason, code, 422);
  }
}

export class AccountingRefundPostingDisabledError extends AccountingError {
  constructor() {
    super(
      "Refund posting is disabled. Set ACCOUNTING_REFUND_POSTING_ENABLED=1 for shadow journal persistence.",
      "ACCOUNTING_REFUND_POSTING_DISABLED",
      403
    );
  }
}

export class SaleJournalRequiredError extends AccountingError {
  constructor(orderId: string) {
    super(
      `Native ORDER_PAID POSTED journal required before refund posting for order ${orderId}`,
      "SALE_JOURNAL_REQUIRED",
      422
    );
  }
}

export class SettlementJournalImbalanceError extends AccountingError {
  details?: Record<string, unknown>;

  constructor(
    debit: number,
    credit: number,
    imbalance: number,
    details?: Record<string, unknown>
  ) {
    super(
      `PAYMENT_GATEWAY_SETTLED journal imbalance: debits=${debit}, credits=${credit}, diff=${imbalance} paise`,
      "SETTLEMENT_JOURNAL_IMBALANCE",
      422
    );
    this.details = details;
  }
}

export class SettlementMismatchError extends AccountingError {
  constructor(settlementId: string) {
    super(
      `Imported settlement ${settlementId} source payload differs from stored evidence`,
      "SETTLEMENT_MISMATCH",
      409
    );
  }
}

export class SettlementNotEligibleForPostingError extends AccountingError {
  constructor(reason: string, code = "SETTLEMENT_NOT_ELIGIBLE") {
    super(reason, code, 422);
  }
}

export class AccountingSettlementPostingDisabledError extends AccountingError {
  constructor() {
    super(
      "Settlement posting is disabled. Set ACCOUNTING_SETTLEMENT_POSTING_ENABLED=1 for shadow journal persistence.",
      "ACCOUNTING_SETTLEMENT_POSTING_DISABLED",
      403
    );
  }
}

export class NonInrSettlementDeferredError extends AccountingError {
  constructor(currency: string) {
    super(
      `Non-INR settlement currency ${currency} is deferred in Phase 2D V1`,
      "MULTI_CURRENCY_DEFERRED",
      422
    );
  }
}

export class VendorBillJournalImbalanceError extends AccountingError {
  details?: Record<string, unknown>;

  constructor(
    debit: number,
    credit: number,
    imbalance: number,
    details?: Record<string, unknown>
  ) {
    super(
      details?.reason === "GST_DATA_GAP"
        ? `VENDOR_BILL_POSTED GST_DATA_GAP: tax cannot be provisionally recognized (${JSON.stringify(details.dataGapCodes ?? [])})`
        : `VENDOR_BILL_POSTED journal imbalance: debits=${debit}, credits=${credit}, diff=${imbalance} paise`,
      details?.reason === "GST_DATA_GAP" ? "GST_DATA_GAP" : "VENDOR_BILL_JOURNAL_IMBALANCE",
      422
    );
    this.details = details;
  }
}

export class VendorBillNotEligibleForPostingError extends AccountingError {
  constructor(reason: string, code = "VENDOR_BILL_NOT_ELIGIBLE") {
    super(reason, code, 422);
  }
}

export class VendorBillSnapshotNotFoundError extends AccountingError {
  constructor(identifier: string) {
    super(`Vendor bill not found: ${identifier}`, "VENDOR_BILL_SNAPSHOT_NOT_FOUND", 404);
  }
}

export class AccountingPurchasesPostingDisabledError extends AccountingError {
  constructor() {
    super(
      "Purchases posting is disabled. Set ACCOUNTING_PURCHASES_POSTING_ENABLED=1 for shadow journal persistence.",
      "ACCOUNTING_PURCHASES_POSTING_DISABLED",
      403
    );
  }
}

export class VendorPaymentJournalImbalanceError extends AccountingError {
  details?: Record<string, unknown>;

  constructor(
    debit: number,
    credit: number,
    imbalance: number,
    details?: Record<string, unknown>
  ) {
    super(
      details?.reason
        ? `VENDOR_PAYMENT_MADE: ${String(details.reason)}`
        : `VENDOR_PAYMENT_MADE journal imbalance: debits=${debit}, credits=${credit}, diff=${imbalance}`,
      details?.reason === "INVALID_PAID_ACCOUNT"
        ? "INVALID_PAID_ACCOUNT"
        : "VENDOR_PAYMENT_JOURNAL_IMBALANCE",
      422
    );
    this.details = details;
  }
}

export class VendorPaymentNotEligibleError extends AccountingError {
  constructor(reason: string, code = "VENDOR_PAYMENT_NOT_ELIGIBLE") {
    super(reason, code, 422);
  }
}

export class VendorPaymentNotFoundError extends AccountingError {
  constructor(identifier: string) {
    super(`Vendor payment not found: ${identifier}`, "VENDOR_PAYMENT_NOT_FOUND", 404);
  }
}

export class VendorPaymentImmutableError extends AccountingError {
  constructor(action: string) {
    super(`POSTED vendor payment cannot be ${action}`, "VENDOR_PAYMENT_IMMUTABLE", 409);
  }
}

export class AccountingVendorPaymentPostingDisabledError extends AccountingError {
  constructor() {
    super(
      "Vendor payment posting is disabled. Set ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED=1.",
      "ACCOUNTING_VENDOR_PAYMENT_POSTING_DISABLED",
      403
    );
  }
}

export class ExpenseJournalImbalanceError extends AccountingError {
  details?: Record<string, unknown>;

  constructor(
    debit: number,
    credit: number,
    imbalance: number,
    details?: Record<string, unknown>
  ) {
    const reason = details?.reason ? String(details.reason) : null;
    super(
      reason
        ? `EXPENSE_RECORDED: ${reason}`
        : `EXPENSE_RECORDED journal imbalance: debits=${debit}, credits=${credit}, diff=${imbalance}`,
      reason === "GST_DATA_GAP"
        ? "GST_DATA_GAP"
        : reason === "AMOUNT_SEMANTICS_INVALID"
          ? "AMOUNT_SEMANTICS_INVALID"
          : "EXPENSE_JOURNAL_IMBALANCE",
      422
    );
    this.details = details;
  }
}

export class ExpenseNotEligibleForPostingError extends AccountingError {
  constructor(reason: string, code = "EXPENSE_NOT_ELIGIBLE") {
    super(reason, code, 422);
  }
}

export class ExpenseSnapshotNotFoundError extends AccountingError {
  constructor(identifier: string) {
    super(`Expense not found: ${identifier}`, "EXPENSE_SNAPSHOT_NOT_FOUND", 404);
  }
}

export class AccountingExpensePostingDisabledError extends AccountingError {
  constructor() {
    super(
      "Expense posting is disabled. Set ACCOUNTING_EXPENSE_POSTING_ENABLED=1.",
      "ACCOUNTING_EXPENSE_POSTING_DISABLED",
      403
    );
  }
}

export class ExpenseMappingInvalidError extends AccountingError {
  constructor(reason: string, code = "EXPENSE_MAPPING_INVALID") {
    super(reason, code, 400);
  }
}

export class ExpenseMappingNotFoundError extends AccountingError {
  constructor(id: string) {
    super(`Expense mapping not found: ${id}`, "EXPENSE_MAPPING_NOT_FOUND", 404);
  }
}

export class PreCutoverPostingBlockedError extends AccountingError {
  constructor(cutoverIso: string) {
    super(
      `Document date is before accounting cutover (${cutoverIso}). ` +
        "Set allowPreCutover for explicit historical posting or adjust ACCOUNTING_CUTOVER_DATE.",
      "PRE_CUTOVER_POSTING_BLOCKED",
      409
    );
  }
}

export class AccountingInventoryValuationDisabledError extends AccountingError {
  constructor() {
    super(
      "Inventory valuation is disabled. Set ACCOUNTING_INVENTORY_VALUATION_ENABLED=1.",
      "ACCOUNTING_INVENTORY_VALUATION_DISABLED",
      403
    );
  }
}

export class AccountingPurchaseCapitalizationDisabledError extends AccountingError {
  constructor() {
    super(
      "Purchase capitalization is disabled. Set ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED=1.",
      "ACCOUNTING_PURCHASE_CAPITALIZATION_DISABLED",
      403
    );
  }
}

export class AccountingCogsPostingDisabledError extends AccountingError {
  constructor() {
    super(
      "COGS posting is disabled. Set ACCOUNTING_COGS_POSTING_ENABLED=1.",
      "ACCOUNTING_COGS_POSTING_DISABLED",
      403
    );
  }
}

export class AccountingCogsReversalDisabledError extends AccountingError {
  constructor() {
    super(
      "COGS reversal posting is disabled. Set ACCOUNTING_COGS_REVERSAL_ENABLED=1.",
      "ACCOUNTING_COGS_REVERSAL_DISABLED",
      403
    );
  }
}

export class OpeningBatchNotFoundError extends AccountingError {
  constructor(id: string) {
    super(`Opening inventory batch not found: ${id}`, "OPENING_BATCH_NOT_FOUND", 404);
  }
}

export class BankAccountNotFoundError extends AccountingError {
  constructor(id: string) {
    super(`Bank account not found: ${id}`, "BANK_ACCOUNT_NOT_FOUND", 404);
  }
}

export class BankAccountInvalidError extends AccountingError {
  constructor(message: string, code = "BANK_ACCOUNT_INVALID") {
    super(message, code, 400);
  }
}

export class BankAccountImmutableError extends AccountingError {
  constructor(field: string) {
    super(`Bank account ${field} cannot change after financial usage`, "BANK_ACCOUNT_IMMUTABLE", 409);
  }
}

export class BankTransferNotFoundError extends AccountingError {
  constructor(id: string) {
    super(`Bank transfer not found: ${id}`, "BANK_TRANSFER_NOT_FOUND", 404);
  }
}

export class BankTransferNotEligibleError extends AccountingError {
  constructor(message: string, code = "BANK_TRANSFER_NOT_ELIGIBLE") {
    super(message, code, 400);
  }
}

export class BankTransferImmutableError extends AccountingError {
  constructor(action: string) {
    super(`Posted bank transfer cannot be ${action}`, "BANK_TRANSFER_IMMUTABLE", 409);
  }
}

export class BankTransferJournalImbalanceError extends AccountingError {
  constructor(debit: number, credit: number, diff: number) {
    super(
      `Bank transfer journal imbalance: debits=${debit}, credits=${credit}, diff=${diff}`,
      "BANK_TRANSFER_JOURNAL_IMBALANCE",
      422
    );
  }
}

export class AccountingBankingDisabledError extends AccountingError {
  constructor() {
    super(
      "Banking is disabled. Set ACCOUNTING_BANKING_ENABLED=1.",
      "ACCOUNTING_BANKING_DISABLED",
      403
    );
  }
}

export class BankOpeningBalanceNotEligibleError extends AccountingError {
  constructor(message: string, code = "BANK_OPENING_NOT_ELIGIBLE") {
    super(message, code, 400);
  }
}

export class AccountingBankStatementImportDisabledError extends AccountingError {
  constructor() {
    super(
      "Bank statement import is disabled. Set ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED=1.",
      "ACCOUNTING_BANK_STATEMENT_IMPORT_DISABLED",
      403
    );
  }
}

export class BankStatementImportError extends AccountingError {
  constructor(message: string, code = "BANK_STATEMENT_IMPORT_ERROR") {
    super(message, code, 400);
  }
}

export class BankStatementDuplicateFileError extends AccountingError {
  constructor() {
    super("This statement file was already imported for this bank account", "DUPLICATE_FILE", 409);
  }
}

export class BankStatementImportNotFoundError extends AccountingError {
  constructor(id: string) {
    super(`Bank statement import not found: ${id}`, "BANK_STATEMENT_IMPORT_NOT_FOUND", 404);
  }
}

export class BankStatementLineNotFoundError extends AccountingError {
  constructor(id: string) {
    super(`Bank statement line not found: ${id}`, "BANK_STATEMENT_LINE_NOT_FOUND", 404);
  }
}

export class BankStatementMatchError extends AccountingError {
  constructor(message: string, code = "BANK_STATEMENT_MATCH_ERROR") {
    super(message, code, 400);
  }
}

export class AccountingBankReconciliationDisabledError extends AccountingError {
  constructor() {
    super(
      "Bank reconciliation is disabled. Set ACCOUNTING_BANK_RECONCILIATION_ENABLED=1.",
      "ACCOUNTING_BANK_RECONCILIATION_DISABLED",
      403
    );
  }
}

export class BankReconciliationError extends AccountingError {
  constructor(message: string, code = "BANK_RECONCILIATION_ERROR", statusCode = 400) {
    super(message, code, statusCode);
  }
}

export class BankReconciliationNotFoundError extends AccountingError {
  constructor(id: string) {
    super(`Bank reconciliation not found: ${id}`, "BANK_RECONCILIATION_NOT_FOUND", 404);
  }
}

export class BankReconciliationLockedError extends AccountingError {
  constructor(message = "Reconciliation is locked") {
    super(message, "BANK_RECONCILIATION_LOCKED", 409);
  }
}

export class BankChargeNotEligibleError extends AccountingError {
  constructor(message: string, code = "BANK_CHARGE_NOT_ELIGIBLE", statusCode = 400) {
    super(message, code, statusCode);
  }
}

export class BankInterestNotEligibleError extends AccountingError {
  constructor(message: string, code = "BANK_INTEREST_NOT_ELIGIBLE", statusCode = 400) {
    super(message, code, statusCode);
  }
}

export class AccountingOpeningBalanceDisabledError extends AccountingError {
  constructor() {
    super(
      "Production opening balance is disabled. Set ACCOUNTING_OPENING_BALANCE_ENABLED=1 for opening batch mutations.",
      "ACCOUNTING_OPENING_BALANCE_DISABLED",
      403
    );
  }
}

export class AccountingResetBlockedError extends AccountingError {
  constructor(message: string, code = "ACCOUNTING_RESET_BLOCKED", statusCode = 403) {
    super(message, code, statusCode);
  }
}
