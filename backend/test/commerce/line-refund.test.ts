import "./setup-mocks";
import { beforeEach, describe, expect, it } from "vitest";

import { getCommerceMocks } from "./setup-mocks";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  getInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import {
  executeAdminLineRefund,
  loadLineRefundOptions
} from "../../src/modules/orders/order-line-refund.service";

/** MAN-006 shape: 2 x ₹5 merchandise + ₹3 shipping, paid by Razorpay. */
async function paidOrderWithShipping() {
  const bundle = await createTestProductWithInventory({ onHand: 50, saleInPaise: 500 });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, {
    qty: 2,
    unitPriceInPaise: 500
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { shippingInPaise: 300, grandTotalInPaise: 1300 }
  });
  await prisma.payment.updateMany({
    where: { orderId: order.id },
    data: { amountInPaise: 1300 }
  });
  await completePaidOrder(rzpOrderId, `pay_line_${Date.now()}`);
  return { bundle, order };
}

describe("admin line-item partial refund", () => {
  beforeEach(() => {
    const m = getCommerceMocks();
    m.razorpayRefund.mockClear();
    m.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    }));
  });

  it("offers per-unit refund values and restock quantities before dispatch", async () => {
    const { bundle, order } = await paidOrderWithShipping();
    try {
      const options = await loadLineRefundOptions(order.id);

      expect(options.eligible).toBe(true);
      expect(options.originallyCollectedInPaise).toBe(1300);
      expect(options.alreadyRefundedInPaise).toBe(0);
      expect(options.shippingInPaise).toBe(300);
      expect(options.restockAvailable).toBe(true);
      expect(options.lines).toHaveLength(1);
      expect(options.lines[0]).toMatchObject({
        qtyOrdered: 2,
        unitPriceInPaise: 500,
        perUnitRefundInPaise: 500,
        maxRefundQty: 2,
        restockableQty: 2
      });
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });

  it("refunds one of two units without refunding shipping or cancelling the order", async () => {
    const { bundle, order } = await paidOrderWithShipping();
    try {
      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      const before = await getInventory(bundle.variantId);

      const result = await executeAdminLineRefund({
        orderId: order.id,
        body: {
          lines: [{ orderItemId: items[0]!.id, quantity: 1 }],
          refundShipping: false,
          restock: true,
          idempotencyKey: `man006-${order.id}`
        },
        adminEmail: "admin@sarveda.com"
      });

      expect(result.refundedInPaise).toBe(500);
      expect(result.merchandiseRefundInPaise).toBe(500);
      expect(result.shippingRefundInPaise).toBe(0);
      expect(result.restockedUnits).toBe(1);
      expect(result.netCollectedInPaise).toBe(800);

      const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updatedOrder?.status).not.toBe("REFUNDED");
      expect(updatedOrder?.status).not.toBe("CANCELLED");
      expect(updatedOrder?.paymentStatus).toBe("PARTIALLY_REFUNDED");

      const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
      expect(payment?.refundedInPaise).toBe(500);

      const after = await getInventory(bundle.variantId);
      expect((after?.onHand ?? 0) - (before?.onHand ?? 0)).toBe(1);

      const gateway = getCommerceMocks().razorpayRefund;
      expect(gateway).toHaveBeenCalledTimes(1);
      expect(gateway.mock.calls[0]?.[1]).toMatchObject({ amount: 500 });
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });

  it("is idempotent for a repeated idempotency key", async () => {
    const { bundle, order } = await paidOrderWithShipping();
    try {
      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      const body = {
        lines: [{ orderItemId: items[0]!.id, quantity: 1 }],
        refundShipping: false,
        restock: true,
        idempotencyKey: `man006-repeat-${order.id}`
      };

      await executeAdminLineRefund({ orderId: order.id, body });
      const second = await executeAdminLineRefund({ orderId: order.id, body });

      expect(second.refundedInPaise).toBe(500);
      expect(getCommerceMocks().razorpayRefund).toHaveBeenCalledTimes(1);

      const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
      expect(payment?.refundedInPaise).toBe(500);

      const restockEvents = await prisma.orderInventoryRestockEvent.findMany({
        where: { orderId: order.id }
      });
      expect(restockEvents).toHaveLength(1);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });

  it("refuses a line refund that covers the whole remaining payment", async () => {
    const { bundle, order } = await paidOrderWithShipping();
    try {
      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      await expect(
        executeAdminLineRefund({
          orderId: order.id,
          body: {
            lines: [{ orderItemId: items[0]!.id, quantity: 2 }],
            refundShipping: true,
            restock: false,
            idempotencyKey: `man006-full-${order.id}`
          }
        })
      ).rejects.toMatchObject({ code: "FULL_REFUND_REQUIRED" });

      expect(getCommerceMocks().razorpayRefund).not.toHaveBeenCalled();
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });

  it("rejects a refund quantity greater than the quantity purchased", async () => {
    const { bundle, order } = await paidOrderWithShipping();
    try {
      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      await expect(
        executeAdminLineRefund({
          orderId: order.id,
          body: {
            lines: [{ orderItemId: items[0]!.id, quantity: 3 }],
            refundShipping: false,
            restock: false,
            idempotencyKey: `man006-over-${order.id}`
          }
        })
      ).rejects.toMatchObject({ code: "REFUND_QTY_EXCEEDS_ORDERED" });
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });
});
