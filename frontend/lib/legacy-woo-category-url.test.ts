/**
 * Nested Woo category URL compatibility tests.
 * Run: cd frontend && npx tsx --test lib/legacy-woo-category-url.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEGACY_WOO_KNOWN_CATEGORY_SLUGS,
  LEGACY_WOO_NESTED_CATEGORY_REDIRECTS,
  normalizeNestedCategoryPath,
  resolveNestedCategoryRedirect
} from "./legacy-woo-category-url";

describe("legacy nested category redirects", () => {
  it("covers the audited nested paths", () => {
    assert.equal(Object.keys(LEGACY_WOO_NESTED_CATEGORY_REDIRECTS).length, 36);
  });

  it("sends the old musical-instruments rattles path to the live category", () => {
    assert.equal(
      resolveNestedCategoryRedirect("/product-category/musical-instruments/rattles-shakers"),
      "/product-category/rattles-shakers"
    );
  });

  it("maps nested singing-bowls path to leaf", () => {
    const r = resolveNestedCategoryRedirect(
      "/product-category/sound-musical-instruments/singing-bowls-bells/"
    );
    assert.equal(r, "/product-category/singing-bowls-bells");
  });

  it("preserves approved tracking params and drops unsafe ones", () => {
    const qs = new URLSearchParams({
      gclid: "TEST123",
      utm_source: "google",
      utm_campaign: "test",
      redirect: "https://evil.example",
      next: "https://evil.example",
      url: "https://evil.example"
    });
    const r = resolveNestedCategoryRedirect(
      "/product-category/yoga-and-meditation/yoga-mats-props",
      qs
    );
    assert.ok(r);
    assert.ok(r!.startsWith("/product-category/yoga-mats-props?"));
    assert.ok(r!.includes("gclid=TEST123"));
    assert.ok(r!.includes("utm_source=google"));
    assert.ok(!r!.includes("redirect="));
    assert.ok(!r!.includes("next="));
    assert.ok(!r!.includes("url="));
  });

  it("does not redirect arbitrary nested paths", () => {
    assert.equal(
      resolveNestedCategoryRedirect("/product-category/fake-parent/fake-child"),
      null
    );
  });

  it("does not redirect single-segment native category URLs", () => {
    assert.equal(normalizeNestedCategoryPath("/product-category/crystal-bowls"), null);
    assert.equal(normalizeNestedCategoryPath("/product-category/crystal-bowls/"), null);
    assert.equal(resolveNestedCategoryRedirect("/product-category/crystal-bowls"), null);
    assert.equal(resolveNestedCategoryRedirect("/product-category/yoga-and-meditation"), null);
  });

  it("sends old category names to the nearest live category", () => {
    assert.equal(
      resolveNestedCategoryRedirect("/product-category/yoga"),
      "/product-category/yoga-and-meditation"
    );
    assert.equal(
      resolveNestedCategoryRedirect("/product-category/music-therapy"),
      "/product-category/sound-musical-instruments"
    );
    assert.equal(
      resolveNestedCategoryRedirect("/product-category/musical-instruments/xylophones"),
      "/product-category/xylophones"
    );
    assert.equal(
      resolveNestedCategoryRedirect("/product-category/musical-instruments/all-musical-instruments"),
      "/product-category/all-musical-instruments"
    );
    assert.equal(
      resolveNestedCategoryRedirect("/product-category/musical-instruments/percussion"),
      "/product-category/percussion"
    );
    assert.equal(
      resolveNestedCategoryRedirect("/product-category/musical-instruments/gongs"),
      "/product-category/gongs-musical-instruments"
    );
    assert.equal(
      resolveNestedCategoryRedirect("/product-category/yoga-and-meditation/bottles"),
      "/product-category/bottles-accessories"
    );
    assert.equal(resolveNestedCategoryRedirect("/product-category/ayurveda"), null);
    assert.equal(resolveNestedCategoryRedirect("/product-category/nutrition"), null);
  });

  it("does not touch product/store/api paths", () => {
    assert.equal(resolveNestedCategoryRedirect("/product/ocean-drums"), null);
    assert.equal(resolveNestedCategoryRedirect("/store/foo/bar"), null);
    assert.equal(resolveNestedCategoryRedirect("/api/merchant/google/x"), null);
  });

  it("every destination leaf is in the known category set", () => {
    for (const leaf of Object.values(LEGACY_WOO_NESTED_CATEGORY_REDIRECTS)) {
      assert.ok(LEGACY_WOO_KNOWN_CATEGORY_SLUGS.has(leaf), leaf);
    }
  });
});
