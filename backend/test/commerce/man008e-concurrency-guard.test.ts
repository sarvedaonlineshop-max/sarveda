/**
 * MAN-008E Chunk 1C — concurrent submit must not double-claim last unit.
 */
import "./setup-mocks";
import { describe, expect, it } from "vitest";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import { submitReturnReplacementRequest } from "../../src/modules/orders/return-replacement.service";

const photo = {
  buffer: Buffer.from("x"),
  originalname: "a.jpg",
  mimetype: "image/jpeg",
  size: 1
};

async function createDeliveredOrderQty1() {
  const bundle = await createTestProductWithInventory({ onHand: 50 });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
  await completePaidOrder(rzpOrderId, `pay_m8e1c_${Date.now()}`);
  const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-M8E1C-${Date.now()}`,
      status: "DELIVERED",
      deliveredAt
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED", fulfillmentStatus: "FULFILLED" }
  });
  const user = await prisma.user.create({
    data: {
      email: `m8e1c-${Date.now()}@example.com`,
      role: "CUSTOMER",
      isVerified: true
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { customerId: user.id, email: user.email }
  });
  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  return { bundle, order, user, orderItem };
}

describe("MAN-008E Chunk 1C — concurrency guard", () => {
  it("two simultaneous qty1 submits for last remaining unit → one success, one reject", async () => {
    const ctx = await createDeliveredOrderQty1();
    try {
      const payload = {
        orderNumber: ctx.order.orderNumber,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        items: [
          {
            orderItemId: ctx.orderItem.id,
            reasonCode: "changed_mind" as const,
            qty: 1,
            requestedResolution: "RETURN_FOR_REFUND" as const
          }
        ],
        photosByIndex: new Map([[0, [photo]]])
      };

      const results = await Promise.allSettled([
        submitReturnReplacementRequest(payload),
        submitReturnReplacementRequest({
          ...payload,
          photosByIndex: new Map([[0, [photo]]])
        })
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const err = (rejected[0] as PromiseRejectedResult).reason as Error & { code?: string };
      expect(["QTY_EXCEEDS_AVAILABLE", "REQUEST_PENDING"]).toContain(err.code);

      const cases = await prisma.orderServiceRequest.findMany({
        where: { orderId: ctx.order.id, type: "REFUND_AFTER_DELIVERY" }
      });
      expect(cases).toHaveLength(1);
      expect(cases[0]?.status).toBe("PENDING_APPROVAL");
    } finally {
      await cleanupTestOrder(ctx.order.id);
      await prisma.user.delete({ where: { id: ctx.user.id } }).catch(() => undefined);
      await cleanupTestProduct(ctx.bundle);
    }
  });
});
