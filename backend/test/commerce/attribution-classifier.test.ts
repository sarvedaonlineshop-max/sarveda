import { describe, expect, it } from "vitest";

import { classifySourceType, deriveSourceMedium } from "../../src/modules/attribution/source-classifier";
import { classifyDeviceFromUserAgent } from "../../src/modules/attribution/device";
import { sanitizeAttributionPayload, sanitizeLandingUrl } from "../../src/modules/attribution/sanitize";

describe("attribution source classifier", () => {
  it("classifies Direct visitor", () => {
    expect(classifySourceType({})).toBe("Direct");
    expect(deriveSourceMedium({}).source).toBe("(direct)");
  });

  it("classifies Google organic", () => {
    expect(
      classifySourceType({ referrer: "https://www.google.com/search?q=singing+bowl" })
    ).toBe("Organic Search");
  });

  it("classifies ChatGPT referral", () => {
    expect(classifySourceType({ referrer: "https://chatgpt.com/" })).toBe("Referral");
    expect(deriveSourceMedium({ referrer: "https://chatgpt.com/" }).source).toContain("chatgpt");
  });

  it("classifies Instagram/Facebook social referral", () => {
    expect(classifySourceType({ referrer: "https://www.instagram.com/" })).toBe("Social");
    expect(classifySourceType({ referrer: "https://l.facebook.com/l.php" })).toBe("Social");
  });

  it("classifies UTM campaign as Other when medium unknown", () => {
    expect(
      classifySourceType({
        utmSource: "newsletter_partner",
        utmMedium: "partner",
        utmCampaign: "summer"
      })
    ).toBe("Other");
  });

  it("classifies Paid Search via utm and gclid", () => {
    expect(
      classifySourceType({ utmSource: "google", utmMedium: "cpc", utmCampaign: "bowls" })
    ).toBe("Paid Search");
    expect(classifySourceType({ gclid: "Cj0KCQjw_abc" })).toBe("Paid Search");
  });

  it("classifies Paid Social via fbclid and paid facebook utm", () => {
    expect(classifySourceType({ fbclid: "IwAR0abc" })).toBe("Paid Social");
    expect(
      classifySourceType({ utmSource: "facebook", utmMedium: "paid", utmCampaign: "reels" })
    ).toBe("Paid Social");
  });

  it("classifies Email", () => {
    expect(classifySourceType({ utmSource: "newsletter", utmMedium: "email" })).toBe("Email");
  });
});

describe("attribution sanitize", () => {
  it("strips secrets from landing URLs", () => {
    const out = sanitizeLandingUrl("/reset?token=secret&utm_source=email&utm_medium=email");
    expect(out).toContain("utm_source=email");
    expect(out).not.toContain("token");
    expect(out).not.toContain("secret");
  });

  it("returns null for malformed payload without throwing", () => {
    expect(sanitizeAttributionPayload("not-an-object")).toBeNull();
    expect(sanitizeAttributionPayload([])).toBeNull();
    expect(sanitizeAttributionPayload(null)).toBeNull();
  });

  it("sanitizes a valid chatgpt referral payload", () => {
    const out = sanitizeAttributionPayload(
      {
        firstSource: "chatgpt.com",
        firstMedium: "referral",
        firstReferrer: "https://chatgpt.com/",
        firstLandingPage: "/shop",
        lastSource: "chatgpt.com",
        lastMedium: "referral",
        lastReferrer: "https://chatgpt.com/",
        lastLandingPage: "/product/bowl",
        referringDomain: "chatgpt.com",
        landingPath: "/product/bowl",
        sessionPageViews: 18,
        sessionStartedAt: new Date().toISOString()
      },
      { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    );
    expect(out).not.toBeNull();
    expect(out?.sourceType).toBe("Referral");
    expect(out?.deviceType).toBe("DESKTOP");
    expect(out?.sessionPageViews).toBe(18);
  });
});

describe("device UA classification", () => {
  it("detects mobile, tablet, desktop", () => {
    expect(
      classifyDeviceFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      )
    ).toBe("MOBILE");
    expect(
      classifyDeviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15")
    ).toBe("TABLET");
    expect(
      classifyDeviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0")
    ).toBe("DESKTOP");
  });
});
