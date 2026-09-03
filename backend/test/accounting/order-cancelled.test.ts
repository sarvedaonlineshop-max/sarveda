import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ACCOUNT_CODE } from "../../src/modules/accounting/order-paid.constants";
import { loadOrderPaidSnapshotById } from "../../src/modules/accounting/order-snapshot.service";
import { postOrderPaidJournal } from "../../src/modules/accounting/order-paid-posting.service";
import { evaluateCodOrderCancelledEligibility } from "../../src/modules/accounting/order-cancelled-eligibility";
import {
  ORDER_CANCELLED_CALC_VERSION,
  ORDER_CANCELLED_EVENT_TYPE,
  orderCancelledUniqueKey
} from "../../src/modules/accounting/order-cancelled.constants";
import {
  postOrderCancelledByIdentifier
} from "../../src/modules/accounting/order-cancelled-posting.service";
import { evaluateFullRefundEligibility } from "../../src/modules/accounting/order-refunded-full-eligibility";
import {
  ORDER_REFUNDED_FULL_EVENT_TYPE,
  orderRefundedFullUniqueKey
} from "../../src/modules/accounting/order-refunded-full.constants";
import {
  postOrderRefundedFull
} from "../../src/modules/accounting/order-refunded-full-posting.service";
import { loadOrderRefundContextByOrderId } from "../../src/modules/accounting/order-refund-snapshot.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { handlePaidOrderStatusChange } from "../../src/modules/orders/orders.service";
import { cleanupAccountingTestData, prisma } from "../helpers/commerce";
import {
  cleanupSyntheticPaidOrder,
  createSyntheticFullRefund,
  createSyntheticPaidOrder
} from "../helpers/accounting-orders";

async function journalsForOrder(orderId: string, eventType: string) {
  return prisma.accountingPostingEvent.findMany({
    where: { eventType, sourceId: orderId, status: "POSTED" },
    include: {
      journalEntry: {
        include: {
          lines: { include: { account: true }, orderBy: { sortOrder: "asc" } }
        }
      }
    }
  });
}

function lineByCode(
  lines: Array<{ account: { code: string }; debitInPaise: number; creditInPaise: number }>,
  code: string
) {
  return lines.find((l) => l.account.code === code);
}

describe("ORDER_CANCELLED_V1 — COD sale reversal", () => {
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
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
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

  it("A. COD placed → ORDER_PAID → cancel → exactly one balanced ORDER_CANCELLED reversal", async () => {
    const order = await createSyntheticPaidOrder({
      provider: "COD",
      paymentStatus: "PENDING",
      status: "PAID",
      shippingInPaise: 300,
      shippingState: "Delhi",
      lines: [{ unitPriceInPaise: 500, qtyOrdered: 1, taxClass: "standard" }]
    });
    created.push(order.id);

    await postOrderPaidJournal(await loadOrderPaidSnapshotById(order.id));
    await handlePaidOrderStatusChange(order.id, "CANCELLED", "COD cancel before shipment");

    const paid = await journalsForOrder(order.id, "ORDER_PAID");
    const cancelled = await journalsForOrder(order.id, ORDER_CANCELLED_EVENT_TYPE);
    expect(paid).toHaveLength(1);
    expect(cancelled).toHaveLength(1);

    const saleLines = paid[0]!.journalEntry!.lines;
    const revLines = cancelled[0]!.journalEntry!.lines;
    expect(cancelled[0]!.uniqueKey).toBe(orderCancelledUniqueKey(order.id));
    expect((cancelled[0]!.payloadJson as { calcVersion?: string }).calcVersion).toBe(
      ORDER_CANCELLED_CALC_VERSION
    );

    const debit = revLines.reduce((s, l) => s + l.debitInPaise, 0);
    const credit = revLines.reduce((s, l) => s + l.creditInPaise, 0);
    expect(debit).toBe(800);
    expect(credit).toBe(800);

    expect(lineByCode(revLines, ACCOUNT_CODE.ACCOUNTS_RECEIVABLE)?.creditInPaise).toBe(800);
    expect(lineByCode(revLines, ACCOUNT_CODE.PRODUCT_SALES)?.debitInPaise).toBe(424);
    expect(lineByCode(revLines, ACCOUNT_CODE.OUTPUT_IGST)?.debitInPaise).toBe(76);
    expect(lineByCode(revLines, ACCOUNT_CODE.SHIPPING_INCOME)?.debitInPaise).toBe(300);

    for (let i = 0; i < saleLines.length; i += 1) {
      expect(revLines[i]?.account.code).toBe(saleLines[i]?.account.code);
      expect(revLines[i]?.debitInPaise).toBe(saleLines[i]?.creditInPaise);
      expect(revLines[i]?.creditInPaise).toBe(saleLines[i]?.debitInPaise);
    }

    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment?.provider).toBe("COD");
    expect(payment?.status).toBe("PENDING");
    expect(payment?.refundedInPaise).toBe(0);
    const refunds = await prisma.refund.count({ where: { paymentId: payment!.id } });
    expect(refunds).toBe(0);

    const refundEvents = await journalsForOrder(order.id, ORDER_REFUNDED_FULL_EVENT_TYPE);
    expect(refundEvents).toHaveLength(0);
  });

  it("B. cancellation invoked twice still posts exactly one reversal", async () => {
    const order = await createSyntheticPaidOrder({
      provider: "COD",
      paymentStatus: "PENDING",
      status: "PAID",
      shippingInPaise: 300,
      shippingState: "Delhi",
      lines: [{ unitPriceInPaise: 500, qtyOrdered: 1, taxClass: "standard" }]
    });
    created.push(order.id);

    await postOrderPaidJournal(await loadOrderPaidSnapshotById(order.id));
    await handlePaidOrderStatusChange(order.id, "CANCELLED", "first cancel");
    await handlePaidOrderStatusChange(order.id, "CANCELLED", "second cancel");

    const second = await postOrderCancelledByIdentifier({ orderId: order.id });
    expect(second.skipped).toBe(false);
    if (!second.skipped) {
      expect(second.duplicate).toBe(true);
    }

    const cancelled = await journalsForOrder(order.id, ORDER_CANCELLED_EVENT_TYPE);
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]!.uniqueKey).toBe(orderCancelledUniqueKey(order.id));
  });

  it("C. COD cancelled before any sale journal exists → no reversal", async () => {
    const order = await createSyntheticPaidOrder({
      provider: "COD",
      paymentStatus: "PENDING",
      status: "PAID"
    });
    created.push(order.id);

    await handlePaidOrderStatusChange(order.id, "CANCELLED", "cancel with no sale journal");

    const result = await postOrderCancelledByIdentifier({ orderId: order.id });
    expect(result).toMatchObject({ skipped: true, code: "NO_SALE_JOURNAL" });

    const ctx = await loadOrderRefundContextByOrderId(order.id);
    expect(evaluateCodOrderCancelledEligibility(ctx).code).toBe("NO_SALE_JOURNAL");

    expect(await journalsForOrder(order.id, ORDER_CANCELLED_EVENT_TYPE)).toHaveLength(0);
    expect(await journalsForOrder(order.id, "ORDER_PAID")).toHaveLength(0);
    expect(await journalsForOrder(order.id, ORDER_REFUNDED_FULL_EVENT_TYPE)).toHaveLength(0);
  });

  it("D. online full-refund accounting remains ORDER_REFUNDED_FULL and is unchanged", async () => {
    const order = await createSyntheticPaidOrder({ provider: "RAZORPAY" });
    created.push(order.id);
    await postOrderPaidJournal(await loadOrderPaidSnapshotById(order.id));
    await createSyntheticFullRefund(order);
    const ctx = await loadOrderRefundContextByOrderId(order.id);

    expect(evaluateFullRefundEligibility(ctx).code).toBe("AUTO_POSTABLE_FULL");
    expect(evaluateCodOrderCancelledEligibility(ctx).code).toBe("NOT_COD");

    const posted = await postOrderRefundedFull(ctx);
    expect(posted.duplicate).toBe(false);

    const again = await postOrderRefundedFull(ctx);
    expect(again.duplicate).toBe(true);

    const refundEvents = await journalsForOrder(order.id, ORDER_REFUNDED_FULL_EVENT_TYPE);
    expect(refundEvents).toHaveLength(1);
    expect(refundEvents[0]!.uniqueKey).toBe(orderRefundedFullUniqueKey(order.id));
    expect(await journalsForOrder(order.id, ORDER_CANCELLED_EVENT_TYPE)).toHaveLength(0);

    const cancelAttempt = await postOrderCancelledByIdentifier({ orderId: order.id });
    expect(cancelAttempt).toMatchObject({ skipped: true, code: "NOT_COD" });
  });
});
