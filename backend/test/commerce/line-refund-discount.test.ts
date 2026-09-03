import "./setup-mocks";
import { randomUUID } from "crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { getCommerceMocks } from "./setup-mocks";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import { executeAdminLineRefund } from "../../src/modules/orders/order-line-refund.service";
import { allocateOrderDiscountPaise } from "../../src/modules/accounting/discount-allocation";
import { buildPartialRefundSpecForLineDelta } from "../../src/modules/accounting/partial-refund-spec.service";
import { buildOrderRefundedPartialJournal } from "../../src/modules/accounting/order-refunded-partial-journal.builder";
import { gstFromInclusiveLine, lookupGstRate } from "../../src/utils/gst";

/**
 * Two lines sharing one order-level coupon:
 *   A: 2 x ₹5.00 = ₹10.00   B: 1 x ₹7.00 = ₹7.00
 *   discount ₹2.00, shipping ₹3.00, paid ₹18.00
 */
async function paidDiscountedOrder() {
  const bundleA = await createTestProductWithInventory({ onHand: 20, saleInPaise: 500 });
  const bundleB = await createTestProductWithInventory({ onHand: 20, saleInPaise: 700 });
  const rzpOrderId = `order_disc_${randomUUID().slice(0, 12)}`;

  const order = await prisma.order.create({
    data: {
      orderNumber: `SRV-TEST-${randomUUID().slice(0, 8)}`,
      email: `test-${randomUUID().slice(0, 8)}@example.com`,
      phone: "9876543210",
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      subtotalInPaise: 1700,
      discountInPaise: 200,
      shippingInPaise: 300,
      grandTotalInPaise: 1800,
      currency: "INR",
      items: {
        create: [
          {
            variantId: bundleA.variantId,
            skuSnapshot: bundleA.sku,
            nameSnapshot: "Discounted Product A",
            qtyOrdered: 2,
            warehouseFulfillmentQty: 2,
            dropShipFulfillmentQty: 0,
            unitPriceInPaise: 500,
            lineTotalInPaise: 1000
          },
          {
            variantId: bundleB.variantId,
            skuSnapshot: bundleB.sku,
            nameSnapshot: "Discounted Product B",
            qtyOrdered: 1,
            warehouseFulfillmentQty: 1,
            dropShipFulfillmentQty: 0,
            unitPriceInPaise: 700,
            lineTotalInPaise: 700
          }
        ]
      },
      addresses: {
        create: [
          {
            type: "SHIPPING",
            fullName: "Test User",
            phone: "9876543210",
            line1: "123 Test Street",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560001",
            country: "IN"
          }
        ]
      },
      payments: {
        create: {
          provider: "RAZORPAY",
          providerOrderId: rzpOrderId,
          amountInPaise: 1800,
          currency: "INR",
          status: "PENDING"
        }
      }
    },
    include: { items: true }
  });

  const { reserveStockTx } = await import("../../src/modules/orders/orders.service");
  await prisma.$transaction(async (tx) => {
    await reserveStockTx(tx, order.id);
  });
  await completePaidOrder(rzpOrderId, `pay_disc_${Date.now()}`);

  return { bundleA, bundleB, order };
}

describe("line refund with an order coupon allocated across lines", () => {
  beforeEach(() => {
    const m = getCommerceMocks();
    m.razorpayRefund.mockClear();
    m.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_disc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    }));
  });

  it("refunds the allocated paid value and reverses only that line's discount share and GST", async () => {
    const { bundleA, bundleB, order } = await paidDiscountedOrder();
    try {
      const items = await prisma.orderItem.findMany({
        where: { orderId: order.id },
        orderBy: { lineTotalInPaise: "desc" }
      });
      const lineA = items.find((i) => i.variantId === bundleA.variantId)!;
      const lineB = items.find((i) => i.variantId === bundleB.variantId)!;

      const allocationItems = items.map((i) => ({
        lineTotalInPaise: i.lineTotalInPaise,
        unitPriceInPaise: i.unitPriceInPaise,
        qtyOrdered: i.qtyOrdered
      }));
      const { lineDiscountsPaise } = allocateOrderDiscountPaise(allocationItems, 200);
      const indexA = items.findIndex((i) => i.id === lineA.id);
      const indexB = items.findIndex((i) => i.id === lineB.id);
      const discountA = lineDiscountsPaise[indexA]!;
      const discountB = lineDiscountsPaise[indexB]!;
      const expectedUnitRefund = Math.round((lineA.lineTotalInPaise - discountA) / lineA.qtyOrdered);

      expect(discountA).toBeGreaterThan(0);
      expect(discountB).toBeGreaterThan(0);
      // Allocated value, not list price.
      expect(expectedUnitRefund).toBeLessThan(lineA.unitPriceInPaise);

      const result = await executeAdminLineRefund({
        orderId: order.id,
        body: {
          lines: [{ orderItemId: lineA.id, quantity: 1 }],
          refundShipping: false,
          restock: true,
          disposition: "SELLABLE",
          idempotencyKey: `disc-${order.id}`
        },
        adminEmail: "admin@sarveda.com"
      });

      expect(result.refundedInPaise).toBe(expectedUnitRefund);
      expect(result.merchandiseRefundInPaise).toBe(expectedUnitRefund);
      expect(result.shippingRefundInPaise).toBe(0);
      expect(result.restockedUnits).toBe(1);

      const gateway = getCommerceMocks().razorpayRefund;
      expect(gateway).toHaveBeenCalledTimes(1);
      expect(gateway.mock.calls[0]?.[1]).toMatchObject({ amount: expectedUnitRefund });

      // Shipping income untouched: full shipping still sits with the order.
      const refreshed = await prisma.order.findUnique({ where: { id: order.id } });
      expect(refreshed?.shippingInPaise).toBe(300);
      expect(refreshed?.discountInPaise).toBe(200);
      expect(refreshed?.paymentStatus).toBe("PARTIALLY_REFUNDED");

      // Line B keeps its own allocated discount and its full quantity.
      const lineBAfter = await prisma.orderItem.findUnique({ where: { id: lineB.id } });
      expect(lineBAfter?.qtyOrdered).toBe(1);
      expect(lineBAfter?.lineTotalInPaise).toBe(700);
      const allocationAfter = allocateOrderDiscountPaise(allocationItems, 200);
      expect(allocationAfter.lineDiscountsPaise[indexB]).toBe(discountB);

      // Accounting reversal: discounted taxable value, no shipping component, balanced.
      const spec = buildPartialRefundSpecForLineDelta({
        orderId: order.id,
        orderNumber: order.orderNumber,
        currency: "INR",
        provider: "RAZORPAY",
        refundId: "00000000-0000-4000-8000-000000000002",
        providerRefundId: "rfnd_disc_spec",
        sourceType: "ORDER_ADJUSTMENT",
        sourceId: `disc-${order.id}:${lineA.id}`,
        interState: false,
        isGstApplicable: true,
        accountingDate: new Date(),
        refundMerchandisePaise: expectedUnitRefund,
        orderItem: {
          id: lineA.id,
          lineTotalInPaise: lineA.lineTotalInPaise,
          unitPriceInPaise: lineA.unitPriceInPaise,
          qtyOrdered: lineA.qtyOrdered,
          taxClass: "standard"
        },
        orderDiscountInPaise: 200,
        allItems: allocationItems
      });

      const expectedGst = gstFromInclusiveLine(
        expectedUnitRefund,
        lookupGstRate("standard").ratePercent
      );
      expect(spec.merchandiseGstRefundPaise).toBe(expectedGst.taxMinor);
      expect(spec.merchandiseTaxableRefundPaise).toBe(expectedGst.taxableMinor);
      expect(
        spec.merchandiseTaxableRefundPaise + spec.merchandiseGstRefundPaise
      ).toBe(expectedUnitRefund);
      expect(spec.shippingRefundPaise).toBe(0);

      // GST is computed on the discounted value, never on list price.
      const listPriceGst = gstFromInclusiveLine(
        lineA.unitPriceInPaise,
        lookupGstRate("standard").ratePercent
      );
      expect(spec.merchandiseGstRefundPaise).toBeLessThan(listPriceGst.taxMinor);

      const proposal = buildOrderRefundedPartialJournal(spec);
      expect(proposal.balanced).toBe(true);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundleA);
      await cleanupTestProduct(bundleB);
    }
  });
});
