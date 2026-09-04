/**
 * MAN-007b — authoritative refund preview + shipping policy + approval copy.
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
  executeReturnReplacementRefund,
  previewReturnReplacementRefund,
  returnApprovalCustomerMessage,
  submitReturnReplacementRequest
} from "../../src/modules/orders/return-replacement.service";
import {
  markCustomerReturnReceived,
  setCustomerReturnDisposition
} from "../../src/modules/orders/customer-return-workflow.service";
import {
  calculateReturnItemRefund,
  calculateSellerFaultShippingRefundPaise
} from "../../src/modules/orders/return-refund-calculator.service";
import { getCommerceMocks } from "./setup-mocks";

async function createDeliveredPaidOrder(opts?: {
  qty?: number;
  unitPriceInPaise?: number;
  shippingInPaise?: number;
}) {
  const qty = opts?.qty ?? 2;
  const unitPriceInPaise = opts?.unitPriceInPaise ?? 500;
  const shippingInPaise = opts?.shippingInPaise ?? 300;
  const bundle = await createTestProductWithInventory({
    onHand: 50,
    saleInPaise: unitPriceInPaise,
    mrpInPaise: unitPriceInPaise
  });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, {
    qty,
    unitPriceInPaise
  });
  await prisma.order.update({
    where: { id: order.id },
    data: {
      shippingInPaise,
      grandTotalInPaise: unitPriceInPaise * qty + shippingInPaise
    }
  });
  await prisma.payment.updateMany({
    where: { orderId: order.id },
    data: { amountInPaise: unitPriceInPaise * qty + shippingInPaise }
  });
  await completePaidOrder(rzpOrderId, `pay_m7b_${Date.now()}`);
  const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-M7B-${Date.now()}`,
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
      email: `m7b-${Date.now()}@example.com`,
      role: "CUSTOMER",
      isVerified: true
    }
  });
  await prisma.order.update({ where: { id: order.id }, data: { customerId: user.id } });
  return { bundle, order, orderItem, user, unitPriceInPaise, shippingInPaise, qty };
}

const dummyPhoto = {
  buffer: Buffer.from("fake-image"),
  originalname: "evidence.jpg",
  mimetype: "image/jpeg",
  size: 11
};

describe("MAN-007b refund preview + shipping policy", () => {
  beforeEach(() => {
    const m = getCommerceMocks();
    m.razorpayRefund.mockClear();
    m.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_m7b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    }));
  });

  it("A+B+C — qty2/qty1 merchandise ₹5; shipping proportional ₹1.50 under existing seller-fault rule", async () => {
    expect(
      calculateSellerFaultShippingRefundPaise({
        shippingPolicy: "SHIPPING_REFUNDABLE",
        orderShippingInPaise: 300,
        qtyReturned: 1,
        lineQtyOrdered: 2,
        orderLineCount: 1,
        orderTotalQtyOrdered: 2
      })
    ).toBe(150);

    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({
      qty: 2,
      unitPriceInPaise: 500,
      shippingInPaise: 300
    });

    const created = await submitReturnReplacementRequest({
      orderNumber: order.orderNumber,
      userId: user.id,
      userEmail: user.email,
      items: [
        {
          orderItemId: orderItem.id,
          reasonCode: "damaged_delivery",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([[0, [dummyPhoto]]])
    });
    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });

    const calc = await calculateReturnItemRefund({
      orderId: order.id,
      orderItemId: orderItem.id,
      qty: 1,
      shippingPolicy: "SHIPPING_REFUNDABLE"
    });
    expect(calc.merchandiseRefundPaise).toBe(500);
    expect(calc.shippingRefundPaise).toBe(150);
    expect(calc.totalRefundPaise).toBe(650);

    const preview = await previewReturnReplacementRefund(created.id);
    expect(preview.merchandiseRefundPaise).toBe(500);
    expect(preview.shippingRefundPaise).toBe(150);
    expect(preview.otherAdjustmentPaise).toBe(0);
    expect(preview.totalRefundNowPaise).toBe(650);
    expect(preview.approvedQtySelected).toBe(1);
    expect(preview.orderedQtyOnLines).toBe(2);
    // Not executable until receipt+QC
    expect(preview.executable).toBe(false);
    expect(preview.blockCode).toBe("RETURN_NOT_RECEIVED");

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("D+G — preview and execution produce identical component calculation", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({
      qty: 2,
      unitPriceInPaise: 500,
      shippingInPaise: 300
    });
    const created = await submitReturnReplacementRequest({
      orderNumber: order.orderNumber,
      userId: user.id,
      userEmail: user.email,
      items: [
        {
          orderItemId: orderItem.id,
          reasonCode: "damaged_delivery",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([[0, [dummyPhoto]]])
    });
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

    const preview = await previewReturnReplacementRefund(created.id);
    expect(preview.executable).toBe(true);
    expect(preview.merchandiseRefundPaise).toBe(500);
    expect(preview.shippingRefundPaise).toBe(150);
    expect(preview.totalRefundNowPaise).toBe(650);

    const result = await executeReturnReplacementRefund({
      requestId: created.id,
      adminEmail: "admin@test.com"
    });
    expect(result.totalRefundedInPaise).toBe(preview.totalRefundNowPaise);
    expect(result.preview.merchandiseRefundPaise).toBe(preview.merchandiseRefundPaise);
    expect(result.preview.shippingRefundPaise).toBe(preview.shippingRefundPaise);

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("E+F+H+I — gates + no double refund / stale over-refund", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({
      qty: 2,
      unitPriceInPaise: 500,
      shippingInPaise: 300
    });
    const created = await submitReturnReplacementRequest({
      orderNumber: order.orderNumber,
      userId: user.id,
      userEmail: user.email,
      items: [
        {
          orderItemId: orderItem.id,
          reasonCode: "damaged_delivery",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([[0, [dummyPhoto]]])
    });
    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });

    await expect(
      executeReturnReplacementRefund({ requestId: created.id, adminEmail: "admin@test.com" })
    ).rejects.toMatchObject({ code: "RETURN_NOT_RECEIVED" });

    await markCustomerReturnReceived({ requestId: created.id });
    await expect(
      executeReturnReplacementRefund({ requestId: created.id, adminEmail: "admin@test.com" })
    ).rejects.toMatchObject({ code: "QC_INCOMPLETE" });

    await setCustomerReturnDisposition({
      requestId: created.id,
      disposition: "NEEDS_REVIEW"
    });
    await expect(
      executeReturnReplacementRefund({ requestId: created.id, adminEmail: "admin@test.com" })
    ).rejects.toMatchObject({ code: "QC_INCOMPLETE" });

    await prisma.orderReturnShipment.updateMany({
      where: { requestId: created.id },
      data: { disposition: null, dispositionAt: null }
    });
    await prisma.orderServiceRequest.update({
      where: { id: created.id },
      data: { returnPhysicalStatus: "RECEIVED" }
    });
    await setCustomerReturnDisposition({
      requestId: created.id,
      disposition: "DAMAGED_NON_RESTOCKABLE"
    });

    await executeReturnReplacementRefund({
      requestId: created.id,
      adminEmail: "admin@test.com"
    });

    const stale = await previewReturnReplacementRefund(created.id);
    expect(stale.executable).toBe(false);
    expect(stale.blockCode).toBe("ALREADY_REFUNDED");
    expect(stale.totalRefundNowPaise).toBe(0);

    await expect(
      executeReturnReplacementRefund({ requestId: created.id, adminEmail: "admin@test.com" })
    ).rejects.toMatchObject({ code: "ALREADY_REFUNDED" });

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("J+K — approval customer message differs for physical vs NOT_REQUIRED", () => {
    expect(returnApprovalCustomerMessage({ physicalReturnRequired: true })).toContain(
      "after we receive and inspect"
    );
    expect(returnApprovalCustomerMessage({ physicalReturnRequired: false })).toContain(
      "refund is being processed"
    );
    expect(returnApprovalCustomerMessage({ physicalReturnRequired: false })).not.toContain(
      "receive and inspect"
    );
  });
});
