import "./setup-mocks";
import { describe, expect, it, vi } from "vitest";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import { orderRefundPreview } from "../../src/modules/admin/admin.handlers";
import { loadOrderRefundPreview } from "../../src/modules/orders/order-refund-preview.service";

describe("refund preview API (read-only)", () => {
  it("X — preview loader does not mutate order", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 5 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
    await completePaidOrder(rzpOrderId, `pay_preview_${Date.now()}`);

    const before = await prisma.order.findUnique({ where: { id: order.id } });
    const preview = await loadOrderRefundPreview(order.id);
    const after = await prisma.order.findUnique({ where: { id: order.id } });

    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.breakdown.proposedRefundAmountPaise).toBeGreaterThan(0);
    }
    expect(after?.status).toBe(before?.status);

    const refundCount = await prisma.refund.count({ where: { payment: { orderId: order.id } } });
    expect(refundCount).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("preview HTTP handler returns breakdown without mutation", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 4 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
    await completePaidOrder(rzpOrderId, `pay_http_preview_${Date.now()}`);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const req = { params: { id: order.id }, query: {} } as unknown as import("express").Request;
    const res = { status, json } as unknown as import("express").Response;
    const next = vi.fn();

    await orderRefundPreview(req, res, next);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          breakdown: expect.objectContaining({
            policy: "FULL_PRE_DISPATCH_CANCELLATION"
          })
        })
      })
    );

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
