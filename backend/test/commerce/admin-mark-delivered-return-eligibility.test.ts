/**
 * Regression: Admin Mark Delivered must establish one canonical delivery truth
 * shared by My Orders eligibility and return submission.
 */
import "./setup-mocks";
import type { OrderStatus, ShipmentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import { markOrderDeliveredByAdmin } from "../../src/modules/orders/order-delivery.service";
import { getReturnEligibility } from "../../src/modules/orders/return-eligibility.service";
import {
  canRequestRefund,
  resolveDeliveredAt,
  returnWindowEnd
} from "../../src/modules/orders/order-service-request.service";
import { persistShipmentTrackingFromCarrier } from "../../src/modules/shipping/shipmentTracking.persist";
import { submitReturnReplacementRequest } from "../../src/modules/orders/return-replacement.service";
import { getCommerceMocks } from "./setup-mocks";

async function createPaidOrderWithInTransitShipment() {
  const bundle = await createTestProductWithInventory({ onHand: 20 });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 2 });
  await completePaidOrder(rzpOrderId, `pay_md_${Date.now()}`);

  const user = await prisma.user.create({
    data: {
      email: `md-${Date.now()}@example.com`,
      role: "CUSTOMER",
      isVerified: true
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: {
      customerId: user.id,
      status: "SHIPPED" satisfies OrderStatus,
      fulfillmentStatus: "PARTIAL"
    }
  });

  const shipment = await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-MD-${Date.now()}`,
      status: "INTRANSIT" satisfies ShipmentStatus
    }
  });

  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  return { bundle, order, shipment, orderItem, user };
}

async function loadEligibilityOrder(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      payments: true,
      shipments: true,
      statusHistory: true,
      items: true
    }
  });
}

function myOrdersCanRefund(full: Awaited<ReturnType<typeof loadEligibilityOrder>>): boolean {
  return canRequestRefund({
    orderNumber: full.orderNumber,
    email: full.email,
    status: full.status,
    paymentStatus: full.paymentStatus,
    customerId: full.customerId,
    payments: full.payments,
    shipments: full.shipments,
    statusHistory: full.statusHistory
  });
}

const dummyPhoto = {
  buffer: Buffer.from("fake-image"),
  originalname: "evidence.jpg",
  mimetype: "image/jpeg",
  size: 11
};

describe("Admin Mark Delivered ↔ return eligibility consistency", () => {
  beforeEach(() => {
    const m = getCommerceMocks();
    m.razorpayRefund.mockClear();
    m.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_md_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    }));
  });

  it("1 — paid + shipment INTRANSIT → return submission rejected", async () => {
    const { bundle, order, orderItem, user } = await createPaidOrderWithInTransitShipment();
    const full = await loadEligibilityOrder(order.id);

    expect(myOrdersCanRefund(full)).toBe(false);

    const eligibility = await getReturnEligibility({
      order: full,
      orderItemId: orderItem.id,
      qtyRequested: 1
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockCode).toBe("NOT_DELIVERED");

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("2+3+4 — after Mark Delivered → submission allowed; My Orders agrees; deliveredAt set", async () => {
    const { bundle, order, shipment, orderItem, user } = await createPaidOrderWithInTransitShipment();
    const fixedNow = new Date("2026-09-04T10:00:00.000Z");

    const result = await markOrderDeliveredByAdmin(order.id, {
      reason: "Admin marked delivered",
      now: fixedNow
    });

    expect(result.newlyDelivered).toBe(true);
    expect(result.deliveredAt.toISOString()).toBe(fixedNow.toISOString());
    expect(result.fulfillmentStatus).toBe("FULFILLED");

    const full = await loadEligibilityOrder(order.id);
    expect(full.status).toBe("DELIVERED");
    expect(full.fulfillmentStatus).toBe("FULFILLED");

    const ship = full.shipments.find((s) => s.id === shipment.id)!;
    expect(ship.status).toBe("DELIVERED");
    expect(ship.deliveredAt?.toISOString()).toBe(fixedNow.toISOString());
    expect(resolveDeliveredAt(full)?.toISOString()).toBe(fixedNow.toISOString());

    expect(myOrdersCanRefund(full)).toBe(true);

    const eligibility = await getReturnEligibility({
      order: full,
      orderItemId: orderItem.id,
      qtyRequested: 1
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.deliveredAt?.toISOString()).toBe(fixedNow.toISOString());

    // My Orders flag and submission eligibility must agree.
    expect(myOrdersCanRefund(full)).toBe(eligibility.eligible);

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("5 — 7-day window starts from deliveredAt, not order createdAt / payment date", async () => {
    const { bundle, order, orderItem, user } = await createPaidOrderWithInTransitShipment();

    // Backdate order creation far outside a naive "createdAt + 7d" window.
    const oldCreated = new Date("2026-01-01T00:00:00.000Z");
    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: oldCreated, placedAt: oldCreated }
    });

    const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await markOrderDeliveredByAdmin(order.id, { now: deliveredAt });

    const full = await loadEligibilityOrder(order.id);
    const eligibility = await getReturnEligibility({
      order: full,
      orderItemId: orderItem.id,
      qtyRequested: 1
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.deliveredAt?.toISOString()).toBe(deliveredAt.toISOString());
    expect(eligibility.returnWindowEndsAt?.getTime()).toBe(returnWindowEnd(deliveredAt).getTime());
    // Window must not be keyed off January createdAt.
    expect(eligibility.returnWindowEndsAt!.getTime()).toBeGreaterThan(Date.now());

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("6 — after return window expires → submission rejected", async () => {
    const { bundle, order, orderItem, user } = await createPaidOrderWithInTransitShipment();
    const deliveredAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await markOrderDeliveredByAdmin(order.id, { now: deliveredAt });

    const full = await loadEligibilityOrder(order.id);
    expect(myOrdersCanRefund(full)).toBe(false);

    const eligibility = await getReturnEligibility({
      order: full,
      orderItemId: orderItem.id,
      qtyRequested: 1
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockCode).toBe("RETURN_WINDOW_EXPIRED");
    expect(myOrdersCanRefund(full)).toBe(false);

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("7 — repeated Mark Delivered is idempotent (deliveredAt / history / email-side newlyDelivered)", async () => {
    const { bundle, order, shipment, user } = await createPaidOrderWithInTransitShipment();
    const firstAt = new Date("2026-09-01T08:00:00.000Z");
    const first = await markOrderDeliveredByAdmin(order.id, { now: firstAt });
    expect(first.newlyDelivered).toBe(true);

    const secondAt = new Date("2026-09-10T12:00:00.000Z");
    const second = await markOrderDeliveredByAdmin(order.id, { now: secondAt });
    expect(second.newlyDelivered).toBe(false);
    expect(second.deliveredAt.toISOString()).toBe(firstAt.toISOString());

    const ship = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(ship.deliveredAt?.toISOString()).toBe(firstAt.toISOString());
    expect(ship.status).toBe("DELIVERED");

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id, toStatus: "DELIVERED" }
    });
    expect(history).toHaveLength(1);

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("8 — carrier INTRANSIT after manual Mark Delivered must not regress delivery state", async () => {
    const { bundle, order, shipment, user } = await createPaidOrderWithInTransitShipment();
    const deliveredAt = new Date("2026-09-04T09:00:00.000Z");
    await markOrderDeliveredByAdmin(order.id, { now: deliveredAt });

    const row = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
      include: { order: true }
    });

    const result = await persistShipmentTrackingFromCarrier(row, "INTRANSIT");
    expect(result.orderStatus).toBe("DELIVERED");
    expect(result.fulfillmentStatus).toBe("FULFILLED");

    const afterShip = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(afterShip.status).toBe("DELIVERED");
    expect(afterShip.deliveredAt?.toISOString()).toBe(deliveredAt.toISOString());

    const afterOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterOrder.status).toBe("DELIVERED");
    expect(afterOrder.fulfillmentStatus).toBe("FULFILLED");

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });

  it("9 — legacy inconsistent state (order DELIVERED, shipment still INTRANSIT) is healed by Mark Delivered; submit works", async () => {
    const { bundle, order, shipment, orderItem, user } = await createPaidOrderWithInTransitShipment();

    // Reproduce the bug: status flipped without shipment/history delivery truth.
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "DELIVERED", fulfillmentStatus: "PARTIAL" }
    });

    const broken = await loadEligibilityOrder(order.id);
    expect(resolveDeliveredAt(broken)).toBeNull();
    expect(myOrdersCanRefund(broken)).toBe(false);
    const blocked = await getReturnEligibility({
      order: broken,
      orderItemId: orderItem.id,
      qtyRequested: 1
    });
    expect(blocked.blockCode).toBe("NOT_DELIVERED");

    const healedAt = new Date("2026-09-04T11:30:00.000Z");
    const heal = await markOrderDeliveredByAdmin(order.id, { now: healedAt });
    expect(heal.newlyDelivered).toBe(true);
    expect(heal.deliveredAt.toISOString()).toBe(healedAt.toISOString());

    const full = await loadEligibilityOrder(order.id);
    expect(full.fulfillmentStatus).toBe("FULFILLED");
    expect(full.shipments.find((s) => s.id === shipment.id)?.status).toBe("DELIVERED");
    expect(myOrdersCanRefund(full)).toBe(true);

    await submitReturnReplacementRequest({
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

    const pending = await prisma.orderServiceRequest.findFirst({
      where: { orderId: order.id, type: "REFUND_AFTER_DELIVERY" }
    });
    expect(pending?.status).toBe("PENDING_APPROVAL");

    await cleanupTestOrder(order.id);
    await prisma.user.delete({ where: { id: user.id } });
    await cleanupTestProduct(bundle);
  });
});
