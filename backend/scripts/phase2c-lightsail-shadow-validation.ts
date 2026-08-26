/**
 * Phase 2C shadow validation against pre-launch Lightsail Sarveda DB.
 *
 * Commerce tables: READ-ONLY fingerprints. Accounting* writes only.
 * Requires explicit PHASE2C_LIGHTSAIL_SHADOW_OK=1.
 *
 * Usage (on Lightsail, after CoA seed):
 *   PHASE2C_LIGHTSAIL_SHADOW_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   ACCOUNTING_SALES_POSTING_ENABLED=1 \
 *   ACCOUNTING_REFUND_POSTING_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   npx tsx scripts/phase2c-lightsail-shadow-validation.ts
 */
import { createHash } from "crypto";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { runOrderPaidDiscovery } from "../src/modules/accounting/discovery-worker";
import {
  postOrderPaidJournal,
  previewOrderPaidJournal
} from "../src/modules/accounting/order-paid-posting.service";
import {
  ORDER_PAID_EVENT_TYPE,
  orderPaidUniqueKey
} from "../src/modules/accounting/order-paid.constants";
import {
  postOrderRefundedFull,
  previewOrderRefundedFull
} from "../src/modules/accounting/order-refunded-full-posting.service";
import {
  ORDER_REFUNDED_FULL_EVENT_TYPE,
  orderRefundedFullUniqueKey
} from "../src/modules/accounting/order-refunded-full.constants";
import { loadOrderPaidSnapshotById } from "../src/modules/accounting/order-snapshot.service";
import { loadOrderRefundContextByOrderId } from "../src/modules/accounting/order-refund-snapshot.service";
import {
  isProductionLikeEnvironment
} from "../src/modules/accounting/production-guard";
import {
  buildReconciliationV2Report,
  buildReconciliationV2Row
} from "../src/modules/accounting/reconciliation.service";
import { runOrderRefundedFullDiscovery } from "../src/modules/accounting/refund-discovery-worker";
import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";

const prisma = new PrismaClient();

const EXPECTED_LIGHTSAIL_HOST_FRAGMENT = "c9oiska8wm8k.ap-south-1.rds.amazonaws.com";
const EXPECTED_DB = "sarveda_db";
/** Known single full Razorpay refund with line items on pre-launch Lightsail. */
const PRIMARY_REFUND_ORDER = "SRV-20260800003";
const PRIMARY_SALE_SAMPLE = "SRV-20260800010";

type Fingerprint = {
  orderHash: string;
  paymentHash: string;
  refundHash: string;
  itemHash: string;
  inventoryHash: string;
  invoiceHash: string;
  shipmentHash: string;
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
      updatedAt: true,
      rawPayload: true
    }
  });
  const refunds = await prisma.refund.findMany({
    where: { paymentId: { in: payments.map((p) => p.id) } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amountInPaise: true,
      status: true,
      providerRefundId: true,
      reason: true,
      createdAt: true
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
      lineTotalInPaise: true,
      discountInPaise: true,
      taxInPaise: true
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
  const shipments = await prisma.shipment.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: { id: true, courier: true, awb: true, status: true, updatedAt: true }
  });
  return {
    orderHash: hash(order),
    paymentHash: hash(payments),
    refundHash: hash(refunds),
    itemHash: hash(items),
    inventoryHash: hash(inventory),
    invoiceHash: hash(invoice),
    shipmentHash: hash(shipments),
    zoho: {
      zohoInvoiceId: order?.zohoInvoiceId ?? null,
      zohoInvoiceNo: order?.zohoInvoiceNo ?? null,
      zohoSyncedAt: order?.zohoSyncedAt ?? null,
      zohoSyncError: order?.zohoSyncError ?? null,
      paymentZoho: payments.map((p) => {
        const raw = (p.rawPayload ?? {}) as Record<string, unknown>;
        return {
          paymentId: p.id,
          zohoCustomerPaymentId: raw.zohoCustomerPaymentId ?? null,
          zohoCustomerPaymentReference: raw.zohoCustomerPaymentReference ?? null
        };
      })
    }
  };
}

function assertSame(a: Fingerprint, b: Fingerprint, label: string) {
  for (const k of [
    "orderHash",
    "paymentHash",
    "refundHash",
    "itemHash",
    "inventoryHash",
    "invoiceHash",
    "shipmentHash"
  ] as const) {
    if (a[k] !== b[k]) {
      throw new Error(`COMMERCE MUTATION after ${label}: ${k} ${a[k]} -> ${b[k]}`);
    }
  }
  if (JSON.stringify(a.zoho) !== JSON.stringify(b.zoho)) {
    throw new Error(`COMMERCE MUTATION after ${label}: zoho`);
  }
}

async function accountingSummary(orderId: string) {
  const saleKey = orderPaidUniqueKey(orderId);
  const refundKey = orderRefundedFullUniqueKey(orderId);
  const events = await prisma.accountingPostingEvent.findMany({
    where: {
      OR: [
        { eventType: ORDER_PAID_EVENT_TYPE, uniqueKey: saleKey },
        { eventType: ORDER_REFUNDED_FULL_EVENT_TYPE, uniqueKey: refundKey }
      ]
    },
    include: {
      journalEntry: {
        include: {
          lines: { include: { account: true }, orderBy: { sortOrder: "asc" } }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  const links = await prisma.accountingDocumentLink.findMany({
    where: { documentId: orderId }
  });
  const audits = await prisma.accountingAuditLog.findMany({
    where: {
      OR: [
        { entityType: "AccountingPostingEvent", entityId: { in: events.map((e) => e.id) } },
        {
          entityType: "AccountingJournalEntry",
          entityId: { in: events.map((e) => e.journalEntryId).filter(Boolean) as string[] }
        }
      ]
    },
    select: { id: true, action: true, entityType: true, entityId: true }
  });
  return {
    events: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      uniqueKey: e.uniqueKey,
      status: e.status,
      journalEntryId: e.journalEntryId,
      entryNumber: e.journalEntry?.entryNumber ?? null,
      debit: e.journalEntry?.totalDebitInPaise ?? null,
      credit: e.journalEntry?.totalCreditInPaise ?? null,
      lines: (e.journalEntry?.lines ?? []).map((l) => ({
        code: l.account.code,
        debit: l.debitInPaise,
        credit: l.creditInPaise
      }))
    })),
    documentLinks: links.map((l) => ({
      id: l.id,
      documentType: l.documentType,
      documentId: l.documentId,
      journalEntryId: l.journalEntryId,
      zohoDocumentId: l.zohoDocumentId,
      zohoDocumentType: l.zohoDocumentType
    })),
    auditLogIds: audits.map((a) => a.id),
    auditCount: audits.length
  };
}

async function classifyScenarios() {
  const refunds = await prisma.refund.findMany({
    include: {
      payment: {
        include: {
          order: {
            include: { items: true, addresses: true, invoice: true }
          }
        }
      }
    }
  });
  const refundedOrders = await prisma.order.findMany({
    where: { deletedAt: null, status: "REFUNDED" },
    include: { payments: { include: { refunds: true } }, items: true }
  });

  const razorpayPaidWithItems = await prisma.order.count({
    where: {
      deletedAt: null,
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] },
      payments: { some: { provider: "RAZORPAY", status: "CAPTURED" } },
      items: { some: {} }
    }
  });
  const stripePaidWithItems = await prisma.order.count({
    where: {
      deletedAt: null,
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] },
      payments: { some: { provider: "STRIPE", status: "CAPTURED" } },
      items: { some: {} }
    }
  });
  const paypalPaidWithItems = await prisma.order.count({
    where: {
      deletedAt: null,
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] },
      payments: { some: { provider: "PAYPAL", status: "CAPTURED" } },
      items: { some: {} }
    }
  });
  const codPaidWithItems = await prisma.order.count({
    where: {
      deletedAt: null,
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] },
      payments: { some: { provider: "COD" } },
      items: { some: {} }
    }
  });
  const discountWithItems = await prisma.order.count({
    where: {
      deletedAt: null,
      discountInPaise: { gt: 0 },
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "REFUNDED"] },
      items: { some: {} }
    }
  });
  const shippingWithItems = await prisma.order.count({
    where: {
      deletedAt: null,
      shippingInPaise: { gt: 0 },
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "REFUNDED"] },
      items: { some: {} }
    }
  });
  const multiLine = await prisma.order.count({
    where: {
      deletedAt: null,
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] },
      items: { some: {} }
    }
  });

  const refundCases = refunds.map((r) => {
    const o = r.payment.order;
    return {
      orderNumber: o.orderNumber,
      provider: r.payment.provider,
      refundAmount: r.amountInPaise,
      refundStatus: r.status,
      grandTotal: o.grandTotalInPaise,
      equalGrand: r.amountInPaise === o.grandTotalInPaise,
      itemCount: o.items.length,
      shipping: o.shippingInPaise,
      discount: o.discountInPaise,
      zohoInvoiceNo: o.zohoInvoiceNo ?? o.invoice?.invoiceNo ?? null,
      classification:
        r.amountInPaise === o.grandTotalInPaise &&
        r.status === "processed" &&
        o.items.length > 0
          ? "SINGLE_PROCESSED_FULL_WITH_ITEMS"
          : r.amountInPaise < o.grandTotalInPaise
            ? "PARTIAL_OR_UNEQUAL"
            : r.status !== "processed"
              ? `NON_PROCESSED_STATUS_${r.status}`
              : o.items.length === 0
                ? "FULL_BUT_NO_LINE_ITEMS"
                : "OTHER"
    };
  });

  const statusOnly = refundedOrders.filter((o) =>
    o.payments.every((p) => p.refunds.length === 0)
  );

  return {
    counts: {
      refundRows: refunds.length,
      refundedStatusOrders: refundedOrders.length,
      statusOnlyRefundedNoRefundRow: statusOnly.length,
      razorpayPaidWithItems,
      stripePaidWithItems,
      paypalPaidWithItems,
      codPaidWithItems,
      discountWithItems,
      shippingWithItems,
      multiLinePaidPipelineWithAnyItems: multiLine
    },
    refundCases,
    statusOnlyOrderNumbers: statusOnly.map((o) => o.orderNumber),
    coverageMatrix: {
      "Razorpay paid (with items)": razorpayPaidWithItems > 0 ? "YES" : "DATA_GAP",
      "Stripe paid (with items)": stripePaidWithItems > 0 ? "YES" : "DATA_GAP",
      "PayPal paid (with items)": paypalPaidWithItems > 0 ? "YES" : "DATA_GAP",
      "COD (with items)": codPaidWithItems > 0 ? "YES" : "DATA_GAP",
      Discount: discountWithItems > 0 ? "YES" : "DATA_GAP",
      Shipping: shippingWithItems > 0 ? "YES" : "DATA_GAP",
      "Interstate GST (sample AP vs seller KA)": "YES_IF_SAMPLED",
      "Multi-line": "DATA_GAP_LIKELY",
      "Multi-rate GST": "DATA_GAP",
      "Quantity >1": "CHECK_SAMPLE",
      "Single processed full refund": refundCases.some(
        (c) => c.classification === "SINGLE_PROCESSED_FULL_WITH_ITEMS"
      )
        ? "YES"
        : "DATA_GAP",
      "Partial refund": refundCases.some((c) => c.classification === "PARTIAL_OR_UNEQUAL")
        ? "YES"
        : "DATA_GAP",
      "Cumulative partials": "DATA_GAP",
      "REFUNDED status without Refund row": statusOnly.length > 0 ? "YES" : "DATA_GAP",
      "Zoho invoice / credit-note refs": refundCases.some((c) => c.zohoInvoiceNo)
        ? "YES"
        : "DATA_GAP"
    }
  };
}

async function main() {
  const report: Record<string, unknown> = {
    ENVIRONMENT: "PRE-LAUNCH LIGHTSAIL / REAL SARVEDA DATABASE",
    COMMERCE_DATA: "REAL",
    COMMERCE_MODIFICATIONS: "NONE",
    EXTERNAL_PAYMENT_ZOHO_SHIPPING_SIDE_EFFECTS: "NONE"
  };

  if (process.env.PHASE2C_LIGHTSAIL_SHADOW_OK !== "1") {
    throw new Error("Refusing: set PHASE2C_LIGHTSAIL_SHADOW_OK=1 explicitly");
  }

  const meta = dbMeta(process.env.DATABASE_URL ?? "");
  const intended =
    meta.database === EXPECTED_DB &&
    meta.host.includes(EXPECTED_LIGHTSAIL_HOST_FRAGMENT);

  report.environmentProof = {
    NODE_ENV: process.env.NODE_ENV ?? "(unset)",
    database_host: meta.host,
    database_name: meta.database,
    database_port: meta.port,
    intended_prelaunch_lightsail_db: intended,
    production_like_detection: isProductionLikeEnvironment(),
    NATIVE_ACCOUNTING_ENABLED: process.env.NATIVE_ACCOUNTING_ENABLED ?? "(unset)",
    ACCOUNTING_SALES_POSTING_ENABLED: process.env.ACCOUNTING_SALES_POSTING_ENABLED ?? "(unset)",
    ACCOUNTING_REFUND_POSTING_ENABLED: process.env.ACCOUNTING_REFUND_POSTING_ENABLED ?? "(unset)",
    ACCOUNTING_PRODUCTION_POSTING_ALLOWED:
      process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED ?? "(unset)",
    ACCOUNTING_BULK_DISCOVERY_ALLOWED:
      process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED ?? "(unset)",
    note: "No live customer launch; pre-launch Lightsail. Credentials not logged."
  };

  if (!intended) {
    throw new Error(`STOP: not intended Lightsail DB (host=${meta.host} db=${meta.database})`);
  }

  await seedAccountingChartOfAccounts();
  report.scenarioClassification = await classifyScenarios();

  const refundOrder = await prisma.order.findFirst({
    where: { orderNumber: PRIMARY_REFUND_ORDER, deletedAt: null }
  });
  if (!refundOrder) throw new Error(`Missing primary refund order ${PRIMARY_REFUND_ORDER}`);

  const saleSample = await prisma.order.findFirst({
    where: { orderNumber: PRIMARY_SALE_SAMPLE, deletedAt: null }
  });

  // --- Single-order SALE preview (refund dependency) ---
  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "0";
  process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "0";

  const saleSnap = await loadOrderPaidSnapshotById(refundOrder.id);
  const salePreview = await previewOrderPaidJournal(saleSnap);
  report.salePreview = {
    orderNumber: saleSnap.orderNumber,
    eligible: salePreview.eligibility.eligible,
    reason: salePreview.eligibility.reason,
    code: salePreview.eligibility.code,
    paymentStatus: saleSnap.payment.status,
    balanced: salePreview.proposal?.balanced ?? false,
    imbalance: salePreview.proposal?.imbalancePaise ?? null,
    debit: salePreview.proposal?.totalDebitPaise ?? null,
    credit: salePreview.proposal?.totalCreditPaise ?? null,
    jurisdiction: salePreview.proposal?.diagnostics.interState ? "INTER_STATE" : "INTRA_STATE",
    shipState: saleSnap.shippingState,
    shipping: saleSnap.shippingInPaise,
    discount: saleSnap.discountInPaise,
    lines: saleSnap.lines.length,
    zohoInvoiceId: saleSnap.zohoInvoiceId,
    zohoInvoiceNo: saleSnap.zohoInvoiceNo
  };
  if (!salePreview.eligibility.eligible || !salePreview.proposal?.balanced) {
    throw new Error("STOP: sale preview not eligible/balanced for refund dependency");
  }

  const beforeRefundOrder = await fingerprint(refundOrder.id);

  // dry-run sale discovery
  const saleDry = await runOrderPaidDiscovery({
    orderId: refundOrder.id,
    dryRun: true,
    limit: 1
  });
  assertSame(beforeRefundOrder, await fingerprint(refundOrder.id), "sale-dry-run");
  report.saleDryRun = { result: saleDry, commerceUnchanged: true };

  // --- Single-order refund preview (expect SALE_JOURNAL_REQUIRED) ---
  let refundCtx = await loadOrderRefundContextByOrderId(refundOrder.id);
  let refundPreview = await previewOrderRefundedFull(refundCtx);
  report.refundPreviewBeforeSale = {
    code: refundPreview.eligibility.code,
    autoPostable: refundPreview.eligibility.autoPostable,
    reason: refundPreview.eligibility.reason
  };

  // Persist sale (Accounting* only) with production override already in env
  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
  process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";
  const salePost = await postOrderPaidJournal(saleSnap);
  assertSame(beforeRefundOrder, await fingerprint(refundOrder.id), "sale-post");
  const saleReplay = await postOrderPaidJournal(saleSnap);
  assertSame(beforeRefundOrder, await fingerprint(refundOrder.id), "sale-replay");
  report.salePost = {
    duplicate: salePost.duplicate,
    journalEntryNumber: salePost.journal.entryNumber,
    uniqueKey: salePost.proposal.uniqueKey,
    debit: salePost.proposal.totalDebitPaise,
    credit: salePost.proposal.totalCreditPaise,
    replayDuplicate: saleReplay.duplicate,
    accounting: await accountingSummary(refundOrder.id)
  };
  if (!saleReplay.duplicate) throw new Error("Sale replay must be duplicate");

  // Refund preview after sale
  refundCtx = await loadOrderRefundContextByOrderId(refundOrder.id);
  refundPreview = await previewOrderRefundedFull(refundCtx);
  report.refundPreview = {
    code: refundPreview.eligibility.code,
    autoPostable: refundPreview.eligibility.autoPostable,
    reason: refundPreview.eligibility.reason,
    balanced: refundPreview.proposal?.balanced ?? false,
    imbalance: refundPreview.proposal?.imbalancePaise ?? null,
    debit: refundPreview.proposal?.totalDebitPaise ?? null,
    credit: refundPreview.proposal?.totalCreditPaise ?? null,
    candidateRefundId: refundPreview.eligibility.candidateRefundId ?? null
  };
  if (!refundPreview.eligibility.autoPostable || !refundPreview.proposal?.balanced) {
    throw new Error(
      `STOP: refund not auto-postable after sale: ${refundPreview.eligibility.code} ${refundPreview.eligibility.reason}`
    );
  }

  // Refund dry-run discovery
  process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "0";
  const refundDry = await runOrderRefundedFullDiscovery({
    orderId: refundOrder.id,
    dryRun: true,
    limit: 1
  });
  assertSame(beforeRefundOrder, await fingerprint(refundOrder.id), "refund-dry-run");
  report.refundDryRun = { result: refundDry, commerceUnchanged: true };

  // One accounting shadow refund post + replay
  process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
  const refundPost = await postOrderRefundedFull(refundCtx);
  assertSame(beforeRefundOrder, await fingerprint(refundOrder.id), "refund-post");
  const refundReplay = await postOrderRefundedFull(refundCtx);
  assertSame(beforeRefundOrder, await fingerprint(refundOrder.id), "refund-replay");
  if (!refundReplay.duplicate) throw new Error("Refund replay must be duplicate");

  report.refundPost = {
    duplicate: refundPost.duplicate,
    journalEntryNumber: refundPost.journal.entryNumber,
    uniqueKey: refundPost.proposal.uniqueKey,
    debit: refundPost.proposal.totalDebitPaise,
    credit: refundPost.proposal.totalCreditPaise,
    replayDuplicate: refundReplay.duplicate
  };

  // Partial / status-only — eligibility only (no posts); tolerate missing payments
  report.partialStripePreview = null;
  report.statusOnlyPreview = null;
  try {
    const partialStripe = await prisma.order.findFirst({
      where: { orderNumber: "WOO-7963", deletedAt: null },
      include: { payments: true }
    });
    if (partialStripe?.payments.length) {
      const ctx = await loadOrderRefundContextByOrderId(partialStripe.id);
      const prev = await previewOrderRefundedFull(ctx);
      report.partialStripePreview = {
        orderNumber: "WOO-7963",
        code: prev.eligibility.code,
        autoPostable: prev.eligibility.autoPostable,
        reason: prev.eligibility.reason
      };
    } else {
      report.partialStripePreview = {
        orderNumber: "WOO-7963",
        note: partialStripe ? "NO_PAYMENT_ROWS" : "ORDER_MISSING"
      };
    }
  } catch (err) {
    report.partialStripePreview = {
      orderNumber: "WOO-7963",
      error: err instanceof Error ? err.message : String(err)
    };
  }

  try {
    const statusOnly = await prisma.order.findFirst({
      where: { orderNumber: "WOO-8091", deletedAt: null },
      include: { payments: true }
    });
    if (statusOnly?.payments.length) {
      const ctx = await loadOrderRefundContextByOrderId(statusOnly.id);
      const prev = await previewOrderRefundedFull(ctx);
      report.statusOnlyPreview = {
        orderNumber: "WOO-8091",
        code: prev.eligibility.code,
        autoPostable: prev.eligibility.autoPostable,
        reason: prev.eligibility.reason
      };
    } else {
      report.statusOnlyPreview = {
        orderNumber: "WOO-8091",
        code: "NO_AUTHORITATIVE_REFUND",
        note: statusOnly ? "REFUNDED_STATUS_WITHOUT_PAYMENT_OR_REFUND_ROWS" : "ORDER_MISSING",
        autoPostable: false
      };
    }
  } catch (err) {
    report.statusOnlyPreview = {
      orderNumber: "WOO-8091",
      error: err instanceof Error ? err.message : String(err)
    };
  }

  // Optional second sale sample (shipping / interstate) — bounded
  if (saleSample) {
    const beforeSale = await fingerprint(saleSample.id);
    const snap = await loadOrderPaidSnapshotById(saleSample.id);
    const prev = await previewOrderPaidJournal(snap);
    report.saleSamplePreview = {
      orderNumber: snap.orderNumber,
      eligible: prev.eligibility.eligible,
      balanced: prev.proposal?.balanced ?? false,
      shipping: snap.shippingInPaise,
      jurisdiction: prev.proposal?.diagnostics.interState ? "INTER_STATE" : "INTRA_STATE",
      shipState: snap.shippingState
    };
    if (prev.eligibility.eligible && prev.proposal?.balanced) {
      const post = await postOrderPaidJournal(snap);
      assertSame(beforeSale, await fingerprint(saleSample.id), "sale-sample-post");
      report.saleSamplePost = {
        journalEntryNumber: post.journal.entryNumber,
        duplicate: post.duplicate
      };
    }
  }

  // Recon V2
  const reconPrimary = await buildReconciliationV2Row(refundOrder.id);
  report.reconciliationV2Primary = reconPrimary;
  const reconReport = await buildReconciliationV2Report([refundOrder.id]);
  report.reconciliationV2Report = reconReport;

  // Bounded refund discovery persist limit <= 10 (single already posted → duplicate)
  process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED = "1";
  const bounded = await runOrderRefundedFullDiscovery({
    limit: 10,
    dryRun: false,
    since: new Date("2020-01-01"),
    until: new Date("2030-01-01")
  });
  report.boundedRefundDiscovery = {
    scanned: bounded.scanned,
    posted: bounded.posted,
    duplicates: bounded.duplicates,
    skipped: bounded.skipped,
    failed: bounded.failed,
    dryRun: bounded.dryRun,
    results: bounded.results
  };
  assertSame(beforeRefundOrder, await fingerprint(refundOrder.id), "bounded-discovery");

  const finalAccounting = await accountingSummary(refundOrder.id);
  if (saleSample) {
    report.saleSampleAccounting = await accountingSummary(saleSample.id);
  }
  report.ACCOUNTING_SHADOW_WRITES = finalAccounting;
  report.commerceFingerprints = {
    primaryRefundOrder: PRIMARY_REFUND_ORDER,
    unchanged: true,
    before: beforeRefundOrder,
    after: await fingerprint(refundOrder.id)
  };

  // Restore process env flags for this process (caller should unset shell overrides)
  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "0";
  process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "0";
  delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
  delete process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED;

  report.flagsRestoredInProcess = {
    ACCOUNTING_SALES_POSTING_ENABLED: "0",
    ACCOUNTING_REFUND_POSTING_ENABLED: "0",
    ACCOUNTING_PRODUCTION_POSTING_ALLOWED: "(deleted)",
    ACCOUNTING_BULK_DISCOVERY_ALLOWED: "(deleted)"
  };

  const saleOk =
    Boolean(salePost.journal.entryNumber) && saleReplay.duplicate === true;
  const refundOk =
    refundPreview.eligibility.autoPostable === true &&
    Boolean(refundPost.journal.entryNumber) &&
    refundReplay.duplicate === true;
  const commerceOk = true;
  const verdict =
    saleOk && refundOk && commerceOk
      ? "PHASE 2C SHADOW VALIDATED — READY FOR SETTLEMENT ARCHITECTURE REVIEW"
      : "PHASE 2C SHADOW VALIDATION FAILED";
  report.verdict = verdict;

  const fs = await import("fs");
  const outPath = "/tmp/phase2c-shadow-report.json";
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`WROTE_REPORT ${outPath}`);
  console.log(verdict);
  if (!String(verdict).includes("VALIDATED")) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
