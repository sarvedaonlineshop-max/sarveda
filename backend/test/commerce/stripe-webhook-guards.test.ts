import "./setup-mocks";
import { afterEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";

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

describe("stripe payment_intent.payment_failed handling", () => {
  afterEach(() => {
    const mocks = getCommerceMocks();
    mocks.notifyOrderEmail.mockClear();
    mocks.ensureOrderInvoicePdf.mockClear();
  });

  it("resolves the Sarveda payment from PaymentIntent metadata without providerPaymentId and fails immediately", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 8, reserved: 0 });
    const { order, payment, qty } = await createPendingStripeOrder(bundle, { qty: 1 });
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

    await processStripeEvent(
      stripeEvent("payment_intent.payment_failed", {
        id: piId,
        object: "payment_intent",
        metadata: {
          sarveda_payment_id: payment.id,
          order_id: order.id,
          order_number: order.orderNumber
        },
        last_payment_error: {
          type: "invalid_request_error",
          message: "Non-INR transactions in India require a card issued outside India."
        }
      })
    );

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    const updatedPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    const inv = await getInventory(bundle.variantId);

    expect(updatedPay?.status).toBe("FAILED");
    expect(updatedPay?.providerPaymentId).toBeNull();
    expect(updatedOrder?.status).toBe("CANCELLED");
    expect(updatedOrder?.paymentStatus).toBe("FAILED");
    expect(inv?.onHand).toBe(8);
    expect(inv?.reserved).toBe(0);
    expect(await orderPaidEventCount(order.id)).toBe(0);
    expect(await paidInvoiceCount(order.id)).toBe(0);
    expect(updatedOrder?.afterPaidRanAt).toBeNull();
    expect(getCommerceMocks().notifyOrderEmail).toHaveBeenCalledWith(order.id, "payment_failed");
    expect(getCommerceMocks().notifyOrderEmail).not.toHaveBeenCalledWith(order.id, "order_confirmed");
    expect(getCommerceMocks().ensureOrderInvoicePdf).not.toHaveBeenCalled();
    expect(qty).toBe(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("duplicate payment_failed does not double-release inventory", async () => {
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
    expect(inv?.onHand).toBe(5);
    expect(inv?.reserved).toBe(0);
    expect(inv?.reserved).not.toBeLessThan(0);

    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history.filter((h) => h.toStatus === "CANCELLED")).toHaveLength(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("timeout after already-handled payment failure is idempotent", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 6, reserved: 0 });
    const { order, payment } = await createPendingStripeOrder(bundle, { qty: 1 });

    await processStripeEvent(
      stripeEvent("payment_intent.payment_failed", {
        id: `pi_timeout_${payment.id.slice(0, 8)}`,
        object: "payment_intent",
        metadata: { sarveda_payment_id: payment.id }
      })
    );

    const second = await cancelUnpaidOrderWithRelease(
      order.id,
      "Payment not completed within 15 minutes — stock released",
      { source: "payment_timeout_job" }
    );
    expect(second).toBe(false);

    const inv = await getInventory(bundle.variantId);
    expect(inv?.reserved).toBe(0);
    expect(inv?.onHand).toBe(6);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("CANCELLED");

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

  it("late success for a CANCELLED order fails closed and is surfaced for reconciliation", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 7, reserved: 0 });
    const { order, payment, sessionId } = await createPendingStripeOrder(bundle, { qty: 1 });
    const piId = `pi_late_${payment.id.slice(0, 8)}`;

    await cancelUnpaidOrderWithRelease(order.id, "Stripe payment failed");

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
