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
import {
  initiateGatewayRefund,
  initiatePartialGatewayRefund
} from "../../src/modules/payments/refund.service";
import { applyExternalProviderRefund } from "../../src/modules/payments/refund-sync.service";

describe("Phase 7C.1 refund hardening", () => {
  beforeEach(() => {
    const m = getCommerceMocks();
    m.createZohoRefundDocumentsForOrder.mockClear();
    m.razorpayRefund.mockClear();
    m.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    }));
  });

  async function paidOrder() {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
    const rzpPaymentId = `pay_h_${Date.now()}`;
    await completePaidOrder(rzpOrderId, rzpPaymentId);
    return { bundle, order, rzpPaymentId };
  }

  it("Razorpay full refund creates processed Refund + REFUNDED", async () => {
    const { bundle, order } = await paidOrder();
    const result = await initiateGatewayRefund(order.id, "full");
    expect(result.success).toBe(true);
    expect(result.refundId).toBeTruthy();

    const pay = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(pay?.status).toBe("REFUNDED");
    const refunds = await prisma.refund.findMany({ where: { paymentId: pay!.id } });
    expect(refunds.some((r) => r.status === "processed" && r.providerRefundId)).toBe(true);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("REFUNDED");
    expect(updated?.paymentStatus).toBe("REFUNDED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("Razorpay partial refund does not mark order REFUNDED", async () => {
    const { bundle, order } = await paidOrder();
    const pay = await prisma.payment.findFirst({ where: { orderId: order.id } });
    const half = Math.floor((pay!.amountInPaise || order.grandTotalInPaise) / 2);

    const result = await initiatePartialGatewayRefund(order.id, half, "partial");
    expect(result.success).toBe(true);

    const updatedPay = await prisma.payment.findUnique({ where: { id: pay!.id } });
    expect(updatedPay?.status).toBe("PARTIALLY_REFUNDED");
    expect(updatedPay?.refundedInPaise).toBe(half);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).not.toBe("REFUNDED");
    expect(updated?.paymentStatus).toBe("PARTIALLY_REFUNDED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("Razorpay duplicate / concurrent admin refund cannot over-refund", async () => {
    const { bundle, order } = await paidOrder();
    const pay = await prisma.payment.findFirst({ where: { orderId: order.id } });
    const amount = pay!.amountInPaise || order.grandTotalInPaise;

    const [a, b] = await Promise.allSettled([
      initiateGatewayRefund(order.id, "concurrent-a"),
      initiateGatewayRefund(order.id, "concurrent-b")
    ]);

    const successes = [a, b].filter((r) => r.status === "fulfilled");
    const failures = [a, b].filter((r) => r.status === "rejected");
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const refunds = await prisma.refund.findMany({
      where: { paymentId: pay!.id, status: "processed" }
    });
    const total = refunds.reduce((s, r) => s + r.amountInPaise, 0);
    expect(total).toBe(amount);
    expect(getCommerceMocks().razorpayRefund.mock.calls.length).toBe(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("Razorpay duplicate webhook is idempotent and partial stays partial", async () => {
    const { bundle, order, rzpPaymentId } = await paidOrder();
    const pay = await prisma.payment.findFirst({ where: { orderId: order.id } });
    const half = Math.floor((pay!.amountInPaise || order.grandTotalInPaise) / 2);
    const providerRefundId = `rfnd_wh_${Date.now()}`;

    const first = await applyExternalProviderRefund({
      provider: "RAZORPAY",
      providerRefundId,
      providerPaymentId: rzpPaymentId,
      amountInPaise: half,
      reason: "webhook partial",
      refundStatus: "processed"
    });
    expect(first.newlyRecorded).toBe(true);
    expect(first.fullyRefunded).toBe(false);

    const second = await applyExternalProviderRefund({
      provider: "RAZORPAY",
      providerRefundId,
      providerPaymentId: rzpPaymentId,
      amountInPaise: half,
      reason: "webhook partial replay",
      refundStatus: "processed"
    });
    expect(second.duplicate).toBe(true);

    const count = await prisma.refund.count({
      where: { paymentId: pay!.id, providerRefundId }
    });
    expect(count).toBe(1);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).not.toBe("REFUNDED");
    expect(updated?.paymentStatus).toBe("PARTIALLY_REFUNDED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("Stripe webhook recovery creates Refund and supports full after partial", async () => {
    const { bundle, order } = await paidOrder();
    const pay = await prisma.payment.update({
      where: { id: (await prisma.payment.findFirst({ where: { orderId: order.id } }))!.id },
      data: { provider: "STRIPE", providerPaymentId: `pi_${Date.now()}` }
    });
    const captured = pay.amountInPaise;
    const half = Math.floor(captured / 2);
    const r1 = `re_${Date.now()}_a`;
    const r2 = `re_${Date.now()}_b`;

    await applyExternalProviderRefund({
      provider: "STRIPE",
      providerRefundId: r1,
      providerPaymentId: pay.providerPaymentId,
      amountInPaise: half,
      reason: "stripe partial",
      refundStatus: "succeeded"
    });

    let row = await prisma.payment.findUnique({ where: { id: pay.id } });
    expect(row?.status).toBe("PARTIALLY_REFUNDED");
    expect(row?.refundedInPaise).toBe(half);

    await applyExternalProviderRefund({
      provider: "STRIPE",
      providerRefundId: r2,
      providerPaymentId: pay.providerPaymentId,
      amountInPaise: captured - half,
      reason: "stripe remainder",
      refundStatus: "succeeded"
    });

    row = await prisma.payment.findUnique({ where: { id: pay.id } });
    expect(row?.status).toBe("REFUNDED");
    expect(row?.refundedInPaise).toBe(captured);

    const dup = await applyExternalProviderRefund({
      provider: "STRIPE",
      providerRefundId: r2,
      providerPaymentId: pay.providerPaymentId,
      amountInPaise: captured - half,
      reason: "stripe remainder replay",
      refundStatus: "succeeded"
    });
    expect(dup.duplicate).toBe(true);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("PayPal webhook creates authoritative Refund (not status-only)", async () => {
    const { bundle, order } = await paidOrder();
    const pay = await prisma.payment.update({
      where: { id: (await prisma.payment.findFirst({ where: { orderId: order.id } }))!.id },
      data: { provider: "PAYPAL", providerPaymentId: `cap_${Date.now()}` }
    });
    const amount = pay.amountInPaise;
    const providerRefundId = `pp_rfnd_${Date.now()}`;

    const result = await applyExternalProviderRefund({
      provider: "PAYPAL",
      providerRefundId,
      providerPaymentId: pay.providerPaymentId,
      paymentDbId: pay.id,
      amountInPaise: amount,
      reason: "PayPal PAYMENT.REFUND.COMPLETED",
      refundStatus: "processed"
    });
    expect(result.newlyRecorded).toBe(true);
    expect(result.fullyRefunded).toBe(true);

    const refund = await prisma.refund.findFirst({ where: { providerRefundId } });
    expect(refund?.status).toBe("processed");
    expect(refund?.amountInPaise).toBe(amount);

    const updatedPay = await prisma.payment.findUnique({ where: { id: pay.id } });
    expect(updatedPay?.refundedInPaise).toBe(amount);
    expect(updatedPay?.status).toBe("REFUNDED");

    const replay = await applyExternalProviderRefund({
      provider: "PAYPAL",
      providerRefundId,
      providerPaymentId: pay.providerPaymentId,
      paymentDbId: pay.id,
      amountInPaise: amount,
      reason: "replay",
      refundStatus: "processed"
    });
    expect(replay.duplicate).toBe(true);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("refund amount cannot exceed remaining (after prior partial)", async () => {
    const { bundle, order } = await paidOrder();
    const pay = await prisma.payment.findFirst({ where: { orderId: order.id } });
    const captured = pay!.amountInPaise || order.grandTotalInPaise;
    const half = Math.floor(captured / 2);

    await initiatePartialGatewayRefund(order.id, half, "first");
    await expect(initiatePartialGatewayRefund(order.id, captured, "too much")).rejects.toMatchObject({
      code: "AMOUNT_TOO_HIGH"
    });

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("full refund after previous partial uses remaining only", async () => {
    const { bundle, order } = await paidOrder();
    const pay = await prisma.payment.findFirst({ where: { orderId: order.id } });
    const captured = pay!.amountInPaise || order.grandTotalInPaise;
    const half = Math.floor(captured / 2);

    await initiatePartialGatewayRefund(order.id, half, "partial first");
    const full = await initiateGatewayRefund(order.id, "remainder as full");
    expect(full.success).toBe(true);

    const updatedPay = await prisma.payment.findUnique({ where: { id: pay!.id } });
    expect(updatedPay?.status).toBe("REFUNDED");
    expect(updatedPay?.refundedInPaise).toBe(captured);

    const processed = await prisma.refund.findMany({
      where: { paymentId: pay!.id, status: "processed" }
    });
    expect(processed.reduce((s, r) => s + r.amountInPaise, 0)).toBe(captured);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("provider failure marks reserved refund failed and releases capacity", async () => {
    const { bundle, order } = await paidOrder();
    getCommerceMocks().razorpayRefund.mockRejectedValueOnce(new Error("gateway down"));

    await expect(initiateGatewayRefund(order.id, "fail")).rejects.toMatchObject({
      code: "REFUND_FAILED"
    });

    const pay = await prisma.payment.findFirst({ where: { orderId: order.id } });
    const failed = await prisma.refund.findMany({ where: { paymentId: pay!.id, status: "failed" } });
    expect(failed.length).toBeGreaterThanOrEqual(1);

    // Capacity released — retry can succeed
    getCommerceMocks().razorpayRefund.mockResolvedValueOnce({ id: `rfnd_retry_${Date.now()}` });
    const ok = await initiateGatewayRefund(order.id, "retry");
    expect(ok.success).toBe(true);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
