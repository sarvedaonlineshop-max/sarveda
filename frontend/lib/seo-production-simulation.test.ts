/**
 * Production SITE_URL simulation tests (no live Vercel env change).
 * Run: cd frontend && NEXT_PUBLIC_SITE_URL=https://sarveda.com npx tsx --test lib/seo-production-simulation.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Ensure env before importing site helpers
process.env.NEXT_PUBLIC_SITE_URL = "https://sarveda.com";

describe("production SITE_URL simulation", async () => {
  const { absoluteUrl, canonical, getSiteUrl, isProductionSite } = await import(
    "./site"
  );

  it("getSiteUrl and isProductionSite", () => {
    assert.equal(getSiteUrl(), "https://sarveda.com");
    assert.equal(isProductionSite(), true);
  });

  it("homepage / PDP / category canonicals use sarveda.com", () => {
    assert.equal(canonical("/"), "https://sarveda.com/");
    assert.equal(canonical("/product/ocean-drums"), "https://sarveda.com/product/ocean-drums");
    assert.equal(
      canonical("/product-category/crystal-bowls"),
      "https://sarveda.com/product-category/crystal-bowls"
    );
  });

  it("no demo/vercel/localhost leakage in absolute URLs", () => {
    const urls = [
      absoluteUrl("/"),
      absoluteUrl("/product/ocean-drums"),
      absoluteUrl("/product-category/crystal-bowls"),
      absoluteUrl("/sitemap.xml")
    ];
    for (const u of urls) {
      assert.equal(u.includes("sarveda-demo.xyz"), false);
      assert.equal(u.includes("vercel.app"), false);
      assert.equal(u.includes("localhost"), false);
      assert.equal(u.includes("?offer="), false);
      assert.equal(u.includes("gclid"), false);
      assert.equal(u.includes("utm_"), false);
      assert.equal(u.includes("/store/"), false);
    }
  });

  it("page metadata must pass clean paths (offer never in canonical path arg)", () => {
    // Product pages call canonical(`/product/${slug}`) without searchParams — contract check.
    assert.equal(
      canonical(`/product/ocean-drums`),
      "https://sarveda.com/product/ocean-drums"
    );
    assert.equal(canonical(`/product/ocean-drums`).includes("offer="), false);
  });
});
