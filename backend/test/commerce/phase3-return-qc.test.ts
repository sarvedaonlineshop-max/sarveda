/**
 * Phase 3 — Warehouse receipt / QC / inventory dispositions.
 */
import "./setup-mocks";
import type { OrderStatus, ShipmentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/db";
import { nextReturnCaseNumber } from "../../src/modules/orders/return-case-number";
import {
  dispositionAffectsSellableOnHand,
  performReturnQc,
  recordReturnReceipt,
  releaseRepackToSellable
} from "../../src/modules/orders/return-qc.service";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  getInventory
} from "../helpers/commerce";

async function createDeliveredReturnCase(opts: {
  onHand: number;
  qty: number;
}) {
  const bundle = await createTestProductWithInventory({ onHand: opts.onHand });
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: opts.qty });
  await completePaidOrder(rzpOrderId, `pay_p3_${Date.now()}`);
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      courier: "Delhivery",
      awb: `AWB-P3-${Date.now()}`,
      status: "DELIVERED" satisfies ShipmentStatus,
      deliveredAt: new Date()
    }
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED" satisfies OrderStatus }
  });
  const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  const caseNumber = await nextReturnCaseNumber();
  const request = await prisma.orderServiceRequest.create({
    data: {
      caseNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerEmail: order.email,
      type: "REFUND_AFTER_DELIVERY",
      status: "APPROVED",
      reasonCode: "defective",
      reasonLabel: "Defective",
      returnPhysicalStatus: "AWAITING_RETURN",
      resolutionStatus: "REFUND_PENDING",
      items: {
        create: {
          orderItemId: item.id,
          nameSnapshot: item.nameSnapshot,
          skuSnapshot: item.skuSnapshot,
          qtySelected: opts.qty,
          reasonCode: "defective",
          reasonLabel: "Defective",
          requestedResolution: "RETURN_FOR_REFUND"
        }
      },
      returnShipment: {
        create: {
          orderId: order.id,
          physicalStatus: "AWAITING_RETURN"
        }
      }
    }
  });
  return { bundle, order, item, request };
}

describe("Phase 3 return QC / inventory", () => {
  it("only SELLABLE affects sellable onHand helper", () => {
    expect(dispositionAffectsSellableOnHand("SELLABLE")).toBe(true);
    expect(dispositionAffectsSellableOnHand("REPACK")).toBe(false);
    expect(dispositionAffectsSellableOnHand("QUARANTINE")).toBe(false);
    expect(dispositionAffectsSellableOnHand("WRITE_OFF")).toBe(false);
    expect(dispositionAffectsSellableOnHand("RETURN_TO_VENDOR")).toBe(false);
  });

  it("supports mixed QC dispositions and never sellable-restocks full qty when only part passes", async () => {
    const { bundle, order, item, request } = await createDeliveredReturnCase({
      onHand: 10,
      qty: 3
    });
    // After paid order of 3, onHand should be 7
    expect((await getInventory(bundle.variantId))?.onHand).toBe(7);

    await recordReturnReceipt({
      requestId: request.id,
      lines: [{ orderItemId: item.id, qtyReceived: 3 }]
    });

    await performReturnQc({
      requestId: request.id,
      lines: [
        { orderItemId: item.id, quantity: 2, disposition: "SELLABLE" },
        { orderItemId: item.id, quantity: 1, disposition: "WRITE_OFF" }
      ]
    });

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(9); // +2 sellable only

    const events = await prisma.orderInventoryRestockEvent.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" }
    });
    const sellable = events.filter((e) => e.disposition === "SELLABLE");
    const written = events.filter((e) => e.disposition === "WRITE_OFF");
    expect(sellable.reduce((s, e) => s + e.quantity, 0)).toBe(2);
    expect(written.reduce((s, e) => s + e.quantity, 0)).toBe(1);
    expect(sellable.every((e) => e.inventoryIncremented)).toBe(true);
    expect(written.every((e) => !e.inventoryIncremented)).toBe(true);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("quarantine increments quarantineOnHand not onHand", async () => {
    const { bundle, order, item, request } = await createDeliveredReturnCase({
      onHand: 5,
      qty: 1
    });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(4);

    await recordReturnReceipt({
      requestId: request.id,
      lines: [{ orderItemId: item.id, qtyReceived: 1 }]
    });
    await performReturnQc({
      requestId: request.id,
      lines: [{ orderItemId: item.id, quantity: 1, disposition: "QUARANTINE" }]
    });

    const inv = await getInventory(bundle.variantId);
    expect(inv?.onHand).toBe(4);
    expect(inv?.quarantineOnHand).toBe(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("REPACK does not sellable-restock until release", async () => {
    const { bundle, order, item, request } = await createDeliveredReturnCase({
      onHand: 5,
      qty: 1
    });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(4);

    await recordReturnReceipt({
      requestId: request.id,
      lines: [{ orderItemId: item.id, qtyReceived: 1 }]
    });
    const { qcLineIds } = await performReturnQc({
      requestId: request.id,
      lines: [{ orderItemId: item.id, quantity: 1, disposition: "REPACK" }]
    });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(4);

    await releaseRepackToSellable({
      requestId: request.id,
      qcLineId: qcLineIds[0]!
    });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(5);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("rejects QC qty that exceeds warehouse received", async () => {
    const { bundle, order, item, request } = await createDeliveredReturnCase({
      onHand: 5,
      qty: 2
    });
    await recordReturnReceipt({
      requestId: request.id,
      lines: [{ orderItemId: item.id, qtyReceived: 1 }]
    });
    await expect(
      performReturnQc({
        requestId: request.id,
        lines: [{ orderItemId: item.id, quantity: 2, disposition: "SELLABLE" }]
      })
    ).rejects.toMatchObject({ code: "QC_EXCEEDS_RECEIVED" });

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("records unexpected SKU without crediting expected order inventory", async () => {
    const { bundle, order, item, request } = await createDeliveredReturnCase({
      onHand: 5,
      qty: 1
    });
    await recordReturnReceipt({
      requestId: request.id,
      lines: [{ orderItemId: item.id, qtyReceived: 1 }]
    });
    await performReturnQc({
      requestId: request.id,
      lines: [
        {
          quantity: 1,
          disposition: "QUARANTINE",
          isUnexpectedSku: true,
          receivedSkuSnapshot: "WRONG-SKU-999"
        }
      ]
    });
    expect((await getInventory(bundle.variantId))?.onHand).toBe(4);
    const unexpected = await prisma.orderReturnQcLine.findFirst({
      where: { requestId: request.id, isUnexpectedSku: true }
    });
    expect(unexpected?.receivedSkuSnapshot).toBe("WRONG-SKU-999");
    expect(unexpected?.orderItemId).toBeNull();

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
