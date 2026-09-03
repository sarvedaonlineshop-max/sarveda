/**
 * Phase 2 — Return Case architecture focused tests.
 */
import "./setup-mocks";
import type { OrderStatus, ShipmentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/db";
import { nextReturnCaseNumber } from "../../src/modules/orders/return-case-number";
import {
  appendCaseEvent,
  listCaseEvents,
  serializeCaseEventForCustomer
} from "../../src/modules/orders/return-case-events.service";
import {
  shippingPolicyForRootCause,
  requestMoreInfo,
  provideMoreInfo,
  setReturnCaseRootCause
} from "../../src/modules/orders/return-case.service";
import { allowedResolutionsForReason } from "../../src/modules/orders/return-replacement.constants";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory
} from "../helpers/commerce";

async function createPaidDeliveredOrder(
  bundle: Awaited<ReturnType<typeof createTestProductWithInventory>>
) {
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 1 });
  await completePaidOrder(rzpOrderId, `pay_p2_${Date.now()}`);
  if (!order.customerId) {
    const user = await prisma.user.create({
      data: {
        email: order.email,
        role: "CUSTOMER",
        isVerified: true
      }
    });
    await prisma.order.update({ where: { id: order.id }, data: { customerId: user.id } });
  }
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-P2-${Date.now()}`,
      status: "DELIVERED" satisfies ShipmentStatus,
      deliveredAt: new Date()
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED" satisfies OrderStatus }
  });
  return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
}

describe("Phase 2 return case architecture", () => {
  it("allocates unique immutable RC-YYYYMM-##### case numbers", async () => {
    const a = await nextReturnCaseNumber();
    const b = await nextReturnCaseNumber();
    expect(a).toMatch(/^RC-\d{6}-\d{5}$/);
    expect(b).toMatch(/^RC-\d{6}-\d{5}$/);
    expect(a).not.toBe(b);
  });

  it("allows MISSING_PART resolution for missing_parts reason", () => {
    expect(allowedResolutionsForReason("missing_parts")).toContain("MISSING_PART");
  });

  it("maps root cause to shipping policy without overwriting customer reason semantics", () => {
    expect(shippingPolicyForRootCause("SARVEDA_LISTING_CONTENT", "different_description")).toBe(
      "SHIPPING_REFUNDABLE"
    );
    expect(shippingPolicyForRootCause("CUSTOMER", "different_description")).toBe("SHIPPING_RETAINED");
    expect(shippingPolicyForRootCause("PRODUCT_VENDOR_QC", "quality_issue")).toBe("SHIPPING_REFUNDABLE");
    expect(shippingPolicyForRootCause("UNDETERMINED", "arrived_late")).toBe("MANUAL_REVIEW");
  });

  it("MORE_INFO_REQUIRED pauses case and customer response resumes pending approval", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 5 });
    const order = await createPaidDeliveredOrder(bundle);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    const caseNumber = await nextReturnCaseNumber();
    const request = await prisma.orderServiceRequest.create({
      data: {
        caseNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerEmail: order.email,
        type: "REFUND_AFTER_DELIVERY",
        status: "PENDING_APPROVAL",
        reasonCode: "defective",
        reasonLabel: "Defective",
        items: {
          create: {
            orderItemId: item.id,
            nameSnapshot: item.nameSnapshot,
            skuSnapshot: item.skuSnapshot,
            qtySelected: 1,
            reasonCode: "defective",
            reasonLabel: "Defective"
          }
        }
      }
    });

    await appendCaseEvent({
      requestId: request.id,
      eventType: "CASE_CREATED",
      message: "created"
    });

    await requestMoreInfo({
      orderId: order.id,
      requestId: request.id,
      prompt: "Please send a clear photo of the serial number",
      adminEmail: "admin@test.com"
    });

    let updated = await prisma.orderServiceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("MORE_INFO_REQUIRED");
    expect(updated.slaPausedAt).not.toBeNull();
    expect(updated.moreInfoPrompt).toContain("serial");

    await provideMoreInfo({
      orderNumber: order.orderNumber,
      requestId: request.id,
      userId: order.customerId!,
      userEmail: order.email,
      response: "Here is the serial photo description"
    });

    updated = await prisma.orderServiceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("PENDING_APPROVAL");
    expect(updated.slaPausedAt).toBeNull();
    expect(updated.moreInfoResponse).toContain("serial");

    const events = await listCaseEvents(request.id);
    const types = events.map((e) => e.eventType);
    expect(types).toContain("MORE_INFO_REQUESTED");
    expect(types).toContain("MORE_INFO_PROVIDED");

    await setReturnCaseRootCause({
      orderId: order.id,
      requestId: request.id,
      rootCause: "SARVEDA_DISPATCH",
      adminEmail: "admin@test.com"
    });
    const afterRoot = await listCaseEvents(request.id);
    const customerVisible = afterRoot
      .map(serializeCaseEventForCustomer)
      .filter(Boolean)
      .map((e) => e!.eventType);
    expect(customerVisible).not.toContain("ROOT_CAUSE_SET");

    const withRoot = await prisma.orderServiceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(withRoot.rootCause).toBe("SARVEDA_DISPATCH");
    expect(withRoot.reasonCode).toBe("defective");
    expect(withRoot.shippingRefundPolicy).toBe("SHIPPING_REFUNDABLE");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
