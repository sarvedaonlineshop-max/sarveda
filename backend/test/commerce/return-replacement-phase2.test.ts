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
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import {
  getReturnEligibility,
  unavailableReturnQtyFromCaseLines
} from "../../src/modules/orders/return-eligibility.service";
import {
  approveReturnReplacementRequest,
  executeReturnReplacementRefund,
  submitReturnReplacementRequest
} from "../../src/modules/orders/return-replacement.service";
import {
  markCustomerReturnReceived,
  setCustomerReturnDisposition
} from "../../src/modules/orders/customer-return-workflow.service";
import { getCommerceMocks } from "./setup-mocks";

async function createDeliveredPaidOrder(opts?: { qty?: number; onHand?: number }) {
  const bundle = await createTestProductWithInventory({ onHand: opts?.onHand ?? 50 });
  const qty = opts?.qty ?? 2;
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty });
  await completePaidOrder(rzpOrderId, `pay_p2_${Date.now()}`);
  const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-P2-${Date.now()}`,
      status: "DELIVERED",
      deliveredAt
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED", fulfillmentStatus: "FULFILLED" }
  });
  const orderItem = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
  const user = await prisma.user.create({
    data: {
      email: `p2-${Date.now()}@example.com`,
      role: "CUSTOMER",
      isVerified: true
    }
  });
  await prisma.order.update({ where: { id: order.id }, data: { customerId: user.id } });
  return { bundle, order, orderItem: orderItem!, user, deliveredAt };
}

const dummyPhoto = {
  buffer: Buffer.from("fake-image"),
  originalname: "evidence.jpg",
  mimetype: "image/jpeg",
  size: 11
};

function photosForFirstItem() {
  return new Map([[0, [dummyPhoto]]]);
}

describe("Phase 2 return / replacement", () => {
  beforeEach(() => {
    const m = getCommerceMocks();
    m.razorpayRefund.mockClear();
    m.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_p2_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    }));
  });

  it("A — delivered eligible return", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder();
    const full = await prisma.order.findUnique({
      where: { id: order.id },
      include: { payments: true, shipments: true, statusHistory: true }
    });
    const eligibility = await getReturnEligibility({
      order: full!,
      orderItemId: orderItem.id,
      qtyRequested: 1
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.maxReturnableQty).toBe(2);
    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("B — non-delivered return rejected", async () => {
    const bundle = await createTestProductWithInventory();
    const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle);
    await completePaidOrder(rzpOrderId, `pay_p2_nd_${Date.now()}`);
    const orderItem = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const full = await prisma.order.findUnique({
      where: { id: order.id },
      include: { payments: true, shipments: true, statusHistory: true }
    });
    const eligibility = await getReturnEligibility({
      order: full!,
      orderItemId: orderItem!.id,
      qtyRequested: 1
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockCode).toBe("NOT_DELIVERED");
    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("C — return window enforcement", async () => {
    const { bundle, order, orderItem, user, deliveredAt } = await createDeliveredPaidOrder();
    await prisma.shipment.updateMany({
      where: { orderId: order.id },
      data: { deliveredAt: new Date(deliveredAt.getTime() - 10 * 24 * 60 * 60 * 1000) }
    });
    const full = await prisma.order.findUnique({
      where: { id: order.id },
      include: { payments: true, shipments: true, statusHistory: true }
    });
    const eligibility = await getReturnEligibility({
      order: full!,
      orderItemId: orderItem.id,
      qtyRequested: 1
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockCode).toBe("RETURN_WINDOW_EXPIRED");
    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("D — partial qty return submit", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({ qty: 3 });
    const created = await submitReturnReplacementRequest({
      orderNumber: order.orderNumber,
      userId: user.id,
      userEmail: user.email,
      items: [
        {
          orderItemId: orderItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: photosForFirstItem()
    });
    expect(created.items[0].qtySelected).toBe(1);
    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("J/K/L/M — physical receipt + disposition restock idempotency", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({ qty: 1, onHand: 10 });
    const invBefore = await getInventory(bundle.variantId);

    const created = await submitReturnReplacementRequest({
      orderNumber: order.orderNumber,
      userId: user.id,
      userEmail: user.email,
      items: [
        {
          orderItemId: orderItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: photosForFirstItem()
    });

    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });

    const midInv = await getInventory(bundle.variantId);
    expect(midInv.onHand).toBe(invBefore.onHand);

    await markCustomerReturnReceived({ requestId: created.id });
    const afterReceive = await getInventory(bundle.variantId);
    expect(afterReceive.onHand).toBe(invBefore.onHand);

    await setCustomerReturnDisposition({
      requestId: created.id,
      disposition: "RESTOCKABLE"
    });
    const afterRestock = await getInventory(bundle.variantId);
    expect(afterRestock.onHand).toBe(invBefore.onHand + 1);

    await setCustomerReturnDisposition({
      requestId: created.id,
      disposition: "RESTOCKABLE"
    });
    const afterDup = await getInventory(bundle.variantId);
    expect(afterDup.onHand).toBe(afterRestock.onHand);

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("M — damaged disposition does not restock sellable", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({ qty: 1, onHand: 8 });
    const invBefore = await getInventory(bundle.variantId);

    const created = await submitReturnReplacementRequest({
      orderNumber: order.orderNumber,
      userId: user.id,
      userEmail: user.email,
      items: [
        {
          orderItemId: orderItem.id,
          reasonCode: "quality_issue",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: photosForFirstItem()
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

    const after = await getInventory(bundle.variantId);
    expect(after.onHand).toBe(invBefore.onHand);

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("N — partial refund execution via Phase 1E after physical receipt", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder({ qty: 2, onHand: 5 });

    const created = await submitReturnReplacementRequest({
      orderNumber: order.orderNumber,
      userId: user.id,
      userEmail: user.email,
      items: [
        {
          orderItemId: orderItem.id,
          reasonCode: "quality_issue",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: photosForFirstItem()
    });

    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });
    await markCustomerReturnReceived({ requestId: created.id });
    await setCustomerReturnDisposition({
      requestId: created.id,
      disposition: "RESTOCKABLE"
    });

    const result = await executeReturnReplacementRefund({
      requestId: created.id,
      adminEmail: "admin@test.com"
    });
    expect(result.totalRefundedInPaise).toBeGreaterThan(0);
    expect(result.refundIds.length).toBe(1);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.paymentStatus).toBe("PARTIALLY_REFUNDED");
    expect(updated?.status).not.toBe("REFUNDED");

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("refund blocked before physical receipt", async () => {
    const { bundle, order, orderItem, user } = await createDeliveredPaidOrder();

    const created = await submitReturnReplacementRequest({
      orderNumber: order.orderNumber,
      userId: user.id,
      userEmail: user.email,
      items: [
        {
          orderItemId: orderItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: photosForFirstItem()
    });

    await approveReturnReplacementRequest({
      orderId: order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });

    await expect(
      executeReturnReplacementRefund({ requestId: created.id, adminEmail: "admin@test.com" })
    ).rejects.toMatchObject({ code: "RETURN_NOT_RECEIVED" });

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });
});

describe("MAN-008E Chunk 1A — per-line return eligibility qty", () => {
  it("Dummy ordered3 approved2 on PARTIALLY_APPROVED → unavailable 2 (remaining 1)", () => {
    const unavailable = unavailableReturnQtyFromCaseLines([
      {
        qtySelected: 2,
        reviewDecision: "APPROVED",
        caseStatus: "PARTIALLY_APPROVED"
      }
    ]);
    expect(unavailable).toBe(2);
    expect(Math.max(0, 3 - unavailable)).toBe(1);
  });

  it("Test ordered2 rejected1 on PARTIALLY_APPROVED → locked 1 (remaining 1)", () => {
    const unavailable = unavailableReturnQtyFromCaseLines([
      {
        qtySelected: 1,
        reviewDecision: "REJECTED",
        caseStatus: "PARTIALLY_APPROVED"
      }
    ]);
    expect(unavailable).toBe(1);
    expect(Math.max(0, 2 - unavailable)).toBe(1);
  });

  it("PENDING and MORE_INFO_REQUIRED reduce availability; untouched stays free", () => {
    expect(
      unavailableReturnQtyFromCaseLines([
        { qtySelected: 1, reviewDecision: "PENDING", caseStatus: "PENDING_APPROVAL" }
      ])
    ).toBe(1);
    expect(
      unavailableReturnQtyFromCaseLines([
        { qtySelected: 2, reviewDecision: "MORE_INFO_REQUIRED", caseStatus: "MORE_INFO_REQUIRED" }
      ])
    ).toBe(2);
    // Mixed partial case: approved 2 + rejected 1 on ordered 5 → remaining 2 untouched
    const mixed = unavailableReturnQtyFromCaseLines([
      { qtySelected: 2, reviewDecision: "APPROVED", caseStatus: "PARTIALLY_APPROVED" },
      { qtySelected: 1, reviewDecision: "REJECTED", caseStatus: "PARTIALLY_APPROVED" }
    ]);
    expect(mixed).toBe(3);
    expect(Math.max(0, 5 - mixed)).toBe(2);
  });

  it("customer snapshot buckets match Dummy/Test live shape", async () => {
    const { summarizeReturnCaseLineQtys } = await import(
      "../../src/modules/orders/return-eligibility.service"
    );
    const dummy = summarizeReturnCaseLineQtys([
      {
        qtySelected: 2,
        reviewDecision: "APPROVED",
        caseStatus: "PARTIALLY_APPROVED",
        caseNumber: "RC-202609-00002",
        requestId: "req-1"
      }
    ]);
    expect(dummy.approvedQty).toBe(2);
    expect(dummy.rejectedLockedQty).toBe(0);
    expect(dummy.approvedQty + dummy.pendingQty + dummy.moreInfoQty).toBe(2);

    const test = summarizeReturnCaseLineQtys([
      {
        qtySelected: 1,
        reviewDecision: "REJECTED",
        caseStatus: "PARTIALLY_APPROVED",
        caseNumber: "RC-202609-00002",
        requestId: "req-1"
      }
    ]);
    expect(test.rejectedLockedQty).toBe(1);
    expect(test.approvedQty).toBe(0);
  });
});
