/**
 * MAN-007 — approved physical return must not refund early or above case qty.
 */
import "./setup-mocks";
import { beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import {
  approveReturnReplacementRequest,
  assertReturnCaseRefundExecutable,
  executeReturnReplacementRefund,
  submitReturnReplacementRequest
} from "../../src/modules/orders/return-replacement.service";
import {
  markCustomerReturnReceived,
  setCustomerReturnDisposition
} from "../../src/modules/orders/customer-return-workflow.service";
import {
  calculateReturnItemRefund,
  caseMerchandiseCeilingPaise
} from "../../src/modules/orders/return-refund-calculator.service";
import { processServiceRequestRefund } from "../../src/modules/orders/order-service-request.service";
import { getCommerceMocks } from "./setup-mocks";

async function createDeliveredPaidOrder(opts?: { qty?: number; saleInPaise?: number }) {
  const qty = opts?.qty ?? 2;
  const saleInPaise = opts?.saleInPaise ?? 500;
  const bundle = await createTestProductWithInventory({ onHand: 50, saleInPaise, mrpInPaise: saleInPaise });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty });
  await completePaidOrder(rzpOrderId, `pay_man007_${Date.now()}`);
  const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-M7-${Date.now()}`,
      status: "DELIVERED",
      deliveredAt
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED", fulfillmentStatus: "FULFILLED" }
  });
  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  const user = await prisma.user.create({
    data: {
      email: `man007-${Date.now()}@example.com`,
      role: "CUSTOMER",
      isVerified: true
    }
  });
  await prisma.order.update({ where: { id: order.id }, data: { customerId: user.id } });
  return { bundle, order, orderItem, user };
}

const dummyPhoto = {
  buffer: Buffer.from("fake-image"),
  originalname: "evidence.jpg",
  mimetype: "image/jpeg",
  size: 11
};

async function submitDamagedQty1(orderNumber: string, userId: string, email: string, orderItemId: string) {
  return submitReturnReplacementRequest({
    orderNumber,
    userId,
    userEmail: email,
    items: [
      {
        orderItemId,
        reasonCode: "damaged_delivery",
        qty: 1,
        requestedResolution: "RETURN_FOR_REFUND"
      }
    ],
    photosByIndex: new Map([[0, [dummyPhoto]]])
  });
}

describe("MAN-007 return refund qty + physical gate", () => {
  beforeEach(() => {
    const m = getCommerceMocks();
    m.razorpayRefund.mockClear();
    m.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_m7_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    }));
  });

  it("qty2 case qty1 → merchandise ceiling is one unit only", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({ qty: 2 });
    expect(orderItem.qtyOrdered).toBe(2);
    const oneUnit = Math.round(orderItem.lineTotalInPaise / orderItem.qtyOrdered);
    expect(caseMerchandiseCeilingPaise(orderItem.lineTotalInPaise, 2, 1)).toBe(oneUnit);
    expect(oneUnit).toBeLessThan(orderItem.lineTotalInPaise);

    const created = await submitDamagedQty1(order.orderNumber, user.id, user.email, orderItem.id);
    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });

    const preview = await calculateReturnItemRefund({
      orderId: order.id,
      orderItemId: orderItem.id,
      qty: 1,
      shippingPolicy: "SHIPPING_REFUNDABLE"
    });
    expect(preview.merchandiseRefundPaise).toBe(oneUnit);
    expect(preview.merchandiseRefundPaise).toBeLessThan(orderItem.lineTotalInPaise);

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("legacy processServiceRequestRefund rejects REFUND_AFTER_DELIVERY", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder();
    const created = await submitDamagedQty1(order.orderNumber, user.id, user.email, orderItem.id);
    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });

    await expect(
      processServiceRequestRefund({
        orderId: order.id,
        requestId: created.id,
        adminEmail: "admin@test.com",
        items: [{ requestItemId: created.items[0]!.id, amountInPaise: 1000 }]
      })
    ).rejects.toMatchObject({ code: "USE_RETURN_CASE_REFUND" });

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("physical return approved but not received → refund rejected", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder();
    const created = await submitDamagedQty1(order.orderNumber, user.id, user.email, orderItem.id);
    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });

    const full = await prisma.orderServiceRequest.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: true, returnShipment: true }
    });
    expect(() => assertReturnCaseRefundExecutable(full)).toThrow(/received/i);

    await expect(
      executeReturnReplacementRefund({ requestId: created.id, adminEmail: "admin@test.com" })
    ).rejects.toMatchObject({ code: "RETURN_NOT_RECEIVED" });

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("received but QC/disposition incomplete → refund rejected", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder();
    const created = await submitDamagedQty1(order.orderNumber, user.id, user.email, orderItem.id);
    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });
    await markCustomerReturnReceived({ requestId: created.id });

    await expect(
      executeReturnReplacementRefund({ requestId: created.id, adminEmail: "admin@test.com" })
    ).rejects.toMatchObject({ code: "QC_INCOMPLETE" });

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("after receipt + valid QC → refund eligible for case qty only; retry idempotent", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({ qty: 2 });
    const oneUnit = Math.round(orderItem.lineTotalInPaise / orderItem.qtyOrdered);
    const created = await submitDamagedQty1(order.orderNumber, user.id, user.email, orderItem.id);
    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });
    await markCustomerReturnReceived({ requestId: created.id });
    await setCustomerReturnDisposition({
      requestId: created.id,
      disposition: "DAMAGED_NON_RESTOCKABLE"
    });

    const first = await executeReturnReplacementRefund({
      requestId: created.id,
      adminEmail: "admin@test.com"
    });
    expect(first.totalRefundedInPaise).toBe(oneUnit);
    expect(first.refundIds.length).toBe(1);

    const allocCount = await prisma.refundAllocation.count({
      where: { refundId: first.refundIds[0] }
    });
    expect(allocCount).toBeGreaterThanOrEqual(1);

    // Second call must not duplicate gateway/journal — already refunded.
    await expect(
      executeReturnReplacementRefund({ requestId: created.id, adminEmail: "admin@test.com" })
    ).rejects.toMatchObject({ code: "ALREADY_REFUNDED" });

    const refunds = await prisma.refund.findMany({
      where: { sourceType: "SERVICE_REQUEST", sourceId: created.items[0]!.id }
    });
    expect(refunds.filter((r) => r.status === "processed" || r.providerRefundId).length).toBe(1);

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("APPROVED_NO_RETURN (keep item) can refund without physical receipt", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({ qty: 2 });
    const oneUnit = Math.round(orderItem.lineTotalInPaise / orderItem.qtyOrdered);
    const created = await submitReturnReplacementRequest({
      orderNumber: order.orderNumber,
      userId: user.id,
      userEmail: user.email,
      items: [
        {
          orderItemId: orderItem.id,
          reasonCode: "quality_issue",
          qty: 1,
          requestedResolution: "KEEP_ITEM_PARTIAL_REFUND"
        }
      ],
      photosByIndex: new Map([[0, [dummyPhoto]]])
    });
    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });

    const full = await prisma.orderServiceRequest.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: true, returnShipment: true }
    });
    expect(full.returnPhysicalStatus).toBe("NOT_REQUIRED");
    expect(() => assertReturnCaseRefundExecutable(full)).not.toThrow();

    const result = await executeReturnReplacementRefund({
      requestId: created.id,
      adminEmail: "admin@test.com"
    });
    expect(result.totalRefundedInPaise).toBe(oneUnit);

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });
});
