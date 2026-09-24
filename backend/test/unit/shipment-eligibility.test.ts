import { describe, expect, it } from "vitest";

import {
  assertOrderEligibleForCreatingShipment,
  assertOrderEligibleForRecordingLabel,
  isCodOrderReadyToShip
} from "../../src/modules/shipping/shipment-eligibility";

describe("isCodOrderReadyToShip", () => {
  it("allows COD with PENDING payment after Mark Processing", () => {
    expect(
      isCodOrderReadyToShip({
        status: "PROCESSING",
        paymentStatus: "PENDING",
        payments: [{ provider: "COD" }]
      })
    ).toBe(true);
  });

  it("rejects PENDING when payment rows are missing", () => {
    expect(
      isCodOrderReadyToShip({
        status: "PROCESSING",
        paymentStatus: "PENDING"
      })
    ).toBe(false);
  });
});

describe("assertOrderEligibleForCreatingShipment", () => {
  it("allows a COD Processing order to create a label", () => {
    const result = assertOrderEligibleForCreatingShipment({
      status: "PROCESSING",
      paymentStatus: "PENDING",
      payments: [{ provider: "COD" }]
    });
    expect(result.ok).toBe(true);
  });

  it("treats PENDING without a COD row as unpaid Razorpay", () => {
    const result = assertOrderEligibleForCreatingShipment({
      status: "PROCESSING",
      paymentStatus: "PENDING"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PAYMENT_NOT_CAPTURED");
      expect(result.error).toMatch(/current: PENDING/);
    }
  });
});

describe("assertOrderEligibleForRecordingLabel", () => {
  it("allows recording a manual AWB on a COD Processing order", () => {
    const result = assertOrderEligibleForRecordingLabel({
      status: "PROCESSING",
      paymentStatus: "PENDING",
      payments: [{ provider: "COD" }]
    });
    expect(result.ok).toBe(true);
  });
});
