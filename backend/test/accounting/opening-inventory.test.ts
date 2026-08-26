import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingInventoryValuationDisabledError,
  AccountingProductionGuardError
} from "../../src/modules/accounting/accounting-errors";
import {
  classifyVariantForInventory,
  isOpeningLayerEligible
} from "../../src/modules/accounting/inventory-classification";
import {
  assertLayerQuantityInvariants,
  computeLineTotalCost,
  parseUnitCostToPaise,
  parsePositiveInt
} from "../../src/modules/accounting/inventory-layer-invariants";
import { INVENTORY_ACCOUNT_CODE, openingLayerFingerprint } from "../../src/modules/accounting/inventory.constants";
import { buildOpeningInventoryJournal } from "../../src/modules/accounting/opening-inventory-journal.builder";
import {
  hashOpeningPayload,
  parseOpeningInventoryXlsx,
  validateOpeningImportRows
} from "../../src/modules/accounting/opening-inventory-import.service";
import { saveOpeningBatchDraft } from "../../src/modules/accounting/opening-inventory-batch.service";
import {
  postOpeningInventoryBatch,
  previewOpeningInventoryPost
} from "../../src/modules/accounting/opening-inventory-posting.service";
import {
  buildInventoryReconciliationV1,
  sortLayersFifo
} from "../../src/modules/accounting/inventory-reconciliation.service";
import {
  assertInventoryOpeningPostingPersistenceAllowed
} from "../../src/modules/accounting/production-guard";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import {
  cleanupAccountingTestData,
  createTestProductWithInventory,
  getInventory,
  prisma
} from "../helpers/commerce";

async function xlsxFromRows(rows: Array<Array<string | number>>) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Opening");
  for (const row of rows) sheet.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe("Phase 3D1 opening inventory layers", () => {
  const batchIds: string[] = [];
  const originalFlags = {
    native: process.env.NATIVE_ACCOUNTING_ENABLED,
    inv: process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED,
    prod: process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED,
    nodeEnv: process.env.NODE_ENV
  };

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "1";
    process.env.NODE_ENV = "test";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "1";
    process.env.NODE_ENV = "test";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
  });

  afterEach(async () => {
    for (const id of batchIds.splice(0)) {
      await prisma.accountingInventoryOpeningBatch.deleteMany({ where: { id } }).catch(() => undefined);
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalFlags.native ?? "0";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = originalFlags.inv ?? "0";
    if (originalFlags.prod === undefined) delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    else process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = originalFlags.prod;
    if (originalFlags.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalFlags.nodeEnv;
  });

  it("1. classifies physical SKU as PHYSICAL_INVENTORY", () => {
    expect(
      classifyVariantForInventory({
        sku: "BOWL-001",
        productType: "SIMPLE",
        catalogHidden: false,
        onHand: 10
      })
    ).toBe("PHYSICAL_INVENTORY");
    expect(isOpeningLayerEligible("PHYSICAL_INVENTORY")).toBe(true);
  });

  it("2. excludes course/digital placeholder", () => {
    expect(
      classifyVariantForInventory({
        sku: "COURSE-SOUND-THERAPY",
        productType: "VARIABLE",
        catalogHidden: false,
        onHand: 999
      })
    ).toBe("COURSE_DIGITAL_PLACEHOLDER");
  });

  it("3. rejects unknown SKU in import validation", async () => {
    const preview = await validateOpeningImportRows({
      rows: [
        {
          sku: "DOES-NOT-EXIST-XYZ",
          openingQty: 5,
          unitCostInPaise: 1000,
          rowNumber: 2
        }
      ],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    expect(preview.errors.some((e) => e.code === "UNKNOWN_SKU")).toBe(true);
  });

  it("4. rejects duplicate SKU rows", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 5 });
    const preview = await validateOpeningImportRows({
      rows: [
        { sku: bundle.sku, openingQty: 5, unitCostInPaise: 500, rowNumber: 2 },
        { sku: bundle.sku, openingQty: 5, unitCostInPaise: 500, rowNumber: 3 }
      ],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    expect(preview.errors.some((e) => e.code === "DUPLICATE_SKU")).toBe(true);
  });

  it("5. rejects zero cost", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 5 });
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 5, unitCostInPaise: 0, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    expect(preview.errors.some((e) => e.code === "ZERO_COST")).toBe(true);
  });

  it("6. rejects negative cost via parser", () => {
    expect(parseUnitCostToPaise(-100, null)).toBeNull();
    expect(parsePositiveInt(-1)).toBeNull();
  });

  it("7. quantity mismatch blocked without override", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 5, unitCostInPaise: 1000, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test",
      allowQuantityMismatch: false
    });
    expect(preview.errors.some((e) => e.code === "QUANTITY_MISMATCH")).toBe(true);
    expect(preview.canPost).toBe(false);
  });

  it("8. exact quantity match passes", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 7 });
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 7, unitCostInPaise: 2500, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    expect(preview.canPost).toBe(true);
    expect(preview.errors.filter((e) => e.code !== "CLASSIFICATION_EXCLUDED")).toHaveLength(0);
  });

  it("9. total value arithmetic", () => {
    expect(computeLineTotalCost(3, 1500)).toBe(4500);
  });

  it("10. rupee to paise conversion in XLSX", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 2 });
    const buf = await xlsxFromRows([
      ["SKU", "OPENING_QTY", "UNIT_COST"],
      [bundle.sku, 2, 12.5]
    ]);
    const rows = await parseOpeningInventoryXlsx(buf);
    expect(rows[0]?.unitCostInPaise).toBe(1250);
  });

  it("11. duplicate batch post is idempotent", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 4 });
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 4, unitCostInPaise: 800, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    const batch = await saveOpeningBatchDraft({ preview });
    batchIds.push(batch.id);

    const first = await postOpeningInventoryBatch(batch.id);
    const second = await postOpeningInventoryBatch(batch.id);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);

    const events = await prisma.accountingPostingEvent.findMany({
      where: { eventType: "INVENTORY_OPENING_POSTED" }
    });
    expect(events).toHaveLength(1);
    const journals = await prisma.accountingJournalEntry.findMany();
    expect(journals).toHaveLength(1);
  });

  it("12. concurrent post attempts produce one journal", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 3 });
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 3, unitCostInPaise: 900, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    const batch = await saveOpeningBatchDraft({ preview });
    batchIds.push(batch.id);

    await Promise.allSettled(Array.from({ length: 20 }, () => postOpeningInventoryBatch(batch.id)));

    const journals = await prisma.accountingJournalEntry.findMany();
    expect(journals).toHaveLength(1);
    const layers = await prisma.accountingInventoryCostLayer.findMany({ where: { sourceId: batch.id } });
    expect(layers).toHaveLength(1);
  });

  it("13. layer quantity invariants", () => {
    assertLayerQuantityInvariants({ quantityOriginal: 10, quantityRemaining: 5 });
    expect(() =>
      assertLayerQuantityInvariants({ quantityOriginal: 5, quantityRemaining: 10 })
    ).toThrow();
  });

  it("14. FIFO deterministic ordering", () => {
    const base = new Date("2026-01-01");
    const sorted = sortLayersFifo([
      { id: "b", effectiveAt: base, createdAt: base },
      { id: "a", effectiveAt: base, createdAt: base },
      { id: "c", effectiveAt: new Date("2026-01-02"), createdAt: base }
    ]);
    expect(sorted.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("15. source fingerprint stable", () => {
    const fp = openingLayerFingerprint("batch-1", "var-1", "item-1");
    expect(fp).toBe("opening:batch-1:var-1:item-1");
  });

  it("16. flag off blocks posting", () => {
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "0";
    expect(() => assertInventoryOpeningPostingPersistenceAllowed()).toThrow(
      AccountingInventoryValuationDisabledError
    );
  });

  it("17. production dual guard", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://x@13.204.112.165/sarveda_db";
    process.env.ACCOUNTING_INVENTORY_VALUATION_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    expect(() => assertInventoryOpeningPostingPersistenceAllowed()).toThrow(
      AccountingProductionGuardError
    );
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://sarveda:password@localhost:5432/sarveda_db";
  });

  it("18. malformed workbook rejected", async () => {
    await expect(parseOpeningInventoryXlsx(Buffer.from("not-xlsx"))).rejects.toThrow();
  });

  it("19. operational Inventory unchanged after post", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 6, reserved: 1 });
    const before = await getInventory(bundle.variantId);
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 6, unitCostInPaise: 1100, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    const batch = await saveOpeningBatchDraft({ preview });
    batchIds.push(batch.id);
    await postOpeningInventoryBatch(batch.id);
    const after = await getInventory(bundle.variantId);
    expect(after?.onHand).toBe(before?.onHand);
    expect(after?.reserved).toBe(before?.reserved);
  });

  it("20. ProductVariant.costInPaise unchanged after post", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 2 });
    await prisma.productVariant.update({ where: { id: bundle.variantId }, data: { costInPaise: null } });
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 2, unitCostInPaise: 2200, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    const batch = await saveOpeningBatchDraft({ preview });
    batchIds.push(batch.id);
    await postOpeningInventoryBatch(batch.id);
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: bundle.variantId } });
    expect(variant.costInPaise).toBeNull();
  });

  it("21. opening journal balanced Dr 1200 / Cr 3900", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 5 });
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 5, unitCostInPaise: 1000, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    const batch = await saveOpeningBatchDraft({ preview });
    batchIds.push(batch.id);
    const posted = await postOpeningInventoryBatch(batch.id);
    expect(posted.journal.totalDebitInPaise).toBe(5000);
    expect(posted.journal.totalCreditInPaise).toBe(5000);

    const lines = await prisma.accountingJournalLine.findMany({
      where: { journalEntryId: posted.journal.id },
      include: { account: true }
    });
    expect(lines.find((l) => l.account.code === INVENTORY_ACCOUNT_CODE.INVENTORY_ASSET)?.debitInPaise).toBe(
      5000
    );
    expect(
      lines.find((l) => l.account.code === INVENTORY_ACCOUNT_CODE.OPENING_BALANCE_EQUITY)?.creditInPaise
    ).toBe(5000);
    expect(lines.some((l) => l.account.code === INVENTORY_ACCOUNT_CODE.INVENTORY_PURCHASES_CLEARING)).toBe(
      false
    );
  });

  it("22. reconciliation shows OPENING_POSTED after batch", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 8 });
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 8, unitCostInPaise: 500, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    const batch = await saveOpeningBatchDraft({ preview });
    batchIds.push(batch.id);
    await postOpeningInventoryBatch(batch.id);

    const recon = await buildInventoryReconciliationV1({ sku: bundle.sku, limit: 10 });
    const row = recon.rows.find((r) => r.sku === bundle.sku);
    expect(row?.openingStatus).toBe("OPENING_POSTED");
    expect(row?.nativeLayerQuantity).toBe(8);
    expect(recon.financialControl.glVsLayersVarianceInPaise).toBe(0);
  });

  it("23. course SKU excluded from opening import", async () => {
    const suffix = `${Date.now()}`;
    const product = await prisma.product.create({
      data: {
        slug: `course-${suffix}`,
        name: "Course",
        status: "ACTIVE",
        productType: "DIGITAL"
      }
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `COURSE-TEST-${suffix}`,
        mrpInPaise: 100_000,
        saleInPaise: 100_000,
        isDefault: true
      }
    });
    await prisma.inventory.create({ data: { variantId: variant.id, onHand: 999 } });

    const preview = await validateOpeningImportRows({
      rows: [{ sku: variant.sku, openingQty: 999, unitCostInPaise: 100, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    expect(preview.errors.some((e) => e.code === "CLASSIFICATION_EXCLUDED")).toBe(true);
    expect(preview.canPost).toBe(false);
  });

  it("24. preview post returns proposal without persisting", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 1 });
    const preview = await validateOpeningImportRows({
      rows: [{ sku: bundle.sku, openingQty: 1, unitCostInPaise: 100, rowNumber: 2 }],
      effectiveDate: "2026-08-24",
      valuationSource: "test"
    });
    const batch = await saveOpeningBatchDraft({ preview });
    batchIds.push(batch.id);
    const p = await previewOpeningInventoryPost(batch.id);
    expect(p.proposal.totalValueInPaise).toBe(100);
    expect(p.alreadyPosted).toBe(false);
  });

  it("25. payload hash deterministic", () => {
    const rows = [{ sku: "A", openingQty: 1, unitCostInPaise: 100, rowNumber: 2 }];
    expect(hashOpeningPayload(rows)).toBe(hashOpeningPayload(rows));
  });

  it("26. opening journal builder uses 1200 not 1210", () => {
    const proposal = buildOpeningInventoryJournal(
      {
        id: "b1",
        batchNumber: "INV-OPEN-TEST",
        effectiveDate: new Date("2026-08-24"),
        totalQuantity: 2,
        totalValueInPaise: 2000,
        valuationSource: "test"
      },
      [{ sku: "X", openingQuantity: 2, unitCostInPaise: 1000, totalCostInPaise: 2000 }]
    );
    expect(proposal.lines.some((l) => l.accountCode === "1210")).toBe(false);
    expect(proposal.lines.some((l) => l.accountCode === "1200")).toBe(true);
  });
});
