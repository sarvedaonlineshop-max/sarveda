import "./setup-mocks";
import type { OrderStatus, PaymentStatus, ShipmentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  getInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import { initiateGatewayRefund } from "../../src/modules/payments/refund.service";
import {
  listCapturedPaymentsForRefund,
  pickCapturedPaymentForRefund
} from "../../src/modules/payments/payment-selection";
import {
  getCancellationEligibility
} from "../../src/modules/orders/cancellation-eligibility";
import {
  canRequestCancel,
  executeApprovedCancellationRequest,
  reviewServiceRequest,
  submitServiceRequest
} from "../../src/modules/orders/order-service-request.service";
import { handleRtoShipment } from "../../src/modules/shipping/orderLifecycle";
import { listOrderInventoryRestocks } from "../../src/modules/orders/order-inventory-restock.service";
import { getCommerceMocks } from "./setup-mocks";

async function createPaidOrderWithShipment(opts: {
  bundle: Awaited<ReturnType<typeof createTestProductWithInventory>>;
  shipmentStatus: ShipmentStatus;
  orderStatus?: OrderStatus;
}) {
  const { order, rzpOrderId } = await createPendingRazorpayOrder(opts.bundle, { qty: 2 });
  await completePaidOrder(rzpOrderId, `pay_ship_${Date.now()}`);
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB${Date.now()}`,
      status: opts.shipmentStatus
    }
  });
  if (opts.orderStatus) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: opts.orderStatus }
    });
  }
  return order;
}

async function createCodPaidOrder(bundle: Awaited<ReturnType<typeof createTestProductWithInventory>>) {
  const lineTotal = 118_000;
  const order = await prisma.order.create({
    data: {
      orderNumber: `SRV-COD-${Date.now()}`,
      email: `cod-${Date.now()}@example.com`,
      phone: "9876543210",
      status: "PAID",
      paymentStatus: "PENDING",
      subtotalInPaise: lineTotal,
      grandTotalInPaise: lineTotal,
      currency: "INR",
      placedAt: new Date(),
      items: {
        create: {
          variantId: bundle.variantId,
          skuSnapshot: bundle.sku,
          nameSnapshot: "COD Test",
          qtyOrdered: 1,
          unitPriceInPaise: lineTotal,
          lineTotalInPaise: lineTotal
        }
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
  const { confirmStockTx } = await import("../../src/modules/orders/orders.service");
  await prisma.$transaction(async (tx) => {
    await confirmStockTx(tx, order.id);
  });
  return order;
}

describe("cancellation Phase 1A safety", () => {
  beforeEach(() => {
    const mocks = getCommerceMocks();
    mocks.createZohoRefundDocumentsForOrder.mockClear();
    mocks.razorpayRefund.mockClear();
    mocks.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    }));
  });

  describe("getCancellationEligibility", () => {
    it("allows cancel before dispatch for paid order", () => {
      const e = getCancellationEligibility({
        status: "PAID",
        paymentStatus: "CAPTURED",
        payments: [{ provider: "RAZORPAY" }],
        shipments: [{ status: "CREATED" }]
      });
      expect(e.customerCanRequest).toBe(true);
      expect(e.dispatched).toBe(false);
    });

    it("rejects cancel when shipment is INTRANSIT", () => {
      const e = getCancellationEligibility({
        status: "SHIPPED",
        paymentStatus: "CAPTURED",
        payments: [{ provider: "RAZORPAY" }],
        shipments: [{ status: "INTRANSIT" }]
      });
      expect(e.customerCanRequest).toBe(false);
      expect(e.blockCode).toBe("CANCELLATION_NOT_ALLOWED_AFTER_DISPATCH");
      expect(e.customerMessage).toContain("dispatched");
    });

    it("rejects cancel when delivered", () => {
      const e = getCancellationEligibility({
        status: "DELIVERED",
        paymentStatus: "CAPTURED",
        payments: [{ provider: "RAZORPAY" }],
        shipments: [{ status: "DELIVERED" }]
      });
      expect(e.customerCanRequest).toBe(false);
    });

    it("rejects cancel when shipment RTO", () => {
      const e = getCancellationEligibility({
        status: "SHIPPED",
        paymentStatus: "CAPTURED",
        payments: [{ provider: "RAZORPAY" }],
        shipments: [{ status: "RTO" }]
      });
      expect(e.customerCanRequest).toBe(false);
      expect(e.blockCode).toBe("RTO_IN_PROGRESS");
    });
  });

  describe("pickCapturedPaymentForRefund", () => {
    const base = { id: "1", createdAt: new Date(), provider: "RAZORPAY" as const };

    it("selects single CAPTURED payment", () => {
      const pick = pickCapturedPaymentForRefund([
        { ...base, id: "f", status: "FAILED" as PaymentStatus },
        { ...base, id: "c", status: "CAPTURED" as PaymentStatus }
      ]);
      expect(pick.ok).toBe(true);
      if (pick.ok) expect(pick.payment.id).toBe("c");
    });

    it("flags multiple CAPTURED payments", () => {
      const pick = pickCapturedPaymentForRefund([
        { ...base, id: "a", status: "CAPTURED" as PaymentStatus },
        { ...base, id: "b", status: "CAPTURED" as PaymentStatus }
      ]);
      expect(pick.ok).toBe(false);
      if (!pick.ok) expect(pick.code).toBe("MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED");
    });

    it("ignores failed and pending attempts", () => {
      expect(
        listCapturedPaymentsForRefund([
          { ...base, status: "FAILED" as PaymentStatus },
          { ...base, status: "PENDING" as PaymentStatus }
        ])
      ).toHaveLength(0);
    });
  });

  it("COD before dispatch — cancellation allowed", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const order = await createCodPaidOrder(bundle);
    expect(
      canRequestCancel({
        status: order.status,
        paymentStatus: order.paymentStatus,
        orderNumber: order.orderNumber,
        email: order.email,
        customerId: null,
        payments: [{ provider: "COD" }],
        shipments: []
      })
    ).toBe(true);
    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("COD after dispatch — cancellation rejected", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const order = await createCodPaidOrder(bundle);
    await prisma.shipment.create({
      data: {
        orderId: order.id,
        courier: "Delhivery",
        awb: `AWB-COD-${Date.now()}`,
        status: "INTRANSIT"
      }
    });
    await prisma.order.update({ where: { id: order.id }, data: { status: "SHIPPED" } });
    expect(
      canRequestCancel({
        status: "SHIPPED",
        paymentStatus: "PENDING",
        orderNumber: order.orderNumber,
        email: order.email,
        customerId: null,
        payments: [{ provider: "COD" }],
        shipments: [{ status: "INTRANSIT" }]
      })
    ).toBe(false);
    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("COD cancellation restores stock once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const order = await createCodPaidOrder(bundle);
    expect((await getInventory(bundle.variantId))?.onHand).toBe(9);

    await executeApprovedCancellationRequest({
      orderId: order.id,
      reason: "COD cancel test"
    });

    expect((await getInventory(bundle.variantId))?.onHand).toBe(10);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("CANCELLED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("online paid before dispatch — approve cancel triggers full refund", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 12 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    await completePaidOrder(rzpOrderId, `pay_approve_${Date.now()}`);
    expect((await getInventory(bundle.variantId))?.onHand).toBe(10);

    const request = await prisma.orderServiceRequest.create({
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.email,
        type: "CANCEL_BEFORE_DELIVERY",
        reasonLabel: "mistake",
        status: "PENDING_APPROVAL",
        items: {
          create: {
            orderItemId: order.items[0]!.id,
            nameSnapshot: "Test",
            skuSnapshot: bundle.sku,
            qtySelected: 2,
            reasonCode: "mistake",
            reasonLabel: "Placed by mistake"
          }
        }
      }
    });

    await reviewServiceRequest({
      orderId: order.id,
      requestId: request.id,
      approve: true,
      adminEmail: "admin@test.com"
    });

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("REFUNDED");
    expect((await getInventory(bundle.variantId))?.onHand).toBe(12);

    const mocks = getCommerceMocks();
    expect(mocks.razorpayRefund).toHaveBeenCalled();

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("online paid after dispatch — approve cancel rejected", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 8 });
    const order = await createPaidOrderWithShipment({
      bundle,
      shipmentStatus: "INTRANSIT",
      orderStatus: "SHIPPED"
    });

    const request = await prisma.orderServiceRequest.create({
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.email,
        type: "CANCEL_BEFORE_DELIVERY",
        reasonLabel: "slow",
        status: "PENDING_APPROVAL",
        items: {
          create: {
            orderItemId: (await prisma.orderItem.findFirst({ where: { orderId: order.id } }))!.id,
            nameSnapshot: "Test",
            skuSnapshot: bundle.sku,
            qtySelected: 2,
            reasonCode: "delivery_slow",
            reasonLabel: "Too slow"
          }
        }
      }
    });

    await expect(
      reviewServiceRequest({
        orderId: order.id,
        requestId: request.id,
        approve: true,
        adminEmail: "admin@test.com"
      })
    ).rejects.toMatchObject({ code: "CANCELLATION_NOT_ALLOWED_AFTER_DISPATCH" });

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("Shiprocket RTO does not auto-restock", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 15 });
    const order = await createPaidOrderWithShipment({
      bundle,
      shipmentStatus: "INTRANSIT",
      orderStatus: "SHIPPED"
    });
    const shipment = await prisma.shipment.findFirst({ where: { orderId: order.id } });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(13);

    await handleRtoShipment(order.id, shipment!.awb!, "RTO Initiated");

    expect((await getInventory(bundle.variantId))?.onHand).toBe(13);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("SHIPPED");
    const restocks = await listOrderInventoryRestocks(order.id);
    expect(restocks).toHaveLength(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("duplicate cancellation approval does not double-refund", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 6 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
    await completePaidOrder(rzpOrderId, `pay_dup_approve_${Date.now()}`);

    const request = await prisma.orderServiceRequest.create({
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.email,
        type: "CANCEL_BEFORE_DELIVERY",
        reasonLabel: "mistake",
        status: "PENDING_APPROVAL",
        items: {
          create: {
            orderItemId: order.items[0]!.id,
            nameSnapshot: "Test",
            skuSnapshot: bundle.sku,
            qtySelected: 1,
            reasonCode: "mistake",
            reasonLabel: "Mistake"
          }
        }
      }
    });

    await reviewServiceRequest({
      orderId: order.id,
      requestId: request.id,
      approve: true,
      adminEmail: "admin@test.com"
    });

    await expect(
      reviewServiceRequest({
        orderId: order.id,
        requestId: request.id,
        approve: true,
        adminEmail: "admin@test.com"
      })
    ).rejects.toMatchObject({ code: "ALREADY_REVIEWED" });

    const refundCount = await prisma.refund.count({
      where: { payment: { orderId: order.id }, status: "processed" }
    });
    expect(refundCount).toBe(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("submit rejects cancel after dispatch", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 5 });
    const order = await createPaidOrderWithShipment({
      bundle,
      shipmentStatus: "PICKED",
      orderStatus: "SHIPPED"
    });
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });

    await expect(
      submitServiceRequest({
        orderNumber: order.orderNumber,
        userId: "00000000-0000-0000-0000-000000000001",
        userEmail: order.email,
        type: "CANCEL_BEFORE_DELIVERY",
        items: [
          {
            orderItemId: item!.id,
            reasonCode: "mistake",
            otherMessage: undefined,
            message: undefined
          }
        ],
        photosByIndex: new Map()
      })
    ).rejects.toMatchObject({ code: "CANCELLATION_NOT_ALLOWED_AFTER_DISPATCH" });

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});

describe("patchOrderStatus REFUNDED guard", () => {
  it("blocks admin PATCH to REFUNDED without refund workflow", async () => {
    const { patchOrderStatus } = await import("../../src/modules/admin/admin.handlers");
    const bundle = await createTestProductWithInventory({ onHand: 4 });
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
    await completePaidOrder(rzpOrderId, `pay_patch_${Date.now()}`);

    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const req = {
      params: { id: order.id },
      body: { status: "REFUNDED" }
    } as unknown as import("express").Request;
    const res = { status, json } as unknown as import("express").Response;
    const next = vi.fn();

    await patchOrderStatus(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "REFUNDED_STATUS_PATCH_FORBIDDEN" })
    );

    const still = await prisma.order.findUnique({ where: { id: order.id } });
    expect(still?.status).not.toBe("REFUNDED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
