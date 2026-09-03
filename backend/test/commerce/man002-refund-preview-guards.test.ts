import "./setup-mocks";
import { describe, expect, it, beforeEach } from "vitest";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { getCommerceMocks } from "./setup-mocks";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import {
  initiateGatewayRefund,
  initiatePartialGatewayRefund
} from "../../src/modules/payments/refund.service";
import { loadOrderRefundPreview } from "../../src/modules/orders/order-refund-preview.service";
import { calculateOrderRefund } from "../../src/modules/orders/order-refund-calculator.service";
import {
  pickCapturedPaymentForRefund,
  pickPaymentForRefundHistory
} from "../../src/modules/payments/payment-selection";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { postOrderPaidByIdentifier } from "../../src/modules/accounting/order-paid-posting.service";

async function paidOrder(onHand = 5) {
  const bundle = await createTestProductWithInventory({ onHand });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
  await completePaidOrder(rzpOrderId, `pay_man002_${Date.now()}_${Math.random()}`);
  const paid = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { payments: true, items: true }
  });
  return { bundle, order: paid };
}

describe("MAN-002 refund preview + duplicate execution guards", () => {
  beforeEach(() => {
    getCommerceMocks().notifyOrderEmail.mockClear();
    getCommerceMocks().razorpayRefund.mockClear();
  });

  describe("pure calculator history states", () => {
    const order = {
      subtotalInPaise: 500,
      discountInPaise: 0,
      shippingInPaise: 300,
      taxInPaise: 0,
      grandTotalInPaise: 800,
      currency: "INR"
    };
    const items = [
      {
        id: "i1",
        lineTotalInPaise: 500,
        unitPriceInPaise: 500,
        qtyOrdered: 1,
        taxClass: "standard"
      }
    ];

    it("1 — CAPTURED, no refund → remaining 800, eligible true", () => {
      const r = calculateOrderRefund({
        order,
        items,
        payment: {
          id: "p1",
          provider: "RAZORPAY",
          status: "CAPTURED",
          amountInPaise: 800,
          refundedInPaise: 0
        },
        policy: "FULL_PRE_DISPATCH_CANCELLATION"
      });
      expect(r.capturedAmountPaise).toBe(800);
      expect(r.alreadyRefundedAmountPaise).toBe(0);
      expect(r.remainingRefundableAmountPaise).toBe(800);
      expect(r.proposedRefundAmountPaise).toBe(800);
      expect(r.refundEligible).toBe(true);
      expect(r.unavailableCode).toBeUndefined();
    });

    it("2 — PARTIALLY_REFUNDED → remaining 500, eligible true", () => {
      const r = calculateOrderRefund({
        order,
        items,
        payment: {
          id: "p1",
          provider: "RAZORPAY",
          status: "PARTIALLY_REFUNDED",
          amountInPaise: 800,
          refundedInPaise: 300
        },
        policy: "FULL_PRE_DISPATCH_CANCELLATION"
      });
      expect(r.capturedAmountPaise).toBe(800);
      expect(r.alreadyRefundedAmountPaise).toBe(300);
      expect(r.remainingRefundableAmountPaise).toBe(500);
      expect(r.proposedRefundAmountPaise).toBe(500);
      expect(r.refundEligible).toBe(true);
    });

    it("3 — REFUNDED → remaining 0, eligible false, history visible", () => {
      const r = calculateOrderRefund({
        order,
        items,
        payment: {
          id: "p1",
          provider: "RAZORPAY",
          status: "REFUNDED",
          amountInPaise: 800,
          refundedInPaise: 800
        },
        policy: "FULL_PRE_DISPATCH_CANCELLATION"
      });
      expect(r.capturedAmountPaise).toBe(800);
      expect(r.alreadyRefundedAmountPaise).toBe(800);
      expect(r.remainingRefundableAmountPaise).toBe(0);
      expect(r.proposedRefundAmountPaise).toBe(0);
      expect(r.refundEligible).toBe(false);
      expect(r.unavailableCode).toBe("FULLY_REFUNDED");
      expect(r.explanation).toMatch(/FULLY REFUNDED/i);
    });
  });

  it("history picker includes REFUNDED; execution picker excludes it", () => {
    const payments = [
      {
        id: "p1",
        provider: "RAZORPAY" as const,
        status: "REFUNDED" as const,
        createdAt: new Date()
      }
    ];
    expect(pickCapturedPaymentForRefund(payments).ok).toBe(false);
    const hist = pickPaymentForRefundHistory(payments);
    expect(hist.ok).toBe(true);
    if (hist.ok) expect(hist.payment.status).toBe("REFUNDED");
  });

  it("4/5 — preview after full refund shows FULLY REFUNDED (not stale NO_CAPTURED)", async () => {
    const { bundle, order } = await paidOrder();
    const before = await loadOrderRefundPreview(order.id);
    expect(before.ok).toBe(true);
    if (before.ok) {
      expect(before.breakdown.remainingRefundableAmountPaise).toBeGreaterThan(0);
      expect(before.breakdown.refundEligible).toBe(true);
    }

    await initiateGatewayRefund(order.id, "man002 preview refresh");

    const after = await loadOrderRefundPreview(order.id);
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.breakdown.capturedAmountPaise).toBeGreaterThan(0);
      expect(after.breakdown.alreadyRefundedAmountPaise).toBe(after.breakdown.capturedAmountPaise);
      expect(after.breakdown.remainingRefundableAmountPaise).toBe(0);
      expect(after.breakdown.proposedRefundAmountPaise).toBe(0);
      expect(after.breakdown.refundEligible).toBe(false);
      expect(after.breakdown.unavailableCode).toBe("FULLY_REFUNDED");
      expect(after.breakdown.unavailableCode).not.toBe("NO_CAPTURED_PAYMENT");
    }

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("6–11 — duplicate full-refund API is rejected with zero side effects", async () => {
    const { bundle, order } = await paidOrder(3);
    const pay = order.payments[0]!;
    const captured = pay.amountInPaise || order.grandTotalInPaise;

    await initiateGatewayRefund(order.id, "first full refund");
    const rzpCallsAfterFirst = getCommerceMocks().razorpayRefund.mock.calls.length;
    const notifyCallsAfterFirst = getCommerceMocks().notifyOrderEmail.mock.calls.length;

    const refundsAfterFirst = await prisma.refund.count({
      where: { paymentId: pay.id, status: "processed" }
    });
    const restocksAfterFirst = await prisma.orderInventoryRestockEvent.count({
      where: { orderId: order.id }
    });
    const journalsAfterFirst = await prisma.accountingPostingEvent.count({
      where: {
        sourceId: order.id,
        eventType: "ORDER_REFUNDED_FULL",
        status: "POSTED"
      }
    });

    await expect(initiateGatewayRefund(order.id, "duplicate retry")).rejects.toMatchObject({
      code: "ALREADY_REFUNDED",
      statusCode: 409
    });

    expect(getCommerceMocks().razorpayRefund.mock.calls.length).toBe(rzpCallsAfterFirst);
    expect(getCommerceMocks().notifyOrderEmail.mock.calls.length).toBe(notifyCallsAfterFirst);

    const refundsAfter = await prisma.refund.count({
      where: { paymentId: pay.id, status: "processed" }
    });
    const restocksAfter = await prisma.orderInventoryRestockEvent.count({
      where: { orderId: order.id }
    });
    const journalsAfter = await prisma.accountingPostingEvent.count({
      where: {
        sourceId: order.id,
        eventType: "ORDER_REFUNDED_FULL",
        status: "POSTED"
      }
    });
    const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const inv = await prisma.inventory.findUnique({
      where: { variantId: order.items[0]!.variantId }
    });

    expect(refundsAfter).toBe(refundsAfterFirst);
    expect(restocksAfter).toBe(restocksAfterFirst);
    expect(journalsAfter).toBe(journalsAfterFirst);
    expect(orderAfter.status).toBe("REFUNDED");
    expect(orderAfter.status).not.toBe("CANCELLED");
    expect(orderAfter.paymentStatus).toBe("REFUNDED");

    const refundRow = await prisma.refund.findFirst({
      where: { paymentId: pay.id, status: "processed" }
    });
    expect(refundRow?.amountInPaise).toBe(captured);

    expect(inv?.onHand).toBe(3); // sold 1 then restocked once → back to 3
    expect(inv?.reserved).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("12 — accountingPostedAt/stage set when ORDER_REFUNDED_FULL posts", async () => {
    const prevNative = process.env.NATIVE_ACCOUNTING_ENABLED;
    const prevSales = process.env.ACCOUNTING_SALES_POSTING_ENABLED;
    const prevRefund = process.env.ACCOUNTING_REFUND_POSTING_ENABLED;
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
    try {
      await seedAccountingChartOfAccounts();
      const { bundle, order } = await paidOrder(2);
      await postOrderPaidByIdentifier({ orderId: order.id }, { forcePersist: true });
      await initiateGatewayRefund(order.id, "stamp accounting marker");

      const refund = await prisma.refund.findFirst({
        where: { payment: { orderId: order.id }, status: "processed" }
      });
      expect(refund).toBeTruthy();
      expect(refund?.accountingPostedAt).not.toBeNull();
      expect(refund?.settlementStage).toBe("COMPLETE");

      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    } finally {
      if (prevNative === undefined) delete process.env.NATIVE_ACCOUNTING_ENABLED;
      else process.env.NATIVE_ACCOUNTING_ENABLED = prevNative;
      if (prevSales === undefined) delete process.env.ACCOUNTING_SALES_POSTING_ENABLED;
      else process.env.ACCOUNTING_SALES_POSTING_ENABLED = prevSales;
      if (prevRefund === undefined) delete process.env.ACCOUNTING_REFUND_POSTING_ENABLED;
      else process.env.ACCOUNTING_REFUND_POSTING_ENABLED = prevRefund;
    }
  });

  it("partial then full preview remaining math", async () => {
    const { bundle, order } = await paidOrder();
    const pay = order.payments[0]!;
    const captured = pay.amountInPaise || order.grandTotalInPaise;
    const half = Math.floor(captured / 2);

    await initiatePartialGatewayRefund(order.id, half, "partial");
    const mid = await loadOrderRefundPreview(order.id);
    expect(mid.ok).toBe(true);
    if (mid.ok) {
      expect(mid.breakdown.alreadyRefundedAmountPaise).toBe(half);
      expect(mid.breakdown.remainingRefundableAmountPaise).toBe(captured - half);
      expect(mid.breakdown.refundEligible).toBe(true);
    }

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
