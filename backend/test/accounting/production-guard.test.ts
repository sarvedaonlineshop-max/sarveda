import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingProductionGuardError,
  AccountingPurchasesPostingDisabledError,
  AccountingRefundPostingDisabledError,
  AccountingSalesPostingDisabledError,
  AccountingSettlementPostingDisabledError,
  AccountingVendorPaymentPostingDisabledError,
  AccountingExpensePostingDisabledError
} from "../../src/modules/accounting/accounting-errors";
import {
  assertBulkDiscoveryAllowed,
  assertPurchasesPostingPersistenceAllowed,
  assertRefundPostingPersistenceAllowed,
  assertSalesPostingPersistenceAllowed,
  assertSettlementPostingPersistenceAllowed,
  assertVendorPaymentPostingPersistenceAllowed,
  assertExpensePostingPersistenceAllowed,
  resolveDiscoveryDryRun,
  resolvePurchasesDiscoveryDryRun,
  resolveRefundDiscoveryDryRun,
  resolveSettlementDiscoveryDryRun
} from "../../src/modules/accounting/production-guard";

describe("production guard", () => {
  const originalDb = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBulk = process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED;
  const originalSales = process.env.ACCOUNTING_SALES_POSTING_ENABLED;
  const originalNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const originalProdPost = process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;

  const originalRefund = process.env.ACCOUNTING_REFUND_POSTING_ENABLED;
  const originalSettlement = process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED;
  const originalPurchases = process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED;
  const originalVendorPayment = process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED;
  const originalExpense = process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://sarveda:password@localhost:5432/sarveda_db";
    process.env.NODE_ENV = "test";
    delete process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED;
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "0";
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "0";
    process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = "0";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "0";
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "0";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "0";
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalDb;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalBulk === undefined) delete process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED;
    else process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED = originalBulk;
    if (originalProdPost === undefined) delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    else process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = originalProdPost;
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = originalSales ?? "0";
    process.env.NATIVE_ACCOUNTING_ENABLED = originalNative ?? "0";
    if (originalRefund === undefined) delete process.env.ACCOUNTING_REFUND_POSTING_ENABLED;
    else process.env.ACCOUNTING_REFUND_POSTING_ENABLED = originalRefund;
    if (originalSettlement === undefined) delete process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED;
    else process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = originalSettlement;
    if (originalPurchases === undefined) delete process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED;
    else process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = originalPurchases;
    if (originalVendorPayment === undefined) delete process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED;
    else process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = originalVendorPayment;
    if (originalExpense === undefined) delete process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED;
    else process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = originalExpense;
  });

  it("blocks bulk discovery on production-like DB without explicit flag", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    expect(() =>
      assertBulkDiscoveryAllowed({ limit: 10, dryRun: true, persist: false })
    ).toThrow(AccountingProductionGuardError);
  });

  it("allows single-order discovery on production-like DB", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    expect(() =>
      assertBulkDiscoveryAllowed({
        orderId: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        dryRun: true,
        persist: false
      })
    ).not.toThrow();
  });

  it("allows bulk when ACCOUNTING_BULK_DISCOVERY_ALLOWED=1", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED = "1";
    expect(() =>
      assertBulkDiscoveryAllowed({ limit: 10, dryRun: true, persist: false })
    ).not.toThrow();
  });

  it("rejects persistence when sales posting disabled", () => {
    expect(() => assertSalesPostingPersistenceAllowed()).toThrow(
      AccountingSalesPostingDisabledError
    );
  });

  it("allows persistence on staging/dev with sales posting only", () => {
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    expect(() => assertSalesPostingPersistenceAllowed()).not.toThrow();
  });

  it("blocks even ONE production post with sales flag alone", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    expect(() => assertSalesPostingPersistenceAllowed()).toThrow(AccountingProductionGuardError);
  });

  it("allows production post only with dual flags", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";
    expect(() => assertSalesPostingPersistenceAllowed()).not.toThrow();
  });

  it("blocks production post when NODE_ENV=production without override", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://sarveda:password@localhost:5432/sarveda_db";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    expect(() => assertSalesPostingPersistenceAllowed()).toThrow(AccountingProductionGuardError);
  });

  it("defaults discovery to dryRun when sales posting off", () => {
    expect(resolveDiscoveryDryRun(undefined)).toBe(true);
    expect(resolveDiscoveryDryRun(false)).toBe(true);
  });

  it("allows dryRun=false only when sales posting enabled", () => {
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    expect(resolveDiscoveryDryRun(false)).toBe(false);
  });

  it("rejects refund persistence when refund posting disabled", () => {
    expect(() => assertRefundPostingPersistenceAllowed()).toThrow(
      AccountingRefundPostingDisabledError
    );
  });

  it("allows refund persistence on staging/dev with refund posting only", () => {
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
    expect(() => assertRefundPostingPersistenceAllowed()).not.toThrow();
  });

  it("blocks production refund post without dual flags", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    expect(() => assertRefundPostingPersistenceAllowed()).toThrow(AccountingProductionGuardError);
  });

  it("defaults refund discovery to dryRun when refund posting off", () => {
    expect(resolveRefundDiscoveryDryRun(undefined)).toBe(true);
    expect(resolveRefundDiscoveryDryRun(false)).toBe(true);
  });

  it("allows refund dryRun=false only when refund posting enabled", () => {
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
    expect(resolveRefundDiscoveryDryRun(false)).toBe(false);
  });

  it("rejects settlement persistence when settlement posting disabled", () => {
    expect(() => assertSettlementPostingPersistenceAllowed()).toThrow(
      AccountingSettlementPostingDisabledError
    );
  });

  it("allows settlement persistence on staging/dev with settlement posting only", () => {
    process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = "1";
    expect(() => assertSettlementPostingPersistenceAllowed()).not.toThrow();
  });

  it("blocks production settlement post without dual flags", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    expect(() => assertSettlementPostingPersistenceAllowed()).toThrow(AccountingProductionGuardError);
  });

  it("allows single-settlement discovery on production-like DB", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    expect(() =>
      assertBulkDiscoveryAllowed({
        settlementId: "setl_abc",
        limit: 10,
        dryRun: true,
        persist: false
      })
    ).not.toThrow();
  });

  it("defaults settlement discovery to dryRun when settlement posting off", () => {
    expect(resolveSettlementDiscoveryDryRun(undefined)).toBe(true);
    expect(resolveSettlementDiscoveryDryRun(false)).toBe(true);
  });

  it("blocks purchases persistence when purchases posting disabled", () => {
    expect(() => assertPurchasesPostingPersistenceAllowed()).toThrow(
      AccountingPurchasesPostingDisabledError
    );
  });

  it("allows purchases persistence on staging/dev with purchases posting only", () => {
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    expect(() => assertPurchasesPostingPersistenceAllowed()).not.toThrow();
  });

  it("blocks production purchases post without dual flags", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    expect(() => assertPurchasesPostingPersistenceAllowed()).toThrow(AccountingProductionGuardError);
  });

  it("allows single-bill discovery on production-like DB", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    expect(() =>
      assertBulkDiscoveryAllowed({
        billId: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        dryRun: true,
        persist: false
      })
    ).not.toThrow();
  });

  it("blocks vendor payment persistence when flag disabled", () => {
    expect(() => assertVendorPaymentPostingPersistenceAllowed()).toThrow(
      AccountingVendorPaymentPostingDisabledError
    );
  });

  it("allows vendor payment persistence on staging/dev with flag only", () => {
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";
    expect(() => assertVendorPaymentPostingPersistenceAllowed()).not.toThrow();
  });

  it("blocks production vendor payment post without dual flags", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    expect(() => assertVendorPaymentPostingPersistenceAllowed()).toThrow(AccountingProductionGuardError);
  });

  it("allows single-payment discovery on production-like DB", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    expect(() =>
      assertBulkDiscoveryAllowed({
        paymentId: "00000000-0000-4000-8000-000000000099",
        limit: 10,
        dryRun: true,
        persist: false
      })
    ).not.toThrow();
  });

  it("blocks expense persistence when flag disabled", () => {
    expect(() => assertExpensePostingPersistenceAllowed()).toThrow(AccountingExpensePostingDisabledError);
  });

  it("allows expense persistence on staging/dev with flag only", () => {
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";
    expect(() => assertExpensePostingPersistenceAllowed()).not.toThrow();
  });

  it("blocks production expense post without dual flags", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    process.env.ACCOUNTING_EXPENSE_POSTING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    expect(() => assertExpensePostingPersistenceAllowed()).toThrow(AccountingProductionGuardError);
  });
});
