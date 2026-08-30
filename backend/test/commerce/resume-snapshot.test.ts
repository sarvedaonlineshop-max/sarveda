/**
 * Commercial snapshot guard on resumePendingCheckout (payment retry hardening).
 * Does not change stock reservation design — only verifies resume reject + Razorpay reuse.
 */
import "./setup-mocks";
import { describe, expect, it } from "vitest";

import {
  cleanupGuestCart,
  cleanupTestOrder,
  cleanupTestProduct,
  createGuestCartWithItem,
  createTestProductWithInventory,
  getInventory,
  mockRequest,
  prisma
} from "../helpers/commerce";
import {
  createCheckoutOrder,
  resumePendingCheckout
} from "../../src/modules/checkout/checkout.service";

describe("resume commercial snapshot guard", () => {
  it("same currency + same grand total resumes Razorpay with same providerOrderId", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 30, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const created = await createCheckoutOrder(req, {
      email: "resume-ok@example.com",
      phone: "9876543210",
      shippingFullName: "Resume OK",
      line1: "1 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay"
    });

    expect(created.rzpOrderId).toBeTruthy();
    const reservedAfterCreate = (await getInventory(bundle.variantId))?.reserved;

    const resumed = await resumePendingCheckout(created.orderNumber, "resume-ok@example.com", {
      currency: created.currency,
      amountInPaise: created.amountInPaise
    });

    expect(resumed.orderId).toBe(created.orderId);
    expect(resumed.orderNumber).toBe(created.orderNumber);
    expect(resumed.paymentId).toBe(created.paymentId);
    expect(resumed.rzpOrderId).toBe(created.rzpOrderId);
    expect(resumed.amountInPaise).toBe(created.amountInPaise);
    expect(resumed.currency).toBe(created.currency);

    const reservedAfterResume = (await getInventory(bundle.variantId))?.reserved;
    expect(reservedAfterResume).toBe(reservedAfterCreate);

    await cleanupTestOrder(created.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("mismatched amountInPaise rejects with ORDER_SNAPSHOT_MISMATCH", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const created = await createCheckoutOrder(req, {
      email: "resume-amt@example.com",
      phone: "9876543210",
      shippingFullName: "Resume Amt",
      line1: "1 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay"
    });

    await expect(
      resumePendingCheckout(created.orderNumber, "resume-amt@example.com", {
        currency: created.currency,
        amountInPaise: created.amountInPaise + 5000
      })
    ).rejects.toMatchObject({ code: "ORDER_SNAPSHOT_MISMATCH", statusCode: 409 });

    await cleanupTestOrder(created.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("mismatched currency rejects with ORDER_SNAPSHOT_MISMATCH", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const created = await createCheckoutOrder(req, {
      email: "resume-cur@example.com",
      phone: "9876543210",
      shippingFullName: "Resume Cur",
      line1: "1 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay"
    });

    await expect(
      resumePendingCheckout(created.orderNumber, "resume-cur@example.com", {
        currency: "USD",
        amountInPaise: created.amountInPaise
      })
    ).rejects.toMatchObject({ code: "ORDER_SNAPSHOT_MISMATCH", statusCode: 409 });

    await cleanupTestOrder(created.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("Stripe compatible resume: same Order + Payment, new Checkout Session URL", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const created = await createCheckoutOrder(req, {
      email: "resume-stripe@example.com",
      phone: "9876543210",
      shippingFullName: "Resume Stripe",
      line1: "1 Market St",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US",
      paymentMethod: "stripe"
    });

    expect(created.paymentMethod).toBe("stripe");
    expect(created.stripeCheckoutUrl).toBeTruthy();
    const firstUrl = created.stripeCheckoutUrl;

    const resumed = await resumePendingCheckout(created.orderNumber, "resume-stripe@example.com", {
      currency: created.currency,
      amountInPaise: created.amountInPaise
    });

    expect(resumed.orderId).toBe(created.orderId);
    expect(resumed.paymentId).toBe(created.paymentId);
    expect(resumed.paymentMethod).toBe("stripe");
    expect(resumed.stripeCheckoutUrl).toBeTruthy();
    expect(resumed.stripeCheckoutUrl).not.toBe(firstUrl);

    await cleanupTestOrder(created.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("PayPal compatible resume: same Order + Payment, new approval URL", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const created = await createCheckoutOrder(req, {
      email: "resume-paypal@example.com",
      phone: "9876543210",
      shippingFullName: "Resume PayPal",
      line1: "1 Market St",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US",
      paymentMethod: "paypal"
    });

    expect(created.paymentMethod).toBe("paypal");
    expect(created.paypalApprovalUrl).toBeTruthy();
    const firstUrl = created.paypalApprovalUrl;

    const resumed = await resumePendingCheckout(created.orderNumber, "resume-paypal@example.com", {
      currency: created.currency,
      amountInPaise: created.amountInPaise
    });

    expect(resumed.orderId).toBe(created.orderId);
    expect(resumed.paymentId).toBe(created.paymentId);
    expect(resumed.paymentMethod).toBe("paypal");
    expect(resumed.paypalApprovalUrl).toBeTruthy();
    expect(resumed.paypalApprovalUrl).not.toBe(firstUrl);

    await cleanupTestOrder(created.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("create-order after cart change supersedes prior PENDING_PAYMENT and releases stock once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 50, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 2);
    const req = mockRequest({ sessionId });

    const first = await createCheckoutOrder(req, {
      email: "supersede@example.com",
      phone: "9876543210",
      shippingFullName: "Supersede",
      line1: "1 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay"
    });

    expect((await getInventory(bundle.variantId))?.reserved).toBe(2);

    await prisma.cartItem.updateMany({
      where: { cartId },
      data: { quantity: 3 }
    });

    const second = await createCheckoutOrder(req, {
      email: "supersede@example.com",
      phone: "9876543210",
      shippingFullName: "Supersede",
      line1: "1 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay"
    });

    expect(second.orderId).not.toBe(first.orderId);

    const firstOrder = await prisma.order.findUnique({ where: { id: first.orderId } });
    expect(firstOrder?.status).toBe("CANCELLED");

    const inv = await getInventory(bundle.variantId);
    expect(inv?.reserved).toBe(3);
    expect(inv?.onHand).toBe(50);

    await cleanupTestOrder(second.orderId);
    await cleanupTestOrder(first.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });
});
