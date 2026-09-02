import "./setup-mocks";
import { beforeEach, describe, expect, it } from "vitest";

import { getCommerceMocks } from "./setup-mocks";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import { initiatePartialGatewayRefund } from "../../src/modules/payments/refund.service";
import { executeAuthoritativePartialRefund } from "../../src/modules/payments/partial-refund-settlement.service";
import { buildOrderRefundedPartialJournal } from "../../src/modules/accounting/order-refunded-partial-journal.builder";
import { buildPartialRefundSpecFromBreakdown } from "../../src/modules/accounting/partial-refund-spec.service";
import { loadOrderRefundPreview } from "../../src/modules/orders/order-refund-preview.service";
import {
  executeAdjustmentRequest,
  submitAdjustmentRequest
} from "../../src/modules/orders/order-adjustment.service";
import { createSupplementaryPaymentSession, verifyRazorpaySupplementaryPayment } from "../../src/modules/payments/supplementary-payment.service";

async function paidOrder(qty = 2) {
  const bundle = await createTestProductWithInventory({ onHand: 50 });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty });
  await completePaidOrder(rzpOrderId, `pay_1e_${Date.now()}`);
  return { bundle, order };
}

describe("Phase 1E financial settlement", () => {
  beforeEach(() => {
    const m = getCommerceMocks();
    m.razorpayRefund.mockClear();
    m.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_1e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    }));
  });

  it("partial refund via settlement service does not mark order REFUNDED", async () => {
    const { bundle, order } = await paidOrder(1);
    const pay = await prisma.payment.findFirst({ where: { orderId: order.id } });
    const half = Math.floor((pay!.amountInPaise || order.grandTotalInPaise) / 2);

    const result = await executeAuthoritativePartialRefund({
      orderId: order.id,
      sourceType: "ADMIN_MANUAL",
      sourceId: `test-manual-${order.id}`,
      reason: "Phase 1E partial test",
      manualRefundPaise: half
    });

    expect(result.amountInPaise).toBe(half);
    expect(result.providerRefundId).toBeTruthy();

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).not.toBe("REFUNDED");
    expect(updated?.paymentStatus).toBe("PARTIALLY_REFUNDED");

    const refund = await prisma.refund.findUnique({ where: { id: result.refundId } });
    expect(refund?.sourceType).toBe("ADMIN_MANUAL");
    expect(refund?.settlementStage).toBeTruthy();

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("RTO shipping retained breakdown produces balanced partial journal", async () => {
    const { bundle, order } = await paidOrder(1);
    const preview = await loadOrderRefundPreview(order.id, { policy: "RTO_SHIPPING_RETAINED" });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const spec = buildPartialRefundSpecFromBreakdown({
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      provider: "RAZORPAY",
      refundId: "00000000-0000-4000-8000-000000000001",
      providerRefundId: "rfnd_test",
      breakdown: preview.breakdown,
      sourceType: "RTO",
      sourceId: "shipment-test",
      interState: false,
      isGstApplicable: true,
      accountingDate: new Date()
    });

    const proposal = buildOrderRefundedPartialJournal(spec);
    expect(proposal.balanced).toBe(true);
    expect(spec.shippingRefundPaise).toBe(0);
    expect(spec.totalRefundPaise).toBeLessThanOrEqual(preview.breakdown.remainingRefundableAmountPaise);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("cheaper quantity adjustment executes partial refund path", async () => {
    const { bundle, order } = await paidOrder(2);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(item).toBeTruthy();

    const created = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userEmail: order.email,
      reasonCode: "change_quantity",
      orderItemId: item!.id,
      requestedQty: 1,
      message: "Reduce qty"
    });
    const requestId = created.id;

    const result = await executeAdjustmentRequest({
      orderId: order.id,
      requestId,
      adminEmail: "admin@test.com"
    });

    expect(result.executionStatus).toBe("EXECUTED");

    const refunds = await prisma.refund.findMany({
      where: { sourceType: "ORDER_ADJUSTMENT", sourceId: requestId }
    });
    expect(refunds.some((r) => r.status === "processed")).toBe(true);

    await prisma.orderServiceRequest.deleteMany({ where: { orderId: order.id } });
    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("supplementary payment session is idempotent on requestId", async () => {
    const { bundle, order } = await paidOrder(1);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });

    const expensive = await prisma.productVariant.create({
      data: {
        productId: bundle.productId,
        sku: `${bundle.sku}-UP`,
        mrpInPaise: item!.unitPriceInPaise + 50000,
        saleInPaise: item!.unitPriceInPaise + 50000,
        isDefault: false,
        status: "ACTIVE"
      }
    });
    await prisma.inventory.create({
      data: { variantId: expensive.id, onHand: 20, reserved: 0, lowStockThreshold: 5 }
    });

    const created = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userEmail: order.email,
      reasonCode: "wrong_item",
      orderItemId: item!.id,
      requestedVariantId: expensive.id,
      message: "Upgrade variant"
    });
    const requestId = created.id;

    const s1 = await createSupplementaryPaymentSession({ orderId: order.id, requestId });
    const s2 = await createSupplementaryPaymentSession({ orderId: order.id, requestId });
    expect(s1.supplementaryPaymentId).toBe(s2.supplementaryPaymentId);
    expect(s1.amountInPaise).toBeGreaterThan(0);

    await prisma.orderSupplementaryPayment.deleteMany({ where: { orderId: order.id } });
    await prisma.orderServiceRequest.deleteMany({ where: { orderId: order.id } });
    await prisma.inventory.deleteMany({ where: { variantId: expensive.id } });
    await prisma.productVariant.deleteMany({ where: { id: expensive.id } });
    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("initiatePartialGatewayRefund routes through authoritative settlement", async () => {
    const { bundle, order } = await paidOrder(1);
    const pay = await prisma.payment.findFirst({ where: { orderId: order.id } });
    const partial = Math.floor((pay!.amountInPaise || order.grandTotalInPaise) / 3);

    await initiatePartialGatewayRefund(order.id, partial, "admin partial 1E");

    const refunds = await prisma.refund.findMany({ where: { paymentId: pay!.id, status: "processed" } });
    expect(refunds.length).toBeGreaterThan(0);
    expect(refunds[0]?.sourceType).toBe("ADMIN_MANUAL");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
