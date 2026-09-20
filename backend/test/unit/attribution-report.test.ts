import { describe, expect, it } from "vitest";

import {
  ATTRIBUTION_REPORT_COLUMNS,
  formatProductName,
  formatVariantLabel,
  toAttributionReportRow
} from "../../src/modules/admin/attribution-report";

describe("marketing attribution report", () => {
  it("exports product, variant, sku, date, time, and marketing attribute columns", () => {
    const headers = ATTRIBUTION_REPORT_COLUMNS.map((c) => c.header);
    expect(headers).toEqual(
      expect.arrayContaining([
        "Product name",
        "Variant",
        "SKU",
        "Date",
        "Time",
        "Origin",
        "Source type",
        "Source / Medium",
        "Campaign",
        "Landing page",
        "Device",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "gclid",
        "fbclid"
      ])
    );
  });

  it("splits product name and variant from live attributes", () => {
    expect(formatProductName("Singing Bowl (Size: 7 inch)", "Singing Bowl")).toBe("Singing Bowl");
    expect(
      formatVariantLabel("Singing Bowl (Size: 7 inch)", [{ name: "Size", value: "7 inch" }])
    ).toBe("Size: 7 inch");
  });

  it("falls back to name snapshot when variant attributes are missing", () => {
    expect(formatProductName("Handpan (D Minor)", null)).toBe("Handpan");
    expect(formatVariantLabel("Handpan (D Minor)")).toBe("D Minor");
  });

  it("maps a line item to MA card fields with IST date and time", () => {
    const row = toAttributionReportRow({
      orderNumber: "SRV-2026090001",
      skuSnapshot: "BOWL-7",
      nameSnapshot: "Singing Bowl (Size: 7 inch)",
      qtyOrdered: 2,
      placedAt: new Date("2026-09-19T10:15:30+05:30"),
      productName: "Singing Bowl",
      variantSku: "BOWL-7",
      variantAttributes: [{ name: "Size", value: "7 inch" }],
      attribution: {
        sourceType: "Referral",
        firstSource: "chatgpt.com",
        firstMedium: "referral",
        firstLandingPage: "/shop",
        lastSource: "google",
        lastMedium: "cpc",
        lastCampaign: "bowls-sep",
        lastLandingPage: "/product/singing-bowl",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "bowls-sep",
        utmContent: "ad-a",
        utmTerm: "singing bowl",
        gclid: "Cj0TEST",
        fbclid: "",
        referringDomain: "chatgpt.com",
        landingPath: "/product/singing-bowl",
        deviceType: "MOBILE",
        sessionPageViews: 8,
        firstReferrer: "https://chatgpt.com/",
        lastReferrer: "https://google.com/"
      }
    });

    expect(row.productName).toBe("Singing Bowl");
    expect(row.variant).toBe("Size: 7 inch");
    expect(row.sku).toBe("BOWL-7");
    expect(row.date).toBe("2026-09-19");
    expect(row.time).toBe("10:15:30");
    expect(row.origin).toBe("Referral: chatgpt.com");
    expect(row.sourceType).toBe("Referral");
    expect(row.sourceMedium).toBe("google / cpc");
    expect(row.campaign).toBe("bowls-sep");
    expect(row.landingPage).toBe("/product/singing-bowl");
    expect(row.device).toBe("Mobile");
    expect(row.utmSource).toBe("google");
    expect(row.gclid).toBe("Cj0TEST");
    expect(row.firstTouch).toBe("chatgpt.com / referral");
  });

  it("leaves marketing columns blank when attribution was not captured", () => {
    const row = toAttributionReportRow({
      orderNumber: "SRV-2026090002",
      skuSnapshot: "SKU-1",
      nameSnapshot: "Incense",
      qtyOrdered: 1,
      placedAt: new Date("2026-09-19T18:00:00+05:30"),
      attribution: null
    });
    expect(row.productName).toBe("Incense");
    expect(row.variant).toBe("");
    expect(row.origin).toBe("");
    expect(row.sourceMedium).toBe("");
    expect(row.utmSource).toBe("");
  });
});
