import "./setup-mocks";
import { randomUUID } from "crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { getCommerceMocks } from "./setup-mocks";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  getInventory,
  prisma,
  seedMinimalCoAForTests
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import { initiateGatewayRefund } from "../../src/modules/payments/refund.service";
import {
  executeAdminLineRefund,
  loadLineRefundOptions
} from "../../src/modules/orders/order-line-refund.service";
import { handlePaidOrderStatusChange } from "../../src/modules/orders/orders.service";
import {
  markRtoReceived,
  setRtoDisposition
} from "../../src/modules/orders/rto-workflow.service";
import { getReturnEligibility } from "../../src/modules/orders/return-eligibility.service";
import { postOrderPaidByIdentifier } from "../../src/modules/accounting/order-paid-posting.service";
import { ORDER_CANCELLED_EVENT_TYPE } from "../../src/modules/accounting/order-cancelled.constants";
import { ORDER_REFUNDED_PARTIAL_EVENT_TYPE } from "../../src/modules/accounting/order-refunded-partial.constants";
import { ACCOUNT_CODE } from "../../src/modules/accounting/order-paid.constants";
import { patchOrderStatus } from "../../src/modules/admin/admin.handlers";
import type { Request, Response, NextFunction } from "express";

/** MAN-006 shape: 2 × ₹5 merchandise + ₹3 shipping. */
async function paidOrderWithShipping(qty = 2) {
  const bundle = await createTestProductWithInventory({ onHand: 50, saleInPaise: 500 });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, {
    qty,
    unitPriceInPaise: 500
  });
  const merch = 500 * qty;
  const shipping = 300;
  const grand = merch + shipping;
  await prisma.order.update({
    where: { id: order.id },
    data: { shippingInPaise: shipping, grandTotalInPaise: grand }
  });
  await prisma.payment.updateMany({
    where: { orderId: order.id },
    data: { amountInPaise: grand }
  });
  await completePaidOrder(rzpOrderId, `pay_p1a_${Date.now()}`);
  return { bundle, order };
}

async function enableAccounting() {
  const prev = {
    native: process.env.NATIVE_ACCOUNTING_ENABLED,
    sales: process.env.ACCOUNTING_SALES_POSTING_ENABLED,
    refund: process.env.ACCOUNTING_REFUND_POSTING_ENABLED
  };
  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
  process.env.ACCOUNTING_REFUND_POSTING_ENABLED = "1";
  await seedMinimalCoAForTests();
  return () => {
    if (prev.native === undefined) delete process.env.NATIVE_ACCOUNTING_ENABLED;
    else process.env.NATIVE_ACCOUNTING_ENABLED = prev.native;
    if (prev.sales === undefined) delete process.env.ACCOUNTING_SALES_POSTING_ENABLED;
    else process.env.ACCOUNTING_SALES_POSTING_ENABLED = prev.sales;
    if (prev.refund === undefined) delete process.env.ACCOUNTING_REFUND_POSTING_ENABLED;
    else process.env.ACCOUNTING_REFUND_POSTING_ENABLED = prev.refund;
  };
}

async function journalLinesForRefund(orderId: string) {
  const byOrder = await prisma.accountingPostingEvent.findMany({
    where: {
      eventType: ORDER_REFUNDED_PARTIAL_EVENT_TYPE,
      uniqueKey: { startsWith: `order:${orderId}:refund:` }
    },
    include: {
      journalEntry: { include: { lines: { include: { account: true } } } }
    }
  });
  return { byOrder };
}

describe("Phase 1A — RefundAllocation + financial correctness", () => {
  beforeEach(() => {
    const m = getCommerceMocks();
    m.razorpayRefund.mockClear();
    m.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_p1a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    }));
  });

  it("MAN-006 merchandise-only: RefundAllocation + no shipping GL line", async () => {
    const restore = await enableAccounting();
    const { bundle, order } = await paidOrderWithShipping();
    try {
      await postOrderPaidByIdentifier({ orderId: order.id }, { forcePersist: true });
      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });

      const result = await executeAdminLineRefund({
        orderId: order.id,
        body: {
          lines: [{ orderItemId: items[0]!.id, quantity: 1 }],
          refundShipping: false,
          restock: true,
          disposition: "SELLABLE",
          idempotencyKey: `p1a-merch-${order.id}`
        }
      });

      expect(result.refundedInPaise).toBe(500);
      expect(result.shippingRefundInPaise).toBe(0);

      const allocations = await prisma.refundAllocation.findMany({
        where: { refund: { payment: { orderId: order.id } } }
      });
      expect(allocations).toHaveLength(1);
      expect(allocations[0]).toMatchObject({
        orderItemId: items[0]!.id,
        quantity: 1,
        eligibleItemValuePaise: 500,
        forwardShippingPaise: 0,
        reverseShippingDeductedPaise: 0,
        approvedRefundPaise: 500
      });
      expect(allocations[0]!.merchandiseTaxablePaise + allocations[0]!.gstPaise).toBe(500);

      const { byOrder } = await journalLinesForRefund(order.id);
      expect(byOrder).toHaveLength(1);
      const codes = byOrder[0]!.journalEntry!.lines.map((l) => l.account.code);
      expect(codes).toContain(ACCOUNT_CODE.PRODUCT_SALES);
      expect(codes).not.toContain(ACCOUNT_CODE.SHIPPING_INCOME);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
      restore();
    }
  });

  it("MAN-006 shipping-inclusive: shipping reverses 4100, not Product Sales + GST", async () => {
    const restore = await enableAccounting();
    const { bundle, order } = await paidOrderWithShipping();
    try {
      await postOrderPaidByIdentifier({ orderId: order.id }, { forcePersist: true });
      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });

      const result = await executeAdminLineRefund({
        orderId: order.id,
        body: {
          lines: [{ orderItemId: items[0]!.id, quantity: 1 }],
          refundShipping: true,
          restock: false,
          disposition: "SELLABLE",
          idempotencyKey: `p1a-ship-${order.id}`
        }
      });

      // 1 unit merchandise (500) + proportional shipping (150 of 300 for 1 of 2 units)
      expect(result.merchandiseRefundInPaise).toBe(500);
      expect(result.shippingRefundInPaise).toBe(150);
      expect(result.refundedInPaise).toBe(650);

      const alloc = await prisma.refundAllocation.findFirst({
        where: { refund: { payment: { orderId: order.id } } }
      });
      expect(alloc).toMatchObject({
        quantity: 1,
        eligibleItemValuePaise: 500,
        forwardShippingPaise: 150,
        approvedRefundPaise: 650
      });

      const { byOrder } = await journalLinesForRefund(order.id);
      expect(byOrder).toHaveLength(1);
      const shipLine = byOrder[0]!.journalEntry!.lines.find(
        (l) => l.account.code === ACCOUNT_CODE.SHIPPING_INCOME
      );
      expect(shipLine).toBeTruthy();
      expect(shipLine!.debitInPaise).toBe(150);
      expect(shipLine!.creditInPaise).toBe(0);

      // Shipping must not inflate GST: merchandise GST is from 500 only.
      const gstDebit = byOrder[0]!.journalEntry!.lines
        .filter((l) =>
          [ACCOUNT_CODE.OUTPUT_CGST, ACCOUNT_CODE.OUTPUT_SGST, ACCOUNT_CODE.OUTPUT_IGST].includes(
            l.account.code as typeof ACCOUNT_CODE.OUTPUT_CGST
          )
        )
        .reduce((s, l) => s + l.debitInPaise, 0);
      expect(gstDebit).toBe(alloc!.gstPaise);
      expect(gstDebit).toBeLessThan(150); // would be much higher if 650 were GST-split
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
      restore();
    }
  });

  it("discounted line refund writes allocation with discountReversedPaise", async () => {
    const bundleA = await createTestProductWithInventory({ onHand: 20, saleInPaise: 500 });
    const bundleB = await createTestProductWithInventory({ onHand: 20, saleInPaise: 700 });
    const rzpOrderId = `order_p1a_d_${randomUUID().slice(0, 10)}`;
    const order = await prisma.order.create({
      data: {
        orderNumber: `SRV-TEST-${randomUUID().slice(0, 8)}`,
        email: `t-${randomUUID().slice(0, 6)}@example.com`,
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
              nameSnapshot: "A",
              qtyOrdered: 2,
              warehouseFulfillmentQty: 2,
              unitPriceInPaise: 500,
              lineTotalInPaise: 1000
            },
            {
              variantId: bundleB.variantId,
              skuSnapshot: bundleB.sku,
              nameSnapshot: "B",
              qtyOrdered: 1,
              warehouseFulfillmentQty: 1,
              unitPriceInPaise: 700,
              lineTotalInPaise: 700
            }
          ]
        },
        addresses: {
          create: {
            type: "SHIPPING",
            fullName: "T",
            phone: "9876543210",
            line1: "1",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560001",
            country: "IN"
          }
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
    await completePaidOrder(rzpOrderId, `pay_d_${Date.now()}`);

    try {
      const lineA = order.items.find((i) => i.skuSnapshot === bundleA.sku)!;
      const result = await executeAdminLineRefund({
        orderId: order.id,
        body: {
          lines: [{ orderItemId: lineA.id, quantity: 1 }],
          refundShipping: false,
          restock: true,
          disposition: "SELLABLE",
          idempotencyKey: `p1a-disc-${order.id}`
        }
      });

      // Line A net 1000-118=882 (pro-rata), per unit 441
      expect(result.merchandiseRefundInPaise).toBe(441);

      const alloc = await prisma.refundAllocation.findFirst({
        where: { orderItemId: lineA.id }
      });
      expect(alloc).toBeTruthy();
      expect(alloc!.discountReversedPaise).toBeGreaterThan(0);
      expect(alloc!.approvedRefundPaise).toBe(441);
      expect(alloc!.forwardShippingPaise).toBe(0);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundleA);
      await cleanupTestProduct(bundleB);
    }
  });

  it("full refund regression still works", async () => {
    const { bundle, order } = await paidOrderWithShipping(1);
    try {
      await initiateGatewayRefund(order.id, "full refund regression");
      const updated = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updated?.status).toBe("REFUNDED");
      const refunds = await prisma.refund.findMany({
        where: { payment: { orderId: order.id }, status: "processed" }
      });
      expect(refunds.length).toBeGreaterThanOrEqual(1);
      // Full refund path does not invent allocations (no line scope).
      const allocs = await prisma.refundAllocation.count({
        where: { refund: { payment: { orderId: order.id } } }
      });
      expect(allocs).toBe(0);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });

  it("COD RTO posts ORDER_CANCELLED exactly once", async () => {
    const restore = await enableAccounting();
    const bundle = await createTestProductWithInventory({ onHand: 6 });
    const lineTotal = 118_000;
    const order = await prisma.order.create({
      data: {
        orderNumber: `SRV-COD-P1A-${Date.now()}`,
        email: `cod-p1a-${Date.now()}@example.com`,
        phone: "9876543210",
        status: "PAID",
        paymentStatus: "PENDING",
        fulfillmentStatus: "UNFULFILLED",
        subtotalInPaise: lineTotal,
        grandTotalInPaise: lineTotal,
        currency: "INR",
        placedAt: new Date(),
        items: {
          create: {
            variantId: bundle.variantId,
            skuSnapshot: bundle.sku,
            nameSnapshot: "COD P1A",
            qtyOrdered: 2,
            warehouseFulfillmentQty: 2,
            unitPriceInPaise: lineTotal / 2,
            lineTotalInPaise: lineTotal
          }
        },
        addresses: {
          create: [
            {
              type: "SHIPPING",
              fullName: "COD",
              phone: "9876543210",
              line1: "1",
              city: "Bengaluru",
              state: "Karnataka",
              postalCode: "560001",
              country: "IN"
            },
            {
              type: "BILLING",
              fullName: "COD",
              phone: "9876543210",
              line1: "1",
              city: "Bengaluru",
              state: "Karnataka",
              postalCode: "560001",
              country: "IN"
            }
          ]
        },
        payments: {
          create: {
            provider: "COD",
            amountInPaise: lineTotal,
            currency: "INR",
            status: "PENDING"
          }
        }
      }
    });

    try {
      await postOrderPaidByIdentifier({ orderId: order.id }, { forcePersist: true });

      const shipment = await prisma.shipment.create({
        data: {
          orderId: order.id,
          courier: "Delhivery",
          awb: `AWB-COD-P1A-${Date.now()}`,
          status: "RTO",
          rtoAt: new Date()
        }
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "SHIPPED", fulfillmentStatus: "RETURNED" }
      });

      await markRtoReceived({ shipmentId: shipment.id });
      await setRtoDisposition({ shipmentId: shipment.id, disposition: "RESTOCKABLE" });

      const updated = await prisma.order.findUnique({ where: { id: order.id } });
      expect(updated?.status).toBe("CANCELLED");
      expect(updated?.fulfillmentStatus).toBe("UNFULFILLED");

      const events = await prisma.accountingPostingEvent.findMany({
        where: {
          eventType: ORDER_CANCELLED_EVENT_TYPE,
          uniqueKey: `order:${order.id}:cancelled`
        }
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.status).toBe("POSTED");

      // Idempotent retry must not create a second event.
      await setRtoDisposition({ shipmentId: shipment.id, disposition: "RESTOCKABLE" });
      const events2 = await prisma.accountingPostingEvent.findMany({
        where: {
          eventType: ORDER_CANCELLED_EVENT_TYPE,
          uniqueKey: `order:${order.id}:cancelled`
        }
      });
      expect(events2).toHaveLength(1);
    } finally {
      // POSTED journals are immutable (DB triggers) — leave them; uniqueKeys include order UUID.
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
      restore();
    }
  });

  it("captured prepaid cannot be CANCELLED via PATCH /status", async () => {
    const { bundle, order } = await paidOrderWithShipping(1);
    try {
      const req = {
        params: { id: order.id },
        body: { status: "CANCELLED" }
      } as unknown as Request;
      let statusCode = 200;
      let body: { code?: string } = {};
      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: { code?: string }) {
          body = payload;
          return this;
        }
      } as unknown as Response;
      const next: NextFunction = (err?: unknown) => {
        if (err) throw err;
      };

      await patchOrderStatus(req, res, next);

      expect(statusCode).toBe(400);
      expect(body.code).toBe("USE_REFUND");
      const still = await prisma.order.findUnique({ where: { id: order.id } });
      expect(still?.status).not.toBe("CANCELLED");
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });

  it("approved return case commits qty — second case cannot over-return", async () => {
    const { bundle, order } = await paidOrderWithShipping(3);
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "DELIVERED" }
      });
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: "SHIPPED",
          toStatus: "DELIVERED",
          reason: "test deliver"
        }
      });
      await prisma.shipment.create({
        data: {
          orderId: order.id,
          courier: "Delhivery",
          awb: `AWB-QTY-${Date.now()}`,
          status: "DELIVERED",
          deliveredAt: new Date()
        }
      });

      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      const item = items[0]!;

      await prisma.orderServiceRequest.create({
        data: {
        caseNumber: `RC-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerEmail: order.email,
          type: "REFUND_AFTER_DELIVERY",
          status: "APPROVED",
          requestIntent: "REFUND",
          returnPhysicalStatus: "AWAITING_RETURN",
          resolutionStatus: "REFUND_PENDING",
          items: {
            create: {
              orderItemId: item.id,
              nameSnapshot: item.nameSnapshot,
              skuSnapshot: item.skuSnapshot,
              qtySelected: 2,
              reasonCode: "defective",
              reasonLabel: "Defective",
              requestedResolution: "RETURN_FOR_REFUND"
            }
          }
        }
      });

      const orderRow = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          shipments: true,
          statusHistory: true,
          payments: true
        }
      });

      const second = await getReturnEligibility({
        order: orderRow,
        orderItemId: item.id,
        qtyRequested: 2
      });
      expect(second.eligible).toBe(false);
      expect(second.blockCode).toBe("QTY_EXCEEDS_AVAILABLE");
      expect(second.maxReturnableQty).toBe(1);

      const okOne = await getReturnEligibility({
        order: orderRow,
        orderItemId: item.id,
        qtyRequested: 1
      });
      expect(okOne.eligible).toBe(true);
      expect(okOne.maxReturnableQty).toBe(1);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });

  it("pre-dispatch restock is allowed; post-dispatch refund cannot sellable-restock", async () => {
    const { bundle, order } = await paidOrderWithShipping(2);
    try {
      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      const before = await getInventory(bundle.variantId);

      const pre = await executeAdminLineRefund({
        orderId: order.id,
        body: {
          lines: [{ orderItemId: items[0]!.id, quantity: 1 }],
          refundShipping: false,
          restock: true,
          disposition: "SELLABLE",
          idempotencyKey: `p1a-pre-${order.id}`
        }
      });
      expect(pre.restockedUnits).toBe(1);
      expect((await getInventory(bundle.variantId))?.onHand).toBe((before?.onHand ?? 0) + 1);

      await prisma.shipment.create({
        data: {
          orderId: order.id,
          courier: "Delhivery",
          awb: `AWB-POST-${Date.now()}`,
          status: "INTRANSIT"
        }
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "SHIPPED" }
      });

      const options = await loadLineRefundOptions(order.id);
      expect(options.restockAvailable).toBe(false);

      await expect(
        executeAdminLineRefund({
          orderId: order.id,
          body: {
            lines: [{ orderItemId: items[0]!.id, quantity: 1 }],
            refundShipping: false,
            restock: true,
            disposition: "SELLABLE",
            idempotencyKey: `p1a-post-${order.id}`
          }
        })
      ).rejects.toMatchObject({ code: "RESTOCK_NOT_ALLOWED" });

      // Money-only refund after dispatch is fine.
      const moneyOnly = await executeAdminLineRefund({
        orderId: order.id,
        body: {
          lines: [{ orderItemId: items[0]!.id, quantity: 1 }],
          refundShipping: false,
          restock: false,
          disposition: "SELLABLE",
          idempotencyKey: `p1a-money-${order.id}`
        }
      });
      expect(moneyOnly.refundedInPaise).toBe(500);
      expect(moneyOnly.restockedUnits).toBe(0);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });

  it("idempotent retry does not duplicate RefundAllocation, refund, stock or journal", async () => {
    const restore = await enableAccounting();
    const { bundle, order } = await paidOrderWithShipping(2);
    try {
      await postOrderPaidByIdentifier({ orderId: order.id }, { forcePersist: true });
      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      const key = `p1a-idem-${order.id}`;
      const before = await getInventory(bundle.variantId);

      const first = await executeAdminLineRefund({
        orderId: order.id,
        body: {
          lines: [{ orderItemId: items[0]!.id, quantity: 1 }],
          refundShipping: false,
          restock: true,
          disposition: "SELLABLE",
          idempotencyKey: key
        }
      });
      const second = await executeAdminLineRefund({
        orderId: order.id,
        body: {
          lines: [{ orderItemId: items[0]!.id, quantity: 1 }],
          refundShipping: false,
          restock: true,
          disposition: "SELLABLE",
          idempotencyKey: key
        }
      });

      expect(second.refundedInPaise).toBe(first.refundedInPaise);
      expect(await prisma.refund.count({ where: { payment: { orderId: order.id } } })).toBe(1);
      expect(
        await prisma.refundAllocation.count({
          where: { refund: { payment: { orderId: order.id } } }
        })
      ).toBe(1);
      expect((await getInventory(bundle.variantId))?.onHand).toBe((before?.onHand ?? 0) + 1);
      expect(await prisma.orderInventoryRestockEvent.count({ where: { orderId: order.id } })).toBe(1);

      const { byOrder } = await journalLinesForRefund(order.id);
      expect(byOrder).toHaveLength(1);

      const gateway = getCommerceMocks().razorpayRefund;
      expect(gateway).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
      restore();
    }
  });

  it("handlePaidOrderStatusChange does not auto-restock after dispatch", async () => {
    const { bundle, order } = await paidOrderWithShipping(1);
    try {
      await prisma.shipment.create({
        data: {
          orderId: order.id,
          courier: "Delhivery",
          awb: `AWB-HPOS-${Date.now()}`,
          status: "INTRANSIT"
        }
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "SHIPPED" }
      });
      // Confirm stock was taken at pay time.
      const before = await getInventory(bundle.variantId);
      await handlePaidOrderStatusChange(order.id, "CANCELLED", "test dispatched cancel");
      expect((await getInventory(bundle.variantId))?.onHand).toBe(before?.onHand);
      expect(await prisma.orderInventoryRestockEvent.count({ where: { orderId: order.id } })).toBe(0);
    } finally {
      await cleanupTestOrder(order.id);
      await cleanupTestProduct(bundle);
    }
  });
});
