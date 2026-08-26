/** Gate native accounting module. Default OFF — commerce must behave unchanged. */
export function isNativeAccountingEnabled(): boolean {
  const v = (process.env.NATIVE_ACCOUNTING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

export function isAccountingSalesPostingEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_SALES_POSTING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate ORDER_REFUNDED_FULL shadow persistence. Default OFF. */
export function isAccountingRefundPostingEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_REFUND_POSTING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate PAYMENT_GATEWAY_SETTLED shadow persistence. Default OFF. */
export function isAccountingSettlementPostingEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

export function isAccountingPurchasesPostingEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate VENDOR_PAYMENT_MADE shadow persistence. Default OFF. */
export function isAccountingVendorPaymentPostingEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate EXPENSE_RECORDED shadow persistence. Default OFF. */
export function isAccountingExpensePostingEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

export function isAccountingReportsEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_REPORTS_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate opening inventory / cost-layer valuation. Default OFF. */
export function isAccountingInventoryValuationEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate purchase receipt capitalization (1210 → 1200). Default OFF. */
export function isAccountingPurchaseCapitalizationEnabled(): boolean {
  if (!isAccountingInventoryValuationEnabled()) return false;
  const v = (process.env.ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate FIFO COGS posting from native layers. Default OFF. */
export function isAccountingCogsPostingEnabled(): boolean {
  if (!isAccountingInventoryValuationEnabled()) return false;
  const v = (process.env.ACCOUNTING_COGS_POSTING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate COGS reversal for SELLABLE restocks. Default OFF. Requires COGS posting. */
export function isAccountingCogsReversalEnabled(): boolean {
  if (!isAccountingCogsPostingEnabled()) return false;
  const v = (process.env.ACCOUNTING_COGS_REVERSAL_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate Phase 4B banking registry + transfers. Default OFF. */
export function isAccountingBankingEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_BANKING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate Phase 4C bank statement import + matching. Default OFF. */
export function isAccountingBankStatementImportEnabled(): boolean {
  if (!isAccountingBankingEnabled()) return false;
  const v = (process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate Phase 4D bank reconciliation + categorization posting. Default OFF. */
export function isAccountingBankReconciliationEnabled(): boolean {
  if (!isAccountingBankStatementImportEnabled()) return false;
  const v = (process.env.ACCOUNTING_BANK_RECONCILIATION_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** COD remittance posting — intentionally always OFF in Phase 4D. */
export function isAccountingCodCollectionEnabled(): boolean {
  return false;
}

/** Gate Phase 5B GST ledger / tax snapshot enrichment reads+flags. Default OFF. */
export function isAccountingGstEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_GST_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate Phase 5B GST source↔journal reconciliation. Default OFF. */
export function isAccountingGstReconciliationEnabled(): boolean {
  if (!isAccountingGstEnabled()) return false;
  const v = (process.env.ACCOUNTING_GST_RECONCILIATION_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate Phase 5C ITC verification / evidence workflow. Default OFF. */
export function isAccountingItcVerificationEnabled(): boolean {
  if (!isAccountingGstEnabled()) return false;
  const v = (process.env.ACCOUNTING_ITC_VERIFICATION_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate Phase 5D GSTR-style management reports / export. Default OFF. */
export function isAccountingGstReportingEnabled(): boolean {
  if (!isAccountingGstEnabled()) return false;
  const v = (process.env.ACCOUNTING_GST_REPORTING_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

/** Gate Phase 7B production opening balance preparation/posting. Default OFF. */
export function isAccountingOpeningBalanceEnabled(): boolean {
  if (!isNativeAccountingEnabled()) return false;
  const v = (process.env.ACCOUNTING_OPENING_BALANCE_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

export const ACCOUNTING_MODULE_DISABLED_MESSAGE =
  "Native accounting is disabled. Set NATIVE_ACCOUNTING_ENABLED=1 on the backend to enable.";
