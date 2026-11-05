import { currencyForDeliveryCountry, priceMinorForCurrency, canApproveQuote } from "../../src/modules/crm/quote-pricing";

describe("quotation delivery currency", () => {
  it("uses INR only for delivery inside India", () => {
    expect(currencyForDeliveryCountry("IN")).toBe("INR");
    expect(currencyForDeliveryCountry("in")).toBe("INR");
  });

  it("uses AED for the UAE and USD for every other destination", () => {
    expect(currencyForDeliveryCountry("AE")).toBe("AED");
    expect(currencyForDeliveryCountry("US")).toBe("USD");
    expect(currencyForDeliveryCountry("GB")).toBe("USD");
    expect(currencyForDeliveryCountry("DE")).toBe("USD");
  });

  it("does not read a phone country; a missing country is the international USD list", () => {
    expect(currencyForDeliveryCountry("")).toBe("USD");
    expect(currencyForDeliveryCountry(null)).toBe("USD");
  });

  it("picks the price list that matches the delivery currency", () => {
    const variant = {
      saleInPaise: 10000,
      mrpInPaise: 12000,
      saleUsdCents: 1500,
      mrpUsdCents: 1800,
      saleAedFils: 5500,
      mrpAedFils: 6000
    };
    expect(priceMinorForCurrency(variant, "INR")).toBe(10000);
    expect(priceMinorForCurrency(variant, "USD")).toBe(1500);
    expect(priceMinorForCurrency(variant, "AED")).toBe(5500);
  });

  it("allows only Deepak, Arjun, and Partha to approve", () => {
    expect(canApproveQuote("deepak@sarveda.com")).toBe(true);
    expect(canApproveQuote("Arjun@sarveda.com")).toBe(true);
    expect(canApproveQuote("partha@sarveda.com")).toBe(true);
    expect(canApproveQuote("sowmya@sarveda.com")).toBe(false);
  });
});
