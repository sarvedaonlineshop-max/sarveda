/**
 * Phase 7C — stage + validate + preview REAL cutover opening pack (DRAFT only).
 * Does NOT post, does NOT reset, does NOT persist flags to .env.
 *
 * Usage (on Lightsail with evidence files present):
 *   npx tsx scripts/phase7c-stage-real-opening-pack.ts
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

import { prisma } from "../src/config/db";
import {
  createOpeningBatch,
  previewOpeningBatchPost,
  replaceOpeningStaging
} from "../src/modules/accounting/opening-batch.service";
import { buildOpeningReviewWorkbook } from "../src/modules/accounting/opening-import.service";
import { buildOpeningProposal, validateOpeningBatch } from "../src/modules/accounting/opening-validation.service";
import { classifyCutover } from "../src/modules/accounting/accounting-cutover";

const CUTOVER_ISO = "2026-08-25";
const CUTOVER_DATE = new Date(`${CUTOVER_ISO}T00:00:00.000Z`);
const SOURCE = "PHASE7C_REAL_CUTOVER_2026-08-25";
const DESC = "PHASE7C_REAL_CUTOVER_2026-08-25 real opening pack DRAFT — do not post";

const EVIDENCE_DIR = process.env.PHASE7C_EVIDENCE_DIR || "/tmp/phase7c-evidence";

function inrToPaise(n: number): number {
  return Math.round(Number(n) * 100);
}

function cellNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v && "result" in (v as object)) {
    return Number((v as { result: unknown }).result) || 0;
  }
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

async function loadZohoUnitCostsBySku(file: string): Promise<Map<string, number>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0]!;
  const map = new Map<string, number>();
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    // Zoho export headers are messy: SKU is usually column 7; category_id col 6 may be empty.
    const sku = String(row.getCell(7).value ?? row.getCell(6).value ?? "")
      .trim()
      .toUpperCase();
    if (!sku || sku === "SKU" || sku === "CATEGORY_ID") continue;
    const qty = cellNum(row.getCell(4).value);
    const valueInr = cellNum(row.getCell(5).value);
    if (qty > 0 && valueInr > 0) {
      map.set(sku, inrToPaise(valueInr / qty));
    }
  }
  return map;
}

async function loadVendorPayables(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0]!;
  const rows: Array<{ vendorName: string; outstandingInPaise: number; billNumber: string }> = [];
  let sumInr = 0;
  for (let r = 3; r <= ws.rowCount; r++) {
    const name = String(ws.getRow(r).getCell(1).value ?? "").trim();
    if (!name || /total/i.test(name)) continue;
    const bal = cellNum(ws.getRow(r).getCell(5).value);
    if (bal > 0.005) {
      sumInr += bal;
      rows.push({
        vendorName: name.slice(0, 180),
        outstandingInPaise: inrToPaise(bal),
        billNumber: `OPENING-${CUTOVER_ISO}-${r}`
      });
    }
  }
  return { rows, sumInr, tbApInr: 4031538.66 };
}

async function loadCustomerReceivables(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0]!;
  const rows: Array<{
    customerName: string;
    invoiceReference: string;
    outstandingInPaise: number;
  }> = [];
  let sumInr = 0;
  for (let r = 3; r <= ws.rowCount; r++) {
    const name = String(ws.getRow(r).getCell(1).value ?? "").trim();
    if (!name || /total/i.test(name)) continue;
    const bal = cellNum(ws.getRow(r).getCell(5).value);
    if (bal > 0.5) {
      sumInr += bal;
      rows.push({
        customerName: name.slice(0, 180),
        invoiceReference: `AR-OPEN-${CUTOVER_ISO}-${r}`,
        outstandingInPaise: inrToPaise(bal)
      });
    }
  }
  return { rows, sumInr };
}

type Gap = { code: string; category: string; message: string; amountInr?: number };

async function main() {
  const prevNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const prevOpening = process.env.ACCOUNTING_OPENING_BALANCE_ENABLED;
  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = "1";

  const gaps: Gap[] = [];
  const classifications: Array<{
    zohoAccount: string;
    classification: string;
    tbDebitInr: number;
    tbCreditInr: number;
    staged: boolean;
    reason: string;
  }> = [];

  const tbAsOf = "Zoho Trial Balance.xlsx (owner evidence; period ending ~25/08/2026)";
  console.log(
    JSON.stringify(
      {
        cutoverDate: CUTOVER_ISO,
        cutoverInstantUtc: CUTOVER_DATE.toISOString(),
        semantics:
          "Documents with date < cutover instant are PRE_CUTOVER; date >= cutover are POST_CUTOVER",
        classifySampleBefore: classifyCutover(new Date("2026-08-24T23:59:59.000Z")),
        classifySampleOn: classifyCutover(CUTOVER_DATE),
        evidenceDir: EVIDENCE_DIR
      },
      null,
      2
    )
  );

  const valuationPath = path.join(EVIDENCE_DIR, "Inventory Valuation Summary.xlsx");
  const vendorPath = path.join(EVIDENCE_DIR, "Vendor Balance Summary.xlsx");
  const customerPath = path.join(EVIDENCE_DIR, "Customer Balance Summary.xlsx");
  for (const f of [valuationPath, vendorPath, customerPath]) {
    if (!fs.existsSync(f)) throw new Error(`Missing evidence file: ${f}`);
  }

  const zohoCosts = await loadZohoUnitCostsBySku(valuationPath);
  const vendors = await loadVendorPayables(vendorPath);
  const customers = await loadCustomerReceivables(customerPath);

  // Control account classification (from TB — not staged unless genuine forward need)
  const controlRows: Array<[string, number, number, string, string]> = [
    ["ICICI Bank - SARVEDA LIFE PRIVATE LIMITED", 107049.36, 0, "BANK", "Stage book balance to GL 1010"],
    ["Petty Cash", 24524.98, 0, "CASH", "Stage book balance to GL 1000"],
    ["Razorpay Account", 0, 385295.09, "DATA_GAP", "TB credit balance is not a clean unsettled receivable — exclude"],
    ["Stripe Control Account", 0, 4190.59, "DATA_GAP", "TB credit balance — exclude pending owner confirmation of unsettled"],
    ["PayPal (no TB control A/c)", 0, 0, "ZERO", "No PayPal control balance on TB — stage nothing"],
    ["Amazon Control Account", 0, 45760.76, "NOT_MIGRATING", "Marketplace recon control — not native gateway clearing"],
    ["Flipkart Control Account", 0, 8831.06, "NOT_MIGRATING", "Marketplace recon control"],
    ["Firstcry Control Account", 0, 10209, "NOT_MIGRATING", "Marketplace recon control"],
    ["Tata 1Mg Control Account", 0, 967.06, "NOT_MIGRATING", "Marketplace recon control"],
    ["Amala Earth Control Account", 7707.2, 0, "DATA_GAP", "Marketplace receivable candidate — needs owner confirm"],
    ["Etsy Control Account", 43230.46, 0, "DATA_GAP", "Marketplace receivable candidate — needs owner confirm"],
    ["Delhivery Control Account", 0, 243857.04, "LOGISTICS_CONTROL", "Logistics control — not opening AP/gateway"],
    ["Undeposited Funds", 3001976.63, 0, "NOT_MIGRATING", "Historical recon dump — exclude"],
    ["Clearining A/c", 1224327, 0, "NOT_MIGRATING", "Legacy clearing — exclude"],
    ["Accounts Receivable (TB control)", 0, 260504.51, "DATA_GAP", "TB shows CR; use Customer Balance Summary for AR staging"],
    ["Accounts Payable (TB control)", 0, 4031538.66, "DATA_GAP", "TB total ≠ vendor schedule sum — schedule is staged source"]
  ];
  for (const [name, dr, cr, cls, reason] of controlRows) {
    classifications.push({
      zohoAccount: name,
      classification: cls,
      tbDebitInr: dr,
      tbCreditInr: cr,
      staged: cls === "BANK" || cls === "CASH",
      reason
    });
    if (cls === "DATA_GAP") {
      gaps.push({
        code: "CONTROL_OR_TB_GAP",
        category: name,
        message: reason,
        amountInr: Math.max(dr, cr)
      });
    }
  }

  if (Math.abs(vendors.sumInr - vendors.tbApInr) > 1) {
    gaps.push({
      code: "AP_SCHEDULE_VS_TB",
      category: "AP",
      message: `Vendor schedule sum ₹${vendors.sumInr.toFixed(2)} ≠ TB AP ₹${vendors.tbApInr.toFixed(2)}`,
      amountInr: vendors.tbApInr - vendors.sumInr
    });
  }

  // Inventory from Sarveda ops qty
  const invRows = await prisma.$queryRaw<
    Array<{
      sku: string;
      product_name: string;
      variant_id: string;
      on_hand: number;
    }>
  >`
    SELECT v.sku, pr.name AS product_name, v.id AS variant_id, i."onHand" AS on_hand
    FROM "Inventory" i
    JOIN "ProductVariant" v ON v.id = i."variantId"
    JOIN "Product" pr ON pr.id = v."productId"
    WHERE i."onHand" > 0
      AND pr."deletedAt" IS NULL
      AND v.status = 'ACTIVE'
      AND COALESCE(pr."catalogHidden", false) = false
      AND v.sku NOT ILIKE '%TEST%'
      AND pr.slug NOT ILIKE '%test-acc%'
      AND pr.slug NOT ILIKE '%acct-prod%'
    ORDER BY v.sku ASC
  `;

  const fingerprintBefore = {
    orders: await prisma.order.count(),
    payments: await prisma.payment.count(),
    inventoryOnHandSum: (
      await prisma.inventory.aggregate({ _sum: { onHand: true } })
    )._sum.onHand ?? 0
  };

  const skuMappings: Array<{
    newSarvedaSku: string;
    productName: string | null;
    matchStatus: "EXACT";
    openingQty: number;
    unitCostInPaise: number;
    source: string;
    reviewStatus: "APPROVED" | "PENDING";
  }> = [];
  const inventoryLines: Array<{
    sku: string;
    quantity: number;
    unitCostInPaise: number;
    source: string;
    reviewStatus: "APPROVED" | "PENDING";
  }> = [];

  let invValPaise = 0;
  let missingCost = 0;
  let missingCostUnits = 0;

  for (const row of invRows) {
    const cost = zohoCosts.get(row.sku.toUpperCase());
    if (cost == null || cost <= 0) {
      missingCost++;
      missingCostUnits += row.on_hand;
      continue;
    }
    skuMappings.push({
      newSarvedaSku: row.sku,
      productName: row.product_name,
      matchStatus: "EXACT",
      openingQty: row.on_hand,
      unitCostInPaise: cost,
      source: `${SOURCE}|cost:zoho-inventory-valuation`,
      reviewStatus: "APPROVED"
    });
    inventoryLines.push({
      sku: row.sku,
      quantity: row.on_hand,
      unitCostInPaise: cost,
      source: `${SOURCE}|qty:sarveda-onHand`,
      reviewStatus: "APPROVED"
    });
    invValPaise += row.on_hand * cost;
  }

  if (missingCost > 0) {
    gaps.push({
      code: "INVENTORY_COST_DATA_GAP",
      category: "Inventory",
      message: `${missingCost} Sarveda stocked SKUs (${missingCostUnits} units) lack positive Zoho valuation unit cost — excluded from opening valuation`,
      amountInr: undefined
    });
  }
  gaps.push({
    code: "INVENTORY_BACKEND_FIFO_EMPTY",
    category: "Inventory",
    message:
      "Native AccountingInventoryCostLayer has no non-TEST costs for stocked SKUs; unit costs taken from Zoho Inventory Valuation Summary as cost evidence only (qty remains Sarveda)"
  });

  // Delete any prior PHASE7C draft batches to keep disposable
  const prior = await prisma.accountingOpeningBatch.findMany({
    where: { description: { contains: "PHASE7C_REAL_CUTOVER" }, status: { in: ["DRAFT", "VALIDATED"] } },
    select: { id: true }
  });
  for (const b of prior) {
    await prisma.accountingOpeningInventoryLine.updateMany({
      where: { batchId: b.id },
      data: { costLayerId: null }
    });
    await prisma.accountingOpeningBatch.delete({ where: { id: b.id } });
  }

  const batch = await createOpeningBatch({
    effectiveDate: CUTOVER_ISO,
    description: DESC,
    source: SOURCE,
    arApprovedZero: customers.rows.length === 0
  });

  const bankLines = [
    {
      name: "ICICI Bank - SARVEDA LIFE PRIVATE LIMITED",
      bankName: "ICICI",
      maskedAccountNumber: "XXXX",
      ifsc: null as string | null,
      accountType: "BANK",
      glAccountCode: "1010",
      openingBookBalanceInPaise: inrToPaise(107049.36),
      statementBalanceInPaise: inrToPaise(107049.36),
      source: `${SOURCE}|${tbAsOf}`,
      reviewStatus: "APPROVED" as const
    },
    {
      name: "Petty Cash",
      bankName: null,
      maskedAccountNumber: null,
      ifsc: null,
      accountType: "CASH",
      glAccountCode: "1000",
      openingBookBalanceInPaise: inrToPaise(24524.98),
      statementBalanceInPaise: inrToPaise(24524.98),
      source: `${SOURCE}|${tbAsOf}`,
      reviewStatus: "APPROVED" as const
    }
  ];

  // Ensure cash CoA exists
  const cash = await prisma.accountingAccount.findUnique({ where: { code: "1000" } });
  if (!cash) {
    gaps.push({
      code: "MISSING_COA_1000",
      category: "Cash",
      message: "GL 1000 Cash missing from CoA — seed required before post"
    });
  }

  const gstLines = [
    { accountCode: "2200", balanceInPaise: inrToPaise(84056.03), source: SOURCE, reviewStatus: "APPROVED" as const },
    { accountCode: "2201", balanceInPaise: inrToPaise(84056.03), source: SOURCE, reviewStatus: "APPROVED" as const },
    { accountCode: "2202", balanceInPaise: inrToPaise(546347.85), source: SOURCE, reviewStatus: "APPROVED" as const },
    { accountCode: "2100", balanceInPaise: -inrToPaise(388610.11), source: SOURCE, reviewStatus: "APPROVED" as const },
    { accountCode: "2101", balanceInPaise: -inrToPaise(388610.11), source: SOURCE, reviewStatus: "APPROVED" as const },
    { accountCode: "2102", balanceInPaise: -inrToPaise(104148.1), source: SOURCE, reviewStatus: "APPROVED" as const }
  ];

  // Temporary staging without equity to compute residual
  await replaceOpeningStaging(batch.id, {
    skuMappings,
    inventoryLines,
    bankLines,
    gatewayLines: [],
    apLines: vendors.rows.map((v) => ({
      vendorName: v.vendorName,
      billNumber: v.billNumber,
      billDate: CUTOVER_ISO,
      outstandingInPaise: v.outstandingInPaise,
      currency: "INR",
      source: SOURCE,
      reviewStatus: "APPROVED" as const
    })),
    arLines: customers.rows.map((c) => ({
      customerName: c.customerName,
      invoiceReference: c.invoiceReference,
      invoiceDate: CUTOVER_ISO,
      outstandingInPaise: c.outstandingInPaise,
      currency: "INR",
      source: SOURCE,
      reviewStatus: "APPROVED" as const
    })),
    gstLines,
    equityLines: [],
    arApprovedZero: customers.rows.length === 0
  });

  let graph = await previewOpeningBatchPost(batch.id);
  let proposal = buildOpeningProposal(graph.batch!);
  const residual = proposal.totalDebitInPaise - proposal.totalCreditInPaise;
  // residual > 0 means need more credits (equity); residual < 0 need more debits
  const proposedEquityPaise = residual;

  gaps.push({
    code: "PROPOSED_OPENING_EQUITY",
    category: "Equity",
    message:
      proposedEquityPaise > 0
        ? `Proposed credit to equity to balance opening: ${proposedEquityPaise} paise (₹${(proposedEquityPaise / 100).toFixed(2)}) — NOT auto-approved`
        : proposedEquityPaise < 0
          ? `Opening credits exceed debits by ${-proposedEquityPaise} paise — missing asset or overstated liability (DATA_GAP)`
          : "Opening already balanced without equity plug",
    amountInr: proposedEquityPaise / 100
  });

  const equityLines =
    proposedEquityPaise > 0
      ? [
          {
            accountCode: "3000",
            amountInPaise: proposedEquityPaise,
            reason: "PROPOSED_OPENING_EQUITY — balancing residual pending owner/accountant approval",
            reviewStatus: "PENDING" as const
          }
        ]
      : [];

  await replaceOpeningStaging(batch.id, {
    skuMappings,
    inventoryLines,
    bankLines,
    gatewayLines: [],
    apLines: vendors.rows.map((v) => ({
      vendorName: v.vendorName,
      billNumber: v.billNumber,
      billDate: CUTOVER_ISO,
      outstandingInPaise: v.outstandingInPaise,
      currency: "INR",
      source: SOURCE,
      reviewStatus: "APPROVED" as const
    })),
    arLines: customers.rows.map((c) => ({
      customerName: c.customerName,
      invoiceReference: c.invoiceReference,
      invoiceDate: CUTOVER_ISO,
      outstandingInPaise: c.outstandingInPaise,
      currency: "INR",
      source: SOURCE,
      reviewStatus: "APPROVED" as const
    })),
    gstLines,
    equityLines,
    arApprovedZero: customers.rows.length === 0,
    equity3900Approved: false
  });

  const validation = await validateOpeningBatch(batch.id);
  graph = await previewOpeningBatchPost(batch.id);
  proposal = buildOpeningProposal(graph.batch!);

  const reviewBuf = await buildOpeningReviewWorkbook(batch.id);
  const outDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const reviewPath = path.join(outDir, `phase7c-opening-review-${CUTOVER_ISO}.xlsx`);
  fs.writeFileSync(reviewPath, reviewBuf);

  const fingerprintAfter = {
    orders: await prisma.order.count(),
    payments: await prisma.payment.count(),
    inventoryOnHandSum: (
      await prisma.inventory.aggregate({ _sum: { onHand: true } })
    )._sum.onHand ?? 0
  };

  const postedJournals = await prisma.accountingJournalEntry.count({
    where: { memo: { contains: "PRODUCTION_OPENING_BALANCE" }, status: "POSTED" }
  });
  const thisBatch = await prisma.accountingOpeningBatch.findUnique({
    where: { id: batch.id },
    select: { status: true, journalEntryId: true, batchNumber: true }
  });

  const assetsPaise =
    invValPaise +
    inrToPaise(107049.36) +
    inrToPaise(24524.98) +
    customers.rows.reduce((s, c) => s + c.outstandingInPaise, 0) +
    inrToPaise(84056.03) +
    inrToPaise(84056.03) +
    inrToPaise(546347.85);

  const liabilitiesPaise =
    vendors.rows.reduce((s, v) => s + v.outstandingInPaise, 0) +
    inrToPaise(388610.11) +
    inrToPaise(388610.11) +
    inrToPaise(104148.1);

  const summary = {
    batchId: batch.id,
    batchNumber: thisBatch?.batchNumber,
    status: thisBatch?.status,
    journalEntryId: thisBatch?.journalEntryId,
    postedOpeningJournals: postedJournals,
    cutoverDate: CUTOVER_ISO,
    inventory: {
      stockedSkus: invRows.length,
      stagedSkus: inventoryLines.length,
      missingCostSkus: missingCost,
      valuationPaise: invValPaise,
      valuationInr: invValPaise / 100,
      gl: "1200"
    },
    bankCash: {
      iciciPaise: inrToPaise(107049.36),
      pettyCashPaise: inrToPaise(24524.98),
      totalPaise: inrToPaise(107049.36) + inrToPaise(24524.98)
    },
    gatewayStagedPaise: 0,
    ap: { vendors: vendors.rows.length, totalPaise: vendors.rows.reduce((s, v) => s + v.outstandingInPaise, 0) },
    ar: {
      customers: customers.rows.length,
      totalPaise: customers.rows.reduce((s, c) => s + c.outstandingInPaise, 0)
    },
    gst: {
      inputCgst: inrToPaise(84056.03),
      inputSgst: inrToPaise(84056.03),
      inputIgst: inrToPaise(546347.85),
      outputCgst: inrToPaise(388610.11),
      outputSgst: inrToPaise(388610.11),
      outputIgst: inrToPaise(104148.1)
    },
    proposedEquityPaise,
    totals: {
      assetsPaise,
      liabilitiesPaise,
      proposedEquityPaise,
      debitPaise: proposal.totalDebitInPaise,
      creditPaise: proposal.totalCreditInPaise,
      differencePaise: proposal.totalDebitInPaise - proposal.totalCreditInPaise
    },
    validationStatus: validation.status,
    validationFails: validation.checks.filter((c) => c.status === "FAIL").map((c) => c.code),
    gaps,
    classifications,
    fingerprintBefore,
    fingerprintAfter,
    commerceUnchanged:
      fingerprintBefore.orders === fingerprintAfter.orders &&
      fingerprintBefore.payments === fingerprintAfter.payments &&
      fingerprintBefore.inventoryOnHandSum === fingerprintAfter.inventoryOnHandSum,
    reviewPath,
    flagsNote: "NATIVE_ACCOUNTING_ENABLED and ACCOUNTING_OPENING_BALANCE_ENABLED set in-process only; .env not written"
  };

  const summaryPath = path.join(outDir, `phase7c-opening-summary-${CUTOVER_ISO}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("SUMMARY_JSON", summaryPath);
  console.log("REVIEW_XLSX", reviewPath);

  if (prevNative === undefined) delete process.env.NATIVE_ACCOUNTING_ENABLED;
  else process.env.NATIVE_ACCOUNTING_ENABLED = prevNative;
  if (prevOpening === undefined) delete process.env.ACCOUNTING_OPENING_BALANCE_ENABLED;
  else process.env.ACCOUNTING_OPENING_BALANCE_ENABLED = prevOpening;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
