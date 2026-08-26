import { randomUUID } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingOpeningBalanceDisabledError,
  AccountingProductionGuardError
} from "../../src/modules/accounting/accounting-errors";
import { productionOpeningUniqueKey } from "../../src/modules/accounting/opening.constants";
import { sanitizeImportedString } from "../../src/modules/accounting/opening-import.service";
import {
  createOpeningBatch,
  markOpeningBatchValidated,
  postOpeningBatch,
  previewOpeningBatchPost,
  replaceOpeningStaging
} from "../../src/modules/accounting/opening-batch.service";
import { validateOpeningBatch } from "../../src/modules/accounting/opening-validation.service";
import {
  assertProductionOpeningPersistenceAllowed
} from "../../src/modules/accounting/production-guard";
import { getPostingEvent } from "../../src/modules/accounting/posting-event.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { cleanupAccountingTestData, getInventory, prisma } from "../helpers/commerce";

const SKU_A = "TEST-ACC-CUTOVER-SKU-A";
const SKU_B = "TEST-ACC-CUTOVER-SKU-B";
const FIXTURE_DESC = "TEST-ACC-CUTOVER synthetic Phase 7B";

const ON_HAND_A = 10;
const ON_HAND_B = 5;
const COST_A = 5_000;
const COST_B = 4_000;
const INV_TOTAL = ON_HAND_A * COST_A + ON_HAND_B * COST_B; // 70_000

const BANK_A_GL = "1011";
const BANK_B_GL = "1012";
const BANK_A_AMT = 100_000;
const BANK_B_AMT = 50_000;

const GATEWAY_AMT = 25_000;
const AP_1 = 40_000;
const AP_2 = 30_000;
const AP_TOTAL = AP_1 + AP_2;

const GST_OUTPUT = -5_000;
const GST_INPUT = 3_000;
const EQUITY_PLUG = 173_000;

async function ensureGlAccount(code: string, name: string) {
  await prisma.accountingAccount.upsert({
    where: { code },
    create: { code, name, type: "ASSET", isSystem: false, isActive: true, currency: "INR" },
    update: {}
  });
}

async function createCutoverVariant(
  sku: string,
  onHand: number
): Promise<{ variantId: string; productId: string; inventoryId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: {
      slug: `test-acc-cutover-${sku.toLowerCase()}-${suffix}`,
      name: `Cutover ${sku}`,
      status: "ACTIVE",
      productType: "SIMPLE",
      taxClass: "standard"
    }
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku,
      mrpInPaise: 10_000,
      saleInPaise: 10_000,
      isDefault: true,
      status: "ACTIVE"
    }
  });
  const inventory = await prisma.inventory.create({
    data: { variantId: variant.id, onHand, reserved: 0, lowStockThreshold: 5 }
  });
  return { variantId: variant.id, productId: product.id, inventoryId: inventory.id };
}

async function cleanupOpeningBatches() {
  await prisma.accountingOpeningInventoryLine.updateMany({ data: { costLayerId: null } });
  await prisma.accountingOpeningBatch.updateMany({
    data: { journalEntryId: null, postingEventId: null }
  });
  await prisma.accountingOpeningBatch.deleteMany({});
}

async function cleanupCutoverProducts() {
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: [SKU_A, SKU_B] } },
    select: { id: true, productId: true, inventory: { select: { id: true } } }
  });
  for (const v of variants) {
    if (v.inventory) await prisma.inventory.deleteMany({ where: { id: v.inventory.id } });
    await prisma.productVariant.deleteMany({ where: { id: v.id } });
    await prisma.product.deleteMany({ where: { id: v.productId } });
  }
}

async function sumPostedGlNet(code: string): Promise<number> {
  const acct = await prisma.accountingAccount.findUnique({ where: { code } });
  if (!acct) return 0;
  const agg = await prisma.accountingJournalLine.aggregate({
    where: { accountId: acct.id, journalEntry: { status: "POSTED" } },
    _sum: { debitInPaise: true, creditInPaise: true }
  });
  return (agg._sum.debitInPaise ?? 0) - (agg._sum.creditInPaise ?? 0);
}

function buildBalancedStaging() {
  return {
    skuMappings: [
      {
        newSarvedaSku: SKU_A,
        legacySku: SKU_A,
        matchStatus: "EXACT" as const,
        openingQty: ON_HAND_A,
        unitCostInPaise: COST_A,
        reviewStatus: "APPROVED" as const
      },
      {
        newSarvedaSku: SKU_B,
        legacySku: SKU_B,
        matchStatus: "EXACT" as const,
        openingQty: ON_HAND_B,
        unitCostInPaise: COST_B,
        reviewStatus: "APPROVED" as const
      }
    ],
    inventoryLines: [
      {
        sku: SKU_A,
        quantity: ON_HAND_A,
        unitCostInPaise: COST_A,
        reviewStatus: "APPROVED" as const
      },
      {
        sku: SKU_B,
        quantity: ON_HAND_B,
        unitCostInPaise: COST_B,
        reviewStatus: "APPROVED" as const
      }
    ],
    bankLines: [
      {
        name: "TEST-ACC-CUTOVER-HDFC",
        glAccountCode: BANK_A_GL,
        openingBookBalanceInPaise: BANK_A_AMT,
        accountType: "BANK",
        reviewStatus: "APPROVED" as const
      },
      {
        name: "TEST-ACC-CUTOVER-ICICI",
        glAccountCode: BANK_B_GL,
        openingBookBalanceInPaise: BANK_B_AMT,
        accountType: "BANK",
        reviewStatus: "APPROVED" as const
      }
    ],
    gatewayLines: [
      {
        provider: "RAZORPAY",
        glAccountCode: "1020",
        unsettledAmountInPaise: GATEWAY_AMT,
        direction: "ASSET",
        reviewStatus: "APPROVED" as const
      }
    ],
    apLines: [
      {
        vendorName: "TEST-ACC-CUTOVER-VENDOR-1",
        billNumber: "TEST-ACC-CUTOVER-BILL-1",
        outstandingInPaise: AP_1,
        reviewStatus: "APPROVED" as const
      },
      {
        vendorName: "TEST-ACC-CUTOVER-VENDOR-2",
        billNumber: "TEST-ACC-CUTOVER-BILL-2",
        outstandingInPaise: AP_2,
        reviewStatus: "APPROVED" as const
      }
    ],
    arLines: [],
    arApprovedZero: true,
    gstLines: [
      { accountCode: "2100", balanceInPaise: GST_OUTPUT, reviewStatus: "APPROVED" as const },
      { accountCode: "2200", balanceInPaise: GST_INPUT, reviewStatus: "APPROVED" as const }
    ],
    equityLines: [
      {
        accountCode: "3000",
        amountInPaise: EQUITY_PLUG,
        reason: "TEST-ACC-CUTOVER balancing plug",
        reviewStatus: "APPROVED" as const
      }
    ]
  };
}

describe("Phase 7B production opening batch (TEST-ACC-CUTOVER)", () => {
  const originalFlags = {
    native: process.env.NATIVE_ACCOUNTING_ENABLED,
    opening: process.env.ACCOUNTING_OPENING_BALANCE_ENABLED,
    prod: process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED,
    nodeEnv: process.env.NODE_ENV
  };

  let variantAId = "";
  let variantBId = "";

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "1";
    process.env.NODE_ENV = "test";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
    await ensureGlAccount(BANK_A_GL, "TEST-ACC-CUTOVER Bank A");
    await ensureGlAccount(BANK_B_GL, "TEST-ACC-CUTOVER Bank B");
  });

  beforeEach(async () => {
    await cleanupOpeningBatches();
    await cleanupAccountingTestData();
    await cleanupCutoverProducts();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "1";
    process.env.NODE_ENV = "test";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;

    const a = await createCutoverVariant(SKU_A, ON_HAND_A);
    const b = await createCutoverVariant(SKU_B, ON_HAND_B);
    variantAId = a.variantId;
    variantBId = b.variantId;
  });

  afterEach(async () => {
    await cleanupOpeningBatches();
    await cleanupAccountingTestData();
    await cleanupCutoverProducts();
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalFlags.native ?? "0";
    if (originalFlags.opening === undefined) delete process.env.ACCOUNTING_OPENING_BALANCE_ENABLED;
    else process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = originalFlags.opening;
    if (originalFlags.prod === undefined) delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    else process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = originalFlags.prod;
    if (originalFlags.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalFlags.nodeEnv;
  });

  it("sanitizeImportedString strips formula injection prefix", () => {
    expect(sanitizeImportedString("=CMD|'/C calc'!A0")).toBe("CMD|'/C calc'!A0");
    expect(sanitizeImportedString("+1234")).toBe("1234");
    expect(sanitizeImportedString("-999")).toBe("999");
    expect(sanitizeImportedString("@SUM(A1)")).toBe("SUM(A1)");
    expect(sanitizeImportedString("normal-sku")).toBe("normal-sku");
  });

  it("UNKNOWN SKU mapping with qty blocks validate", async () => {
    const batch = await createOpeningBatch({
      effectiveDate: "2026-08-24",
      description: FIXTURE_DESC
    });
    await replaceOpeningStaging(batch.id, {
      skuMappings: [
        {
          newSarvedaSku: "UNKNOWN-SKU-XYZ",
          matchStatus: "UNKNOWN",
          openingQty: 3,
          unitCostInPaise: 1000,
          reviewStatus: "APPROVED"
        }
      ],
      inventoryLines: [],
      arApprovedZero: true
    });
    const validation = await validateOpeningBatch(batch.id);
    expect(validation.status).toBe("FAIL");
    expect(validation.checks.some((c) => c.code === "SKU_MAPPING_BLOCKED")).toBe(true);
  });

  it("feature flag off blocks create without forcePersist", async () => {
    process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "0";
    await expect(
      createOpeningBatch({ effectiveDate: "2026-08-24", description: FIXTURE_DESC })
    ).rejects.toThrow(/ACCOUNTING_OPENING_BALANCE_ENABLED/);
    expect(() => assertProductionOpeningPersistenceAllowed()).toThrow(
      AccountingOpeningBalanceDisabledError
    );
  });

  it("feature flag off blocks post without forcePersist", async () => {
    process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "1";
    const batch = await createOpeningBatch({
      effectiveDate: "2026-08-24",
      description: FIXTURE_DESC
    });
    await replaceOpeningStaging(batch.id, buildBalancedStaging());
    process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "0";
    await expect(postOpeningBatch(batch.id)).rejects.toThrow(AccountingOpeningBalanceDisabledError);
  });

  it("end-to-end: stage → validate → preview → post with exact paise invariants", async () => {
    const onHandBeforeA = (await getInventory(variantAId))!.onHand;
    const onHandBeforeB = (await getInventory(variantBId))!.onHand;

    const batch = await createOpeningBatch({
      effectiveDate: "2026-08-24",
      description: FIXTURE_DESC,
      arApprovedZero: true
    });

    await replaceOpeningStaging(batch.id, buildBalancedStaging());

    const validation = await validateOpeningBatch(batch.id);
    expect(validation.status).not.toBe("FAIL");
    expect(["PASS", "WARNING"]).toContain(validation.status);
    expect(validation.balanced).toBe(true);
    expect(validation.proposedDebitInPaise).toBe(validation.proposedCreditInPaise);

    const marked = await markOpeningBatchValidated(batch.id);
    expect(marked.ok).toBe(true);

    const preview = await previewOpeningBatchPost(batch.id);
    expect(preview.proposal.totalDebitInPaise).toBe(preview.proposal.totalCreditInPaise);
    expect(preview.proposal.totalDebitInPaise).toBe(248_000);

    const first = await postOpeningBatch(batch.id, { forcePersist: true });
    expect(first.duplicate).toBe(false);
    expect(first.journal).toBeTruthy();

    expect(await sumPostedGlNet("1200")).toBe(INV_TOTAL);
    expect(await sumPostedGlNet("2000")).toBe(-AP_TOTAL);
    expect(await sumPostedGlNet("1100")).toBe(0);
    expect(await sumPostedGlNet("1020")).toBe(GATEWAY_AMT);
    expect(await sumPostedGlNet(BANK_A_GL)).toBe(BANK_A_AMT);
    expect(await sumPostedGlNet(BANK_B_GL)).toBe(BANK_B_AMT);

    const layers = await prisma.accountingInventoryCostLayer.findMany({
      where: { variantId: { in: [variantAId, variantBId] }, sourceType: "OPENING" }
    });
    expect(layers.reduce((s, l) => s + l.totalCostInPaise, 0)).toBe(INV_TOTAL);

    expect((await getInventory(variantAId))!.onHand).toBe(onHandBeforeA);
    expect((await getInventory(variantBId))!.onHand).toBe(onHandBeforeB);

    const second = await postOpeningBatch(batch.id, { forcePersist: true });
    expect(second.duplicate).toBe(true);

    const uniqueKey = productionOpeningUniqueKey(batch.id);
    const events = await prisma.accountingPostingEvent.findMany({
      where: { eventType: "PRODUCTION_OPENING_BALANCE", uniqueKey }
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("POSTED");

    const event = await getPostingEvent("PRODUCTION_OPENING_BALANCE", uniqueKey);
    expect(event?.journalEntryId).toBe(first.journal?.id);
  });

  it("production guard blocks post on production-like DB without override", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;

    try {
      const batch = await createOpeningBatch({
        effectiveDate: "2026-08-24",
        description: FIXTURE_DESC
      });
      await replaceOpeningStaging(batch.id, buildBalancedStaging());
      await expect(postOpeningBatch(batch.id)).rejects.toThrow(AccountingProductionGuardError);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "1";
    }
  });
});
