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
import { createCheckoutOrder } from "../../src/modules/checkout/checkout.service";
import { cancelUnpaidOrderWithRelease } from "../../src/modules/orders/orders.service";

describe("commerce checkout", () => {
  it("creates PENDING_PAYMENT order and reserves stock for Razorpay checkout", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 40, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 2);
    const req = mockRequest({ sessionId });

    const result = await createCheckoutOrder(req, {
      email: "checkout-test@example.com",
      phone: "9876543210",
      shippingFullName: "Test Shopper",
      line1: "42 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay"
    });

    expect(result.paymentMethod).toBe("razorpay");
    expect(result.paymentProvider).toBe("RAZORPAY");

    const order = await prisma.order.findUnique({ where: { id: result.orderId } });
    expect(order?.status).toBe("PENDING_PAYMENT");
    expect(order?.paymentStatus).toBe("PENDING");

    const inv = await getInventory(bundle.variantId);
    expect(inv?.reserved).toBe(2);

    await cleanupTestOrder(result.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("payment timeout cancels unpaid order and releases reservation", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 15, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const result = await createCheckoutOrder(req, {
      email: "timeout-test@example.com",
      phone: "9876543210",
      shippingFullName: "Timeout Test",
      line1: "99 Residency Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay"
    });

    const changed = await cancelUnpaidOrderWithRelease(
      result.orderId,
      "Payment not completed within 15 minutes — stock released"
    );
    expect(changed).toBe(true);

    const order = await prisma.order.findUnique({ where: { id: result.orderId } });
    expect(order?.status).toBe("CANCELLED");

    const inv = await getInventory(bundle.variantId);
    expect(inv?.reserved).toBe(0);
    expect(inv?.onHand).toBe(15);

    await prisma.orderStatusHistory.deleteMany({ where: { orderId: result.orderId } });
    await cleanupTestOrder(result.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });
});

describe("commerce COD flow", () => {
  it("COD checkout confirms stock and marks order PAID with pending payment", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 12, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const result = await createCheckoutOrder(req, {
      email: "cod-test@example.com",
      phone: "9876543210",
      shippingFullName: "COD Shopper",
      line1: "12 Brigade Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "cod"
    });

    expect(result.paymentMethod).toBe("cod");
    expect(result.codConfirmed).toBe(true);

    const order = await prisma.order.findUnique({
      where: { id: result.orderId },
      include: { payments: true }
    });
    expect(order?.status).toBe("PAID");
    expect(order?.paymentStatus).toBe("PENDING");
    expect(order?.payments[0]?.provider).toBe("COD");

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(11);
    expect(inv?.reserved).toBe(0);

    await cleanupTestOrder(result.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("payment timeout skips COD orders", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 12 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const result = await createCheckoutOrder(req, {
      email: "cod-skip-timeout@example.com",
      phone: "9876543210",
      shippingFullName: "COD Timeout",
      line1: "12 Brigade Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "cod"
    });

    const changed = await cancelUnpaidOrderWithRelease(result.orderId, "Should not cancel COD");
    expect(changed).toBe(false);

    const order = await prisma.order.findUnique({ where: { id: result.orderId } });
    expect(order?.status).toBe("PAID");

    await cleanupTestOrder(result.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });
});
