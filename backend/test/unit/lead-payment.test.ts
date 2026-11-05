import { dueAtFromDate, leadPaymentStatus, receivedMinor } from "../../src/modules/crm/lead-payment";

describe("lead payment totals", () => {
  it("counts gateway, verified bank, and COD settlement only", () => {
    const received = receivedMinor([
      { amountInPaise: 5000, channel: "GATEWAY", status: "VERIFIED" },
      { amountInPaise: 2000, channel: "BANK_UPI", status: "PENDING" },
      { amountInPaise: 1500, channel: "BANK_UPI", status: "VERIFIED" },
      { amountInPaise: 8000, channel: "COD_COLLECTION", status: "COLLECTED" },
      { amountInPaise: 8000, channel: "COD_COLLECTION", status: "VERIFIED" },
      { amountInPaise: 3000, channel: "COD_SETTLEMENT", status: "VERIFIED" },
      { amountInPaise: 1000, channel: "COD_SETTLEMENT", status: "REJECTED" }
    ]);
    expect(received).toBe(9500);
  });

  it("marks a past due balance overdue and a covered total paid", () => {
    const due = new Date("2026-10-01T18:29:59.000Z");
    expect(leadPaymentStatus({ total: 10000, received: 0, dueAt: due, now: new Date("2026-11-01T00:00:00.000Z") })).toBe(
      "OVERDUE"
    );
    expect(leadPaymentStatus({ total: 10000, received: 4000, dueAt: null })).toBe("PARTIALLY_PAID");
    expect(leadPaymentStatus({ total: 10000, received: 10000, dueAt: due })).toBe("PAID");
    expect(leadPaymentStatus({ total: 10000, received: 0, dueAt: null })).toBe("UNPAID");
  });

  it("treats the due date as the end of that day in India", () => {
    const due = dueAtFromDate("2026-11-01");
    expect(due?.toISOString()).toBe("2026-11-01T18:29:59.000Z");
  });
});
