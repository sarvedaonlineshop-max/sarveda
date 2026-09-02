/**
 * Lightsail staging certification for Drop Shipping V1 (read/write test fixtures only).
 * Run: cd ~/sarveda/backend && npx tsx scripts/dropship-cert-lightsail.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

import { orderItemWarehouseUnits } from "../src/modules/inventory/order-item-fulfillment";
import {
  getVariantFulfillmentAvailability,
  isCustomerSellable,
  merchantFeedAvailability,
  variantFulfillmentInputFromVariant
} from "../src/modules/inventory/variant-fulfillment-availability";
import { addCartItem, getCartPayload } from "../src/modules/cart/cart.service";
import {
  confirmStockTx,
  reserveStockTx,
  restockPaidOrderTx
} from "../src/modules/orders/orders.service";

const prisma = new PrismaClient();

type Check = { name: string; ok: boolean; detail?: unknown };

async function main() {
  const checks: Check[] = [];
  const push = (name: string, ok: boolean, detail?: unknown) => {
    checks.push({ name, ok, detail });
    console.log(ok ? "PASS" : "FAIL", name, detail ? JSON.stringify(detail) : "");
  };

  const zeroDropExact = await prisma.$queryRaw<
    Array<{ id: string; sku: string; onHand: number; reserved: number; slug: string }>
  >`
    SELECT v.id, v.sku, i."onHand", i.reserved, p.slug
    FROM "ProductVariant" v
    JOIN "Inventory" i ON i."variantId"=v.id
    JOIN "Product" p ON p.id=v."productId"
    WHERE v."dropShipEnabled"=true AND GREATEST(0,i."onHand"-i.reserved)=0
      AND v.status='ACTIVE' AND p.status='ACTIVE' AND p."deletedAt" IS NULL AND p."catalogHidden"=false
    LIMIT 1`;
  const zeroNon = await prisma.$queryRaw<
    Array<{ id: string; sku: string; onHand: number; reserved: number; slug: string }>
  >`
    SELECT v.id, v.sku, i."onHand", i.reserved, p.slug
    FROM "ProductVariant" v
    JOIN "Inventory" i ON i."variantId"=v.id
    JOIN "Product" p ON p.id=v."productId"
    WHERE v."dropShipEnabled"=false AND GREATEST(0,i."onHand"-i.reserved)=0
      AND v.status='ACTIVE' AND p.status='ACTIVE' AND p."deletedAt" IS NULL AND p."catalogHidden"=false
    LIMIT 1`;
  const mixedDrop = await prisma.$queryRaw<
    Array<{ id: string; sku: string; onHand: number; reserved: number; slug: string; available: number }>
  >`
    SELECT v.id, v.sku, i."onHand", i.reserved, p.slug, GREATEST(0,i."onHand"-i.reserved)::int as available
    FROM "ProductVariant" v
    JOIN "Inventory" i ON i."variantId"=v.id
    JOIN "Product" p ON p.id=v."productId"
    WHERE v."dropShipEnabled"=true AND GREATEST(0,i."onHand"-i.reserved) BETWEEN 1 AND 5
      AND v.status='ACTIVE' AND p.status='ACTIVE' AND p."deletedAt" IS NULL AND p."catalogHidden"=false
    LIMIT 1`;
  const warehouseOnly = await prisma.$queryRaw<
    Array<{ id: string; sku: string; onHand: number; reserved: number; available: number }>
  >`
    SELECT v.id, v.sku, i."onHand", i.reserved, GREATEST(0,i."onHand"-i.reserved)::int as available
    FROM "ProductVariant" v
    JOIN "Inventory" i ON i."variantId"=v.id
    JOIN "Product" p ON p.id=v."productId"
    WHERE v."dropShipEnabled"=false AND GREATEST(0,i."onHand"-i.reserved) BETWEEN 2 AND 10
      AND v.status='ACTIVE' AND p.status='ACTIVE' AND p."deletedAt" IS NULL AND p."catalogHidden"=false
      AND v.sku NOT LIKE 'TEST-%' AND v.sku NOT LIKE 'COURSE-%'
    LIMIT 1`;

  if (zeroDropExact[0]) {
    const v = await prisma.productVariant.findUnique({
      where: { id: zeroDropExact[0].id },
      include: { inventory: true }
    });
    push("F zero-stock dropship sellable", isCustomerSellable(variantFulfillmentInputFromVariant(v!)));
    push(
      "W merchant in_stock for zero-stock dropship",
      merchantFeedAvailability(v!.inventory?.onHand, v!.inventory?.reserved, true) === "in_stock"
    );
  } else {
    push("F zero-stock dropship sample missing", false);
  }

  if (zeroNon[0]) {
    const v = await prisma.productVariant.findUnique({
      where: { id: zeroNon[0].id },
      include: { inventory: true }
    });
    push("E zero-stock non-dropship NOT sellable", !isCustomerSellable(variantFulfillmentInputFromVariant(v!)));
    push(
      "X merchant out_of_stock for zero-stock non-dropship",
      merchantFeedAvailability(v!.inventory?.onHand, v!.inventory?.reserved, false) === "out_of_stock"
    );
  } else {
    push("E zero-stock non-dropship sample missing", false);
  }

  if (mixedDrop[0]) {
    const avail = mixedDrop[0].available;
    const a = getVariantFulfillmentAvailability(
      {
        onHand: mixedDrop[0].onHand,
        reserved: mixedDrop[0].reserved,
        dropShipEnabled: true,
        hasInventoryRow: true
      },
      avail + 3
    );
    push(
      "D mixed allocation",
      a.sellable && a.warehouseFulfillmentQty === avail && a.dropShipFulfillmentQty === 3,
      a
    );
  }

  if (warehouseOnly[0]) {
    const avail = warehouseOnly[0].available;
    const a = getVariantFulfillmentAvailability(
      {
        onHand: warehouseOnly[0].onHand,
        reserved: warehouseOnly[0].reserved,
        dropShipEnabled: false,
        hasInventoryRow: true
      },
      avail + 1
    );
    push("B non-dropship over-request rejected", !a.sellable && a.maxAllowedQty === avail, a);
  }

  if (mixedDrop[0]) {
    const sessionId = randomUUID();
    const cart = await prisma.cart.create({ data: { sessionId } });
    const avail = mixedDrop[0].available;
    try {
      await addCartItem(cart.id, mixedDrop[0].id, avail + 2);
      const payload = await getCartPayload(cart.id);
      const line = payload.items.find((i) => i.variantId === mixedDrop[0].id);
      push("I cart dropship exceeds local stock", !!line && line.quantity === avail + 2, line);
    } catch (e) {
      push("I cart dropship exceeds local stock", false, e instanceof Error ? e.message : e);
    }
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.delete({ where: { id: cart.id } });
  }

  if (warehouseOnly[0]) {
    const sessionId = randomUUID();
    const cart = await prisma.cart.create({ data: { sessionId } });
    const avail = warehouseOnly[0].available;
    let blocked = false;
    try {
      await addCartItem(cart.id, warehouseOnly[0].id, avail + 1);
    } catch (e) {
      const err = e as { code?: string };
      blocked = err.code === "INSUFFICIENT_STOCK" || err.code === "OUT_OF_STOCK";
    }
    push("J cart non-dropship block over stock", blocked);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.delete({ where: { id: cart.id } });
  }

  if (mixedDrop[0]) {
    const v = await prisma.productVariant.findUnique({
      where: { id: mixedDrop[0].id },
      include: { inventory: true }
    });
    const before = { onHand: v!.inventory!.onHand, reserved: v!.inventory!.reserved };
    const avail = Math.max(0, before.onHand - before.reserved);
    const qty = avail + 2;
    const alloc = getVariantFulfillmentAvailability(variantFulfillmentInputFromVariant(v!), qty);
    const orderNumber = `SRV-DS-CERT-${randomUUID().slice(0, 8)}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        email: "dropship-cert@example.com",
        phone: "9999999999",
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        subtotalInPaise: 10000 * qty,
        grandTotalInPaise: 10000 * qty,
        currency: "INR",
        items: {
          create: {
            variantId: v!.id,
            skuSnapshot: v!.sku,
            nameSnapshot: "DS Cert",
            qtyOrdered: qty,
            warehouseFulfillmentQty: alloc.warehouseFulfillmentQty,
            dropShipFulfillmentQty: alloc.dropShipFulfillmentQty,
            unitPriceInPaise: 10000,
            lineTotalInPaise: 10000 * qty
          }
        },
        payments: {
          create: {
            provider: "RAZORPAY",
            amountInPaise: 10000 * qty,
            currency: "INR",
            status: "PENDING"
          }
        }
      },
      include: { items: true }
    });
    const item = order.items[0]!;
    push(
      "H snapshot sum",
      item.warehouseFulfillmentQty + item.dropShipFulfillmentQty === item.qtyOrdered,
      item
    );
    await prisma.$transaction((tx) => reserveStockTx(tx, order.id));
    const afterReserve = await prisma.inventory.findUnique({ where: { variantId: v!.id } });
    push(
      "K reserve warehouse only",
      afterReserve!.reserved === before.reserved + alloc.warehouseFulfillmentQty,
      { before, afterReserve, alloc }
    );
    await prisma.$transaction((tx) => confirmStockTx(tx, order.id));
    const afterConfirm = await prisma.inventory.findUnique({ where: { variantId: v!.id } });
    push(
      "M/N confirm warehouse only, no negative",
      afterConfirm!.onHand === before.onHand - alloc.warehouseFulfillmentQty &&
        afterConfirm!.onHand >= 0,
      { before, afterConfirm, alloc }
    );
    await prisma.$transaction((tx) => restockPaidOrderTx(tx, order.id));
    const afterRestock = await prisma.inventory.findUnique({ where: { variantId: v!.id } });
    push("O restock warehouse only", afterRestock!.onHand === before.onHand, {
      before,
      afterRestock,
      alloc
    });
    await prisma.orderInventoryRestockEvent.deleteMany({ where: { orderId: order.id } });
    await prisma.payment.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
  }

  push(
    "Q shipping warehouse units helper",
    orderItemWarehouseUnits({
      qtyOrdered: 5,
      warehouseFulfillmentQty: 2,
      dropShipFulfillmentQty: 3
    }) === 2 &&
      orderItemWarehouseUnits({
        qtyOrdered: 2,
        warehouseFulfillmentQty: 0,
        dropShipFulfillmentQty: 2
      }) === 0
  );

  const counts = await prisma.$queryRaw<
    Array<{
      DB_DROP_SHIP_ENABLED: number;
      DB_DROP_SHIP_DISABLED: number;
      ZERO_STOCK_DROP_SHIP_AVAILABLE: number;
      CUSTOMER_OUT_OF_STOCK: number;
    }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE v."dropShipEnabled"=true)::int AS "DB_DROP_SHIP_ENABLED",
      COUNT(*) FILTER (WHERE v."dropShipEnabled"=false)::int AS "DB_DROP_SHIP_DISABLED",
      COUNT(*) FILTER (WHERE v."dropShipEnabled"=true AND GREATEST(0, COALESCE(i."onHand",0)-COALESCE(i.reserved,0))=0)::int AS "ZERO_STOCK_DROP_SHIP_AVAILABLE",
      COUNT(*) FILTER (WHERE v."dropShipEnabled"=false AND GREATEST(0, COALESCE(i."onHand",0)-COALESCE(i.reserved,0))=0)::int AS "CUSTOMER_OUT_OF_STOCK"
    FROM "ProductVariant" v
    LEFT JOIN "Inventory" i ON i."variantId"=v.id`;

  const failed = checks.filter((c) => !c.ok);
  const report = {
    pass: failed.length === 0,
    failedCount: failed.length,
    samples: { zeroDropExact, zeroNon, mixedDrop, warehouseOnly },
    dbCounts: counts[0],
    checks
  };
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
