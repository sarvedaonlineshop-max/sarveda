import "./setup-mocks";
import { describe, expect, it } from "vitest";

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
import { orderItemWarehouseUnits } from "../../src/modules/inventory/order-item-fulfillment";
import {
  getVariantFulfillmentAvailability,
  isCustomerSellable,
  merchantFeedAvailability
} from "../../src/modules/inventory/variant-fulfillment-availability";

function input(onHand: number, reserved: number, dropShipEnabled = false) {
  return { onHand, reserved, dropShipEnabled, hasInventoryRow: true };
}

describe("drop shipping V1 — availability helper", () => {
  it("A: stock 5, dropship false, request 3 → allow warehouse 3", () => {
    const a = getVariantFulfillmentAvailability(input(5, 0, false), 3);
    expect(a.sellable).toBe(true);
    expect(a.warehouseFulfillmentQty).toBe(3);
    expect(a.dropShipFulfillmentQty).toBe(0);
  });

  it("B: stock 5, dropship false, request 6 → reject", () => {
    const a = getVariantFulfillmentAvailability(input(5, 0, false), 6);
    expect(a.sellable).toBe(false);
    expect(a.maxAllowedQty).toBe(5);
  });

  it("C: stock 5, dropship true, request 3 → warehouse 3/drop 0", () => {
    const a = getVariantFulfillmentAvailability(input(5, 0, true), 3);
    expect(a.warehouseFulfillmentQty).toBe(3);
    expect(a.dropShipFulfillmentQty).toBe(0);
  });

  it("D: stock 5, dropship true, request 6 → warehouse 5/drop 1", () => {
    const a = getVariantFulfillmentAvailability(input(5, 0, true), 6);
    expect(a.warehouseFulfillmentQty).toBe(5);
    expect(a.dropShipFulfillmentQty).toBe(1);
  });

  it("E: stock 0, dropship false → OOS", () => {
    expect(isCustomerSellable(input(0, 0, false))).toBe(false);
  });

  it("F: stock 0, dropship true → purchasable", () => {
    expect(isCustomerSellable(input(0, 0, true))).toBe(true);
  });

  it("G: reserved to zero + dropship true → purchasable", () => {
    expect(isCustomerSellable(input(2, 2, true))).toBe(true);
  });
});

describe("drop shipping V1 — stock lifecycle", () => {
  it("M/N: warehouse deduction only warehouse qty, no negative stock", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 2, reserved: 0, dropShipEnabled: true });
    const { order } = await createPendingRazorpayOrder(bundle, { qty: 5 });

    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(item?.warehouseFulfillmentQty).toBe(2);
    expect(item?.dropShipFulfillmentQty).toBe(3);

    await prisma.$transaction(async (tx) => {
      await confirmStockTx(tx, order.id);
    });

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(0);
    expect(inv?.reserved).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("O: cancellation restores only warehouse qty", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 2, reserved: 0, dropShipEnabled: true });
    const { order } = await createPendingRazorpayOrder(bundle, { qty: 5 });

    await prisma.$transaction(async (tx) => {
      await confirmStockTx(tx, order.id);
    });

    await prisma.$transaction(async (tx) => {
      await restockPaidOrderTx(tx, order.id);
    });

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(2);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("reserve uses warehouse snapshot only", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 3, reserved: 0, dropShipEnabled: true });
    const { order } = await createPendingRazorpayOrder(bundle, { qty: 8 });

    const inv = await getInventory(bundle.variantId);
    expect(inv?.reserved).toBe(3);

    await cancelUnpaidOrderWithRelease(order.id, "test");
    const after = await getInventory(bundle.variantId);
    expect(after?.reserved).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("non-dropship still blocks over-request", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 2, reserved: 0, dropShipEnabled: false });
    await expect(createPendingRazorpayOrder(bundle, { qty: 3 })).rejects.toMatchObject({
      code: "OUT_OF_STOCK"
    });
    await cleanupTestProduct(bundle);
  });
});

describe("drop shipping V1 — merchant feed", () => {
  it("W/X: zero-stock dropship in_stock; non-dropship out_of_stock", () => {
    expect(merchantFeedAvailability(0, 0, true)).toBe("in_stock");
    expect(merchantFeedAvailability(0, 0, false)).toBe("out_of_stock");
  });
});

describe("drop shipping V1 — order item warehouse units", () => {
  it("uses snapshot when present", () => {
    expect(
      orderItemWarehouseUnits({
        qtyOrdered: 5,
        warehouseFulfillmentQty: 2,
        dropShipFulfillmentQty: 3
      })
    ).toBe(2);
  });
});
