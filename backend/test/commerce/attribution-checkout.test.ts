import "./setup-mocks";
import { describe, expect, it } from "vitest";

import {
  cleanupGuestCart,
  cleanupTestOrder,
  cleanupTestProduct,
  createGuestCartWithItem,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  mockRequest,
  prisma
} from "../helpers/commerce";
import { createCheckoutOrder, resumePendingCheckout } from "../../src/modules/checkout/checkout.service";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";

const chatgptAttribution = {
  sourceType: "Referral",
  firstSource: "chatgpt.com",
  firstMedium: "referral",
  firstReferrer: "https://chatgpt.com/",
  firstLandingPage: "/shop",
  lastSource: "chatgpt.com",
  lastMedium: "referral",
  lastReferrer: "https://chatgpt.com/",
  lastLandingPage: "/product/test-bowl",
  referringDomain: "chatgpt.com",
  landingPath: "/product/test-bowl",
  sessionPageViews: 12,
  sessionStartedAt: new Date(Date.now() - 60_000).toISOString(),
  capturedAt: new Date().toISOString()
};

describe("commerce order attribution", () => {
  it("create-order with attribution persists OrderAttribution", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({
      sessionId,
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      }
    });

    const result = await createCheckoutOrder(req, {
      email: "attr-persist@example.com",
      phone: "9876543210",
      shippingFullName: "Attr Test",
      line1: "1 Test St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay",
      attribution: chatgptAttribution
    });

    const attr = await prisma.orderAttribution.findUnique({ where: { orderId: result.orderId } });
    expect(attr).not.toBeNull();
    expect(attr?.sourceType).toBe("Referral");
    expect(attr?.referringDomain).toBe("chatgpt.com");
    expect(attr?.sessionPageViews).toBe(12);
    expect(attr?.deviceType).toBe("MOBILE");
    expect(attr?.firstSource).toBe("chatgpt.com");

    await cleanupTestOrder(result.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("create-order without attribution still succeeds", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const result = await createCheckoutOrder(req, {
      email: "attr-none@example.com",
      phone: "9876543210",
      shippingFullName: "No Attr",
      line1: "1 Test St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay"
    });

    expect(result.orderId).toBeTruthy();
    const attr = await prisma.orderAttribution.findUnique({ where: { orderId: result.orderId } });
    expect(attr).toBeNull();

    await cleanupTestOrder(result.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("malformed attribution does not break checkout", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const result = await createCheckoutOrder(req, {
      email: "attr-bad@example.com",
      phone: "9876543210",
      shippingFullName: "Bad Attr",
      line1: "1 Test St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay",
      attribution: "totally-invalid" as unknown as never
    });

    expect(result.orderId).toBeTruthy();
    const attr = await prisma.orderAttribution.findUnique({ where: { orderId: result.orderId } });
    expect(attr).toBeNull();

    await cleanupTestOrder(result.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("resume same Order does NOT overwrite attribution", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const created = await createCheckoutOrder(req, {
      email: "attr-resume@example.com",
      phone: "9876543210",
      shippingFullName: "Resume Attr",
      line1: "1 Test St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay",
      attribution: chatgptAttribution
    });

    const before = await prisma.orderAttribution.findUnique({ where: { orderId: created.orderId } });
    expect(before?.referringDomain).toBe("chatgpt.com");

    await resumePendingCheckout(created.orderNumber, "attr-resume@example.com");

    const after = await prisma.orderAttribution.findUnique({ where: { orderId: created.orderId } });
    expect(after?.id).toBe(before?.id);
    expect(after?.referringDomain).toBe("chatgpt.com");
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());

    await cleanupTestOrder(created.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("new create-order receives a new attribution snapshot", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 40, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const first = await createCheckoutOrder(req, {
      email: "attr-newsnap@example.com",
      phone: "9876543210",
      shippingFullName: "Snap One",
      line1: "1 Test St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay",
      attribution: chatgptAttribution
    });

    const second = await createCheckoutOrder(req, {
      email: "attr-newsnap@example.com",
      phone: "9876543210",
      shippingFullName: "Snap Two",
      line1: "1 Test St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay",
      attribution: {
        ...chatgptAttribution,
        referringDomain: "instagram.com",
        lastReferrer: "https://www.instagram.com/",
        lastSource: "instagram.com",
        lastMedium: "social",
        sessionPageViews: 3
      }
    });

    expect(second.orderId).not.toBe(first.orderId);

    const firstAttr = await prisma.orderAttribution.findUnique({ where: { orderId: first.orderId } });
    const secondAttr = await prisma.orderAttribution.findUnique({ where: { orderId: second.orderId } });
    // Cancelled predecessor keeps its snapshot; new order gets a fresh snapshot
    expect(firstAttr?.referringDomain).toBe("chatgpt.com");
    expect(secondAttr?.referringDomain).toBe("instagram.com");
    expect(secondAttr?.sourceType).toBe("Social");
    expect(secondAttr?.sessionPageViews).toBe(3);

    await cleanupTestOrder(first.orderId);
    await cleanupTestOrder(second.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("payment completion does NOT mutate attribution", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const created = await createCheckoutOrder(req, {
      email: "attr-pay@example.com",
      phone: "9876543210",
      shippingFullName: "Pay Attr",
      line1: "1 Test St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay",
      attribution: chatgptAttribution
    });

    const before = await prisma.orderAttribution.findUnique({ where: { orderId: created.orderId } });
    expect(before).not.toBeNull();

    await completePaidOrder(created.rzpOrderId!, `pay_attr_${Date.now()}`);

    const after = await prisma.orderAttribution.findUnique({ where: { orderId: created.orderId } });
    expect(after?.id).toBe(before?.id);
    expect(after?.referringDomain).toBe(before?.referringDomain);
    expect(after?.sourceType).toBe(before?.sourceType);
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());

    await cleanupTestOrder(created.orderId);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });

  it("admin order detail include returns attribution; historical null works", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { cartId, sessionId } = await createGuestCartWithItem(bundle.variantId, 1);
    const req = mockRequest({ sessionId });

    const withAttr = await createCheckoutOrder(req, {
      email: "attr-admin@example.com",
      phone: "9876543210",
      shippingFullName: "Admin Attr",
      line1: "1 Test St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
      paymentMethod: "razorpay",
      attribution: chatgptAttribution
    });

    const loaded = await prisma.order.findUnique({
      where: { id: withAttr.orderId },
      include: { attribution: true }
    });
    expect(loaded?.attribution?.referringDomain).toBe("chatgpt.com");

    const { order: histOrder } = await createPendingRazorpayOrder(bundle);
    const hist = await prisma.order.findUnique({
      where: { id: histOrder.id },
      include: { attribution: true }
    });
    expect(hist?.attribution).toBeNull();

    await cleanupTestOrder(withAttr.orderId);
    await cleanupTestOrder(histOrder.id);
    await cleanupGuestCart(cartId);
    await cleanupTestProduct(bundle);
  });
});
