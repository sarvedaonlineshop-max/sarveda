import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { normalizeGstState, resolvePlaceOfSupply, resolveSellerGstIdentity } from "../../src/utils/gst-state";
import { buildOrderPaidJournal } from "../../src/modules/accounting/order-paid-journal.builder";
import type { OrderPaidSnapshot } from "../../src/modules/accounting/order-paid-journal.types";
import { ACCOUNT_CODE } from "../../src/modules/accounting/order-paid.constants";
import { isVendorBillEligibleForPosting } from "../../src/modules/accounting/vendor-bill-eligibility";
import type { VendorBillSnapshot } from "../../src/modules/accounting/vendor-bill.types";
import { buildGstLedger } from "../../src/modules/accounting/gst-ledger.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { cleanupAccountingTestData, prisma } from "../helpers/commerce";
import {
  createSyntheticPaidOrder,
  cleanupSyntheticPaidOrder
} from "../helpers/accounting-orders";
import { postOrderPaidJournal } from "../../src/modules/accounting/order-paid-posting.service";
import { loadOrderPaidSnapshotById } from "../../src/modules/accounting/order-snapshot.service";
import { SHIPPING_GST_POLICY } from "../../src/modules/accounting/gst.constants";

function baseSnapshot(overrides: Partial<OrderPaidSnapshot> = {}): OrderPaidSnapshot {
  return {
    orderId: "00000000-0000-4000-8000-000000000199",
    orderNumber: "SRV-GST-0001",
    placedAt: new Date("2026-08-22"),
    currency: "INR",
    status: "PAID",
    subtotalInPaise: 118_000,
    discountInPaise: 0,
    shippingInPaise: 0,
    grandTotalInPaise: 118_000,
    shippingCountry: "IN",
    shippingState: "Karnataka",
    payment: {
      id: "pay-gst-1",
      provider: "RAZORPAY",
      status: "CAPTURED",
      amountInPaise: 118_000
    },
    lines: [
      {
        orderItemId: "line-1",
        skuSnapshot: "SKU-1",
        nameSnapshot: "Test Item",
        qtyOrdered: 1,
        unitPriceInPaise: 118_000,
        lineTotalInPaise: 118_000,
        taxClass: "standard",
        hsnCode: "9205"
      }
    ],
    buyerGstin: null,
    ...overrides
  };
}

describe("Phase 5B GST state normalization", () => {
  const origSeller = process.env.SELLER_STATE;
  const origGstin = process.env.SELLER_GSTIN;

  beforeEach(() => {
    process.env.SELLER_STATE = "Karnataka";
    process.env.SELLER_GSTIN = "29ABFCS0538N1ZV";
  });

  afterEach(() => {
    if (origSeller === undefined) delete process.env.SELLER_STATE;
    else process.env.SELLER_STATE = origSeller;
    if (origGstin === undefined) delete process.env.SELLER_GSTIN;
    else process.env.SELLER_GSTIN = origGstin;
  });

  it("KA ≡ Karnataka ≡ 29", () => {
    expect(normalizeGstState("KA").ok && normalizeGstState("KA").ok && (normalizeGstState("KA") as { state: { code: string } }).state.code).toBe("29");
    expect((normalizeGstState("Karnataka") as { ok: true; state: { code: string } }).state.code).toBe("29");
    expect((normalizeGstState("29") as { ok: true; state: { code: string } }).state.code).toBe("29");
    expect((normalizeGstState("  karnataka  ") as { ok: true; state: { code: string } }).state.code).toBe("29");
  });

  it("KA vs Karnataka → INTRA", () => {
    const pos = resolvePlaceOfSupply({ placeOfSupplyRaw: "KA" });
    expect(pos.ok).toBe(true);
    if (pos.ok) expect(pos.supplyType).toBe("INTRA_STATE");
  });

  it("MH vs Karnataka → INTER", () => {
    const pos = resolvePlaceOfSupply({ placeOfSupplyRaw: "MH" });
    expect(pos.ok).toBe(true);
    if (pos.ok) expect(pos.supplyType).toBe("INTER_STATE");
  });

  it("Maharashtra vs KA seller → INTER", () => {
    process.env.SELLER_STATE = "KA";
    const pos = resolvePlaceOfSupply({ placeOfSupplyRaw: "Maharashtra" });
    expect(pos.ok).toBe(true);
    if (pos.ok) expect(pos.supplyType).toBe("INTER_STATE");
  });

  it("missing / unknown state → DATA_GAP", () => {
    expect(normalizeGstState("").ok).toBe(false);
    expect(normalizeGstState("Narnia").ok).toBe(false);
    const pos = resolvePlaceOfSupply({ placeOfSupplyRaw: "Narnia" });
    expect(pos.ok).toBe(false);
    if (!pos.ok) expect(pos.code).toBe("GST_PLACE_OF_SUPPLY_DATA_GAP");
  });

  it("seller GSTIN/state contradiction fails closed", () => {
    process.env.SELLER_STATE = "Maharashtra";
    process.env.SELLER_GSTIN = "29ABFCS0538N1ZV";
    const seller = resolveSellerGstIdentity();
    expect(seller.ok).toBe(false);
    if (!seller.ok) expect(seller.code).toBe("SELLER_STATE_CONFIGURATION_MISMATCH");
  });
});

describe("Phase 5B ORDER_PAID tax snapshot + POS", () => {
  const origSeller = process.env.SELLER_STATE;
  const origGstin = process.env.SELLER_GSTIN;

  beforeEach(() => {
    process.env.SELLER_STATE = "Karnataka";
    process.env.SELLER_GSTIN = "29ABFCS0538N1ZV";
  });

  afterEach(() => {
    if (origSeller === undefined) delete process.env.SELLER_STATE;
    else process.env.SELLER_STATE = origSeller;
    if (origGstin === undefined) delete process.env.SELLER_GSTIN;
    else process.env.SELLER_GSTIN = origGstin;
  });

  it("intra 18% uses CGST+SGST with KA code", () => {
    const p = buildOrderPaidJournal(baseSnapshot({ shippingState: "KA" }));
    expect(p.taxPostingBlock).toBeFalsy();
    expect(p.diagnostics.supplyType).toBe("INTRA_STATE");
    expect(p.diagnostics.placeOfSupplyCode).toBe("29");
    expect(p.diagnostics.outputCgstPaise).toBeGreaterThan(0);
    expect(p.diagnostics.outputIgstPaise).toBe(0);
    expect(p.diagnostics.buyerGstinMissing).toBe(true);
  });

  it("inter MH uses IGST", () => {
    const p = buildOrderPaidJournal(baseSnapshot({ shippingState: "MH" }));
    expect(p.diagnostics.supplyType).toBe("INTER_STATE");
    expect(p.diagnostics.outputIgstPaise).toBeGreaterThan(0);
    expect(p.diagnostics.outputCgstPaise).toBe(0);
  });

  it("discounted inclusive ₹1180 − ₹118 preserves ORDER_PAID_V1 math", () => {
    const p = buildOrderPaidJournal(
      baseSnapshot({
        discountInPaise: 11_800,
        grandTotalInPaise: 106_200,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 106_200 }
      })
    );
    expect(p.balanced).toBe(true);
    expect(p.diagnostics.outputGstTotalPaise).toBe(16_200);
    expect(p.diagnostics.discountTaxableContraPaise).toBe(10_000);
    expect(p.diagnostics.lineAllocations[0]?.taxableValueInPaise).toBe(90_000);
  });

  it("mixed 5% + 18% keeps separate rate buckets", () => {
    const p = buildOrderPaidJournal(
      baseSnapshot({
        subtotalInPaise: 223_000,
        grandTotalInPaise: 223_000,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 223_000 },
        lines: [
          {
            orderItemId: "a",
            skuSnapshot: "A",
            nameSnapshot: "A",
            qtyOrdered: 1,
            unitPriceInPaise: 105_000,
            lineTotalInPaise: 105_000,
            taxClass: "gst-5",
            hsnCode: "1"
          },
          {
            orderItemId: "b",
            skuSnapshot: "B",
            nameSnapshot: "B",
            qtyOrdered: 1,
            unitPriceInPaise: 118_000,
            lineTotalInPaise: 118_000,
            taxClass: "standard",
            hsnCode: "2"
          }
        ]
      })
    );
    expect(p.balanced).toBe(true);
    expect(p.diagnostics.lineAllocations.map((l) => l.gstRate).sort((a, b) => a - b)).toEqual([
      5, 18
    ]);
  });

  it("shipping surfaces SHIPPING_GST_DATA_GAP warning without inventing tax", () => {
    const p = buildOrderPaidJournal(baseSnapshot({ shippingInPaise: 5_000, grandTotalInPaise: 123_000 }));
    expect(p.diagnostics.shippingGstPolicy).toBe(SHIPPING_GST_POLICY);
    expect(p.diagnostics.shippingGstWarning).toBe(true);
    expect(p.lines.find((l) => l.accountCode === ACCOUNT_CODE.SHIPPING_INCOME)?.creditInPaise).toBe(5_000);
  });

  it("unknown state blocks tax posting", () => {
    const p = buildOrderPaidJournal(baseSnapshot({ shippingState: "Atlantis" }));
    expect(p.taxPostingBlock?.code).toBe("GST_PLACE_OF_SUPPLY_DATA_GAP");
    expect(p.balanced).toBe(false);
  });

  it("missing HSN → HSN_DEFAULTED warning", () => {
    const p = buildOrderPaidJournal(
      baseSnapshot({
        lines: [
          {
            orderItemId: "l",
            skuSnapshot: "S",
            nameSnapshot: "N",
            qtyOrdered: 1,
            unitPriceInPaise: 118_000,
            lineTotalInPaise: 118_000,
            taxClass: "standard",
            hsnCode: null
          }
        ]
      })
    );
    expect(p.diagnostics.warnings).toContain("HSN_DEFAULTED");
    expect(p.diagnostics.lineAllocations[0]?.hsnSource).toBe("DEFAULT");
  });

  it("PDF/journal divergence flagged when discount present", () => {
    const p = buildOrderPaidJournal(
      baseSnapshot({
        discountInPaise: 11_800,
        grandTotalInPaise: 106_200,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 106_200 }
      })
    );
    expect(p.diagnostics.pdfJournalTaxDivergencePaise).not.toBe(0);
    expect(p.diagnostics.warnings).toContain("PDF_JOURNAL_TAX_DIVERGENCE");
  });
});

describe("Phase 5B vendor bill RCM fail-closed", () => {
  it("blocks reverseCharge vendor bills", () => {
    const snap = {
      billId: "b",
      billNumber: "B1",
      status: "OPEN",
      billDate: new Date(),
      vendorId: "v",
      vendorName: "V",
      vendorGstin: "29AAAAA0000A1Z5",
      vendorBillingState: "Karnataka",
      vendorBillingCountry: "IN",
      vendorCurrency: "INR",
      reverseCharge: true,
      subtotalInPaise: 10000,
      discountInPaise: 0,
      taxInPaise: 1800,
      adjustmentInPaise: 0,
      totalInPaise: 11800,
      referenceNumber: "INV-1",
      lines: [
        {
          id: "l1",
          variantId: null,
          classification: "NON_STOCK",
          quantity: 1,
          rateInPaise: 10000,
          exclusiveBaseInPaise: 10000,
          taxClass: "gst18",
          taxInPaise: 1800
        }
      ]
    } as unknown as VendorBillSnapshot;
    const elig = isVendorBillEligibleForPosting(snap);
    expect(elig.eligible).toBe(false);
    expect(elig.code).toBe("RCM_DATA_GAP");
  });
});

describe("Phase 5B GST ledger POSTED-only", () => {
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";
    process.env.SELLER_STATE = "Karnataka";
    process.env.SELLER_GSTIN = "29ABFCS0538N1ZV";
    await seedAccountingChartOfAccounts();
  });

  afterEach(async () => {
    for (const id of createdOrderIds.splice(0)) {
      await cleanupSyntheticPaidOrder(id).catch(() => undefined);
    }
    await cleanupAccountingTestData();
  });

  it("ledger counts POSTED output GST", async () => {
    const order = await createSyntheticPaidOrder({
      lines: [{ unitPriceInPaise: 118_000, qtyOrdered: 1, taxClass: "standard" }],
      shippingState: "KA"
    });
    createdOrderIds.push(order.id);
    const snap = await loadOrderPaidSnapshotById(order.id);
    // Force KA if helper uses full name
    snap.shippingState = "KA";
    await postOrderPaidJournal(snap, { forcePersist: true });
    const ledger = await buildGstLedger({ month: "2026-08" });
    expect(ledger.accounts.some((a) => a.accountCode === "2100")).toBe(true);
    const out = ledger.aggregates.outputCgstClosingInPaise + ledger.aggregates.outputSgstClosingInPaise;
    expect(out).toBeGreaterThan(0);
  });
});
