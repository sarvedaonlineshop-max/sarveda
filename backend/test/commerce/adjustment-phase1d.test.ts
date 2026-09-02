import "./setup-mocks";
import type { ShipmentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestOrder,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  getInventory,
  prisma
} from "../helpers/commerce";
import { completePaidOrder } from "../../src/modules/payments/razorpay.verify";
import {
  convertAdjustmentToCancellation,
  executeAdjustmentRequest,
  loadAdjustmentExecutionPreview,
  submitAdjustmentRequest
} from "../../src/modules/orders/order-adjustment.service";
import { calculateAdjustmentCommercialDelta } from "../../src/modules/orders/order-adjustment-calculator.service";
import { buildAdjustmentPayload } from "../../src/modules/orders/order-adjustment.service";
import { getCancellationEligibility } from "../../src/modules/orders/cancellation-eligibility";
import { listOrderInventoryRestocks } from "../../src/modules/orders/order-inventory-restock.service";
import { submitServiceRequest } from "../../src/modules/orders/order-service-request.service";

async function createPaidPreDispatchOrder(bundle: Awaited<ReturnType<typeof createTestProductWithInventory>>) {
  const { order, rzpOrderId } = await createPendingRazorpayOrder(bundle, { qty: 2 });
  await completePaidOrder(rzpOrderId, `pay_adj_${Date.now()}`);
  return order;
}

async function cleanupAltVariant(variantId: string) {
  await prisma.inventory.deleteMany({ where: { variantId } });
  await prisma.variantShippingRate.deleteMany({ where: { variantId } });
  await prisma.productVariant.deleteMany({ where: { id: variantId } });
}

async function cleanupAdjustmentOrder(orderId: string) {
  await prisma.orderServiceRequestItem.deleteMany({ where: { request: { orderId } } });
  await prisma.orderServiceRequest.deleteMany({ where: { orderId } });
  await cleanupTestOrder(orderId);
}
async function cleanupBundle(
  bundle: Awaited<ReturnType<typeof createTestProductWithInventory>>,
  extraVariantIds: string[] = []
) {
  await prisma.variantShippingRate.deleteMany({ where: { variantId: bundle.variantId } });
  for (const id of extraVariantIds) {
    await cleanupAltVariant(id);
  }
  await prisma.inventory.deleteMany({ where: { id: bundle.inventoryId } });
  await prisma.productVariant.deleteMany({ where: { productId: bundle.productId } });
  await prisma.product.deleteMany({ where: { id: bundle.productId } });
}

async function createSecondVariant(
  bundle: Awaited<ReturnType<typeof createTestProductWithInventory>>,
  saleInPaise: number
) {
  const variant = await prisma.productVariant.create({
    data: {
      productId: bundle.productId,
      sku: `${bundle.sku}-ALT`,
      mrpInPaise: saleInPaise,
      saleInPaise,
      isDefault: false,
      status: "ACTIVE"
    }
  });
  await prisma.inventory.create({
    data: { variantId: variant.id, onHand: 50, reserved: 0, lowStockThreshold: 5 }
  });
  return variant;
}

describe("adjustment Phase 1D workflow", () => {
  beforeEach(() => {
    // noop — commerce mocks reset in setup-mocks
  });

  it("submit adjustment does not mutate order, inventory, or payments", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const shipping = await prisma.orderAddress.findFirst({
      where: { orderId: order.id, type: "SHIPPING" }
    });
    const invBefore = await getInventory(bundle.variantId);
    const payBefore = await prisma.payment.findMany({ where: { orderId: order.id } });

    await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: order.email,
      reasonCode: "change_address",
      orderItemId: item!.id,
      requestedAddress: {
        fullName: "New Name",
        phone: shipping!.phone,
        line1: "New Line 1",
        line2: null,
        city: shipping!.city,
        state: shipping!.state,
        postalCode: shipping!.postalCode,
        country: shipping!.country
      }
    });

    const shippingAfter = await prisma.orderAddress.findFirst({
      where: { orderId: order.id, type: "SHIPPING" }
    });
    expect(shippingAfter!.line1).toBe(shipping!.line1);
    const invAfter = await getInventory(bundle.variantId);
    expect(invAfter.onHand).toBe(invBefore.onHand);
    expect(invAfter.reserved).toBe(invBefore.reserved);
    const payAfter = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payAfter).toHaveLength(payBefore.length);

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle);
  });

  it("rejects adjustment-only reason on cancel submit", async () => {
    const bundle = await createTestProductWithInventory();
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });

    await expect(
      submitServiceRequest({
        orderNumber: order.orderNumber,
        userId: "00000000-0000-0000-0000-000000000001",
        userEmail: order.email,
        type: "CANCEL_BEFORE_DELIVERY",
        items: [{ orderItemId: item!.id, reasonCode: "change_address" }],
        photosByIndex: new Map()
      })
    ).rejects.toMatchObject({ code: "USE_ADJUSTMENT_REQUEST" });

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle);
  });

  it("blocks execute when shipment becomes dispatched between request and approval", async () => {
    const bundle = await createTestProductWithInventory();
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const shipping = await prisma.orderAddress.findFirst({
      where: { orderId: order.id, type: "SHIPPING" }
    });

    const request = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: order.email,
      reasonCode: "change_address",
      orderItemId: item!.id,
      requestedAddress: {
        fullName: "Race Test",
        phone: shipping!.phone,
        line1: "Race Line",
        line2: null,
        city: shipping!.city,
        state: shipping!.state,
        postalCode: shipping!.postalCode,
        country: shipping!.country
      }
    });

    await prisma.shipment.create({
      data: {
        orderId: order.id,
        courier: "Delhivery",
        awb: `AWB-RACE-${Date.now()}`,
        status: "INTRANSIT" as ShipmentStatus
      }
    });

    await expect(
      executeAdjustmentRequest({
        orderId: order.id,
        requestId: request.id,
        adminEmail: "admin@sarveda.com"
      })
    ).rejects.toMatchObject({ code: "BLOCKED_AFTER_DISPATCH" });

    const updated = await prisma.orderServiceRequest.findUnique({ where: { id: request.id } });
    expect(updated!.executionStatus).toBe("BLOCKED_AFTER_DISPATCH");

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle);
  });

  it("executes same-value address change pre-dispatch", async () => {
    const bundle = await createTestProductWithInventory();
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const shipping = await prisma.orderAddress.findFirst({
      where: { orderId: order.id, type: "SHIPPING" }
    });

    const request = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: order.email,
      reasonCode: "change_address",
      orderItemId: item!.id,
      requestedAddress: {
        fullName: "Updated Name",
        phone: shipping!.phone,
        line1: "Updated Street",
        line2: null,
        city: shipping!.city,
        state: shipping!.state,
        postalCode: shipping!.postalCode,
        country: shipping!.country
      }
    });

    const result = await executeAdjustmentRequest({
      orderId: order.id,
      requestId: request.id,
      adminEmail: "admin@sarveda.com"
    });
    expect(result.executionStatus).toBe("EXECUTED");

    const shippingAfter = await prisma.orderAddress.findFirst({
      where: { orderId: order.id, type: "SHIPPING" }
    });
    expect(shippingAfter!.line1).toBe("Updated Street");
    expect(shippingAfter!.fullName).toBe("Updated Name");

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle);
  });

  it("blocks postal change with COMMERCIAL_REVIEW_REQUIRED", async () => {
    const bundle = await createTestProductWithInventory();
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const shipping = await prisma.orderAddress.findFirst({
      where: { orderId: order.id, type: "SHIPPING" }
    });

    const request = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: order.email,
      reasonCode: "change_address",
      orderItemId: item!.id,
      requestedAddress: {
        fullName: shipping!.fullName,
        phone: shipping!.phone,
        line1: shipping!.line1,
        line2: null,
        city: shipping!.city,
        state: shipping!.state,
        postalCode: "999999",
        country: shipping!.country
      }
    });

    const preview = await loadAdjustmentExecutionPreview(request.id);
    expect(preview!.classification).toBe("COMMERCIAL_REVIEW_REQUIRED");
    expect(preview!.eligible).toBe(false);

    await expect(
      executeAdjustmentRequest({
        orderId: order.id,
        requestId: request.id,
        adminEmail: "admin@sarveda.com"
      })
    ).rejects.toMatchObject({ code: "COMMERCIAL_REVIEW_REQUIRED" });

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle);
  });

  it("executes same-value variant swap with inventory movement", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 10, saleInPaise: 118_000 });
    const altVariant = await createSecondVariant(bundle, 118_000);
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });

    const invOldBefore = await getInventory(bundle.variantId);
    const invNewBefore = await getInventory(altVariant.id);

    const request = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: order.email,
      reasonCode: "wrong_item",
      orderItemId: item!.id,
      requestedVariantId: altVariant.id
    });

    await executeAdjustmentRequest({
      orderId: order.id,
      requestId: request.id,
      adminEmail: "admin@sarveda.com"
    });

    const itemAfter = await prisma.orderItem.findUnique({ where: { id: item!.id } });
    expect(itemAfter!.variantId).toBe(altVariant.id);

    const invOldAfter = await getInventory(bundle.variantId);
    const invNewAfter = await getInventory(altVariant.id);
    expect(invOldAfter.onHand).toBe(invOldBefore.onHand + 2);
    expect(invNewAfter.onHand).toBe(invNewBefore.onHand - 2);

    const restocks = await listOrderInventoryRestocks(order.id);
    expect(restocks.some((r) => r.sourceType === "ORDER_ADJUSTMENT")).toBe(true);

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle, [altVariant.id]);
  });

  it("blocks more-expensive variant with ADDITIONAL_PAYMENT_REQUIRED", async () => {
    const bundle = await createTestProductWithInventory({ saleInPaise: 100_000 });
    const altVariant = await createSecondVariant(bundle, 150_000);
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });

    const request = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: order.email,
      reasonCode: "wrong_item",
      orderItemId: item!.id,
      requestedVariantId: altVariant.id
    });

    const preview = await loadAdjustmentExecutionPreview(request.id);
    expect(preview!.classification).toBe("ADDITIONAL_PAYMENT_REQUIRED");

    await expect(
      executeAdjustmentRequest({
        orderId: order.id,
        requestId: request.id,
        adminEmail: "admin@sarveda.com"
      })
    ).rejects.toMatchObject({ code: "ADDITIONAL_PAYMENT_REQUIRED" });

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle, [altVariant.id]);
  });

  it("quantity decrease with REFUND_REQUIRED executes partial refund (Phase 1E)", async () => {
    const bundle = await createTestProductWithInventory();
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });

    const request = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: order.email,
      reasonCode: "change_quantity",
      orderItemId: item!.id,
      requestedQty: 1
    });

    const preview = await loadAdjustmentExecutionPreview(request.id);
    expect(preview!.classification).toBe("REFUND_REQUIRED");

    const result = await executeAdjustmentRequest({
      orderId: order.id,
      requestId: request.id,
      adminEmail: "admin@sarveda.com"
    });
    expect(result.executionStatus).toBe("EXECUTED");

    const itemAfter = await prisma.orderItem.findUnique({ where: { id: item!.id } });
    expect(itemAfter!.qtyOrdered).toBe(1);

    const refunds = await prisma.refund.findMany({
      where: { sourceType: "ORDER_ADJUSTMENT", sourceId: request.id }
    });
    expect(refunds.some((r) => r.status === "processed")).toBe(true);

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle);
  });

  it("execute is idempotent on double admin approve", async () => {
    const bundle = await createTestProductWithInventory();
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const shipping = await prisma.orderAddress.findFirst({
      where: { orderId: order.id, type: "SHIPPING" }
    });

    const request = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: order.email,
      reasonCode: "change_address",
      orderItemId: item!.id,
      requestedAddress: {
        fullName: shipping!.fullName,
        phone: shipping!.phone,
        line1: "Idempotent St",
        line2: null,
        city: shipping!.city,
        state: shipping!.state,
        postalCode: shipping!.postalCode,
        country: shipping!.country
      }
    });

    await executeAdjustmentRequest({
      orderId: order.id,
      requestId: request.id,
      adminEmail: "admin@sarveda.com"
    });
    const second = await executeAdjustmentRequest({
      orderId: order.id,
      requestId: request.id,
      adminEmail: "admin@sarveda.com"
    });
    expect(second.message).toMatch(/already executed/i);

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle);
  });

  it("convert to cancellation routes through Phase 1A workflow", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    const order = await createPaidPreDispatchOrder(bundle);
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const shipping = await prisma.orderAddress.findFirst({
      where: { orderId: order.id, type: "SHIPPING" }
    });

    const request = await submitAdjustmentRequest({
      orderNumber: order.orderNumber,
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: order.email,
      reasonCode: "change_address",
      orderItemId: item!.id,
      requestedAddress: {
        fullName: shipping!.fullName,
        phone: shipping!.phone,
        line1: "Convert St",
        line2: null,
        city: shipping!.city,
        state: shipping!.state,
        postalCode: shipping!.postalCode,
        country: shipping!.country
      }
    });

    await convertAdjustmentToCancellation({
      orderId: order.id,
      requestId: request.id,
      adminEmail: "admin@sarveda.com"
    });

    const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
    expect(["CANCELLED", "REFUNDED"]).toContain(orderAfter!.status);

    const updated = await prisma.orderServiceRequest.findUnique({ where: { id: request.id } });
    expect(updated!.status).toBe("CONVERTED_TO_CANCELLATION");

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle);
  });

  it("calculator classifies zero delta as NO_PAYMENT_CHANGE", () => {
    const payload = buildAdjustmentPayload({
      intent: "CHANGE_QUANTITY",
      orderItem: {
        id: "item-1",
        variantId: "v1",
        skuSnapshot: "SKU",
        nameSnapshot: "Item",
        qtyOrdered: 2,
        unitPriceInPaise: 100_00,
        lineTotalInPaise: 200_00
      },
      requested: { qtyOrdered: 2 }
    });

    const delta = calculateAdjustmentCommercialDelta({
      order: {
        subtotalInPaise: 200_00,
        discountInPaise: 0,
        shippingInPaise: 0,
        taxInPaise: 0,
        grandTotalInPaise: 200_00
      },
      items: [{ id: "item-1", lineTotalInPaise: 200_00, unitPriceInPaise: 100_00, qtyOrdered: 2 }],
      payload,
      requestedVariant: null
    });

    expect(delta.classification).toBe("NO_PAYMENT_CHANGE");
    expect(delta.canExecuteAutomatically).toBe(true);
  });

  it("delivered order is ineligible for adjustment", async () => {
    const bundle = await createTestProductWithInventory();
    const order = await createPaidPreDispatchOrder(bundle);
    await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });

    const eligibility = getCancellationEligibility({
      status: "DELIVERED",
      paymentStatus: "CAPTURED",
      payments: [{ provider: "RAZORPAY" }],
      shipments: [{ status: "DELIVERED" }]
    });
    expect(eligibility.customerCanRequest).toBe(false);

    await cleanupAdjustmentOrder(order.id);
    await cleanupBundle(bundle);
  });
});
