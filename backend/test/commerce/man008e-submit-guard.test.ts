/**
 * MAN-008E Chunk 1B — submit qty guard against stale client quantities.
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

async function createPartialDecisionOrder() {
  const dummy = await createTestProductWithInventory({
    onHand: 50,
    saleInPaise: 700,
    mrpInPaise: 1200
  });
  const test = await createTestProductWithInventory({
    onHand: 50,
    saleInPaise: 500,
    mrpInPaise: 1000
  });

  const { order, rzpOrderId } = await createPendingRazorpayOrder(dummy, {
    qty: 3,
    unitPriceInPaise: 700
  });
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      variantId: test.variantId,
      skuSnapshot: test.sku,
      nameSnapshot: `Test Product ${test.sku}`,
      qtyOrdered: 2,
      unitPriceInPaise: 500,
      discountInPaise: 0,
      taxInPaise: 0,
      lineTotalInPaise: 1000
    }
  });
  await prisma.orderItem.updateMany({
    where: { orderId: order.id, variantId: dummy.variantId },
    data: { nameSnapshot: `Dummy Product ${dummy.sku}` }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: {
      subtotalInPaise: 3100,
      shippingInPaise: 800,
      discountInPaise: 0,
      grandTotalInPaise: 3900
    }
  });
  await prisma.payment.updateMany({
    where: { orderId: order.id },
    data: { amountInPaise: 3900 }
  });
  await completePaidOrder(rzpOrderId, `pay_m8e1b_${Date.now()}`);
  const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-M8E1B-${Date.now()}`,
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
      email: `m8e1b-${Date.now()}@example.com`,
      role: "CUSTOMER",
      isVerified: true
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { customerId: user.id, email: user.email }
  });

  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const dummyItem = items.find((i) => i.variantId === dummy.variantId)!;
  const testItem = items.find((i) => i.variantId === test.variantId)!;

  // Seed PARTIALLY_APPROVED case matching live RC shape (do not mutate live data).
  await prisma.orderServiceRequest.create({
    data: {
      caseNumber: `RC-TEST-M8E1B-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: user.id,
      customerEmail: user.email,
      type: "REFUND_AFTER_DELIVERY",
      status: "PARTIALLY_APPROVED",
      requestIntent: "REFUND",
      returnPhysicalStatus: "AWAITING_RETURN",
      resolutionStatus: "NONE",
      items: {
        create: [
          {
            orderItemId: dummyItem.id,
            nameSnapshot: dummyItem.nameSnapshot,
            skuSnapshot: dummyItem.skuSnapshot,
            qtySelected: 2,
            reasonCode: "damaged_delivery",
            reasonLabel: "Damaged",
            reviewDecision: "APPROVED",
            requestedResolution: "RETURN_FOR_REFUND"
          },
          {
            orderItemId: testItem.id,
            nameSnapshot: testItem.nameSnapshot,
            skuSnapshot: testItem.skuSnapshot,
            qtySelected: 1,
            reasonCode: "changed_mind",
            reasonLabel: "Changed mind",
            reviewDecision: "REJECTED",
            requestedResolution: "RETURN_FOR_REFUND"
          }
        ]
      }
    }
  });

  return { order, user, dummy, test, dummyItem, testItem, products: [dummy, test] };
}

describe("MAN-008E Chunk 1B — submit qty guard", () => {
  it("stale Dummy qty2 when only 1 remains → reject QTY_EXCEEDS_AVAILABLE", async () => {
    const ctx = await createPartialDecisionOrder();
    try {
      await expect(
        submitReturnReplacementRequest({
          orderNumber: ctx.order.orderNumber,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          items: [
            {
              orderItemId: ctx.dummyItem.id,
              reasonCode: "changed_mind",
              qty: 2,
              requestedResolution: "RETURN_FOR_REFUND"
            }
          ],
          photosByIndex: new Map([[0, [photo]]])
        })
      ).rejects.toMatchObject({
        code: "QTY_EXCEEDS_AVAILABLE",
        message: "Only 1 unit is currently eligible for a new return request."
      });
    } finally {
      await cleanupTestOrder(ctx.order.id);
      await prisma.user.delete({ where: { id: ctx.user.id } }).catch(() => undefined);
      for (const p of ctx.products) await cleanupTestProduct(p);
    }
  });

  it("stale Test qty2 when only 1 remains → reject QTY_EXCEEDS_AVAILABLE", async () => {
    const ctx = await createPartialDecisionOrder();
    try {
      await expect(
        submitReturnReplacementRequest({
          orderNumber: ctx.order.orderNumber,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          items: [
            {
              orderItemId: ctx.testItem.id,
              reasonCode: "changed_mind",
              qty: 2,
              requestedResolution: "RETURN_FOR_REFUND"
            }
          ],
          photosByIndex: new Map([[0, [photo]]])
        })
      ).rejects.toMatchObject({
        code: "QTY_EXCEEDS_AVAILABLE",
        message: "Only 1 unit is currently eligible for a new return request."
      });
    } finally {
      await cleanupTestOrder(ctx.order.id);
      await prisma.user.delete({ where: { id: ctx.user.id } }).catch(() => undefined);
      for (const p of ctx.products) await cleanupTestProduct(p);
    }
  });

  it("request exactly remaining Dummy qty1 → allow", async () => {
    const ctx = await createPartialDecisionOrder();
    try {
      const created = await submitReturnReplacementRequest({
        orderNumber: ctx.order.orderNumber,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        items: [
          {
            orderItemId: ctx.dummyItem.id,
            reasonCode: "changed_mind",
            qty: 1,
            requestedResolution: "RETURN_FOR_REFUND"
          }
        ],
        photosByIndex: new Map([[0, [photo]]])
      });
      expect(created.status).toBe("PENDING_APPROVAL");
      expect(created.items).toHaveLength(1);
      expect(created.items[0]?.qtySelected).toBe(1);
      expect(created.items[0]?.orderItemId).toBe(ctx.dummyItem.id);
    } finally {
      await cleanupTestOrder(ctx.order.id);
      await prisma.user.delete({ where: { id: ctx.user.id } }).catch(() => undefined);
      for (const p of ctx.products) await cleanupTestProduct(p);
    }
  });
});
