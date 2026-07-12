/**
 * Verifies profile order-card field parity (itemsSubtotalInPaise, lineItems.title, etc.)
 * Run: npx tsx scripts/verify-order-summary-details.ts
 */
import assert from "node:assert/strict";

import { buildOrderSummaryDetails } from "../src/modules/orders/order-summary-details";

const indiaOrder = buildOrderSummaryDetails({
  currency: "INR",
  subtotalInPaise: 100_000,
  discountInPaise: 5_000,
  shippingInPaise: 12_000,
  items: [
    { nameSnapshot: "Singing Bowl", qtyOrdered: 2, lineTotalInPaise: 50_000 },
    { nameSnapshot: "Mala Beads", qtyOrdered: 1, lineTotalInPaise: 50_000 }
  ],
  addresses: [
    {
      type: "BILLING",
      fullName: "Billing Only",
      phone: "9999999999",
      line1: "Secret Billing St",
      line2: null,
      city: "Mysore",
      state: "Karnataka",
      postalCode: "570001",
      country: "IN"
    },
    {
      type: "SHIPPING",
      fullName: "Arjun R",
      phone: "9876543210",
      line1: "12 Yoga Lane",
      line2: "Near Temple",
      city: "Mysore",
      state: "Karnataka",
      postalCode: "570010",
      country: "IN"
    }
  ]
});

assert.ok(indiaOrder.lineItems?.length === 2);
assert.equal(indiaOrder.lineItems?.[0]?.title, "Singing Bowl");
assert.equal(indiaOrder.lineItems?.[0]?.quantity, 2);
assert.equal(indiaOrder.lineItems?.[0]?.lineTotalInPaise, 50_000);

const b = indiaOrder.costBreakdown;
assert.equal(b.itemsSubtotalInPaise, 100_000, "must use itemsSubtotalInPaise key");
assert.equal(b.shippingInPaise, 12_000);
assert.equal(b.discountInPaise, 5_000);
assert.ok(b.gstIncludedInPaise != null && b.gstIncludedInPaise > 0);
assert.equal(b.gstRateLabel, "18%");
assert.ok(!("subtotalInPaise" in b), "must not expose subtotalInPaise on breakdown");

assert.equal(indiaOrder.shippingAddress?.name, "Arjun R");
assert.equal(indiaOrder.shippingAddress?.pincode, "570010");
assert.ok(!("addresses" in indiaOrder), "must not leak raw addresses array");

const usOrder = buildOrderSummaryDetails({
  currency: "USD",
  subtotalInPaise: 50_00,
  discountInPaise: 0,
  shippingInPaise: 10_00,
  items: [{ nameSnapshot: "Eye Pillow", qtyOrdered: 1, lineTotalInPaise: 50_00 }],
  addresses: [
    {
      type: "SHIPPING",
      fullName: "Jane",
      phone: "+15551234567",
      line1: "1 Main St",
      line2: null,
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US"
    }
  ]
});

assert.equal(usOrder.costBreakdown.gstIncludedInPaise, undefined);
assert.equal(usOrder.costBreakdown.gstRateLabel, undefined);

/** Mirrors OrderHistoryCard hasBreakdownData — must be true for India fixture. */
function cardWouldShowSplitUp(details: ReturnType<typeof buildOrderSummaryDetails>): boolean {
  const breakdown = details.costBreakdown;
  const lineItems = details.lineItems;
  return (
    !!lineItems?.length ||
    breakdown?.itemsSubtotalInPaise != null ||
    breakdown?.shippingInPaise != null ||
    breakdown?.gstIncludedInPaise != null
  );
}

assert.ok(cardWouldShowSplitUp(indiaOrder), "India order must show split-up, not placeholders");
assert.ok(cardWouldShowSplitUp(usOrder), "US order must show split-up via subtotal/shipping");

console.log("verify-order-summary-details: OK");
