import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertDocumentDateAllowedForPosting,
  resetAccountingCutoverCache
} from "../../src/modules/accounting/accounting-cutover";
import { PreCutoverPostingBlockedError } from "../../src/modules/accounting/accounting-errors";
import { assessInventoryCogsReversalEligibility } from "../../src/modules/accounting/inventory-cogs-reversal.eligibility";
import type { InventoryCogsReversalSnapshot } from "../../src/modules/accounting/inventory-cogs-reversal.types";
import { evaluateFullRefundEligibility } from "../../src/modules/accounting/order-refunded-full-eligibility";
import type { OrderRefundContext } from "../../src/modules/accounting/order-refunded-full.types";

describe("Phase 7B cutover boundary guards", () => {
  const originalCutover = process.env.ACCOUNTING_CUTOVER_DATE;
  const originalForward = process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY;

  beforeEach(() => {
    resetAccountingCutoverCache();
    process.env.ACCOUNTING_CUTOVER_DATE = "2026-08-01T00:00:00.000Z";
    process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY = "1";
    resetAccountingCutoverCache();
  });

  afterEach(() => {
    resetAccountingCutoverCache();
    if (originalCutover === undefined) delete process.env.ACCOUNTING_CUTOVER_DATE;
    else process.env.ACCOUNTING_CUTOVER_DATE = originalCutover;
    if (originalForward === undefined) delete process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY;
    else process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY = originalForward;
    resetAccountingCutoverCache();
  });

  it("assertDocumentDateAllowedForPosting blocks pre-cutover when FORWARD_ONLY", () => {
    expect(() =>
      assertDocumentDateAllowedForPosting(new Date("2026-07-15T12:00:00.000Z"))
    ).toThrow(PreCutoverPostingBlockedError);
    expect(() =>
      assertDocumentDateAllowedForPosting(new Date("2026-08-15T12:00:00.000Z"))
    ).not.toThrow();
  });

  it("01/09/2026 00:00 IST boundary: bare date ≠ IST midnight; offset form is correct", () => {
    resetAccountingCutoverCache();
    process.env.ACCOUNTING_CUTOVER_DATE = "2026-09-01T00:00:00+05:30";
    process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY = "1";
    resetAccountingCutoverCache();

    // 31 Aug 2026 23:59:59 IST = 31 Aug 18:29:59 UTC → PRE
    expect(() =>
      assertDocumentDateAllowedForPosting(new Date("2026-08-31T18:29:59.000Z"))
    ).toThrow(PreCutoverPostingBlockedError);
    // 01 Sep 2026 00:00:00 IST = 31 Aug 18:30:00 UTC → POST (allowed)
    expect(() =>
      assertDocumentDateAllowedForPosting(new Date("2026-08-31T18:30:00.000Z"))
    ).not.toThrow();
  });

  it("assertDocumentDateAllowedForPosting allows pre-cutover with allowPreCutover", () => {
    expect(() =>
      assertDocumentDateAllowedForPosting(new Date("2026-07-15T12:00:00.000Z"), {
        allowPreCutover: true
      })
    ).not.toThrow();
  });

  it("evaluateFullRefundEligibility: pre-cutover order without originalSale → PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED", () => {
    const ctx = {
      orderId: "00000000-0000-4000-8000-000000000001",
      orderNumber: "SRV-2026070001",
      orderPlacedAt: new Date("2026-07-20T10:00:00.000Z"),
      grandTotalInPaise: 118_000,
      provider: "RAZORPAY",
      paymentStatusDetail: "REFUNDED",
      refundedInPaise: 118_000,
      refunds: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          paymentId: "00000000-0000-4000-8000-000000000003",
          amountInPaise: 118_000,
          status: "processed",
          providerRefundId: "rfnd_test_1",
          reason: null,
          createdAt: new Date("2026-07-21T10:00:00.000Z")
        }
      ],
      originalSale: null
    } satisfies Pick<
      OrderRefundedFullContext,
      | "provider"
      | "grandTotalInPaise"
      | "refunds"
      | "refundedInPaise"
      | "paymentStatusDetail"
      | "originalSale"
      | "orderPlacedAt"
    >;

    const result = evaluateFullRefundEligibility(ctx);
    expect(result.eligible).toBe(false);
    expect(result.code).toBe("PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED");
  });

  it("assessInventoryCogsReversalEligibility: orderCutover PRE_CUTOVER + !nativeCogs → PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED", async () => {
    const snapshot = {
      restockEventId: "00000000-0000-4000-8000-000000000010",
      restockSourceFingerprint: "fp-test",
      restockCreatedAt: new Date("2026-08-10T10:00:00.000Z"),
      disposition: "SELLABLE",
      restockQuantity: 1,
      orderItemId: "00000000-0000-4000-8000-000000000011",
      classification: "PHYSICAL_INVENTORY",
      cutoverClassification: "POST_CUTOVER",
      orderCutoverClassification: "PRE_CUTOVER",
      nativeCogsPosted: false,
      consumptions: [],
      originalConsumedQty: 0,
      remainingReversibleQty: 0
    } as InventoryCogsReversalSnapshot;

    const result = await assessInventoryCogsReversalEligibility(snapshot, null);
    expect(result.eligible).toBe(false);
    expect(result.code).toBe("PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED");
  });
});
