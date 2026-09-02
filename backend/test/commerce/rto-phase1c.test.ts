import "./setup-mocks";
import type { ShipmentStatus } from "@prisma/client";
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
import { initiateGatewayRefund } from "../../src/modules/payments/refund.service";
import { getCancellationEligibility } from "../../src/modules/orders/cancellation-eligibility";
import { listOrderInventoryRestocks } from "../../src/modules/orders/order-inventory-restock.service";
import { loadOrderRefundPreview } from "../../src/modules/orders/order-refund-preview.service";
import {
  loadRtoWorkflowState,
  markRtoReceived,
  setRtoDisposition
} from "../../src/modules/orders/rto-workflow.service";
import {
  applyCarrierWebhookTracking,
  handleRtoShipment
} from "../../src/modules/shipping/orderLifecycle";
import { getCommerceMocks } from "./setup-mocks";

async function createPaidOrderWithRtoShipment(opts: {
  bundle: Awaited<ReturnType<typeof createTestProductWithInventory>>;
  qty?: number;
  shippingInPaise?: number;
}) {
  const { order, rzpOrderId } = await createPendingRazorpayOrder(opts.bundle, {
    qty: opts.qty ?? 2
  });
  if (opts.shippingInPaise != null) {
    const updatedGrand = order.grandTotalInPaise + opts.shippingInPaise;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        shippingInPaise: opts.shippingInPaise,
        grandTotalInPaise: updatedGrand
      }
    });
    await prisma.payment.updateMany({
      where: { orderId: order.id },
      data: { amountInPaise: updatedGrand }
    });
  }
  await completePaidOrder(rzpOrderId, `pay_rto_${Date.now()}`);
  const awb = `AWB-RTO-${Date.now()}`;
  const shipment = await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb,
      status: "RTO" as ShipmentStatus,
      rtoAt: new Date()
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "SHIPPED", fulfillmentStatus: "RETURNED" }
  });
  return { order, shipment, awb };
}

async function createCodRtoOrder(bundle: Awaited<ReturnType<typeof createTestProductWithInventory>>) {
  const lineTotal = 118_000;
  const order = await prisma.order.create({
    data: {
      orderNumber: `SRV-COD-RTO-${Date.now()}`,
      email: `cod-rto-${Date.now()}@example.com`,
      phone: "9876543210",
      status: "SHIPPED",
      paymentStatus: "PENDING",
      fulfillmentStatus: "RETURNED",
      subtotalInPaise: lineTotal,
      grandTotalInPaise: lineTotal,
      currency: "INR",
      placedAt: new Date(),
      items: {
        create: {
          variantId: bundle.variantId,
          skuSnapshot: bundle.sku,
          nameSnapshot: "COD RTO Test",
          qtyOrdered: 2,
          unitPriceInPaise: lineTotal / 2,
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
  const shipment = await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-COD-RTO-${Date.now()}`,
      status: "RTO",
      rtoAt: new Date()
    }
  });
  return { order, shipment };
}

describe("RTO Phase 1C workflow", () => {
  beforeEach(() => {
    const mocks = getCommerceMocks();
    mocks.createZohoRefundDocumentsForOrder.mockClear();
    mocks.razorpayRefund.mockClear();
    mocks.razorpayRefund.mockImplementation(async () => ({
      id: `rfnd_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    }));
  });

  it("A/C — carrier RTO event → no restock, no gateway refund", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, awb } = await createPaidOrderWithRtoShipment({ bundle, qty: 2 });
    const onHandBefore = (await getInventory(bundle.variantId))?.onHand;

    await handleRtoShipment(order.id, awb, "RTO Initiated");

    expect((await getInventory(bundle.variantId))?.onHand).toBe(onHandBefore);
    const refunds = await prisma.refund.count({ where: { payment: { orderId: order.id } } });
    expect(refunds).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("B — Delhivery-style RTO via applyCarrierWebhookTracking → no restock", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 8 });
    const { order, awb } = await createPaidOrderWithRtoShipment({ bundle });
    await prisma.shipment.updateMany({
      where: { orderId: order.id },
      data: { status: "INTRANSIT", rtoAt: null }
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: "FULFILLED" }
    });

    const onHandBefore = (await getInventory(bundle.variantId))?.onHand;
    const result = await applyCarrierWebhookTracking(awb, "RTO Delivered");
    expect(result.success).toBe(true);
    expect((await getInventory(bundle.variantId))?.onHand).toBe(onHandBefore);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("D/E — RTO received idempotent; no restock before disposition", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, shipment } = await createPaidOrderWithRtoShipment({ bundle, qty: 2 });
    const onHandBefore = (await getInventory(bundle.variantId))?.onHand;

    const first = await markRtoReceived({ shipmentId: shipment.id });
    expect(first.alreadyReceived).toBe(false);
    expect(first.shipment.rtoReceivedAt).toBeTruthy();

    const second = await markRtoReceived({ shipmentId: shipment.id });
    expect(second.alreadyReceived).toBe(true);

    expect((await getInventory(bundle.variantId))?.onHand).toBe(onHandBefore);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("F/G — RESTOCKABLE disposition restores stock exactly once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, shipment } = await createPaidOrderWithRtoShipment({ bundle, qty: 2 });

    await markRtoReceived({ shipmentId: shipment.id });
    await setRtoDisposition({ shipmentId: shipment.id, disposition: "RESTOCKABLE" });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(10);

    await setRtoDisposition({ shipmentId: shipment.id, disposition: "RESTOCKABLE" });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(10);

    const events = await listOrderInventoryRestocks(order.id);
    expect(events.filter((e) => e.inventoryIncremented)).toHaveLength(1);
    expect(events[0]?.sourceType).toBe("RTO_PHYSICAL_RECEIPT");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("H — DAMAGED disposition → no sellable restock", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, shipment } = await createPaidOrderWithRtoShipment({ bundle, qty: 2 });
    const onHandBefore = (await getInventory(bundle.variantId))?.onHand;

    await markRtoReceived({ shipmentId: shipment.id });
    await setRtoDisposition({ shipmentId: shipment.id, disposition: "DAMAGED_NON_RESTOCKABLE" });

    expect((await getInventory(bundle.variantId))?.onHand).toBe(onHandBefore);
    const events = await listOrderInventoryRestocks(order.id);
    expect(events.every((e) => !e.inventoryIncremented)).toBe(true);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("I — NEEDS_REVIEW → no restock", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, shipment } = await createPaidOrderWithRtoShipment({ bundle });
    const onHandBefore = (await getInventory(bundle.variantId))?.onHand;

    await markRtoReceived({ shipmentId: shipment.id });
    await setRtoDisposition({ shipmentId: shipment.id, disposition: "NEEDS_REVIEW" });

    expect((await getInventory(bundle.variantId))?.onHand).toBe(onHandBefore);
    expect(await listOrderInventoryRestocks(order.id)).toHaveLength(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("J/K — COD RTO → no gateway refund; RESTOCKABLE restores stock once", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 6 });
    const { order, shipment } = await createCodRtoOrder(bundle);

    await markRtoReceived({ shipmentId: shipment.id });
    const preview = await loadOrderRefundPreview(order.id, { policy: "RTO_SHIPPING_RETAINED" });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.breakdown.proposedRefundAmountPaise).toBe(0);
    }

    await setRtoDisposition({ shipmentId: shipment.id, disposition: "RESTOCKABLE" });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(8);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("CANCELLED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("L/M — paid RTO preview uses RTO_SHIPPING_RETAINED and retains shipping", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const shipping = 15_000;
    const { order, shipment } = await createPaidOrderWithRtoShipment({
      bundle,
      qty: 2,
      shippingInPaise: shipping
    });

    await markRtoReceived({ shipmentId: shipment.id });
    const preview = await loadOrderRefundPreview(order.id, { policy: "RTO_SHIPPING_RETAINED" });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.breakdown.retainedShippingPaise).toBe(shipping);
      expect(preview.breakdown.proposedRefundAmountPaise).toBe(
        preview.breakdown.merchandiseNetPaise
      );
      expect(preview.breakdown.warnings).toContain("PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED");
    }

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("Q — full gateway refund blocked on active RTO order", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order } = await createPaidOrderWithRtoShipment({ bundle });

    await expect(initiateGatewayRefund(order.id, "blocked")).rejects.toMatchObject({
      code: "RTO_WORKFLOW_REQUIRED"
    });

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("S — workflow state enables refund execution after Phase 1E (received, disposition pending blocks execute)", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, shipment } = await createPaidOrderWithRtoShipment({ bundle });

    await markRtoReceived({ shipmentId: shipment.id });
    const state = await loadRtoWorkflowState(order.id);
    expect(state?.shipments[0]?.rtoRefundWorkflowStatus).toBe("READY_FOR_REFUND");
    expect(state?.refundExecutionEnabled).toBe(false);

    await setRtoDisposition({ shipmentId: shipment.id, disposition: "RESTOCKABLE" });
    const afterDisposition = await loadRtoWorkflowState(order.id);
    expect(afterDisposition?.refundExecutionEnabled).toBe(true);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("X/Y — damaged RTO item still shows refund preview eligibility", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order, shipment } = await createPaidOrderWithRtoShipment({ bundle });

    await markRtoReceived({ shipmentId: shipment.id });
    await setRtoDisposition({ shipmentId: shipment.id, disposition: "DAMAGED_NON_RESTOCKABLE" });

    const preview = await loadOrderRefundPreview(order.id, { policy: "RTO_SHIPPING_RETAINED" });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.breakdown.proposedRefundAmountPaise).toBeGreaterThan(0);
    }

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("Z — customer cancel remains blocked during RTO", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10 });
    const { order } = await createPaidOrderWithRtoShipment({ bundle });

    const eligibility = getCancellationEligibility({
      status: "SHIPPED",
      paymentStatus: "CAPTURED",
      payments: [{ provider: "RAZORPAY" }],
      shipments: [{ status: "RTO" }]
    });
    expect(eligibility.customerCanRequest).toBe(false);
    expect(eligibility.blockCode).toBe("RTO_IN_PROGRESS");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});

describe("RTO workflow side-effect isolation", () => {
  it("markRtoReceived and setRtoDisposition do not invoke gateway refund", async () => {
    const mocks = getCommerceMocks();
    const bundle = await createTestProductWithInventory({ onHand: 5 });
    const { order, shipment } = await createPaidOrderWithRtoShipment({ bundle });
    await markRtoReceived({ shipmentId: shipment.id });
    await setRtoDisposition({ shipmentId: shipment.id, disposition: "RESTOCKABLE" });
    expect(mocks.razorpayRefund).not.toHaveBeenCalled();
    const refundCount = await prisma.refund.count({ where: { payment: { orderId: order.id } } });
    expect(refundCount).toBe(0);
    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
