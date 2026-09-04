/**
 * Returns desk + refund override — focused regression tests.
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
  previewReturnReplacementRefund,
  setReturnRefundOverride,
  submitReturnReplacementRequest
} from "../../src/modules/orders/return-replacement.service";
import {
  markCustomerReturnReceived,
  setCustomerReturnDisposition
} from "../../src/modules/orders/customer-return-workflow.service";
import { getAdminReturnCaseByCaseNumber, listReturnCases } from "../../src/modules/orders/return-case.service";
import { deriveReturnCaseStage } from "../../src/modules/orders/return-case-stage";
import { buildLineRefundAllocation } from "../../src/modules/payments/refund-allocation.service";
import { calculateReturnItemRefund } from "../../src/modules/orders/return-refund-calculator.service";

async function createDeliveredPaidOrder(opts?: {
  qty?: number;
  unitPriceInPaise?: number;
  shippingInPaise?: number;
  discountInPaise?: number;
}) {
  const qty = opts?.qty ?? 2;
  const unitPriceInPaise = opts?.unitPriceInPaise ?? 500;
  const shippingInPaise = opts?.shippingInPaise ?? 300;
  const discountInPaise = opts?.discountInPaise ?? 0;
  const bundle = await createTestProductWithInventory({
    onHand: 50,
    saleInPaise: unitPriceInPaise,
    mrpInPaise: unitPriceInPaise
  });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, {
    qty,
    unitPriceInPaise
  });
  const merchandise = unitPriceInPaise * qty;
  await prisma.order.update({
    where: { id: order.id },
    data: {
      shippingInPaise,
      discountInPaise,
      grandTotalInPaise: merchandise + shippingInPaise - discountInPaise
    }
  });
  await prisma.payment.updateMany({
    where: { orderId: order.id },
    data: { amountInPaise: merchandise + shippingInPaise - discountInPaise }
  });
  await completePaidOrder(rzpOrderId, `pay_desk_${Date.now()}`);
  const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-DESK-${Date.now()}`,
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
      email: `desk-${Date.now()}@example.com`,
      role: "CUSTOMER",
      isVerified: true
    }
  });
  await prisma.order.update({ where: { id: order.id }, data: { customerId: user.id } });
  return { order, orderItem, user, bundle };
}

describe("Returns desk + refund override", () => {
  let orderId: string | null = null;
  let bundle: { productId: string; variantId: string; sku: string; inventoryId: string } | null =
    null;

  beforeEach(async () => {
    if (orderId) await cleanupTestOrder(orderId);
    if (bundle) await cleanupTestProduct(bundle);
    orderId = null;
    bundle = null;
  });

  it("3+4. return detail loads by caseNumber and shows qty 1 of 2", async () => {
    const ctx = await createDeliveredPaidOrder({ qty: 2 });
    orderId = ctx.order.id;
    bundle = ctx.bundle;

    const created = await submitReturnReplacementRequest({
      orderNumber: ctx.order.orderNumber,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      items: [
        {
          orderItemId: ctx.orderItem.id,
          reasonCode: "damaged_delivery",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([
        [0, [{ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg", size: 1 }]]
      ])
    });

    const detail = await getAdminReturnCaseByCaseNumber(created.caseNumber!);
    expect(detail.request.caseNumber).toBe(created.caseNumber);
    expect(detail.request.items[0].qtySelected).toBe(1);
    expect(detail.order.items[0].qtyOrdered).toBe(2);
    expect(detail.stage).toBe("PENDING_APPROVAL");

    const listed = await listReturnCases({ stage: "PENDING_APPROVAL", q: created.caseNumber! });
    expect(listed.rows.some((r) => r.caseNumber === created.caseNumber)).toBe(true);
  });

  it("6. discount allocation reduces merchandise vs gross", async () => {
    const ctx = await createDeliveredPaidOrder({
      qty: 1,
      unitPriceInPaise: 100000,
      shippingInPaise: 0,
      discountInPaise: 20000
    });
    orderId = ctx.order.id;
    bundle = ctx.bundle;

    const calc = await calculateReturnItemRefund({
      orderId: ctx.order.id,
      orderItemId: ctx.orderItem.id,
      qty: 1,
      shippingPolicy: "SHIPPING_RETAINED"
    });
    expect(calc.grossItemValuePaise).toBe(100000);
    expect(calc.allocatedDiscountPaise).toBe(20000);
    expect(calc.merchandiseRefundPaise).toBe(80000);
  });

  it("7-12. override defaults to calculated, requires reason, stores audit, blocks upward for ADMIN", async () => {
    const ctx = await createDeliveredPaidOrder({ qty: 2 });
    orderId = ctx.order.id;
    bundle = ctx.bundle;

    const created = await submitReturnReplacementRequest({
      orderNumber: ctx.order.orderNumber,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      items: [
        {
          orderItemId: ctx.orderItem.id,
          reasonCode: "damaged_delivery",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([
        [0, [{ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg", size: 1 }]]
      ])
    });

    await approveReturnReplacementRequest({
      orderId: ctx.order.id,
      requestId: created.id,
      adminEmail: "admin@sarveda.com"
    });
    await markCustomerReturnReceived({ requestId: created.id, adminUserId: ctx.user.id });
    await setCustomerReturnDisposition({
      requestId: created.id,
      disposition: "RESTOCKABLE",
      adminUserId: ctx.user.id
    });

    const preview = await previewReturnReplacementRefund(created.id);
    expect(preview.calculatedRefundPaise).toBe(650);
    expect(preview.totalRefundNowPaise).toBe(650);
    expect(preview.overrideActive).toBe(false);

    await expect(
      setReturnRefundOverride({
        requestId: created.id,
        overrideRefundPaise: 500,
        reason: "",
        adminEmail: "admin@sarveda.com",
        adminRole: "ADMIN"
      })
    ).rejects.toMatchObject({ code: "OVERRIDE_REASON_REQUIRED" });

    await expect(
      setReturnRefundOverride({
        requestId: created.id,
        overrideRefundPaise: 700,
        reason: "Goodwill",
        adminEmail: "admin@sarveda.com",
        adminRole: "ADMIN"
      })
    ).rejects.toMatchObject({ code: "GOODWILL_REQUIRES_SUPER_ADMIN" });

    const down = await setReturnRefundOverride({
      requestId: created.id,
      overrideRefundPaise: 500,
      reason: "Partial courtesy reduction",
      adminEmail: "admin@sarveda.com",
      adminUserId: ctx.user.id,
      adminRole: "ADMIN"
    });
    expect(down.overrideActive).toBe(true);
    expect(down.calculatedRefundPaise).toBe(650);
    expect(down.totalRefundNowPaise).toBe(500);
    expect(down.overrideDifferencePaise).toBe(-150);

    const row = await prisma.orderServiceRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.calculatedRefundPaise).toBe(650);
    expect(row.approvedOverrideRefundPaise).toBe(500);
    expect(row.overrideReason).toBe("Partial courtesy reduction");

    const up = await setReturnRefundOverride({
      requestId: created.id,
      overrideRefundPaise: 700,
      reason: "Goodwill gesture",
      adminEmail: "super@sarveda.com",
      adminRole: "SUPER_ADMIN"
    });
    expect(up.overrideGoodwillPaise).toBe(50);
    expect(up.complianceFlags).toContain("COMPLIANCE_DECISION_REQUIRED");
  });

  it("13-14. goodwill allocation does not inflate GST/merchandise", () => {
    const line = buildLineRefundAllocation({
      orderItem: {
        id: "00000000-0000-4000-8000-000000000001",
        lineTotalInPaise: 500,
        unitPriceInPaise: 500,
        qtyOrdered: 1,
        taxClass: "gst-5"
      },
      allItems: [{ lineTotalInPaise: 500, unitPriceInPaise: 500, qtyOrdered: 1 }],
      orderDiscountInPaise: 0,
      quantity: 1,
      merchandiseInclusivePaise: 500,
      forwardShippingPaise: 150,
      isGstApplicable: true,
      goodwillAdjustmentPaise: 50
    });
    expect(line.eligibleItemValuePaise).toBe(500);
    expect(line.forwardShippingPaise).toBe(150);
    expect(line.otherDeductionPaise).toBe(-50);
    expect(line.otherDeductionLabel).toBe("GOODWILL_ADJUSTMENT");
    expect(line.approvedRefundPaise).toBe(700);
    expect(line.gstPaise + line.merchandiseTaxablePaise).toBe(500);
  });

  it("stage mapping for completed refund", () => {
    expect(
      deriveReturnCaseStage({
        status: "APPROVED",
        returnPhysicalStatus: "INSPECTED",
        resolutionStatus: "REFUNDED",
        refundProcessedAt: new Date()
      })
    ).toBe("COMPLETED");
  });
});
