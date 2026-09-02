import { describe, expect, it, vi } from "vitest";

import {
  calculateOrderRefund,
  capRefundAmountToPolicy
} from "../../src/modules/orders/order-refund-calculator.service";
import type { OrderRefundCalculatorInput } from "../../src/modules/orders/order-refund-calculator.types";

function baseInput(
  overrides: Partial<OrderRefundCalculatorInput> & {
    policy: OrderRefundCalculatorInput["policy"];
  }
): OrderRefundCalculatorInput {
  const {
    order: orderOverrides,
    items: itemsOverrides,
    payment: paymentOverrides,
    policy,
    isGstApplicable,
    ...rest
  } = overrides;

  const items = itemsOverrides ?? [
    {
      id: "item-1",
      lineTotalInPaise: 200_000,
      unitPriceInPaise: 100_000,
      qtyOrdered: 2,
      taxClass: "standard"
    }
  ];
  const subtotal = orderOverrides?.subtotalInPaise ?? items.reduce((s, i) => s + i.lineTotalInPaise, 0);
  const discount = orderOverrides?.discountInPaise ?? 0;
  const shipping = orderOverrides?.shippingInPaise ?? 10_000;
  const taxInPaise = orderOverrides?.taxInPaise ?? 0;
  const merchandiseNet = subtotal - discount;
  const grandTotal = orderOverrides?.grandTotalInPaise ?? merchandiseNet + shipping + taxInPaise;

  return {
    order: {
      subtotalInPaise: subtotal,
      discountInPaise: discount,
      shippingInPaise: shipping,
      taxInPaise,
      grandTotalInPaise: grandTotal,
      currency: "INR",
      ...orderOverrides
    },
    items,
    payment: paymentOverrides ?? {
      id: "pay-1",
      provider: "RAZORPAY",
      status: "CAPTURED",
      amountInPaise: grandTotal,
      refundedInPaise: 0
    },
    policy,
    isGstApplicable: isGstApplicable ?? true,
    ...rest
  };
}

describe("calculateOrderRefund (pure)", () => {
  it("A — paid pre-dispatch → full captured remainder", () => {
    const input = baseInput({ policy: "FULL_PRE_DISPATCH_CANCELLATION" });
    const r = calculateOrderRefund(input);
    expect(r.proposedRefundAmountPaise).toBe(210_000);
    expect(r.refundableShippingPaise).toBe(10_000);
    expect(r.retainedShippingPaise).toBe(0);
    expect(r.remainingRefundableAmountPaise).toBe(210_000);
  });

  it("B — pre-dispatch with shipping → shipping included in full refund", () => {
    const r = calculateOrderRefund(
      baseInput({
        policy: "FULL_PRE_DISPATCH_CANCELLATION",
        order: { shippingInPaise: 15_000 } as never
      })
    );
    expect(r.refundableShippingPaise).toBe(15_000);
    expect(r.proposedRefundAmountPaise).toBe(215_000);
  });

  it("C — dispatched policy → shipping retained", () => {
    const r = calculateOrderRefund(baseInput({ policy: "DISPATCHED_SHIPPING_RETAINED" }));
    expect(r.retainedShippingPaise).toBe(10_000);
    expect(r.refundableShippingPaise).toBe(0);
    expect(r.proposedRefundAmountPaise).toBe(200_000);
    expect(r.warnings).toContain("PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED");
  });

  it("D — RTO policy → shipping retained", () => {
    const r = calculateOrderRefund(baseInput({ policy: "RTO_SHIPPING_RETAINED" }));
    expect(r.retainedShippingPaise).toBe(10_000);
    expect(r.proposedRefundAmountPaise).toBe(200_000);
  });

  it("E — COD → gateway refund 0", () => {
    const r = calculateOrderRefund(
      baseInput({
        policy: "COD_CANCELLATION",
        payment: {
          id: "cod-1",
          provider: "COD",
          status: "PENDING",
          amountInPaise: 210_000,
          refundedInPaise: 0
        }
      })
    );
    expect(r.proposedRefundAmountPaise).toBe(0);
    expect(r.capturedAmountPaise).toBe(0);
    expect(r.customerPaidAmountPaise).toBe(210_000);
  });

  it("F — prior partial refund reduces remaining", () => {
    const r = calculateOrderRefund(
      baseInput({
        policy: "DISPATCHED_SHIPPING_RETAINED",
        payment: {
          id: "pay-1",
          provider: "RAZORPAY",
          status: "PARTIALLY_REFUNDED",
          amountInPaise: 210_000,
          refundedInPaise: 50_000
        }
      })
    );
    expect(r.remainingRefundableAmountPaise).toBe(160_000);
    expect(r.proposedRefundAmountPaise).toBe(160_000);
  });

  it("G — cannot exceed captured amount via remaining", () => {
    const r = calculateOrderRefund(
      baseInput({
        policy: "FULL_PRE_DISPATCH_CANCELLATION",
        payment: {
          id: "pay-1",
          provider: "RAZORPAY",
          status: "CAPTURED",
          amountInPaise: 100_000,
          refundedInPaise: 0
        }
      })
    );
    expect(r.remainingRefundableAmountPaise).toBe(100_000);
    expect(r.proposedRefundAmountPaise).toBe(100_000);
  });

  it("H — policy max caps dispatched refund when remainder lower", () => {
    const r = calculateOrderRefund(
      baseInput({
        policy: "DISPATCHED_SHIPPING_RETAINED",
        payment: {
          id: "pay-1",
          provider: "RAZORPAY",
          status: "PARTIALLY_REFUNDED",
          amountInPaise: 210_000,
          refundedInPaise: 150_000
        }
      })
    );
    expect(r.policyMaximumRefundableAmountPaise).toBe(60_000);
    expect(r.proposedRefundAmountPaise).toBe(60_000);
  });

  it("I/J — product + order coupon discount", () => {
    const r = calculateOrderRefund(
      baseInput({
        policy: "DISPATCHED_SHIPPING_RETAINED",
        order: { discountInPaise: 20_000 } as never
      })
    );
    expect(r.merchandiseDiscountPaise).toBe(20_000);
    expect(r.merchandiseNetPaise).toBe(180_000);
    expect(r.proposedRefundAmountPaise).toBe(180_000);
  });

  it("K/L/M — shipping and free shipping", () => {
    const withShip = calculateOrderRefund(baseInput({ policy: "FULL_PRE_DISPATCH_CANCELLATION" }));
    expect(withShip.shippingNetPaise).toBe(10_000);

    const free = calculateOrderRefund(
      baseInput({
        policy: "FULL_PRE_DISPATCH_CANCELLATION",
        order: { shippingInPaise: 0 } as never
      })
    );
    expect(free.shippingNetPaise).toBe(0);
    expect(free.proposedRefundAmountPaise).toBe(200_000);
  });

  it("O — GST merchandise tax from inclusive lines", () => {
    const r = calculateOrderRefund(baseInput({ policy: "FULL_PRE_DISPATCH_CANCELLATION" }));
    expect(r.taxMerchandisePaise).toBeGreaterThan(0);
    expect(r.taxShippingPaise).toBe(0);
    expect(r.taxLines.length).toBe(1);
  });

  it("Q — odd paise discount allocation reconciles", () => {
    const items = [
      {
        id: "a",
        lineTotalInPaise: 10_001,
        unitPriceInPaise: 10_001,
        qtyOrdered: 1,
        taxClass: "standard"
      },
      {
        id: "b",
        lineTotalInPaise: 10_001,
        unitPriceInPaise: 10_001,
        qtyOrdered: 1,
        taxClass: "standard"
      }
    ];
    const r = calculateOrderRefund(
      baseInput({
        policy: "FULL_PRE_DISPATCH_CANCELLATION",
        items,
        order: {
          subtotalInPaise: 20_002,
          discountInPaise: 3,
          shippingInPaise: 0,
          taxInPaise: 0,
          grandTotalInPaise: 19_999,
          currency: "INR"
        }
      })
    );
    expect(r.unavailableCode).toBeUndefined();
    expect(r.merchandiseNetPaise + r.shippingNetPaise).toBe(19_999);
  });

  it("R/S — multiple items and quantities", () => {
    const r = calculateOrderRefund(
      baseInput({
        policy: "DISPATCHED_SHIPPING_RETAINED",
        items: [
          {
            id: "1",
            lineTotalInPaise: 50_000,
            unitPriceInPaise: 25_000,
            qtyOrdered: 2,
            taxClass: "standard"
          },
          {
            id: "2",
            lineTotalInPaise: 30_000,
            unitPriceInPaise: 30_000,
            qtyOrdered: 1,
            taxClass: "gst-5"
          }
        ],
        order: {
          subtotalInPaise: 80_000,
          discountInPaise: 0,
          shippingInPaise: 5_000,
          taxInPaise: 0,
          grandTotalInPaise: 85_000,
          currency: "INR"
        },
        payment: {
          id: "p",
          provider: "RAZORPAY",
          status: "CAPTURED",
          amountInPaise: 85_000,
          refundedInPaise: 0
        }
      })
    );
    expect(r.merchandiseNetPaise).toBe(80_000);
    expect(r.proposedRefundAmountPaise).toBe(80_000);
  });

  it("component mismatch → REFUND_BREAKDOWN_UNAVAILABLE", () => {
    const r = calculateOrderRefund(
      baseInput({
        policy: "FULL_PRE_DISPATCH_CANCELLATION",
        order: { grandTotalInPaise: 999_999 } as never
      })
    );
    expect(r.unavailableCode).toBe("REFUND_BREAKDOWN_UNAVAILABLE");
    expect(r.proposedRefundAmountPaise).toBe(0);
  });

  it("Y — pure calculator has no side effects", () => {
    const spy = vi.spyOn(console, "log");
    calculateOrderRefund(baseInput({ policy: "FULL_PRE_DISPATCH_CANCELLATION" }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("capRefundAmountToPolicy", () => {
  it("caps to policy and remaining minimum", () => {
    const breakdown = calculateOrderRefund(
      baseInput({
        policy: "DISPATCHED_SHIPPING_RETAINED",
        payment: {
          id: "p",
          provider: "RAZORPAY",
          status: "CAPTURED",
          amountInPaise: 210_000,
          refundedInPaise: 50_000
        }
      })
    );
    const capped = capRefundAmountToPolicy(breakdown, 200_000);
    expect(capped.capped).toBe(true);
    expect(capped.allowedAmountPaise).toBe(160_000);
  });
});
