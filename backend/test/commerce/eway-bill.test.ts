import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { generateDeliveryChallan } from "../../src/modules/delivery-challans/delivery-challan.service";
import {
  buildEwayReviewPack,
  listOrderEwayBills,
  markEwayCancelled,
  markEwayNotRequired,
  prepareEwayBill,
  recordEwayBillEbn
} from "../../src/modules/eway-bills/eway-bill.service";
import {
  ewayPrepareBodySchema,
  ewayRecordEbnBodySchema,
  isPlausibleEbn
} from "../../src/modules/eway-bills/eway-bill.schemas";

async function markOrderPaid(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "PAID", paymentStatus: "CAPTURED", placedAt: new Date() }
  });
  await prisma.payment.updateMany({
    where: { orderId },
    data: { status: "CAPTURED", providerPaymentId: `pay_${randomUUID().slice(0, 10)}` }
  });
}

async function ensureInvoice(orderId: string, orderNumber: string) {
  await prisma.invoice.upsert({
    where: { orderId },
    create: { orderId, invoiceNo: `INV-${orderNumber}` },
    update: {}
  });
}

describe("eway bill schemas", () => {
  it("accepts 12-digit EBN and rejects invented short codes", () => {
    expect(isPlausibleEbn("123456789012")).toBe(true);
    expect(isPlausibleEbn("ABC")).toBe(false);
    expect(isPlausibleEbn(null)).toBe(false);
    const bad = ewayRecordEbnBodySchema.safeParse({
      ebn: "123",
      ewbDate: new Date().toISOString(),
      sourceDocumentType: "TAX_INVOICE"
    });
    expect(bad.success).toBe(false);
  });

  it("rejects invalid GSTIN on prepare", () => {
    const bad = ewayPrepareBodySchema.safeParse({
      sourceDocumentType: "TAX_INVOICE",
      buyerGstin: "NOT-GSTIN"
    });
    expect(bad.success).toBe(false);
  });
});

describe("eway bill service", () => {
  it("tax invoice source: prepare + record EBN; no journals; duplicate EBN rejected", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    const { order } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    await markOrderPaid(order.id);
    await ensureInvoice(order.id, order.orderNumber);

    const journalsBefore = await prisma.accountingJournalEntry.count();
    const stockBefore = await prisma.inventory.findUnique({ where: { variantId: bundle.variantId } });

    const pack = await buildEwayReviewPack(order.id, "TAX_INVOICE");
    expect(pack.sourceDocumentNumber).toMatch(/^INV\//);
    expect(pack.items.length).toBeGreaterThan(0);
    expect(pack.items[0]!.hsnCode).toBeTruthy();
    expect(pack.hints.eligibilityCopy).toContain("may be required");

    const prepared = await prepareEwayBill(order.id, {
      sourceDocumentType: "TAX_INVOICE",
      buyerGstin: null,
      itemOverrides: [{ sortOrder: 0, unitOfMeasure: "NOS" }],
      approxDistanceKm: 120,
      vehicleNumber: "KA01AB1234",
      transportMode: "ROAD",
      notes: "Prep <b>test</b>"
    });
    expect(prepared.status).toBe("PENDING");
    expect(prepared.ebn).toBeNull();
    expect(prepared.generationMethod).toBe("MANUAL");
    expect(prepared.items[0]!.unitOfMeasure).toBe("NOS");
    expect(prepared.notes).not.toContain("<");

    const ebn = `9${String(Date.now()).slice(-11)}`;
    const recorded = await recordEwayBillEbn(
      order.id,
      prepared.id,
      {
        ebn,
        ewbDate: new Date().toISOString(),
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        approxDistanceKm: 120,
        vehicleNumber: "KA01AB1234",
        transportMode: "ROAD"
      }
    );
    expect(recorded.status).toBe("GENERATED");
    expect(recorded.ebn).toBe(ebn);
    expect(recorded.provider).toBe("PORTAL");
    expect(recorded.generationMethod).toBe("MANUAL");

    await expect(
      recordEwayBillEbn(order.id, null, {
        sourceDocumentType: "TAX_INVOICE",
        ebn,
        ewbDate: new Date().toISOString()
      })
    ).rejects.toMatchObject({ code: "EBN_DUPLICATE" });

    expect(await prisma.accountingJournalEntry.count()).toBe(journalsBefore);
    const stockAfter = await prisma.inventory.findUnique({ where: { variantId: bundle.variantId } });
    expect(stockAfter?.onHand).toBe(stockBefore?.onHand);
    expect(stockAfter?.reserved).toBe(stockBefore?.reserved);

    const list = await listOrderEwayBills(order.id);
    expect(list.primary?.ebn).toBe(ebn);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("delivery challan source + B2B GSTIN + AWB prefill; cancel retains EBN", async () => {
    const bundle = await createTestProductWithInventory();
    const { order } = await createPendingRazorpayOrder(bundle);
    await markOrderPaid(order.id);
    await prisma.shipment.create({
      data: {
        orderId: order.id,
        courier: "DELHIVERY",
        awb: "AWB55112233",
        status: "CREATED"
      }
    });
    await generateDeliveryChallan(order.id, {
      reason: "SUPPLY_DELIVERY",
      reasonOther: null,
      notes: null,
      buyerGstin: "29AAAAA0000A1Z5",
      refreshShipment: false
    });

    const journalsBefore = await prisma.accountingJournalEntry.count();
    const pack = await buildEwayReviewPack(order.id, "DELIVERY_CHALLAN");
    expect(pack.sourceDocumentNumber).toMatch(/^DC\//);
    expect(pack.recipient.gstin).toBe("29AAAAA0000A1Z5");
    expect(pack.transport.transportDocNo).toBe("AWB55112233");
    expect(pack.transport.transporterName).toBe("DELHIVERY");

    const ebn = `8${String(Date.now()).slice(-11)}`;
    const recorded = await recordEwayBillEbn(order.id, null, {
      sourceDocumentType: "DELIVERY_CHALLAN",
      ebn,
      ewbDate: new Date().toISOString(),
      buyerGstin: "29AAAAA0000A1Z5",
      transportMode: "ROAD",
      approxDistanceKm: 40
    });
    expect(recorded.sourceDocumentType).toBe("DELIVERY_CHALLAN");
    expect(recorded.transportDocNo).toBe("AWB55112233");

    const cancelled = await markEwayCancelled(order.id, recorded.id, "Cancelled on portal");
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.ebn).toBe(ebn);
    expect(cancelled.cancelledAt).toBeTruthy();
    expect(await prisma.accountingJournalEntry.count()).toBe(journalsBefore);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("rejects quote/proforma as source; B2C without GSTIN; NOT_REQUIRED; international hint", async () => {
    const bundle = await createTestProductWithInventory();
    const { order } = await createPendingRazorpayOrder(bundle);
    await markOrderPaid(order.id);
    await ensureInvoice(order.id, order.orderNumber);

    await expect(buildEwayReviewPack(order.id, "QUOTATION" as never)).rejects.toMatchObject({
      code: "INVALID_SOURCE"
    });

    const pack = await buildEwayReviewPack(order.id, "TAX_INVOICE");
    expect(pack.recipient.gstinStatus).toBe("URP");

    const nr = await markEwayNotRequired(order.id, "Admin note");
    expect(nr.status).toBe("NOT_REQUIRED");
    expect(nr.notes).toContain("Admin");

    await prisma.orderAddress.updateMany({
      where: { orderId: order.id, type: "SHIPPING" },
      data: { country: "US", state: "California", postalCode: "94105" }
    });
    await prisma.order.update({ where: { id: order.id }, data: { currency: "USD" } });
    const list = await listOrderEwayBills(order.id);
    expect(list.likelyNotRequired).toBe(true);
    expect(list.eligibilityCopy).toMatch(/Likely not required/i);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("history allows multiple rows; expired is display-only", async () => {
    const bundle = await createTestProductWithInventory();
    const { order } = await createPendingRazorpayOrder(bundle);
    await markOrderPaid(order.id);
    await ensureInvoice(order.id, order.orderNumber);

    const ebn1 = `7${String(Date.now()).slice(-11)}`;
    const first = await recordEwayBillEbn(order.id, null, {
      sourceDocumentType: "TAX_INVOICE",
      ebn: ebn1,
      ewbDate: new Date().toISOString(),
      validUntil: new Date(Date.now() - 86400000).toISOString()
    });
    await markEwayCancelled(order.id, first.id);

    const ebn2 = `6${String(Date.now()).slice(-11)}`;
    const second = await recordEwayBillEbn(order.id, null, {
      sourceDocumentType: "TAX_INVOICE",
      ebn: ebn2,
      ewbDate: new Date().toISOString(),
      validUntil: new Date(Date.now() + 86400000).toISOString()
    });

    const list = await listOrderEwayBills(order.id);
    expect(list.history.length).toBeGreaterThanOrEqual(2);
    expect(list.primary?.id).toBe(second.id);
    const expiredRow = list.history.find((h) => h.id === first.id);
    // Cancelled primary status — first row remains with EBN
    expect(expiredRow?.ebn).toBe(ebn1);
    expect(expiredRow?.status).toBe("CANCELLED");

    const stillGenerated = await prisma.eWayBill.findUnique({ where: { id: second.id } });
    expect(stillGenerated?.status).toBe("GENERATED");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });
});
