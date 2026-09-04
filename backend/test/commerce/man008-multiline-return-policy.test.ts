/**
 * MAN-008 — multi-line return per-line shipping policy + review decisions.
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
  submitReturnReplacementRequest
} from "../../src/modules/orders/return-replacement.service";
import {
  deriveCaseStatusFromLineDecisions,
  ensureReturnLinePoliciesHealed,
  reviewReturnCaseLine
} from "../../src/modules/orders/return-line-review.service";
import { buildReturnCaseMessage } from "../../src/modules/orders/return-case-notifications.service";
import { calculateReturnItemRefund } from "../../src/modules/orders/return-refund-calculator.service";
import { shippingPolicyForReason } from "../../src/modules/orders/return-replacement.constants";

async function createTwoLineDeliveredOrder() {
  const dummy = await createTestProductWithInventory({
    onHand: 50,
    saleInPaise: 700,
    mrpInPaise: 1200
  });
  const test = await createTestProductWithInventory({
    onHand: 50,
    saleInPaise: 500,
    mrpInPaise: 1000
  });

  const { order, rzpOrderId } = await createPendingRazorpayOrder(dummy, {
    qty: 3,
    unitPriceInPaise: 700
  });
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      variantId: test.variantId,
      skuSnapshot: test.sku,
      nameSnapshot: `Dummy-peer ${test.sku}`,
      qtyOrdered: 2,
      unitPriceInPaise: 500,
      discountInPaise: 0,
      taxInPaise: 0,
      lineTotalInPaise: 1000
    }
  });
  // Rename first line snapshot for clarity in assertions
  await prisma.orderItem.updateMany({
    where: { orderId: order.id, variantId: dummy.variantId },
    data: { nameSnapshot: `Dummy Product ${dummy.sku}` }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: {
      subtotalInPaise: 3100,
      shippingInPaise: 800,
      discountInPaise: 0,
      grandTotalInPaise: 3900
    }
  });
  await prisma.payment.updateMany({
    where: { orderId: order.id },
    data: { amountInPaise: 3900 }
  });
  await completePaidOrder(rzpOrderId, `pay_man008_${Date.now()}`);
  const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-M8-${Date.now()}`,
      status: "DELIVERED",
      deliveredAt
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED", fulfillmentStatus: "FULFILLED" }
  });
  const user = await prisma.user.create({
    data: {
      email: `man008-${Date.now()}@example.com`,
      role: "CUSTOMER",
      isVerified: true
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { customerId: user.id, email: user.email }
  });
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const dummyItem = items.find((i) => i.variantId === dummy.variantId)!;
  const testItem = items.find((i) => i.variantId === test.variantId)!;
  return { order, user, dummy, test, dummyItem, testItem, products: [dummy, test] };
}

describe("MAN-008 per-line shipping + review", () => {
  const cleanup: Array<() => Promise<void>> = [];

  beforeEach(() => {
    cleanup.length = 0;
  });

  async function wipe(orderId: string, products: Array<{ productId: string; variantId: string; inventoryId: string; sku: string }>) {
    await cleanupTestOrder(orderId);
    for (const p of products) await cleanupTestProduct(p);
  }

  it("1+3+4 — seller+customer mixed; item order does not change ₹22.20", async () => {
    const a = await createTwoLineDeliveredOrder();
    cleanup.push(() => wipe(a.order.id, a.products));

    const createdFirst = await submitReturnReplacementRequest({
      orderNumber: a.order.orderNumber,
      userId: a.user.id,
      userEmail: a.user.email,
      items: [
        {
          orderItemId: a.dummyItem.id,
          reasonCode: "damaged_delivery",
          qty: 2,
          requestedResolution: "RETURN_FOR_REFUND"
        },
        {
          orderItemId: a.testItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([
        [0, [{ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg", size: 1 }]],
        [1, [{ buffer: Buffer.from("y"), originalname: "b.jpg", mimetype: "image/jpeg", size: 1 }]]
      ])
    });

    const previewA = await previewReturnReplacementRefund(createdFirst.id);
    expect(previewA.merchandiseRefundPaise).toBe(1900);
    expect(previewA.shippingRefundPaise).toBe(320);
    expect(previewA.requestedRefundPaise).toBe(2220);
    expect(previewA.shippingPolicy).toBe("MIXED");
    const dummyLine = previewA.lines.find((l) => l.orderItemId === a.dummyItem.id)!;
    const testLine = previewA.lines.find((l) => l.orderItemId === a.testItem.id)!;
    expect(dummyLine.shippingRefundPaise).toBe(320);
    expect(testLine.shippingRefundPaise).toBe(0);
    expect(dummyLine.shippingPolicy).toBe("SHIPPING_REFUNDABLE");
    expect(testLine.shippingPolicy).toBe("SHIPPING_RETAINED");

    // Reverse order of items on a fresh order
    const b = await createTwoLineDeliveredOrder();
    cleanup.push(() => wipe(b.order.id, b.products));
    const createdSecond = await submitReturnReplacementRequest({
      orderNumber: b.order.orderNumber,
      userId: b.user.id,
      userEmail: b.user.email,
      items: [
        {
          orderItemId: b.testItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        },
        {
          orderItemId: b.dummyItem.id,
          reasonCode: "damaged_delivery",
          qty: 2,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([
        [0, [{ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg", size: 1 }]],
        [1, [{ buffer: Buffer.from("y"), originalname: "b.jpg", mimetype: "image/jpeg", size: 1 }]]
      ])
    });
    const previewB = await previewReturnReplacementRefund(createdSecond.id);
    expect(previewB.requestedRefundPaise).toBe(2220);
    expect(previewB.shippingRefundPaise).toBe(320);
    expect(previewB.shippingPolicy).toBe("MIXED");

    for (const fn of cleanup.splice(0)) await fn();
  });

  it("5 — per-line policy persisted at submit", async () => {
    const a = await createTwoLineDeliveredOrder();
    const created = await submitReturnReplacementRequest({
      orderNumber: a.order.orderNumber,
      userId: a.user.id,
      userEmail: a.user.email,
      items: [
        {
          orderItemId: a.dummyItem.id,
          reasonCode: "damaged_delivery",
          qty: 2,
          requestedResolution: "RETURN_FOR_REFUND"
        },
        {
          orderItemId: a.testItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([
        [0, [{ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg", size: 1 }]],
        [1, [{ buffer: Buffer.from("y"), originalname: "b.jpg", mimetype: "image/jpeg", size: 1 }]]
      ])
    });
    const items = await prisma.orderServiceRequestItem.findMany({ where: { requestId: created.id } });
    expect(items.find((i) => i.orderItemId === a.dummyItem.id)?.shippingRefundPolicy).toBe(
      "SHIPPING_REFUNDABLE"
    );
    expect(items.find((i) => i.orderItemId === a.testItem.id)?.shippingRefundPolicy).toBe(
      "SHIPPING_RETAINED"
    );
    await wipe(a.order.id, a.products);
  });

  it("7+8+9+11+13 — approve one reject one; reject requires note; pickup qty", async () => {
    const a = await createTwoLineDeliveredOrder();
    const created = await submitReturnReplacementRequest({
      orderNumber: a.order.orderNumber,
      userId: a.user.id,
      userEmail: a.user.email,
      items: [
        {
          orderItemId: a.dummyItem.id,
          reasonCode: "damaged_delivery",
          qty: 2,
          requestedResolution: "RETURN_FOR_REFUND"
        },
        {
          orderItemId: a.testItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([
        [0, [{ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg", size: 1 }]],
        [1, [{ buffer: Buffer.from("y"), originalname: "b.jpg", mimetype: "image/jpeg", size: 1 }]]
      ])
    });
    const dummyLine = created.items.find((i) => i.orderItemId === a.dummyItem.id)!;
    const testLine = created.items.find((i) => i.orderItemId === a.testItem.id)!;

    await expect(
      reviewReturnCaseLine({
        orderId: a.order.id,
        requestId: created.id,
        itemId: testLine.id,
        decision: "REJECTED",
        adminEmail: "admin@test.com"
      })
    ).rejects.toMatchObject({ code: "CUSTOMER_NOTE_REQUIRED" });

    await reviewReturnCaseLine({
      orderId: a.order.id,
      requestId: created.id,
      itemId: dummyLine.id,
      decision: "APPROVED",
      adminEmail: "admin@test.com"
    });
    await reviewReturnCaseLine({
      orderId: a.order.id,
      requestId: created.id,
      itemId: testLine.id,
      decision: "REJECTED",
      customerFacingNote: "Preference returns not accepted this week",
      adminEmail: "admin@test.com"
    });

    const fresh = await prisma.orderServiceRequest.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: true, returnShipment: true }
    });
    expect(fresh.status).toBe("PARTIALLY_APPROVED");
    expect(fresh.returnShipment).toBeTruthy();

    const preview = await previewReturnReplacementRefund(created.id);
    expect(preview.totalRefundNowPaise).toBe(1720);
    expect(preview.lines.find((l) => l.requestItemId === testLine.id)?.includedInRefundNow).toBe(
      false
    );
    expect(preview.approvedQtySelected).toBe(2);

    await wipe(a.order.id, a.products);
  });

  it("10 — more-info can target one line", async () => {
    const a = await createTwoLineDeliveredOrder();
    const created = await submitReturnReplacementRequest({
      orderNumber: a.order.orderNumber,
      userId: a.user.id,
      userEmail: a.user.email,
      items: [
        {
          orderItemId: a.dummyItem.id,
          reasonCode: "damaged_delivery",
          qty: 2,
          requestedResolution: "RETURN_FOR_REFUND"
        },
        {
          orderItemId: a.testItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([
        [0, [{ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg", size: 1 }]],
        [1, [{ buffer: Buffer.from("y"), originalname: "b.jpg", mimetype: "image/jpeg", size: 1 }]]
      ])
    });
    const dummyLine = created.items.find((i) => i.orderItemId === a.dummyItem.id)!;
    await reviewReturnCaseLine({
      orderId: a.order.id,
      requestId: created.id,
      itemId: dummyLine.id,
      decision: "MORE_INFO_REQUIRED",
      moreInfoPrompt: "Please add close-up of damage",
      adminEmail: "admin@test.com"
    });
    const fresh = await prisma.orderServiceRequest.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: true }
    });
    expect(fresh.status).toBe("MORE_INFO_REQUIRED");
    expect(fresh.items.find((i) => i.id === dummyLine.id)?.moreInfoPrompt).toContain("close-up");
    await wipe(a.order.id, a.products);
  });

  it("14 — partial-decision notification wording", () => {
    const msg = buildReturnCaseMessage("RETURN_PARTIALLY_APPROVED", {
      orderNumber: "SRV-20260900006",
      caseNumber: "RC-202609-00002",
      customerEmail: "a@b.com",
      itemSummary: "Dummy × 2",
      approvedItemSummary: "Dummy Product × 2",
      rejectedItemSummary: "Test Product × 1: Not accepted",
      physicalReturnRequired: true
    });
    expect(msg.textBody).toContain("Your return request has been reviewed");
    expect(msg.textBody).toContain("Approved:");
    expect(msg.textBody).toContain("Not approved:");
    expect(msg.textBody).not.toContain("Your return/refund request has been approved.");
  });

  it("13 — case status roll-up", () => {
    expect(deriveCaseStatusFromLineDecisions(["PENDING", "PENDING"])).toBe("PENDING_APPROVAL");
    expect(deriveCaseStatusFromLineDecisions(["APPROVED", "APPROVED"])).toBe("APPROVED");
    expect(deriveCaseStatusFromLineDecisions(["REJECTED", "REJECTED"])).toBe("REJECTED");
    expect(deriveCaseStatusFromLineDecisions(["APPROVED", "REJECTED"])).toBe("PARTIALLY_APPROVED");
    expect(deriveCaseStatusFromLineDecisions(["APPROVED", "MORE_INFO_REQUIRED"])).toBe(
      "MORE_INFO_REQUIRED"
    );
    expect(deriveCaseStatusFromLineDecisions(["PENDING", "MORE_INFO_REQUIRED"])).toBe(
      "MORE_INFO_REQUIRED"
    );
  });

  it("20 — live-case compatibility heal from reason codes", async () => {
    const a = await createTwoLineDeliveredOrder();
    const created = await submitReturnReplacementRequest({
      orderNumber: a.order.orderNumber,
      userId: a.user.id,
      userEmail: a.user.email,
      items: [
        {
          orderItemId: a.dummyItem.id,
          reasonCode: "damaged_delivery",
          qty: 2,
          requestedResolution: "RETURN_FOR_REFUND"
        },
        {
          orderItemId: a.testItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([
        [0, [{ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg", size: 1 }]],
        [1, [{ buffer: Buffer.from("y"), originalname: "b.jpg", mimetype: "image/jpeg", size: 1 }]]
      ])
    });
    // Simulate pre-MAN-008 null policies
    await prisma.orderServiceRequestItem.updateMany({
      where: { requestId: created.id },
      data: { shippingRefundPolicy: null }
    });
    await prisma.orderServiceRequest.update({
      where: { id: created.id },
      data: { shippingRefundPolicy: "SHIPPING_REFUNDABLE" }
    });
    const healed = await ensureReturnLinePoliciesHealed(created.id);
    expect(healed.healedPolicyCount).toBe(2);
    const preview = await previewReturnReplacementRefund(created.id);
    expect(preview.requestedRefundPaise).toBe(2220);
    await wipe(a.order.id, a.products);
  });

  it("7 — approve both → both eligible in refund now", async () => {
    const a = await createTwoLineDeliveredOrder();
    const created = await submitReturnReplacementRequest({
      orderNumber: a.order.orderNumber,
      userId: a.user.id,
      userEmail: a.user.email,
      items: [
        {
          orderItemId: a.dummyItem.id,
          reasonCode: "damaged_delivery",
          qty: 2,
          requestedResolution: "RETURN_FOR_REFUND"
        },
        {
          orderItemId: a.testItem.id,
          reasonCode: "changed_mind",
          qty: 1,
          requestedResolution: "RETURN_FOR_REFUND"
        }
      ],
      photosByIndex: new Map([
        [0, [{ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg", size: 1 }]],
        [1, [{ buffer: Buffer.from("y"), originalname: "b.jpg", mimetype: "image/jpeg", size: 1 }]]
      ])
    });
    await approveReturnReplacementRequest({
      orderId: a.order.id,
      requestId: created.id,
      adminEmail: "admin@test.com"
    });
    const preview = await previewReturnReplacementRefund(created.id);
    expect(preview.totalRefundNowPaise).toBe(2220);
    expect(preview.lines.every((l) => l.includedInRefundNow)).toBe(true);
    await wipe(a.order.id, a.products);
  });

  it("single-line policy helpers remain green", () => {
    expect(shippingPolicyForReason("damaged_delivery")).toBe("SHIPPING_REFUNDABLE");
    expect(shippingPolicyForReason("changed_mind")).toBe("SHIPPING_RETAINED");
  });

  it("calculator unit allocation unchanged", async () => {
    const a = await createTwoLineDeliveredOrder();
    const calc = await calculateReturnItemRefund({
      orderId: a.order.id,
      orderItemId: a.dummyItem.id,
      qty: 2,
      shippingPolicy: "SHIPPING_REFUNDABLE"
    });
    expect(calc.merchandiseRefundPaise).toBe(1400);
    expect(calc.shippingRefundPaise).toBe(320);
    const retained = await calculateReturnItemRefund({
      orderId: a.order.id,
      orderItemId: a.testItem.id,
      qty: 1,
      shippingPolicy: "SHIPPING_RETAINED"
    });
    expect(retained.merchandiseRefundPaise).toBe(500);
    expect(retained.shippingRefundPaise).toBe(0);
    await wipe(a.order.id, a.products);
  });
});
