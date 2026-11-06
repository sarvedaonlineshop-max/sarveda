import "./setup-mocks";
import { afterEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({
  retrieve: vi.fn()
}));

vi.mock("../../src/modules/payments/stripe.client", () => ({
  getStripeClient: () => ({
    checkout: { sessions: { retrieve: stripeMock.retrieve } }
  }),
  stripeLiveApiCallsAllowed: () => true,
  requireStripeClient: () => ({
    checkout: { sessions: { retrieve: stripeMock.retrieve } }
  })
}));

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingStripeOrder,
  createTestProductWithInventory,
  getInventory,
  prisma
} from "../helpers/commerce";
import { cancelUnpaidOrderWithRelease } from "../../src/modules/orders/orders.service";
import { syncStripeCapturedPayment } from "../../src/modules/payments/stripe.sync";

function paidSession(opts: {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency?: string;
}) {
  return {
    id: "cs_test_paid",
    status: "complete",
    payment_status: "paid",
    metadata: { order_id: opts.orderId, order_number: opts.orderNumber },
    payment_intent: {
      id: "pi_test_paid",
      status: "succeeded",
      amount_received: opts.amount,
      currency: opts.currency ?? "usd",
      latest_charge: {
        id: "ch_test_paid",
        paid: true,
        captured: true,
        refunded: false,
        amount: opts.amount,
        amount_refunded: 0,
        currency: opts.currency ?? "usd"
      }
    }
  };
}

describe("stripe checkout sync", () => {
  afterEach(() => {
    stripeMock.retrieve.mockReset();
  });

  it("marks a pending order paid when Stripe has already captured the session", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 8, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1, unitPriceInPaise: 2500 });
    stripeMock.retrieve.mockResolvedValue(
      paidSession({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: payment.amountInPaise
      })
    );

    const result = await syncStripeCapturedPayment(order.id);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    const pay = await prisma.payment.findUnique({ where: { id: payment.id } });
    const inv = await getInventory(bundle.variantId);

    expect(result.updated).toBe(true);
    expect(updated?.status).toBe("PAID");
    expect(updated?.paymentStatus).toBe("CAPTURED");
    expect(pay?.status).toBe("CAPTURED");
    expect(pay?.providerPaymentId).toBe("pi_test_paid");
    expect(inv?.onHand).toBe(7);
    expect(inv?.reserved).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("does not mark the order paid when the captured amount does not match", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 4, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1, unitPriceInPaise: 2500 });
    stripeMock.retrieve.mockResolvedValue(
      paidSession({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: payment.amountInPaise + 1
      })
    );

    const result = await syncStripeCapturedPayment(order.id);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });

    expect(result.updated).toBe(false);
    expect(updated?.status).toBe("PENDING_PAYMENT");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("restores an order the 15-minute timer abandoned after Stripe had captured it", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 6, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1, unitPriceInPaise: 2500 });
    await cancelUnpaidOrderWithRelease(
      order.id,
      "Payment not completed within 15 minutes — stock released",
      { source: "payment_timeout_job" }
    );
    stripeMock.retrieve.mockResolvedValue(
      paidSession({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: payment.amountInPaise
      })
    );

    const result = await syncStripeCapturedPayment(order.id);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    const inv = await getInventory(bundle.variantId);

    expect(result.updated).toBe(true);
    expect(updated?.status).toBe("PAID");
    expect(updated?.paymentStatus).toBe("CAPTURED");
    expect(inv?.onHand).toBe(5);
    expect(inv?.reserved).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("leaves a superseded checkout cancelled", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 3, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1, unitPriceInPaise: 2500 });
    await cancelUnpaidOrderWithRelease(order.id, "Superseded by new checkout attempt");
    stripeMock.retrieve.mockResolvedValue(
      paidSession({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: payment.amountInPaise
      })
    );

    const result = await syncStripeCapturedPayment(order.id);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });

    expect(result.updated).toBe(false);
    expect(updated?.status).toBe("CANCELLED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
