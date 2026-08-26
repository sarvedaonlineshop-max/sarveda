import { describe, expect, it } from "vitest";

import {
  allocateOrderDiscountPaise,
  nativeMerchandiseNetPaise,
  zohoEffectiveMerchandiseNetPaise,
  zohoLineRatesAfterOrderDiscount
} from "../../src/modules/accounting/discount-allocation";

describe("discount allocation — Zoho parity", () => {
  it("matches Zoho for single line qty=1 no discount", () => {
    const items = [{ lineTotalInPaise: 118_000, unitPriceInPaise: 118_000, qtyOrdered: 1 }];
    const native = nativeMerchandiseNetPaise(items, 0);
    const zoho = zohoEffectiveMerchandiseNetPaise(
      items.map((i) => ({ unitPriceInPaise: i.unitPriceInPaise, qtyOrdered: i.qtyOrdered })),
      0
    );
    expect(native).toBe(zoho);
  });

  it("handles quantity > 1 with discount", () => {
    const items = [{ lineTotalInPaise: 236_000, unitPriceInPaise: 118_000, qtyOrdered: 2 }];
    const discount = 10_000;
    const native = nativeMerchandiseNetPaise(items, discount);
    const zoho = zohoEffectiveMerchandiseNetPaise(
      [{ unitPriceInPaise: 118_000, qtyOrdered: 2 }],
      discount
    );
    expect(Math.abs(native - zoho)).toBeLessThanOrEqual(2);
  });

  it("allocates odd-paise discount remainder on last line", () => {
    const items = [
      { lineTotalInPaise: 100_001, unitPriceInPaise: 100_001, qtyOrdered: 1 },
      { lineTotalInPaise: 100_002, unitPriceInPaise: 100_002, qtyOrdered: 1 }
    ];
    const { lineDiscountsPaise, totalAllocatedPaise } = allocateOrderDiscountPaise(items, 333);
    expect(totalAllocatedPaise).toBe(333);
    expect(lineDiscountsPaise.reduce((a, b) => a + b, 0)).toBe(333);
  });

  it("documents variance for multi-line multi-rate with unit-rate rounding", () => {
    const zohoItems = [
      { unitPriceInPaise: 59_000, qtyOrdered: 2 },
      { unitPriceInPaise: 29_500, qtyOrdered: 3 }
    ];
    const lineItems = [
      { lineTotalInPaise: 118_000, unitPriceInPaise: 59_000, qtyOrdered: 2 },
      { lineTotalInPaise: 88_500, unitPriceInPaise: 29_500, qtyOrdered: 3 }
    ];
    const discount = 15_000;
    const native = nativeMerchandiseNetPaise(lineItems, discount);
    const zoho = zohoEffectiveMerchandiseNetPaise(zohoItems, discount);
    const rates = zohoLineRatesAfterOrderDiscount(zohoItems, discount);
    expect(rates).toHaveLength(2);
    expect(native).not.toBe(zoho);
    expect(Math.abs(native - zoho)).toBeLessThan(500);
  });

  it("multiple GST rates — allocation by gross line total", () => {
    const items = [
      { lineTotalInPaise: 118_000, unitPriceInPaise: 118_000, qtyOrdered: 1 },
      { lineTotalInPaise: 105_000, unitPriceInPaise: 105_000, qtyOrdered: 1 }
    ];
    const { lineDiscountsPaise } = allocateOrderDiscountPaise(items, 20_000);
    expect(lineDiscountsPaise[0] + lineDiscountsPaise[1]).toBe(20_000);
  });
});
