/**
 * Unit tests for COD carrier-action eligibility on the admin order page.
 * Run: cd frontend && npx tsx --test lib/cod-shipping.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { carrierActionsEnabled } from "./cod-shipping";

describe("carrierActionsEnabled", () => {
  it("allows COD after Mark Processing while payment is still PENDING", () => {
    assert.equal(
      carrierActionsEnabled({
        status: "PROCESSING",
        paymentStatus: "PENDING",
        payments: [{ provider: "COD" }]
      }),
      true
    );
  });

  it("allows COD while still PAID", () => {
    assert.equal(
      carrierActionsEnabled({
        status: "PAID",
        paymentStatus: "PENDING",
        payments: [{ provider: "COD" }]
      }),
      true
    );
  });

  it("blocks prepaid PENDING", () => {
    assert.equal(
      carrierActionsEnabled({
        status: "PROCESSING",
        paymentStatus: "PENDING",
        payments: [{ provider: "RAZORPAY" }]
      }),
      false
    );
  });

  it("keeps captured prepaid orders enabled", () => {
    assert.equal(
      carrierActionsEnabled({
        status: "PROCESSING",
        paymentStatus: "CAPTURED",
        payments: [{ provider: "RAZORPAY" }]
      }),
      true
    );
  });
});
