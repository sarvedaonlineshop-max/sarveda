import "./setup-mocks";
import { beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  getInventory,
  prisma
} from "../helpers/commerce";
import {
  cancelUnpaidOrderWithRelease,
  confirmStockTx,
  releaseStockTx,
  reserveStockTx,
  restockPaidOrderTx
} from "../../src/modules/orders/orders.service";

describe("commerce stock reservation and confirmation", () => {
  beforeEach(async () => {
    // isolated per-test products
  });

  it("checkout path reserves stock on pending order", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 50, reserved: 0 });
    const { order, qty } = await createPendingRazorpayOrder(bundle, { qty: 2 });

    const inv = await getInventory(bundle.variantId);
    expect(inv?.reserved).toBe(2);
    expect(inv?.onHand).toBe(50);

    await cancelUnpaidOrderWithRelease(order.id, "Test cleanup");
    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("successful payment confirm reduces onHand exactly once per qty", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 40, reserved: 0 });
    const { order, qty } = await createPendingRazorpayOrder(bundle, { qty: 3 });

    await prisma.$transaction(async (tx) => {
      await confirmStockTx(tx, order.id);
    });

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(40 - qty);
    expect(inv?.reserved).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("failed payment path releases reservation", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 30, reserved: 0 });
    const { order } = await createPendingRazorpayOrder(bundle, { qty: 2 });

    await cancelUnpaidOrderWithRelease(order.id, "Test payment failed");

    const inv = await getInventory(bundle.variantId);
    expect(inv?.reserved).toBe(0);
    expect(inv?.onHand).toBe(30);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("CANCELLED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("full refund restock restores onHand", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20, reserved: 0 });
    const { order, qty } = await createPendingRazorpayOrder(bundle, { qty: 2 });

    await prisma.$transaction(async (tx) => {
      await confirmStockTx(tx, order.id);
    });

    await prisma.$transaction(async (tx) => {
      await restockPaidOrderTx(tx, order.id);
    });

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(20);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("reserveStockTx rejects when insufficient available stock", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 1, reserved: 0 });
    const order = await prisma.order.create({
      data: {
        orderNumber: `SRV-NOSTK-${Date.now()}`,
        email: "nostock@example.com",
        phone: "9876543210",
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        subtotalInPaise: 1000,
        grandTotalInPaise: 1000,
        items: {
          create: {
            variantId: bundle.variantId,
            skuSnapshot: bundle.sku,
            nameSnapshot: "Test",
            qtyOrdered: 5,
            unitPriceInPaise: 200,
            lineTotalInPaise: 1000
          }
        }
      }
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await reserveStockTx(tx, order.id);
      })
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK" });

    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await cleanupTestProduct(bundle);
  });
});
