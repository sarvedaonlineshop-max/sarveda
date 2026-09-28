import { describe, expect, it } from "vitest";

import { adminCanCreatePreDispatchCancellation } from "../../src/modules/orders/cancellation-eligibility";

describe("adminCanCreatePreDispatchCancellation", () => {
  const paid = {
    status: "PAID" as const,
    paymentStatus: "CAPTURED",
    payments: [{ provider: "RAZORPAY" }],
    shipments: [] as Array<{ status: string; awb?: string | null }>
  };

  it("allows a paid order with no shipment", () => {
    expect(adminCanCreatePreDispatchCancellation(paid).allowed).toBe(true);
  });

  it("allows processing and packed orders before a label exists", () => {
    expect(adminCanCreatePreDispatchCancellation({ ...paid, status: "PROCESSING" }).allowed).toBe(true);
    expect(adminCanCreatePreDispatchCancellation({ ...paid, status: "PACKED" }).allowed).toBe(true);
  });

  it("blocks once the order is marked shipped or a label exists", () => {
    expect(adminCanCreatePreDispatchCancellation({ ...paid, status: "SHIPPED" }).allowed).toBe(false);
    expect(
      adminCanCreatePreDispatchCancellation({
        ...paid,
        status: "PROCESSING",
        shipments: [{ status: "CREATED", awb: "AWB123" }]
      }).allowed
    ).toBe(false);
    expect(
      adminCanCreatePreDispatchCancellation({
        ...paid,
        shipments: [{ status: "INTRANSIT", awb: "AWB123" }]
      }).allowed
    ).toBe(false);
  });

  it("blocks unpaid checkout attempts", () => {
    expect(
      adminCanCreatePreDispatchCancellation({
        ...paid,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING"
      }).allowed
    ).toBe(false);
  });
});
