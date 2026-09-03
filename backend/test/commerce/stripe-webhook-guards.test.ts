import "./setup-mocks";
import { afterEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { randomUUID } from "crypto";

import { getCommerceMocks } from "./setup-mocks";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createPendingStripeOrder,
  createTestProductWithInventory,
  getInventory,
  prisma
} from "../helpers/commerce";
import { ORDER_PAID_EVENT_TYPE } from "../../src/modules/accounting/order-paid.constants";
import { resumePendingCheckout } from "../../src/modules/checkout/checkout.service";
import { cancelUnpaidOrderWithRelease } from "../../src/modules/orders/orders.service";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import { buildSarvedaCheckoutMetadata } from "../../src/modules/payments/stripe.ids";
import { buildStripeCheckoutSessionCreateParams } from "../../src/modules/payments/stripe.checkout";
import { resolveStripeCheckoutPayment } from "../../src/modules/payments/stripe.resolve";
import { completeStripePaidOrder } from "../../src/modules/payments/stripe.service";
import { processStripeEvent } from "../../src/modules/payments/stripe.webhook";

function stripeEvent(type: Stripe.Event["type"], object: Record<string, unknown>): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
    data: { object: object as Stripe.Event.Data["object"] }
  } as Stripe.Event;
}

async function paidInvoiceCount(orderId: string): Promise<number> {
  return prisma.invoice.count({ where: { orderId } });
}

async function orderPaidEventCount(orderId: string): Promise<number> {
  return prisma.accountingPostingEvent.count({
    where: { eventType: ORDER_PAID_EVENT_TYPE, sourceId: orderId }
  });
}

async function fireStripePaymentFailed(opts: {
  paymentId: string;
  orderId: string;
  orderNumber?: string;
  piId: string;
  message?: string;
}) {
  await processStripeEvent(
    stripeEvent("payment_intent.payment_failed", {
      id: opts.piId,
      object: "payment_intent",
      metadata: {
        sarveda_payment_id: opts.paymentId,
        order_id: opts.orderId,
        ...(opts.orderNumber ? { order_number: opts.orderNumber } : {})
      },
      last_payment_error: {
        type: "invalid_request_error",
        code: "card_declined",
        message: opts.message ?? "Your card was declined."
      }
    })
  );
}

describe("stripe checkout metadata binding", () => {
  it("attaches Sarveda order/payment ids to Checkout Session and PaymentIntent metadata", () => {
    const paymentId = "11111111-1111-4111-8111-111111111111";
    const orderId = "22222222-2222-4222-8222-222222222222";
    const metadata = buildSarvedaCheckoutMetadata({
      paymentId,
      orderId,
      orderNumber: "SRV-TEST-META"
    });
    const params = buildStripeCheckoutSessionCreateParams(
      {
        paymentId,
        orderId,
        orderNumber: "SRV-TEST-META",
        email: "shopper@example.com",
        amountMinor: 110,
        currency: "USD",
        shippingAddress: {
          email: "shopper@example.com",
          fullName: "Test",
          line1: "1 Main",
          city: "Springfield",
          state: "IL",
          postalCode: "62701",
          country: "US"
        }
      },
      { customerId: "cus_test", metadata }
    );

    expect(params.metadata).toMatchObject({
      sarveda_payment_id: paymentId,
      order_id: orderId,
      order_number: "SRV-TEST-META"
    });
    expect(params.payment_intent_data?.metadata).toMatchObject({
      sarveda_payment_id: paymentId,
      order_id: orderId,
      order_number: "SRV-TEST-META"
    });
    expect(params.client_reference_id).toBe(orderId);
  });
});

describe("stripe payment_intent.payment_failed does not expire the order", () => {
  afterEach(() => {
    const mocks = getCommerceMocks();
    mocks.notifyOrderEmail.mockClear();
    mocks.ensureOrderInvoicePdf.mockClear();
    mocks.expireOutstandingStripeSessionsForOrder.mockClear();
  });

  it("minute-2 Stripe failure keeps PENDING_PAYMENT and the inventory reservation", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 8, reserved: 0 });
    const { order, payment, qty } = await createPendingStripeOrder(bundle, { qty: 1 });
    getCommerceMocks().expireOutstandingStripeSessionsForOrder.mockClear();
    const piId = `pi_fail_${payment.id.slice(0, 8)}`;

    const resolved = await resolveStripeCheckoutPayment({
      paymentIntentId: piId,
      metadata: {
        sarveda_payment_id: payment.id,
        order_id: order.id,
        order_number: order.orderNumber
      }
    });
    expect(resolved?.id).toBe(payment.id);

    await fireStripePaymentFailed({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      piId,
      message: "Non-INR transactions in India require a card issued outside India."
    });

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    const updatedPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    const inv = await getInventory(bundle.variantId);
    const payload = (updatedPay?.rawPayload ?? {}) as Record<string, unknown>;
    const lastError = payload.stripeLastPaymentError as Record<string, unknown> | undefined;

    expect(updatedPay?.status).toBe("FAILED");
    expect(updatedPay?.providerPaymentId).toBeNull();
    expect(lastError?.message).toMatch(/Non-INR transactions/);
    expect(updatedOrder?.status).toBe("PENDING_PAYMENT");
    expect(updatedOrder?.paymentStatus).toBe("PENDING");
    expect(inv?.onHand).toBe(8);
    expect(inv?.reserved).toBe(1);
    expect(await orderPaidEventCount(order.id)).toBe(0);
    expect(await paidInvoiceCount(order.id)).toBe(0);
    expect(updatedOrder?.afterPaidRanAt).toBeNull();
    expect(getCommerceMocks().expireOutstandingStripeSessionsForOrder).not.toHaveBeenCalled();
    expect(getCommerceMocks().notifyOrderEmail).not.toHaveBeenCalledWith(order.id, "payment_failed");
    expect(getCommerceMocks().notifyOrderEmail).not.toHaveBeenCalledWith(order.id, "order_confirmed");
    expect(getCommerceMocks().ensureOrderInvoicePdf).not.toHaveBeenCalled();
    expect(qty).toBe(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("duplicate payment_failed does not release inventory or cancel the order", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 5, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1 });
    const event = stripeEvent("payment_intent.payment_failed", {
      id: `pi_dupfail_${payment.id.slice(0, 8)}`,
      object: "payment_intent",
      metadata: { sarveda_payment_id: payment.id, order_id: order.id }
    });

    await processStripeEvent(event);
    await processStripeEvent(event);

    const inv = await getInventory(bundle.variantId);
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("PENDING_PAYMENT");
    expect(inv?.onHand).toBe(5);
    expect(inv?.reserved).toBe(1);
    expect(inv?.reserved).not.toBeLessThan(0);

    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history.filter((h) => h.toStatus === "CANCELLED")).toHaveLength(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("Stripe failure then Razorpay success on the same still-valid order pays exactly once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 9, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1, currency: "INR" });

    await fireStripePaymentFailed({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      piId: `pi_then_rzp_${payment.id.slice(0, 8)}`
    });

    const reservedAfterFail = (await getInventory(bundle.variantId))?.reserved;
    expect(reservedAfterFail).toBe(1);

    const resumed = await resumePendingCheckout(order.orderNumber, order.email, {
      paymentMethod: "razorpay"
    });
    expect(resumed.orderId).toBe(order.id);
    expect(resumed.paymentMethod).toBe("razorpay");
    expect(resumed.rzpOrderId).toBeTruthy();

    await completePaidOrder(resumed.rzpOrderId!, `pay_rzp_${randomUUID().slice(0, 8)}`);

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    const inv = await getInventory(bundle.variantId);
    expect(updatedOrder?.status).toBe("PAID");
    expect(payments.filter((p) => p.status === "CAPTURED")).toHaveLength(1);
    expect(payments.find((p) => p.provider === "STRIPE")?.status).toBe("FAILED");
    expect(inv?.onHand).toBe(8);
    expect(inv?.reserved).toBe(0);
    expect(await orderPaidEventCount(order.id)).toBeLessThanOrEqual(1);
    expect(getCommerceMocks().notifyOrderEmail).toHaveBeenCalledWith(order.id, "order_confirmed");
    expect(getCommerceMocks().notifyOrderEmail).not.toHaveBeenCalledWith(order.id, "payment_failed");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("Stripe failure then Stripe success before the deadline pays exactly once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 7, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1 });
    const piId = `pi_retry_${payment.id.slice(0, 8)}`;

    await fireStripePaymentFailed({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      piId: `pi_fail_then_ok_${payment.id.slice(0, 8)}`
    });

    await processStripeEvent(
      stripeEvent("payment_intent.succeeded", {
        id: piId,
        object: "payment_intent",
        status: "succeeded",
        metadata: {
          sarveda_payment_id: payment.id,
          order_id: order.id,
          order_number: order.orderNumber
        }
      })
    );

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    const updatedPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    const inv = await getInventory(bundle.variantId);
    expect(updatedOrder?.status).toBe("PAID");
    expect(updatedPay?.status).toBe("CAPTURED");
    expect(updatedPay?.providerPaymentId).toBe(piId);
    expect(inv?.onHand).toBe(6);
    expect(inv?.reserved).toBe(0);
    expect(getCommerceMocks().ensureOrderInvoicePdf).toHaveBeenCalledTimes(1);
    expect(getCommerceMocks().notifyOrderEmail).toHaveBeenCalledWith(order.id, "order_confirmed");

    await completeStripePaidOrder(payment.id, piId);
    expect(inv?.onHand).toBe(6);
    expect(await orderPaidEventCount(order.id)).toBeLessThanOrEqual(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});

describe("15-minute payment expiry vs late success", () => {
  afterEach(() => {
    const mocks = getCommerceMocks();
    mocks.notifyOrderEmail.mockClear();
    mocks.ensureOrderInvoicePdf.mockClear();
    mocks.expireOutstandingStripeSessionsForOrder.mockClear();
  });

  it("unpaid order at the deadline cancels once, releases reservation once, and expires Stripe sessions", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 6, reserved: 0 });
    const { order, payment, sessionId } = await createPendingStripeOrder(bundle, { qty: 1 });

    await fireStripePaymentFailed({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      piId: `pi_timeout_${payment.id.slice(0, 8)}`
    });

    const first = await cancelUnpaidOrderWithRelease(
      order.id,
      "Payment not completed within 15 minutes — stock released",
      { source: "payment_timeout_job" }
    );
    expect(first).toBe(true);

    const second = await cancelUnpaidOrderWithRelease(
      order.id,
      "Payment not completed within 15 minutes — stock released",
      { source: "payment_timeout_job" }
    );
    expect(second).toBe(false);

    const inv = await getInventory(bundle.variantId);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("CANCELLED");
    expect(updated?.paymentStatus).toBe("FAILED");
    expect(inv?.reserved).toBe(0);
    expect(inv?.onHand).toBe(6);
    expect(getCommerceMocks().expireOutstandingStripeSessionsForOrder).toHaveBeenCalledWith(order.id);
    expect(sessionId.startsWith("cs_")).toBe(true);
    expect(getCommerceMocks().notifyOrderEmail).not.toHaveBeenCalledWith(order.id, "order_confirmed");
    expect(getCommerceMocks().notifyOrderEmail).not.toHaveBeenCalledWith(order.id, "payment_failed");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("resume after expiry cannot pay the old order; a new checkout is a new order", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 4, reserved: 0 });
    const first = await createPendingStripeOrder(bundle, { qty: 1 });
    await cancelUnpaidOrderWithRelease(first.order.id, "Payment not completed within 15 minutes — stock released");

    await expect(
      resumePendingCheckout(first.order.orderNumber, first.order.email)
    ).rejects.toMatchObject({ code: "ORDER_EXPIRED", statusCode: 400 });

    const second = await createPendingStripeOrder(bundle, { qty: 1 });
    expect(second.order.id).not.toBe(first.order.id);
    expect(second.order.orderNumber).not.toBe(first.order.orderNumber);

    const late = await completeStripePaidOrder(first.payment.id, `pi_old_${first.payment.id.slice(0, 8)}`);
    expect(late?.applied).toBe(false);
    expect(late?.failClosed).toBe(true);

    const oldOrder = await prisma.order.findUnique({ where: { id: first.order.id } });
    expect(oldOrder?.status).toBe("CANCELLED");

    await processStripeEvent(
      stripeEvent("payment_intent.succeeded", {
        id: `pi_new_${second.payment.id.slice(0, 8)}`,
        object: "payment_intent",
        status: "succeeded",
        metadata: {
          sarveda_payment_id: second.payment.id,
          order_id: second.order.id
        }
      })
    );
    const newOrder = await prisma.order.findUnique({ where: { id: second.order.id } });
    expect(newOrder?.status).toBe("PAID");

    await cleanupTestOrder(second.order.id);
    await cleanupTestOrder(first.order.id);
    await cleanupTestProduct(bundle);
  });

  it("Stripe tab still open after expiry cannot revive the order", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 7, reserved: 0 });
    const { order, payment, sessionId } = await createPendingStripeOrder(bundle, { qty: 1 });
    const piId = `pi_late_${payment.id.slice(0, 8)}`;

    await cancelUnpaidOrderWithRelease(
      order.id,
      "Payment not completed within 15 minutes — stock released"
    );

    const result = await completeStripePaidOrder(payment.id, piId);
    expect(result?.failClosed).toBe(true);
    expect(result?.applied).toBe(false);

    await processStripeEvent(
      stripeEvent("checkout.session.completed", {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: piId,
        metadata: { sarveda_payment_id: payment.id, order_id: order.id }
      })
    );

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    const updatedPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    const inv = await getInventory(bundle.variantId);
    const payload = (updatedPay?.rawPayload ?? {}) as Record<string, unknown>;

    expect(updatedOrder?.status).toBe("CANCELLED");
    expect(updatedOrder?.paymentStatus).toBe("FAILED");
    expect(updatedPay?.status).toBe("FAILED");
    expect(updatedOrder?.afterPaidRanAt).toBeNull();
    expect(inv?.onHand).toBe(7);
    expect(inv?.reserved).toBe(0);
    expect(payload.lateSuccessReconciliation).toBe("REQUIRED");
    expect(await paidInvoiceCount(order.id)).toBe(0);
    expect(await orderPaidEventCount(order.id)).toBe(0);
    expect(getCommerceMocks().notifyOrderEmail).not.toHaveBeenCalledWith(order.id, "order_confirmed");

    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history.some((h) => h.reason?.includes("STRIPE_LATE_SUCCESS_RECONCILIATION"))).toBe(true);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("explicit customer/admin cancellation before 15 minutes releases reservation and expires Stripe sessions", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 3, reserved: 0 });
    const { order } = await createPendingStripeOrder(bundle, { qty: 1 });

    const changed = await cancelUnpaidOrderWithRelease(order.id, "Customer cancelled unpaid checkout");
    expect(changed).toBe(true);

    const inv = await getInventory(bundle.variantId);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("CANCELLED");
    expect(inv?.reserved).toBe(0);
    expect(inv?.onHand).toBe(3);
    expect(getCommerceMocks().expireOutstandingStripeSessionsForOrder).toHaveBeenCalledWith(order.id);

    await expect(resumePendingCheckout(order.orderNumber, order.email)).rejects.toMatchObject({
      code: "ORDER_EXPIRED"
    });

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});

describe("first-success-wins concurrent captures", () => {
  afterEach(() => {
    const mocks = getCommerceMocks();
    mocks.notifyOrderEmail.mockClear();
    mocks.ensureOrderInvoicePdf.mockClear();
    mocks.expireOutstandingStripeSessionsForOrder.mockClear();
  });

  it("concurrent Stripe and Razorpay success pay the order exactly once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 11, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1, currency: "INR" });
    const rzpOrderId = `order_race_${randomUUID().slice(0, 12)}`;
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "RAZORPAY",
        providerOrderId: rzpOrderId,
        amountInPaise: order.grandTotalInPaise,
        currency: "INR",
        status: "PENDING",
        rawPayload: { source: "concurrent_race_test" }
      }
    });

    const piId = `pi_race_${payment.id.slice(0, 8)}`;
    const payId = `pay_race_${randomUUID().slice(0, 8)}`;

    const [stripeResult] = await Promise.all([
      completeStripePaidOrder(payment.id, piId),
      completePaidOrder(rzpOrderId, payId)
    ]);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    const captured = payments.filter((p) => p.status === "CAPTURED");
    const inv = await getInventory(bundle.variantId);
    const saleTransitions = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID" }
    });

    expect(updated?.status).toBe("PAID");
    expect(updated?.afterPaidRanAt).toBeTruthy();
    expect(captured).toHaveLength(1);
    expect(inv?.onHand).toBe(10);
    expect(inv?.reserved).toBe(0);
    expect(saleTransitions).toHaveLength(1);
    expect(await orderPaidEventCount(order.id)).toBeLessThanOrEqual(1);
    expect(getCommerceMocks().ensureOrderInvoicePdf).toHaveBeenCalledTimes(1);
    expect(getCommerceMocks().notifyOrderEmail).toHaveBeenCalledWith(order.id, "order_confirmed");
    expect(getCommerceMocks().notifyOrderEmail).toHaveBeenCalledTimes(1);

    const loser = payments.find((p) => p.status !== "CAPTURED");
    expect(loser).toBeTruthy();
    const loserPayload = (loser?.rawPayload ?? {}) as Record<string, unknown>;
    if (stripeResult?.applied === false) {
      expect(stripeResult.failClosed).toBe(true);
      expect(loserPayload.lateSuccessReconciliation).toBe("REQUIRED");
    } else {
      expect(loser?.provider).toBe("RAZORPAY");
      expect(loserPayload.lateSuccessReconciliation).toBe("REQUIRED");
    }

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});

describe("stripe success webhook idempotency", () => {
  afterEach(() => {
    const mocks = getCommerceMocks();
    mocks.notifyOrderEmail.mockClear();
    mocks.ensureOrderInvoicePdf.mockClear();
  });

  it("payment_intent.succeeded maps to the Sarveda payment and captures once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 9, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1 });
    const piId = `pi_ok_${payment.id.slice(0, 8)}`;

    await processStripeEvent(
      stripeEvent("payment_intent.succeeded", {
        id: piId,
        object: "payment_intent",
        amount: 118000,
        currency: "usd",
        status: "succeeded",
        metadata: {
          sarveda_payment_id: payment.id,
          order_id: order.id,
          order_number: order.orderNumber
        }
      })
    );

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    const updatedPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    const inv = await getInventory(bundle.variantId);
    expect(updatedOrder?.status).toBe("PAID");
    expect(updatedPay?.status).toBe("CAPTURED");
    expect(updatedPay?.providerPaymentId).toBe(piId);
    expect(inv?.onHand).toBe(8);
    expect(inv?.reserved).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("checkout.session.completed + payment_intent.succeeded do not double-process", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10, reserved: 0 });
    const { order, payment, sessionId } = await createPendingStripeOrder(bundle, { qty: 2 });
    const piId = `pi_both_${payment.id.slice(0, 8)}`;
    const metadata = {
      sarveda_payment_id: payment.id,
      order_id: order.id,
      order_number: order.orderNumber,
      checkout_session_id: sessionId
    };

    await processStripeEvent(
      stripeEvent("checkout.session.completed", {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: piId,
        metadata
      })
    );
    await processStripeEvent(
      stripeEvent("payment_intent.succeeded", {
        id: piId,
        object: "payment_intent",
        metadata
      })
    );

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(8);
    expect(inv?.reserved).toBe(0);
    const captured = await prisma.payment.count({
      where: { orderId: order.id, status: "CAPTURED" }
    });
    expect(captured).toBe(1);
    expect(await orderPaidEventCount(order.id)).toBeLessThanOrEqual(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("duplicate success webhooks do not double-deduct inventory or duplicate accounting", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 12, reserved: 0 });
    const { order, payment, sessionId } = await createPendingStripeOrder(bundle, { qty: 3 });
    const piId = `pi_iddem_${payment.id.slice(0, 8)}`;
    const sessionCompleted = stripeEvent("checkout.session.completed", {
      id: sessionId,
      object: "checkout.session",
      payment_status: "paid",
      payment_intent: piId,
      metadata: { sarveda_payment_id: payment.id, order_id: order.id }
    });

    await processStripeEvent(sessionCompleted);
    await processStripeEvent(sessionCompleted);
    await completeStripePaidOrder(payment.id, piId);

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(9);
    expect(await orderPaidEventCount(order.id)).toBeLessThanOrEqual(1);
    expect(getCommerceMocks().ensureOrderInvoicePdf).toHaveBeenCalledTimes(1);
    expect(getCommerceMocks().notifyOrderEmail).toHaveBeenCalledWith(order.id, "order_confirmed");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});

describe("razorpay path remains unaffected", () => {
  it("still captures a pending Razorpay order exactly once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 11, reserved: 0 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
    const payId = `pay_rzp_${Date.now()}`;
    await completePaidOrder(rzpOrderId, payId);
    await completePaidOrder(rzpOrderId, payId);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    const inv = await getInventory(bundle.variantId);
    expect(updated?.status).toBe("PAID");
    expect(inv?.onHand).toBe(10);
    expect(inv?.reserved).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
