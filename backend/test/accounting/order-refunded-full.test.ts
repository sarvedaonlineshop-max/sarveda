import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingProductionGuardError,
  AccountingRefundPostingDisabledError,
  RefundNotEligibleForPostingError,
  SaleJournalRequiredError
} from "../../src/modules/accounting/accounting-errors";
import { ACCOUNT_CODE } from "../../src/modules/accounting/order-paid.constants";
import { loadOrderPaidSnapshotById } from "../../src/modules/accounting/order-snapshot.service";
import { postOrderPaidJournal } from "../../src/modules/accounting/order-paid-posting.service";
import { evaluateFullRefundEligibility } from "../../src/modules/accounting/order-refunded-full-eligibility";
import { buildOrderRefundedFullJournal } from "../../src/modules/accounting/order-refunded-full-journal.builder";
import {
  ORDER_REFUNDED_FULL_CALC_VERSION,
  ORDER_REFUNDED_FULL_EVENT_TYPE,
  orderRefundedFullUniqueKey
} from "../../src/modules/accounting/order-refunded-full.constants";
import {
  postOrderRefundedFull,
  previewOrderRefundedFull
} from "../../src/modules/accounting/order-refunded-full-posting.service";
import { loadOrderRefundContextByOrderId } from "../../src/modules/accounting/order-refund-snapshot.service";
import {
  assertBulkDiscoveryAllowed,
  assertRefundPostingPersistenceAllowed,
  resolveRefundDiscoveryDryRun
} from "../../src/modules/accounting/production-guard";
import { buildReconciliationV2Row } from "../../src/modules/accounting/reconciliation.service";
import { runOrderRefundedFullDiscovery } from "../../src/modules/accounting/refund-discovery-worker";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { cleanupAccountingTestData, prisma } from "../helpers/commerce";
import {
  cleanupSyntheticPaidOrder,
  createSyntheticFullRefund,
  createSyntheticPaidOrder,
  createSyntheticPartialRefunds
} from "../helpers/accounting-orders";

async function postSaleThenRefund(
  opts: Parameters<typeof createSyntheticPaidOrder>[0] = {}
) {
  const order = await createSyntheticPaidOrder(opts);
  const snapshot = await loadOrderPaidSnapshotById(order.id);
  const sale = await postOrderPaidJournal(snapshot);
  const refund = await createSyntheticFullRefund(order);
  const ctx = await loadOrderRefundContextByOrderId(order.id);
  return { order, snapshot, sale, refund, ctx };
}

describe("ORDER_REFUNDED_FULL_V1 — eligibility & builder", () => {
  const created: string[] = [];
  const originalNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const originalSales = process.env.ACCOUNTING_SALES_POSTING_ENABLED;
  const originalRefund = process.env.ACCOUNTING_REFUND_POSTING_ENABLED;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
  });

  afterEach(async () => {
    for (const id of created.splice(0)) {
      await cleanupSyntheticPaidOrder(id);
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalNative ?? "0";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = originalSales ?? "0";
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = originalRefund ?? "0";
  });

  it("1. Razorpay single full refund reverses clearing 1020", async () => {
    const { order, sale, ctx } = await postSaleThenRefund({ provider: "RAZORPAY" });
    created.push(order.id);
    const preview = await previewOrderRefundedFull(ctx);
    expect(preview.eligibility.autoPostable).toBe(true);
    expect(preview.proposal?.calcVersion).toBe(ORDER_REFUNDED_FULL_CALC_VERSION);
    expect(preview.proposal?.balanced).toBe(true);
    const clearing = preview.proposal!.lines.find((l) => l.accountCode === ACCOUNT_CODE.RAZORPAY_CLEARING);
    expect(clearing?.creditInPaise).toBe(order.grandTotalInPaise);
    // Exact reverse of sale line amounts
    for (let i = 0; i < sale.proposal.lines.length; i++) {
      const s = sale.proposal.lines[i]!;
      const r = preview.proposal!.lines[i]!;
      expect(r.accountCode).toBe(s.accountCode);
      expect(r.debitInPaise).toBe(s.creditInPaise);
      expect(r.creditInPaise).toBe(s.debitInPaise);
    }
  });

  it("2. Stripe single full refund → 1021", async () => {
    const { order, ctx } = await postSaleThenRefund({ provider: "STRIPE" });
    created.push(order.id);
    const preview = await previewOrderRefundedFull(ctx);
    expect(preview.proposal?.lines.some((l) => l.accountCode === ACCOUNT_CODE.STRIPE_CLEARING)).toBe(
      true
    );
  });

  it("3. PayPal single full refund → 1022", async () => {
    const { order, ctx } = await postSaleThenRefund({ provider: "PAYPAL" });
    created.push(order.id);
    const preview = await previewOrderRefundedFull(ctx);
    expect(preview.proposal?.lines.some((l) => l.accountCode === ACCOUNT_CODE.PAYPAL_CLEARING)).toBe(
      true
    );
  });

  it("4. intra-state GST reversal", async () => {
    const { order, sale, ctx } = await postSaleThenRefund({
      provider: "RAZORPAY",
      shippingState: "Karnataka"
    });
    created.push(order.id);
    const preview = await previewOrderRefundedFull(ctx);
    expect(sale.proposal.diagnostics.outputCgstPaise).toBeGreaterThan(0);
    const cgst = preview.proposal!.lines.find((l) => l.accountCode === ACCOUNT_CODE.OUTPUT_CGST);
    expect(cgst?.debitInPaise).toBe(sale.proposal.diagnostics.outputCgstPaise);
  });

  it("5. inter-state GST reversal", async () => {
    const { order, sale, ctx } = await postSaleThenRefund({
      provider: "RAZORPAY",
      shippingState: "Maharashtra"
    });
    created.push(order.id);
    const preview = await previewOrderRefundedFull(ctx);
    expect(sale.proposal.diagnostics.interState).toBe(true);
    const igst = preview.proposal!.lines.find((l) => l.accountCode === ACCOUNT_CODE.OUTPUT_IGST);
    expect(igst?.debitInPaise).toBe(sale.proposal.diagnostics.outputIgstPaise);
  });

  it("6. discount contra reversal", async () => {
    const { order, sale, ctx } = await postSaleThenRefund({
      provider: "RAZORPAY",
      discountInPaise: 10_000
    });
    created.push(order.id);
    const preview = await previewOrderRefundedFull(ctx);
    const disc = preview.proposal!.lines.find((l) => l.accountCode === ACCOUNT_CODE.DISCOUNTS_CONTRA);
    expect(disc?.creditInPaise).toBe(sale.proposal.diagnostics.discountTaxableContraPaise);
  });

  it("7. shipping reversal", async () => {
    const { order, ctx } = await postSaleThenRefund({
      provider: "RAZORPAY",
      shippingInPaise: 5_000
    });
    created.push(order.id);
    const preview = await previewOrderRefundedFull(ctx);
    const ship = preview.proposal!.lines.find((l) => l.accountCode === ACCOUNT_CODE.SHIPPING_INCOME);
    expect(ship?.debitInPaise).toBe(5_000);
  });

  it("8. no-discount refund", async () => {
    const { order, sale, ctx } = await postSaleThenRefund({ discountInPaise: 0 });
    created.push(order.id);
    const preview = await previewOrderRefundedFull(ctx);
    expect(sale.proposal.diagnostics.discountTaxableContraPaise).toBe(0);
    expect(
      preview.proposal!.lines.some((l) => l.accountCode === ACCOUNT_CODE.DISCOUNTS_CONTRA)
    ).toBe(false);
  });

  it("9. original sale journal missing → SALE_JOURNAL_REQUIRED", async () => {
    const order = await createSyntheticPaidOrder({ provider: "RAZORPAY" });
    created.push(order.id);
    await createSyntheticFullRefund(order);
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    const eligibility = evaluateFullRefundEligibility(ctx);
    expect(eligibility.code).toBe("SALE_JOURNAL_REQUIRED");
    expect(eligibility.autoPostable).toBe(false);
    await expect(postOrderRefundedFull(ctx)).rejects.toBeInstanceOf(SaleJournalRequiredError);
  });

  it("10/11/24. duplicate + 20 concurrent refund posts → 1 journal", async () => {
    const { order, ctx } = await postSaleThenRefund({ provider: "RAZORPAY" });
    created.push(order.id);

    const attempts = await Promise.all(
      Array.from({ length: 20 }, () => postOrderRefundedFull(ctx))
    );
    expect(attempts.filter((a) => !a.duplicate)).toHaveLength(1);

    const events = await prisma.accountingPostingEvent.findMany({
      where: {
        eventType: ORDER_REFUNDED_FULL_EVENT_TYPE,
        uniqueKey: orderRefundedFullUniqueKey(order.id)
      }
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("POSTED");
  });

  it("12. refund amount < grand total → UNPOSTED_PARTIAL", async () => {
    const order = await createSyntheticPaidOrder();
    created.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snapshot);
    await createSyntheticFullRefund(order, { amountInPaise: Math.floor(order.grandTotalInPaise / 2) });
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    expect(evaluateFullRefundEligibility(ctx).code).toBe("UNPOSTED_PARTIAL");
    await expect(postOrderRefundedFull(ctx)).rejects.toBeInstanceOf(RefundNotEligibleForPostingError);
  });

  it("13. two partial refunds → MULTIPLE_REFUNDS_UNALLOCATED", async () => {
    const order = await createSyntheticPaidOrder();
    created.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snapshot);
    const a = Math.floor(order.grandTotalInPaise / 3);
    await createSyntheticPartialRefunds(order, [a, a]);
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    expect(evaluateFullRefundEligibility(ctx).code).toBe("MULTIPLE_REFUNDS_UNALLOCATED");
  });

  it("14. cumulative partials equal full → MUST NOT auto-post", async () => {
    const order = await createSyntheticPaidOrder({
      lines: [{ unitPriceInPaise: 100_000, qtyOrdered: 1, taxClass: "standard" }]
    });
    created.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snapshot);
    await createSyntheticPartialRefunds(order, [30_000, 20_000, 50_000]);
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    const el = evaluateFullRefundEligibility(ctx);
    expect(el.code).toBe("CUMULATIVE_FULL_BUT_UNALLOCATED");
    expect(el.autoPostable).toBe(false);
    expect(el.monetaryRefundTotalPaise).toBe(order.grandTotalInPaise);
    await expect(postOrderRefundedFull(ctx)).rejects.toBeInstanceOf(RefundNotEligibleForPostingError);
  });

  it("15. one refund > grand total → ERROR", async () => {
    const order = await createSyntheticPaidOrder();
    created.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snapshot);
    await createSyntheticFullRefund(order, {
      amountInPaise: order.grandTotalInPaise + 1,
      skipPaymentUpdate: true
    });
    await prisma.payment.update({
      where: { id: order.payments[0]!.id },
      data: { status: "REFUNDED", refundedInPaise: order.grandTotalInPaise + 1 }
    });
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    expect(evaluateFullRefundEligibility(ctx).code).toBe("REFUND_AMOUNT_EXCEEDS_TOTAL");
  });

  it("16. Order.status REFUNDED but no Refund row → no journal", async () => {
    const order = await createSyntheticPaidOrder();
    created.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snapshot);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED", paymentStatus: "REFUNDED" }
    });
    await prisma.payment.update({
      where: { id: order.payments[0]!.id },
      data: { status: "REFUNDED", refundedInPaise: order.grandTotalInPaise }
    });
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    expect(evaluateFullRefundEligibility(ctx).code).toBe("NO_AUTHORITATIVE_REFUND");
    const discovery = await runOrderRefundedFullDiscovery({
      orderId: order.id,
      dryRun: false,
      limit: 1
    });
    expect(discovery.posted).toBe(0);
  });

  it("17. RTO/CANCELLED without Refund → no refund journal", async () => {
    const order = await createSyntheticPaidOrder({ status: "CANCELLED" });
    created.push(order.id);
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    expect(evaluateFullRefundEligibility(ctx).code).toBe("NO_AUTHORITATIVE_REFUND");
  });

  it("18. COD cancellation without monetary evidence → no refund journal", async () => {
    const order = await createSyntheticPaidOrder({ provider: "COD" });
    created.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snapshot);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" }
    });
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    expect(evaluateFullRefundEligibility(ctx).code).toBe("COD_NOT_AUTO_POSTABLE");
  });

  it("19. providerRefundId missing where required", async () => {
    const order = await createSyntheticPaidOrder();
    created.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snapshot);
    await createSyntheticFullRefund(order, { providerRefundId: null });
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    expect(evaluateFullRefundEligibility(ctx).code).toBe("MISSING_PROVIDER_REFUND_ID");
  });

  it("20. Payment status inconsistency (CAPTURED + full refund)", async () => {
    const order = await createSyntheticPaidOrder();
    created.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snapshot);
    await createSyntheticFullRefund(order, { skipPaymentUpdate: true });
    // leave payment CAPTURED
    const ctx = await loadOrderRefundContextByOrderId(order.id);
    expect(evaluateFullRefundEligibility(ctx).code).toBe("INCONSISTENT_PAYMENT_STATUS");
  });

  it("21. feature flag disabled", async () => {
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "0";
    const { order, ctx } = await postSaleThenRefund();
    created.push(order.id);
    await expect(postOrderRefundedFull(ctx)).rejects.toBeInstanceOf(
      AccountingRefundPostingDisabledError
    );
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
  });

  it("22. production dual guard for refunds", () => {
    const originalDb = process.env.DATABASE_URL;
    const originalProd = process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    expect(() => assertRefundPostingPersistenceAllowed()).toThrow(AccountingProductionGuardError);
    process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";
    expect(() => assertRefundPostingPersistenceAllowed()).not.toThrow();
    process.env.DATABASE_URL = originalDb;
    if (originalProd === undefined) delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    else process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = originalProd;
  });

  it("23. bulk guard applies to refund discovery", () => {
    const originalDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://user:pass@sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com:5432/sarveda";
    delete process.env.ACCOUNTING_BULK_DISCOVERY_ALLOWED;
    expect(() =>
      assertBulkDiscoveryAllowed({ limit: 10, dryRun: true, persist: false })
    ).toThrow(AccountingProductionGuardError);
    expect(() =>
      assertBulkDiscoveryAllowed({
        refundId: "00000000-0000-4000-8000-000000000099",
        limit: 10,
        dryRun: true,
        persist: false
      })
    ).not.toThrow();
    process.env.DATABASE_URL = originalDb;
  });

  it("25. commerce rows unchanged after refund posting", async () => {
    const { order, refund, ctx } = await postSaleThenRefund();
    created.push(order.id);
    const beforeOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const beforePayment = await prisma.payment.findUniqueOrThrow({
      where: { id: order.payments[0]!.id }
    });
    const beforeRefund = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });

    await postOrderRefundedFull(ctx);

    const afterOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const afterPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: order.payments[0]!.id }
    });
    const afterRefund = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });

    expect(afterOrder.status).toBe(beforeOrder.status);
    expect(afterOrder.paymentStatus).toBe(beforeOrder.paymentStatus);
    expect(afterOrder.grandTotalInPaise).toBe(beforeOrder.grandTotalInPaise);
    expect(afterPayment.refundedInPaise).toBe(beforePayment.refundedInPaise);
    expect(afterPayment.status).toBe(beforePayment.status);
    expect(afterRefund.amountInPaise).toBe(beforeRefund.amountInPaise);
    expect(afterRefund.providerRefundId).toBe(beforeRefund.providerRefundId);
  });

  it("26. reconciliation V2 statuses", async () => {
    const { order, ctx } = await postSaleThenRefund();
    created.push(order.id);
    await postOrderRefundedFull(ctx);
    const row = await buildReconciliationV2Row(order.id);
    expect(row.status).toBe("UNSETTLED");
    expect(row.nativeSale.eventStatus).toBe("POSTED");
    expect(row.nativeRefund.eventStatus).toBe("POSTED");
    expect(row.clearing.label).toBe("UNSETTLED_PROVISIONAL");

    const partialOrder = await createSyntheticPaidOrder();
    created.push(partialOrder.id);
    const snap = await loadOrderPaidSnapshotById(partialOrder.id);
    await postOrderPaidJournal(snap);
    await createSyntheticFullRefund(partialOrder, {
      amountInPaise: Math.floor(partialOrder.grandTotalInPaise / 2)
    });
    const partialRow = await buildReconciliationV2Row(partialOrder.id);
    expect(partialRow.status).toBe("UNPOSTED_PARTIAL");
  });

  it("27. original ORDER_PAID_V1 values reversed exactly via builder", async () => {
    const { order, sale, refund, ctx } = await postSaleThenRefund({
      discountInPaise: 2_000,
      shippingInPaise: 4_000
    });
    created.push(order.id);
    const proposal = buildOrderRefundedFullJournal({
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: "INR",
      provider: "RAZORPAY",
      accountingDate: refund.createdAt,
      refund: ctx.refunds[0]!,
      originalSale: ctx.originalSale!
    });
    expect(proposal.totalDebitPaise).toBe(sale.proposal.totalCreditPaise);
    expect(proposal.totalCreditPaise).toBe(sale.proposal.totalDebitPaise);
    expect(proposal.balanced).toBe(true);
  });

  it("defaults refund discovery to dryRun when flag off", () => {
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "0";
    expect(resolveRefundDiscoveryDryRun(false)).toBe(true);
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
    expect(resolveRefundDiscoveryDryRun(false)).toBe(false);
  });

  it("discovery dry-run does not persist", async () => {
    const { order } = await postSaleThenRefund();
    created.push(order.id);
    const result = await runOrderRefundedFullDiscovery({
      orderId: order.id,
      dryRun: true,
      limit: 1
    });
    expect(result.dryRun).toBe(true);
    expect(result.posted).toBe(0);
    const events = await prisma.accountingPostingEvent.count({
      where: { eventType: ORDER_REFUNDED_FULL_EVENT_TYPE, sourceId: order.id }
    });
    expect(events).toBe(0);
  });

  it("links ORDER + REFUND document links", async () => {
    const { order, refund, ctx } = await postSaleThenRefund();
    created.push(order.id);
    const result = await postOrderRefundedFull(ctx);
    const orderLinks = await prisma.accountingDocumentLink.findMany({
      where: { documentType: "ORDER", documentId: order.id, journalEntryId: result.journal.id }
    });
    const refundLinks = await prisma.accountingDocumentLink.findMany({
      where: { documentType: "REFUND", documentId: refund.id, journalEntryId: result.journal.id }
    });
    expect(orderLinks).toHaveLength(1);
    expect(refundLinks).toHaveLength(1);
  });
});
