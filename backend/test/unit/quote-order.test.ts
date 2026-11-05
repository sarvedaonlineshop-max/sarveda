import { describe, expect, it } from "vitest";

import { quoteOrderDecision } from "../../src/modules/crm/quote-order";

describe("quoteOrderDecision", () => {
  it("allows a paid quotation through, including partial and COD once the balance is zero", () => {
    expect(quoteOrderDecision({ method: "PREPAID", received: 20000, total: 20000, dueAt: null })).toEqual({
      ok: true,
      mode: "PAID"
    });
    expect(quoteOrderDecision({ method: "PARTIAL", received: 20000, total: 20000, dueAt: null })).toEqual({
      ok: true,
      mode: "PAID"
    });
    expect(quoteOrderDecision({ method: "COD", received: 20000, total: 20000, dueAt: null })).toEqual({
      ok: true,
      mode: "PAID"
    });
  });

  it("blocks prepaid until paid, and partial until some money is confirmed", () => {
    expect(quoteOrderDecision({ method: "PREPAID", received: 0, total: 20000, dueAt: null }).ok).toBe(false);
    expect(quoteOrderDecision({ method: "PREPAID", received: 5000, total: 20000, dueAt: null }).ok).toBe(false);
    expect(quoteOrderDecision({ method: "PARTIAL", received: 0, total: 20000, dueAt: null }).ok).toBe(false);
  });

  it("holds packing for an open partial or credit balance, and keeps unpaid COD collectable", () => {
    expect(quoteOrderDecision({ method: "PARTIAL", received: 15000, total: 20000, dueAt: null })).toEqual({
      ok: true,
      mode: "HOLD"
    });
    expect(quoteOrderDecision({ method: "CREDIT", received: 0, total: 20000, dueAt: null })).toEqual({
      ok: true,
      mode: "HOLD"
    });
    expect(quoteOrderDecision({ method: "COD", received: 0, total: 20000, dueAt: null })).toEqual({
      ok: true,
      mode: "COD"
    });
  });
});
