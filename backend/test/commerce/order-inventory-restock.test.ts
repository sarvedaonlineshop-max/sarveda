import "./setup-mocks";
import { OrderInventoryRestockDisposition } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  getInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import {
  initiateGatewayRefund,
  initiatePartialGatewayRefund
} from "../../src/modules/payments/refund.service";
import {
  adminApplyInventoryRestock,
  listOrderInventoryRestocks
} from "../../src/modules/orders/order-inventory-restock.service";
import { handlePaidOrderStatusChange } from "../../src/modules/orders/orders.service";
import { getCommerceMocks } from "./setup-mocks";

describe("order inventory restock events (Phase 3D4 ops)", () => {
  beforeEach(() => {
    const commerceMocks = getCommerceMocks();
    commerceMocks.createZohoRefundDocumentsForOrder.mockClear();
    commerceMocks.razorpayRefund.mockClear();
  });

  it("full refund creates SELLABLE restock events and restores onHand once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 3 });
    await completePaidOrder(rzpOrderId, `pay_restock_${Date.now()}`);

    expect((await getInventory(bundle.variantId))?.onHand).toBe(7);

    const result = await initiateGatewayRefund(order.id, "Test restock provenance");
    expect(result.success).toBe(true);
    expect((await getInventory(bundle.variantId))?.onHand).toBe(10);

    const events = await listOrderInventoryRestocks(order.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.disposition).toBe(OrderInventoryRestockDisposition.SELLABLE);
    expect(events[0]?.quantity).toBe(3);
    expect(events[0]?.inventoryIncremented).toBe(true);
    expect(events[0]?.sourceType).toBe("FULL_ORDER_STATUS_CHANGE");
    expect(events[0]?.sourceId).toBe(`${order.id}:REFUNDED`);
    expect(events[0]?.orderItemId).toBeTruthy();

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("duplicate full-order restock source does not double-increment onHand", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 5 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    await completePaidOrder(rzpOrderId, `pay_dup_${Date.now()}`);

    await handlePaidOrderStatusChange(order.id, "REFUNDED", "first");
    expect((await getInventory(bundle.variantId))?.onHand).toBe(5);

    await handlePaidOrderStatusChange(order.id, "REFUNDED", "second");
    expect((await getInventory(bundle.variantId))?.onHand).toBe(5);

    const events = await listOrderInventoryRestocks(order.id);
    expect(events).toHaveLength(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("partial monetary refund does not create restock events or restore stock", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 8 });
    const { order, rzpOrderId, qty } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    await completePaidOrder(rzpOrderId, `pay_partial_${Date.now()}`);

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const partial = Math.floor(paid.grandTotalInPaise / 2);
    await initiatePartialGatewayRefund(order.id, partial, "money only");

    expect((await getInventory(bundle.variantId))?.onHand).toBe(8 - qty);
    expect(await listOrderInventoryRestocks(order.id)).toHaveLength(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("admin explicit SELLABLE restock increments onHand and records event", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 12 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 4 });
    await completePaidOrder(rzpOrderId, `pay_admin_${Date.now()}`);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

    const { events, sourceId } = await adminApplyInventoryRestock({
      orderId: order.id,
      body: {
        idempotencyKey: `admin-restock-${order.id}`,
        reason: "Customer returned 2 sellable units",
        lines: [
          {
            orderItemId: item.id,
            quantity: 2,
            disposition: OrderInventoryRestockDisposition.SELLABLE
          }
        ]
      }
    });

    expect(sourceId).toBe(`admin-restock-${order.id}`);
    expect(events).toHaveLength(1);
    expect(events[0]?.inventoryIncremented).toBe(true);
    expect((await getInventory(bundle.variantId))?.onHand).toBe(10);

    await adminApplyInventoryRestock({
      orderId: order.id,
      body: {
        idempotencyKey: `admin-restock-${order.id}`,
        lines: [
          {
            orderItemId: item.id,
            quantity: 2,
            disposition: OrderInventoryRestockDisposition.SELLABLE
          }
        ]
      }
    });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(10);
    expect(await listOrderInventoryRestocks(order.id)).toHaveLength(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("DAMAGED disposition records event without incrementing onHand", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 6 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    await completePaidOrder(rzpOrderId, `pay_dmg_${Date.now()}`);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

    await adminApplyInventoryRestock({
      orderId: order.id,
      body: {
        reason: "Broken on return",
        lines: [
          {
            orderItemId: item.id,
            quantity: 1,
            disposition: OrderInventoryRestockDisposition.DAMAGED
          }
        ]
      }
    });

    expect((await getInventory(bundle.variantId))?.onHand).toBe(4);
    const events = await listOrderInventoryRestocks(order.id);
    expect(events[0]?.disposition).toBe(OrderInventoryRestockDisposition.DAMAGED);
    expect(events[0]?.inventoryIncremented).toBe(false);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("rejects restock quantity greater than remaining returnable", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 9 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    await completePaidOrder(rzpOrderId, `pay_over_${Date.now()}`);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

    await expect(
      adminApplyInventoryRestock({
        orderId: order.id,
        body: {
          lines: [
            {
              orderItemId: item.id,
              quantity: 3,
              disposition: OrderInventoryRestockDisposition.SELLABLE
            }
          ]
        }
      })
    ).rejects.toMatchObject({ code: "RESTOCK_QTY_EXCEEDS_REMAINING" });

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("supports multiple partial SELLABLE returns on one OrderItem", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 5 });
    await completePaidOrder(rzpOrderId, `pay_multi_${Date.now()}`);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

    await adminApplyInventoryRestock({
      orderId: order.id,
      body: {
        idempotencyKey: `partial-1-${order.id}`,
        lines: [
          {
            orderItemId: item.id,
            quantity: 2,
            disposition: OrderInventoryRestockDisposition.SELLABLE
          }
        ]
      }
    });
    await adminApplyInventoryRestock({
      orderId: order.id,
      body: {
        idempotencyKey: `partial-2-${order.id}`,
        lines: [
          {
            orderItemId: item.id,
            quantity: 1,
            disposition: OrderInventoryRestockDisposition.SELLABLE
          }
        ]
      }
    });

    expect((await getInventory(bundle.variantId))?.onHand).toBe(18);
    const events = await listOrderInventoryRestocks(order.id);
    expect(events).toHaveLength(2);
    expect(events.reduce((s, e) => s + e.quantity, 0)).toBe(3);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
