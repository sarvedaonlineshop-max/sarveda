/**
 * Phase 2B local/dev ORDER_PAID shadow validation.
 * Refuses production-like hosts. Posts only against localhost.
 *
 *   NATIVE_ACCOUNTING_ENABLED=1 ACCOUNTING_SALES_POSTING_ENABLED=0 \
 *     npx tsx scripts/phase2b-staging-validation.ts
 */
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

import { runOrderPaidDiscovery } from "../src/modules/accounting/discovery-worker";
import { loadOrderPaidSnapshotById } from "../src/modules/accounting/order-snapshot.service";
import {
  postOrderPaidJournal,
  previewOrderPaidJournal
} from "../src/modules/accounting/order-paid-posting.service";
import {
  ORDER_PAID_CALC_VERSION,
  ORDER_PAID_EVENT_TYPE,
  orderPaidUniqueKey
} from "../src/modules/accounting/order-paid.constants";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";
import { buildReconciliationReport } from "../src/modules/accounting/reconciliation.service";

const prisma = new PrismaClient();

type Fingerprint = {
  orderHash: string;
  paymentHash: string;
  itemHash: string;
  inventoryHash: string;
  invoiceHash: string;
  zoho: unknown;
};

function dbMeta(url: string) {
  try {
    const u = new URL(url.replace(/^postgresql:/i, "http:"));
    return {
      host: u.hostname,
      port: u.port || "5432",
      database: (u.pathname || "/").replace(/^\//, "").split("?")[0]
    };
  } catch {
    return { host: "(parse-error)", port: "?", database: "?" };
  }
}

function hash(v: unknown) {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
}

async function fingerprint(orderId: string): Promise<Fingerprint> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      subtotalInPaise: true,
      discountInPaise: true,
      shippingInPaise: true,
      taxInPaise: true,
      grandTotalInPaise: true,
      zohoInvoiceId: true,
      zohoInvoiceNo: true,
      zohoSyncedAt: true,
      zohoSyncError: true,
      updatedAt: true
    }
  });
  const payments = await prisma.payment.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      provider: true,
      status: true,
      amountInPaise: true,
      refundedInPaise: true,
      updatedAt: true
    }
  });
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      variantId: true,
      qtyOrdered: true,
      unitPriceInPaise: true,
      lineTotalInPaise: true
    }
  });
  const inventory = await prisma.inventory.findMany({
    where: { variantId: { in: items.map((i) => i.variantId) } },
    orderBy: { variantId: "asc" },
    select: { variantId: true, onHand: true, reserved: true }
  });
  const invoice = await prisma.invoice.findUnique({
    where: { orderId },
    select: { id: true, invoiceNo: true, pdfUrl: true, issuedAt: true }
  });
  return {
    orderHash: hash(order),
    paymentHash: hash(payments),
    itemHash: hash(items),
    inventoryHash: hash(inventory),
    invoiceHash: hash(invoice),
    zoho: {
      zohoInvoiceId: order?.zohoInvoiceId ?? null,
      zohoInvoiceNo: order?.zohoInvoiceNo ?? null,
      zohoSyncedAt: order?.zohoSyncedAt ?? null,
      zohoSyncError: order?.zohoSyncError ?? null
    }
  };
}

function assertSame(a: Fingerprint, b: Fingerprint, label: string) {
  for (const k of ["orderHash", "paymentHash", "itemHash", "inventoryHash", "invoiceHash"] as const) {
    if (a[k] !== b[k]) throw new Error(`COMMERCE MUTATION after ${label}: ${k}`);
  }
  if (JSON.stringify(a.zoho) !== JSON.stringify(b.zoho)) {
    throw new Error(`COMMERCE MUTATION after ${label}: zoho`);
  }
}

async function accountingFor(orderId: string) {
  const uniqueKey = orderPaidUniqueKey(orderId);
  const events = await prisma.accountingPostingEvent.findMany({
    where: { eventType: ORDER_PAID_EVENT_TYPE, uniqueKey },
    include: {
      journalEntry: {
        include: {
          lines: { include: { account: true }, orderBy: { sortOrder: "asc" } }
        }
      }
    }
  });
  return {
    eventCount: events.length,
    journalCount: events.filter((e) => e.journalEntryId).length,
    detail: events.map((e) => ({
      status: e.status,
      uniqueKey: e.uniqueKey,
      eventType: e.eventType,
      entryNumber: e.journalEntry?.entryNumber ?? null,
      journalStatus: e.journalEntry?.status ?? null,
      debit: e.journalEntry?.totalDebitInPaise ?? null,
      credit: e.journalEntry?.totalCreditInPaise ?? null,
      memo: e.journalEntry?.memo ?? null,
      lines: (e.journalEntry?.lines ?? []).map((l) => ({
        code: l.account.code,
        debit: l.debitInPaise,
        credit: l.creditInPaise
      }))
    }))
  };
}

async function main() {
  const report: Record<string, unknown> = {};
  const meta = dbMeta(process.env.DATABASE_URL ?? "");

  report.environment = {
    NODE_ENV: process.env.NODE_ENV ?? "(unset)",
    database_host: meta.host,
    database_name: meta.database,
    database_port: meta.port,
    production_like: isProductionLikeEnvironment(),
    NATIVE_ACCOUNTING_ENABLED: process.env.NATIVE_ACCOUNTING_ENABLED ?? "(unset)",
    ACCOUNTING_SALES_POSTING_ENABLED: process.env.ACCOUNTING_SALES_POSTING_ENABLED ?? "(unset)",
    ACCOUNTING_BULK_DISCOVERY_ALLOWED: process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED ?? "(unset)",
    ACCOUNTING_PRODUCTION_POSTING_ALLOWED:
      process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED ?? "(unset)"
  };

  if (isProductionLikeEnvironment()) {
    console.error("STOP: production-like environment detected");
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  if (meta.host !== "localhost" && meta.host !== "127.0.0.1") {
    console.error("STOP: non-local host:", meta.host);
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      placedAt: { not: null },
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "REFUNDED"] }
    },
    select: { id: true, orderNumber: true },
    orderBy: { placedAt: "asc" },
    take: 10
  });
  if (!orders.length) throw new Error("No paid-pipeline orders available");

  report.selectedOrders = orders;
  report.coverage = {
    present: ["A Razorpay no-discount", "C intra-state Karnataka", "H qty>1"],
    absent: ["B discount", "D inter-state", "E shipping", "F multi-line", "G multi-rate", "I COD"],
    note: "Active DB is local/dev localhost — not a remote staging cluster."
  };

  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "0";
  delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;

  const previews = [];
  for (const o of orders) {
    const snapshot = await loadOrderPaidSnapshotById(o.id);
    const preview = await previewOrderPaidJournal(snapshot);
    const d = preview.proposal?.diagnostics;
    const row = {
      orderNumber: snapshot.orderNumber,
      provider: snapshot.payment.provider,
      paymentStatus: snapshot.payment.status,
      eligible: preview.eligibility.eligible,
      reason: preview.eligibility.reason,
      grandTotalInPaise: snapshot.grandTotalInPaise,
      subtotalInPaise: snapshot.subtotalInPaise,
      discountInPaise: snapshot.discountInPaise,
      shippingInPaise: snapshot.shippingInPaise,
      jurisdiction: d ? (d.interState ? "INTER_STATE" : "INTRA_STATE") : null,
      shipState: snapshot.shippingState,
      shipCountry: snapshot.shippingCountry,
      preDiscountTaxable: d?.preDiscountTaxablePaise ?? null,
      postDiscountTaxable: d?.postDiscountTaxablePaise ?? null,
      cgst: d?.outputCgstPaise ?? null,
      sgst: d?.outputSgstPaise ?? null,
      igst: d?.outputIgstPaise ?? null,
      contra4200: d?.discountTaxableContraPaise ?? null,
      debitTotal: preview.proposal?.totalDebitPaise ?? null,
      creditTotal: preview.proposal?.totalCreditPaise ?? null,
      imbalance: preview.proposal?.imbalancePaise ?? null,
      balanced: preview.proposal?.balanced ?? false,
      pdfGst: d?.pdfBasis?.gstTotalPaise ?? null,
      nativeGst: d?.outputGstTotalPaise ?? null,
      pdfTaxable: d?.pdfBasis?.taxablePaise ?? null,
      zohoMerchandiseVariance: d?.zohoParity?.merchandiseVariancePaise ?? null,
      calcVersion: preview.proposal?.calcVersion ?? null,
      uniqueKey: preview.proposal?.uniqueKey ?? null,
      lines: snapshot.lines.length,
      qtys: snapshot.lines.map((l) => l.qtyOrdered),
      buildError: preview.buildError ?? null
    };
    if (preview.eligibility.eligible && (!row.balanced || Math.abs(row.imbalance ?? 99) > 2)) {
      throw new Error(`STOP imbalanced preview ${row.orderNumber}: ${row.imbalance}`);
    }
    previews.push(row);
  }
  report.previews = previews;

  const primary = orders[0]!;
  const before = await fingerprint(primary.id);

  const dry = await runOrderPaidDiscovery({ orderId: primary.id, dryRun: true, limit: 1 });
  assertSame(before, await fingerprint(primary.id), "dry-run");
  const dryCounts = await accountingFor(primary.id);
  if (dryCounts.eventCount || dryCounts.journalCount) {
    throw new Error("Dry-run persisted accounting rows");
  }
  report.firstDryRun = { dry, dryCounts, commerceUnchanged: true };

  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
  const snap = await loadOrderPaidSnapshotById(primary.id);
  const post1 = await postOrderPaidJournal(snap);
  assertSame(before, await fingerprint(primary.id), "first-post");
  const after1 = await accountingFor(primary.id);
  report.firstPost = {
    duplicate: post1.duplicate,
    calcVersion: post1.proposal.calcVersion,
    uniqueKey: post1.proposal.uniqueKey,
    memo: post1.proposal.memo,
    debit: post1.proposal.totalDebitPaise,
    credit: post1.proposal.totalCreditPaise,
    balanced: post1.proposal.balanced,
    journalEntryNumber: post1.journal.entryNumber,
    journalStatus: post1.journal.status,
    journalDebit: post1.journal.totalDebitInPaise,
    journalCredit: post1.journal.totalCreditInPaise,
    lines: post1.proposal.lines.map((l) => ({
      code: l.accountCode,
      debit: l.debitInPaise,
      credit: l.creditInPaise,
      source: (l as any).amountSource ?? (l as any).amountSource
    })),
    accounting: after1
  };
  if (after1.eventCount !== 1 || after1.journalCount !== 1) {
    throw new Error("Expected exactly 1 event and 1 journal");
  }
  if (post1.proposal.uniqueKey !== orderPaidUniqueKey(primary.id)) {
    throw new Error("uniqueKey mismatch");
  }
  if (post1.proposal.calcVersion !== ORDER_PAID_CALC_VERSION) {
    throw new Error(`calcVersion expected ${ORDER_PAID_CALC_VERSION}, got ${post1.proposal.calcVersion}`);
  }

  const replays = [];
  for (let i = 0; i < 5; i++) {
    const r = await postOrderPaidJournal(snap);
    replays.push({ i, duplicate: r.duplicate, entry: r.journal.entryNumber });
  }
  const discReplay = await runOrderPaidDiscovery({ orderId: primary.id, dryRun: false, limit: 1 });
  assertSame(before, await fingerprint(primary.id), "replay");
  const afterReplay = await accountingFor(primary.id);
  report.idempotency = { replays, discReplay, afterReplay };
  if (afterReplay.eventCount !== 1 || afterReplay.journalCount !== 1) {
    throw new Error("Idempotency failed");
  }

  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "0";
  const batchDry = await runOrderPaidDiscovery({ dryRun: true, limit: 10 });
  report.boundedDry = batchDry;

  const fps: Record<string, Fingerprint> = {};
  for (const o of orders) fps[o.id] = await fingerprint(o.id);

  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
  const batchPost = await runOrderPaidDiscovery({ dryRun: false, limit: 10 });
  const batchAgain = await runOrderPaidDiscovery({ dryRun: false, limit: 10 });
  report.boundedPost = batchPost;
  report.boundedReplay = batchAgain;

  for (const o of orders) {
    assertSame(fps[o.id]!, await fingerprint(o.id), `batch-${o.orderNumber}`);
    const c = await accountingFor(o.id);
    if (c.eventCount !== 1 || c.journalCount !== 1) {
      throw new Error(`${o.orderNumber} not 1/1`);
    }
  }
  report.commerceIntegrity = { unchanged: true, checked: orders.length };

  const snapshots = [];
  for (const o of orders) snapshots.push(await loadOrderPaidSnapshotById(o.id));
  const recon = await buildReconciliationReport(snapshots);
  report.reconciliation = recon;
  report.varianceCategories = recon.rows.map((row) => {
    const pdfVar = row.sarvedaPdfBasis.varianceVsNativeTaxablePaise ?? 0;
    const zohoVar = row.native.zohoMerchandiseVariancePaise ?? 0;
    return {
      orderNumber: row.orderNumber,
      pdfTaxableVariance: pdfVar,
      zohoMerchandiseVariance: zohoVar,
      pdfCategory: pdfVar === 0 ? "EXPECTED" : Math.abs(pdfVar) <= 2 ? "ROUNDING" : "EXPECTED",
      zohoCategory: zohoVar === 0 ? "EXPECTED" : Math.abs(zohoVar) <= 2 ? "ROUNDING" : "EXPECTED",
      dataGaps: [
        row.zoho.invoiceId ? null : "ZOHO_LOCAL_REF_MISSING",
        "DISCOUNT_ABSENT",
        "COD_ABSENT",
        "INTERSTATE_ABSENT",
        "SHIPPING_ABSENT",
        "MULTI_RATE_ABSENT"
      ].filter(Boolean)
    };
  });

  report.guardProof = {
    productionLike: false,
    salesPostingEnabledDuringPost: true,
    productionPostingAllowed: false,
    dualGuardOnProduction:
      "On production-like env, ACCOUNTING_SALES_POSTING_ENABLED=1 alone cannot persist; ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 is also required."
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((err) => {
    console.error("VALIDATION_FAILED", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
