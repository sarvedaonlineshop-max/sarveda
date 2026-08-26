import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildAccountingResetConfirmToken,
  executeAccountingReset,
  extractDatabaseName,
  planAccountingReset,
  verifyAccountingResetConfirmToken
} from "../../src/modules/accounting/accounting-reset.service";
import { cleanupAccountingTestData, prisma } from "../helpers/commerce";

describe("Phase 7B accounting reset planner", () => {
  const originalEnv = {
    native: process.env.NATIVE_ACCOUNTING_ENABLED,
    opening: process.env.ACCOUNTING_OPENING_BALANCE_ENABLED,
    db: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV
  };

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://sarveda:password@localhost:5432/sarveda_db";
    process.env.NATIVE_ACCOUNTING_ENABLED = "0";
    process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "0";
    await cleanupAccountingTestData();
  });

  afterEach(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalEnv.native ?? "0";
    if (originalEnv.opening === undefined) delete process.env.ACCOUNTING_OPENING_BALANCE_ENABLED;
    else process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = originalEnv.opening;
    process.env.DATABASE_URL = originalEnv.db;
    if (originalEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.nodeEnv;
  });

  it("buildAccountingResetConfirmToken / verifyAccountingResetConfirmToken", () => {
    const dbName = "sarveda_db";
    const backupRef = "s3://sarveda-backups/2026-08-25-pre-reset.dump";
    const token = buildAccountingResetConfirmToken(dbName, backupRef);
    expect(token).toHaveLength(64);
    expect(verifyAccountingResetConfirmToken(token, dbName, backupRef)).toBe(true);
    expect(verifyAccountingResetConfirmToken(token.toUpperCase(), dbName, backupRef)).toBe(true);
    expect(verifyAccountingResetConfirmToken(token, dbName, "wrong-backup")).toBe(false);
    expect(verifyAccountingResetConfirmToken("deadbeef", dbName, backupRef)).toBe(false);
  });

  it("extractDatabaseName parses postgres URL", () => {
    expect(extractDatabaseName("postgresql://u:p@localhost:5432/sarveda_db?schema=public")).toBe(
      "sarveda_db"
    );
  });

  it("dry-run planCommerce fingerprint structure", async () => {
    const manifest = await planAccountingReset({ databaseUrl: process.env.DATABASE_URL });
    expect(manifest.mode).toBe("dry-run");
    expect(manifest.commerce_fingerprint_before).toMatchObject({
      orders: expect.any(Number),
      payments: expect.any(Number),
      refunds: expect.any(Number),
      products: expect.any(Number),
      productVariants: expect.any(Number),
      inventoryOnHandSum: expect.any(Number)
    });
    expect(manifest.dependency_order.length).toBeGreaterThan(10);
    expect(manifest.entries.some((e) => e.table === "Order" && e.commerce_impact)).toBe(true);
    expect(manifest.preserved_tables).toContain("AccountingAccount");
  });

  it("execute refuses without token", async () => {
    await expect(
      executeAccountingReset({
        databaseUrl: process.env.DATABASE_URL,
        operator: "test-ops",
        backupRef: "backup-1",
        allowLocalhost: true
      })
    ).rejects.toThrow(/confirmToken|blocked/i);
  });

  it("execute refuses without backupRef", async () => {
    const dbName = extractDatabaseName(process.env.DATABASE_URL!);
    const token = buildAccountingResetConfirmToken(dbName, "backup-x");
    await expect(
      executeAccountingReset({
        databaseUrl: process.env.DATABASE_URL,
        operator: "test-ops",
        confirmToken: token,
        allowLocalhost: true
      })
    ).rejects.toThrow(/backupRef|blocked/i);
  });

  it("execute blocked when NATIVE_ACCOUNTING_ENABLED is ON", async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    const dbName = extractDatabaseName(process.env.DATABASE_URL!);
    const backupRef = "backup-flags-on";
    const token = buildAccountingResetConfirmToken(dbName, backupRef);
    const manifest = await planAccountingReset({
      databaseUrl: process.env.DATABASE_URL,
      execute: true,
      operator: "test-ops",
      backupRef,
      confirmToken: token,
      allowLocalhost: true
    });
    expect(manifest.execute_allowed).toBe(false);
    expect(manifest.blocking_reasons.some((r) => r.includes("NATIVE_ACCOUNTING_ENABLED"))).toBe(true);
    await expect(
      executeAccountingReset({
        databaseUrl: process.env.DATABASE_URL,
        operator: "test-ops",
        backupRef,
        confirmToken: token,
        allowLocalhost: true
      })
    ).rejects.toThrow(/blocked/i);
  });

  it("execute blocked when ACCOUNTING_OPENING_BALANCE_ENABLED is ON", async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "1";
    const dbName = extractDatabaseName(process.env.DATABASE_URL!);
    const backupRef = "backup-opening-on";
    const token = buildAccountingResetConfirmToken(dbName, backupRef);
    const manifest = await planAccountingReset({
      databaseUrl: process.env.DATABASE_URL,
      execute: true,
      operator: "test-ops",
      backupRef,
      confirmToken: token,
      allowLocalhost: true
    });
    expect(manifest.blocking_reasons.some((r) => r.includes("ACCOUNTING_OPENING_BALANCE_ENABLED"))).toBe(
      true
    );
    await expect(
      executeAccountingReset({
        databaseUrl: process.env.DATABASE_URL,
        operator: "test-ops",
        backupRef,
        confirmToken: token,
        allowLocalhost: true
      })
    ).rejects.toThrow(/blocked/i);
  });

  it("dry-run reports POSTED opening batch as blocking reason", async () => {
    await prisma.accountingOpeningBatch.create({
      data: {
        batchNumber: "OPEN-202608-99999",
        effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
        status: "POSTED",
        description: "TEST-ACC-CUTOVER fixture",
        postedAt: new Date()
      }
    });
    const manifest = await planAccountingReset({ databaseUrl: process.env.DATABASE_URL });
    expect(manifest.blocking_reasons.some((r) => r.includes("POSTED production opening"))).toBe(true);
    await prisma.accountingOpeningBatch.deleteMany({});
  });
});
