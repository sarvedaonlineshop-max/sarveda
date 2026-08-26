import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AccountingProductionGuardError } from "../../src/modules/accounting/accounting-errors";
import { runOrderPaidDiscovery } from "../../src/modules/accounting/discovery-worker";
import { cleanupAccountingTestData } from "../helpers/commerce";
import {
  cleanupSyntheticPaidOrder,
  createSyntheticPaidOrder
} from "../helpers/accounting-orders";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";

describe("ORDER_PAID discovery worker", () => {
  const createdOrderIds: string[] = [];
  const originalNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const originalSales = process.env.ACCOUNTING_SALES_POSTING_ENABLED;
  const originalDb = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgresql://sarveda:password@localhost:5432/sarveda_db";
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
  });

  afterEach(async () => {
    for (const id of createdOrderIds.splice(0)) {
      await cleanupSyntheticPaidOrder(id);
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalNative ?? "0";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = originalSales ?? "0";
    process.env.DATABASE_URL = originalDb;
  });

  it("defaults to dryRun preview without persisting", async () => {
    const order = await createSyntheticPaidOrder();
    createdOrderIds.push(order.id);

    const result = await runOrderPaidDiscovery({ orderId: order.id });
    expect(result.dryRun).toBe(true);
    expect(result.posted).toBe(0);
    expect(result.eligible).toBe(1);
    expect(result.results[0]?.action).toBe("preview");
  });

  it("posts when dryRun=false and sales posting enabled", async () => {
    const order = await createSyntheticPaidOrder({ provider: "RAZORPAY" });
    createdOrderIds.push(order.id);

    const result = await runOrderPaidDiscovery({ orderId: order.id, dryRun: false });
    expect(result.posted).toBe(1);
    expect(result.results[0]?.action).toBe("posted");
  });

  it("single order mode bypasses production guard", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    try {
      const order = await createSyntheticPaidOrder();
      createdOrderIds.push(order.id);
      const result = await runOrderPaidDiscovery({ orderId: order.id, dryRun: true });
      expect(result.skippedModule).toBe(false);
    } finally {
      process.env.DATABASE_URL = prev;
    }
  });

  it("bulk mode blocked on production-like DB", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    try {
      await expect(runOrderPaidDiscovery({ limit: 5, dryRun: true })).rejects.toBeInstanceOf(
        AccountingProductionGuardError
      );
    } finally {
      process.env.DATABASE_URL = prev;
    }
  });

  it("respects NATIVE_ACCOUNTING_ENABLED=0", async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "0";
    const result = await runOrderPaidDiscovery({ limit: 1 });
    expect(result.skippedModule).toBe(true);
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  });
});
