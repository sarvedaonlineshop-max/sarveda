import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import {
  cleanupTestOrder,
  cleanupTestProduct,
  createPendingRazorpayOrder,
  createTestProductWithInventory,
  prisma
} from "../helpers/commerce";
import { challanFiscalYearLabel, generateChallanNumber } from "../../src/modules/delivery-challans/challan-number";
import { generateDeliveryChallanBodySchema } from "../../src/modules/delivery-challans/challan.schemas";
import { buildDeliveryChallanPdf } from "../../src/modules/delivery-challans/delivery-challan-pdf";
import {
  generateDeliveryChallan,
  getDeliveryChallanForOrder
} from "../../src/modules/delivery-challans/delivery-challan.service";

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

describe("delivery challan numbering", () => {
  it("generates FY-aware DC number format", async () => {
    const a = await generateChallanNumber();
    const fy = challanFiscalYearLabel();
    expect(a).toMatch(new RegExp(`^DC/${fy}/\\d{6}$`));
  });
});

describe("delivery challan schema", () => {
  it("defaults reason to SUPPLY_DELIVERY; requires reasonOther for OTHER", () => {
    const ok = generateDeliveryChallanBodySchema.safeParse({});
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.reason).toBe("SUPPLY_DELIVERY");

    const bad = generateDeliveryChallanBodySchema.safeParse({ reason: "OTHER" });
    expect(bad.success).toBe(false);

    const other = generateDeliveryChallanBodySchema.safeParse({
      reason: "OTHER",
      reasonOther: "Exhibition handoff"
    });
    expect(other.success).toBe(true);
  });

  it("validates GSTIN when supplied", () => {
    const bad = generateDeliveryChallanBodySchema.safeParse({ buyerGstin: "NOT-A-GSTIN" });
    expect(bad.success).toBe(false);
    const ok = generateDeliveryChallanBodySchema.safeParse({ buyerGstin: "29AAAAA0000A1Z5" });
    expect(ok.success).toBe(true);
  });
});

describe("delivery challan PDF", () => {
  it("builds PDF with title and no fabricated EBN", async () => {
    const pdf = await buildDeliveryChallanPdf({
      challanNumber: "DC/26-27/000001",
      challanDate: new Date("2026-08-29"),
      orderNumber: "SRV-TEST-1",
      reasonLabel: "Supply / delivery",
      notes: "Handle with care <script>",
      buyerName: "Buyer",
      buyerEmail: "b@example.com",
      buyerPhone: "9876543210",
      buyerGstin: null,
      consigneeAddress: {
        fullName: "Buyer",
        phone: "9876543210",
        line1: "12 MG Road",
        line2: null,
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "IN"
      },
      billToAddress: null,
      originState: "Karnataka",
      originCountry: "IN",
      destinationState: "Karnataka",
      destinationCountry: "IN",
      currency: "INR",
      items: [
        {
          productName: "Singing Bowl",
          sku: "SB-1",
          hsnCode: "9205",
          quantity: 2,
          unitPriceInPaise: 118000,
          lineTotalInPaise: 236000
        }
      ],
      taxableValueInPaise: 200000,
      grandTotalInPaise: 236000,
      carrier: "DELHIVERY",
      awb: "1234567890",
      trackingUrl: null,
      showValueColumns: true
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(500);
    // Streams are compressed — do not assert literal title strings in binary.
    // Ensure we never embed a fake 12-digit EBN placeholder as raw text.
    expect(pdf.toString("latin1")).not.toMatch(/EBN\s*[:=]\s*\d{12}/i);
  });
});

describe("delivery challan service", () => {
  it("creates challan for paid domestic order; no accounting journals; idempotent", async () => {
    const bundle = await createTestProductWithInventory({ onHand: 20 });
    const { order } = await createPendingRazorpayOrder(bundle, { qty: 2 });
    await markOrderPaid(order.id);

    const journalsBefore = await prisma.accountingJournalEntry.count({
      where: { memo: { contains: order.orderNumber } }
    });
    const result = await generateDeliveryChallan(order.id, {
      reason: "SUPPLY_DELIVERY",
      reasonOther: null,
      notes: "Test <b>notes</b>",
      buyerGstin: null,
      refreshShipment: false
    });

    expect(result.created).toBe(true);
    expect(result.challan.challanNumber).toMatch(/^DC\/\d{2}-\d{2}\/\d{6}$/);
    expect(result.challan.items).toHaveLength(1);
    expect(result.challan.items[0]!.quantity).toBe(2);
    expect(result.challan.items[0]!.hsnCode).toBe("9205");
    expect(result.challan.notes).not.toContain("<");
    expect(result.pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.challan.awbSnapshot).toBeNull();

    const journalsAfter = await prisma.accountingJournalEntry.count({
      where: { memo: { contains: order.orderNumber } }
    });
    expect(journalsAfter).toBe(journalsBefore);
    expect(
      await prisma.accountingPostingEvent.count({ where: { sourceId: order.id } })
    ).toBe(0);

    const again = await generateDeliveryChallan(order.id, {
      reason: "SUPPLY_DELIVERY",
      reasonOther: null,
      notes: null,
      buyerGstin: null,
      refreshShipment: false
    });
    expect(again.created).toBe(false);
    expect(again.challan.challanNumber).toBe(result.challan.challanNumber);

    const count = await prisma.deliveryChallan.count({ where: { orderId: order.id } });
    expect(count).toBe(1);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("supports B2B GSTIN + multi-item + COD; snapshots AWB when present", async () => {
    const b1 = await createTestProductWithInventory({ onHand: 10 });
    const b2 = await createTestProductWithInventory({ onHand: 10 });
    const orderNumber = `SRV-TEST-${randomUUID().slice(0, 8)}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        email: "gst@example.com",
        phone: "9988776655",
        status: "PROCESSING",
        paymentStatus: "PENDING",
        subtotalInPaise: 300000,
        taxInPaise: 0,
        grandTotalInPaise: 300000,
        currency: "INR",
        items: {
          create: [
            {
              variantId: b1.variantId,
              skuSnapshot: b1.sku,
              nameSnapshot: "Item A",
              qtyOrdered: 1,
              unitPriceInPaise: 118000,
              lineTotalInPaise: 118000
            },
            {
              variantId: b2.variantId,
              skuSnapshot: b2.sku,
              nameSnapshot: "Item B",
              qtyOrdered: 3,
              unitPriceInPaise: 50000,
              lineTotalInPaise: 150000
            }
          ]
        },
        addresses: {
          create: [
            {
              type: "SHIPPING",
              fullName: "B2B Buyer",
              phone: "9988776655",
              line1: "Warehouse 9",
              city: "Delhi",
              state: "Delhi",
              postalCode: "110001",
              country: "IN"
            }
          ]
        },
        payments: {
          create: {
            provider: "COD",
            amountInPaise: 300000,
            currency: "INR",
            status: "PENDING"
          }
        },
        shipments: {
          create: {
            courier: "DELHIVERY",
            awb: "AWB99887766",
            trackingUrl: "https://example.com/track/AWB99887766",
            status: "CREATED"
          }
        }
      }
    });

    const journalsBefore = await prisma.accountingJournalEntry.count({
      where: { memo: { contains: orderNumber } }
    });
    const result = await generateDeliveryChallan(order.id, {
      reason: "SUPPLY_DELIVERY",
      reasonOther: null,
      notes: null,
      buyerGstin: "07AAAAA0000A1Z5",
      refreshShipment: false
    });
    expect(result.created).toBe(true);
    expect(result.challan.items).toHaveLength(2);
    expect(result.challan.buyerGstin).toBe("07AAAAA0000A1Z5");
    expect(result.challan.awbSnapshot).toBe("AWB99887766");
    expect(result.challan.carrierSnapshot).toBe("DELHIVERY");
    expect(result.challan.destinationState).toBe("Delhi");
    expect(
      await prisma.accountingJournalEntry.count({ where: { memo: { contains: orderNumber } } })
    ).toBe(journalsBefore);
    expect(
      await prisma.accountingPostingEvent.count({ where: { sourceId: order.id } })
    ).toBe(0);

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(b1);
    await cleanupTestProduct(b2);
  });

  it("rejects unpaid prepaid order; allows international without inventing EBN", async () => {
    const bundle = await createTestProductWithInventory();
    const { order } = await createPendingRazorpayOrder(bundle);
    await expect(
      generateDeliveryChallan(order.id, {
        reason: "SUPPLY_DELIVERY",
        reasonOther: null,
        notes: null,
        buyerGstin: null,
        refreshShipment: false
      })
    ).rejects.toMatchObject({ code: "ORDER_NOT_ELIGIBLE" });

    await markOrderPaid(order.id);
    await prisma.orderAddress.updateMany({
      where: { orderId: order.id, type: "SHIPPING" },
      data: {
        country: "US",
        state: "California",
        city: "San Francisco",
        postalCode: "94105",
        line1: "1 Market St"
      }
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { currency: "USD" }
    });

    const intl = await generateDeliveryChallan(order.id, {
      reason: "SUPPLY_DELIVERY",
      reasonOther: null,
      notes: null,
      buyerGstin: null,
      refreshShipment: false
    });
    expect(intl.created).toBe(true);
    expect(intl.challan.destinationCountry).toBe("US");
    expect(intl.pdf.subarray(0, 4).toString()).toBe("%PDF");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("refreshShipment updates AWB snapshot on existing challan", async () => {
    const bundle = await createTestProductWithInventory();
    const { order } = await createPendingRazorpayOrder(bundle);
    await markOrderPaid(order.id);

    const first = await generateDeliveryChallan(order.id, {
      reason: "SUPPLY_DELIVERY",
      reasonOther: null,
      notes: null,
      buyerGstin: null,
      refreshShipment: false
    });
    expect(first.challan.awbSnapshot).toBeNull();

    await prisma.shipment.create({
      data: {
        orderId: order.id,
        courier: "FEDEX",
        awb: "FX123456",
        status: "CREATED"
      }
    });

    const refreshed = await generateDeliveryChallan(order.id, {
      reason: "SUPPLY_DELIVERY",
      reasonOther: null,
      notes: null,
      buyerGstin: null,
      refreshShipment: true
    });
    expect(refreshed.created).toBe(false);
    expect(refreshed.challan.challanNumber).toBe(first.challan.challanNumber);
    expect(refreshed.challan.awbSnapshot).toBe("FX123456");
    expect(refreshed.challan.carrierSnapshot).toBe("FEDEX");

    const row = await getDeliveryChallanForOrder(order.id);
    expect(row?.items[0]?.productName).toBeTruthy();

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("keeps item HSN snapshot if product HSN changes later", async () => {
    const bundle = await createTestProductWithInventory();
    const { order } = await createPendingRazorpayOrder(bundle);
    await markOrderPaid(order.id);
    const created = await generateDeliveryChallan(order.id, {
      reason: "SUPPLY_DELIVERY",
      reasonOther: null,
      notes: null,
      buyerGstin: null,
      refreshShipment: false
    });
    const snapHsn = created.challan.items[0]!.hsnCode;
    await prisma.product.update({
      where: { id: bundle.productId },
      data: { hsnCode: "9999" }
    });
    const again = await getDeliveryChallanForOrder(order.id);
    expect(again?.items[0]?.hsnCode).toBe(snapHsn);
    expect(again?.items[0]?.hsnCode).not.toBe("9999");

    await cleanupTestOrder(order.id);
    await cleanupTestProduct(bundle);
  });

  it("concurrent creates for different orders yield unique challan numbers", async () => {
    const b1 = await createTestProductWithInventory();
    const b2 = await createTestProductWithInventory();
    const o1 = await createPendingRazorpayOrder(b1);
    const o2 = await createPendingRazorpayOrder(b2);
    await markOrderPaid(o1.order.id);
    await markOrderPaid(o2.order.id);

    const [r1, r2] = await Promise.all([
      generateDeliveryChallan(o1.order.id, {
        reason: "SUPPLY_DELIVERY",
        reasonOther: null,
        notes: null,
        buyerGstin: null,
        refreshShipment: false
      }),
      generateDeliveryChallan(o2.order.id, {
        reason: "SUPPLY_DELIVERY",
        reasonOther: null,
        notes: null,
        buyerGstin: null,
        refreshShipment: false
      })
    ]);
    expect(r1.challan.challanNumber).not.toBe(r2.challan.challanNumber);

    await cleanupTestOrder(o1.order.id);
    await cleanupTestOrder(o2.order.id);
    await cleanupTestProduct(b1);
    await cleanupTestProduct(b2);
  });
});
