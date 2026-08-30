/**
 * Unit tests for commercial checkout fingerprint (resume compatibility).
 * Run: cd frontend && npx tsx --test lib/pending-checkout.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHECKOUT_FINGERPRINT_VERSION,
  buildCartLinesKey,
  buildCommercialFingerprint,
  isHardenedCommercialFingerprint,
  pendingMatchesCommercial,
  type PendingCheckout
} from "./pending-checkout";

const linesA = [
  { variantId: "v-a", quantity: 1 },
  { variantId: "v-b", quantity: 2 }
];

describe("buildCommercialFingerprint", () => {
  it("includes version, sorted lines, currency, and payable minor units", () => {
    const fp = buildCommercialFingerprint({
      lines: [
        { variantId: "v-b", quantity: 2 },
        { variantId: "v-a", quantity: 1 }
      ],
      currency: "inr",
      payableMinor: 110000
    });
    assert.equal(fp, `v${CHECKOUT_FINGERPRINT_VERSION}|v-a:1|v-b:2|INR|110000`);
    assert.equal(isHardenedCommercialFingerprint(fp), true);
  });

  it("changes when payable total changes (shipping/discount)", () => {
    const a = buildCommercialFingerprint({ lines: linesA, currency: "INR", payableMinor: 110000 });
    const b = buildCommercialFingerprint({ lines: linesA, currency: "INR", payableMinor: 105000 });
    assert.notEqual(a, b);
  });

  it("changes when currency changes", () => {
    const a = buildCommercialFingerprint({ lines: linesA, currency: "INR", payableMinor: 4900 });
    const b = buildCommercialFingerprint({ lines: linesA, currency: "USD", payableMinor: 4900 });
    assert.notEqual(a, b);
  });

  it("changes when quantity or variant changes", () => {
    const a = buildCommercialFingerprint({ lines: linesA, currency: "INR", payableMinor: 110000 });
    const b = buildCommercialFingerprint({
      lines: [{ variantId: "v-a", quantity: 2 }, { variantId: "v-b", quantity: 2 }],
      currency: "INR",
      payableMinor: 110000
    });
    const c = buildCommercialFingerprint({
      lines: [{ variantId: "v-c", quantity: 1 }],
      currency: "INR",
      payableMinor: 110000
    });
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });

  it("line key alone is not hardened", () => {
    const linesOnly = buildCartLinesKey(linesA);
    assert.equal(isHardenedCommercialFingerprint(linesOnly), false);
  });
});

describe("pendingMatchesCommercial", () => {
  const live = buildCommercialFingerprint({
    lines: linesA,
    currency: "INR",
    payableMinor: 110000
  });

  function pending(partial: Partial<PendingCheckout>): PendingCheckout {
    return {
      orderId: "o1",
      orderNumber: "SRV-TEST",
      amountInPaise: 110000,
      currency: "INR",
      paymentMethod: "razorpay",
      paymentId: "p1",
      email: "a@b.com",
      savedAt: new Date().toISOString(),
      fingerprintVersion: CHECKOUT_FINGERPRINT_VERSION,
      cartFingerprint: live,
      ...partial
    };
  }

  it("same commercial snapshot resumes", () => {
    assert.equal(pendingMatchesCommercial(pending({}), live, "a@b.com"), true);
  });

  it("legacy pending without version does not resume", () => {
    assert.equal(
      pendingMatchesCommercial(
        pending({ fingerprintVersion: undefined, cartFingerprint: "v-a:1|v-b:2" }),
        live,
        "a@b.com"
      ),
      false
    );
  });

  it("legacy lines-only fingerprint does not resume", () => {
    assert.equal(
      pendingMatchesCommercial(
        pending({
          fingerprintVersion: CHECKOUT_FINGERPRINT_VERSION,
          cartFingerprint: "v-a:1|v-b:2"
        }),
        live,
        "a@b.com"
      ),
      false
    );
  });

  it("total change does not resume", () => {
    const changed = buildCommercialFingerprint({
      lines: linesA,
      currency: "INR",
      payableMinor: 105000
    });
    assert.equal(pendingMatchesCommercial(pending({}), changed, "a@b.com"), false);
  });

  it("currency change does not resume", () => {
    const changed = buildCommercialFingerprint({
      lines: linesA,
      currency: "USD",
      payableMinor: 110000
    });
    assert.equal(pendingMatchesCommercial(pending({}), changed, "a@b.com"), false);
  });

  it("email mismatch does not resume", () => {
    assert.equal(pendingMatchesCommercial(pending({}), live, "other@b.com"), false);
  });
});
