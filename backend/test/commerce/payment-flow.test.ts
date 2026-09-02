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

describe("commerce payment completion", () => {
  beforeEach(() => {
    const commerceMocks = getCommerceMocks();
    commerceMocks.createZohoInvoiceForOrder.mockClear();
    commerceMocks.recordZohoPaymentForOrder.mockClear();
    commerceMocks.ensureOrderInvoicePdf.mockClear();
  });

  it("successful payment transitions order to PAID", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 25 });
    const { order, payment, rzpOrderId } = await createPendingRazorpayOrder(bundle);
    const rzpPaymentId = `pay_test_${Date.now()}`;

    const result = await completePaidOrder(rzpOrderId, rzpPaymentId);
    expect(result.orderNumber).toBe(order.orderNumber);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("PAID");
    expect(updated?.paymentStatus).toBe("CAPTURED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("successful payment reduces stock exactly once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 25 });
    const { order, rzpOrderId, qty } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    const rzpPaymentId = `pay_test_${Date.now()}`;

    await completePaidOrder(rzpOrderId, rzpPaymentId);

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(25 - qty);
    expect(inv?.reserved).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("duplicate successful payment/webhook cannot double-decrement stock", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 25 });
    const { order, rzpOrderId, qty } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    const rzpPaymentId = `pay_dup_${Date.now()}`;

    await completePaidOrder(rzpOrderId, rzpPaymentId);
    await completePaidOrder(rzpOrderId, rzpPaymentId);

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(25 - qty);

    const payments = await prisma.payment.findMany({
      where: { orderId: order.id, providerPaymentId: rzpPaymentId, status: "CAPTURED" }
    });
    expect(payments.length).toBe(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});

describe("commerce after-paid side effects (mocked externals)", () => {
  beforeEach(() => {
    const commerceMocks = getCommerceMocks();
    Object.values(commerceMocks).forEach((fn) => {
      if (typeof fn === "function" && "mockClear" in fn) fn.mockClear();
    });
  });

  it("GST invoice generation still occurs via ensureOrderInvoicePdf", async () => {
    const commerceMocks = getCommerceMocks();
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle);
    await completePaidOrder(rzpOrderId, `pay_inv_${Date.now()}`);

    expect(commerceMocks.ensureOrderInvoicePdf).toHaveBeenCalledWith(order.id);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("does not call Zoho after paid (native accounting only)", async () => {
    const commerceMocks = getCommerceMocks();
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle);
    await completePaidOrder(rzpOrderId, `pay_zoho_${Date.now()}`);

    expect(commerceMocks.createZohoInvoiceForOrder).not.toHaveBeenCalled();
    expect(commerceMocks.recordZohoPaymentForOrder).not.toHaveBeenCalled();

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});

describe("commerce with NATIVE_ACCOUNTING_ENABLED=0", () => {
  it("does not create accounting posting events when flag is off", async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "0";
    const before = await prisma.accountingPostingEvent.count();

    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle);
    await completePaidOrder(rzpOrderId, `pay_flag_${Date.now()}`);

    const after = await prisma.accountingPostingEvent.count();
    expect(after).toBe(before);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
