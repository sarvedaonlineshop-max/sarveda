/**
 * Legacy Woo product URL compatibility tests.
 * Run: cd frontend && npx tsx --test lib/legacy-woo-product-url.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEGACY_WOO_KNOWN_PRODUCT_SLUGS,
  LEGACY_WOO_LEAF_ALIASES,
  LEGACY_WOO_MANUAL_REVIEW_LEAVES,
  LEGACY_WOO_UNRESOLVED_LEAVES,
  buildLegacyProductRedirectTarget,
  extractLegacyStoreProductLeaf,
  pickSafeLegacyProductQuery,
  resolveLegacyWooProductSlug,
  resolveStorePathToProductRedirect
} from "./legacy-woo-product-url";

describe("extractLegacyStoreProductLeaf", () => {
  it("returns null for /store root (listing)", () => {
    assert.equal(extractLegacyStoreProductLeaf("/store"), null);
    assert.equal(extractLegacyStoreProductLeaf("/store/"), null);
  });

  it("extracts leaf from deep category path", () => {
    assert.equal(
      extractLegacyStoreProductLeaf(
        "/store/sound-musical-instruments/kids/ocean-drums/"
      ),
      "ocean-drums"
    );
  });

  it("extracts leaf from shallow /store/{leaf}", () => {
    assert.equal(extractLegacyStoreProductLeaf("/store/ocean-drums"), "ocean-drums");
  });

  it("ignores non-store paths (current /product unaffected)", () => {
    assert.equal(extractLegacyStoreProductLeaf("/product/ocean-drums"), null);
    assert.equal(extractLegacyStoreProductLeaf("/shop/ocean-drums"), null);
  });

  it("rejects open-redirect / path-traversal style leaves", () => {
    assert.equal(extractLegacyStoreProductLeaf("/store/foo/..%2f..%2f"), null);
    assert.equal(extractLegacyStoreProductLeaf("/store/foo/https%3A%2F%2Fevil.com"), null);
    assert.equal(extractLegacyStoreProductLeaf("/store/foo/bar:baz"), null);
  });
});

describe("resolveLegacyWooProductSlug", () => {
  it("A — existing matching Product.slug", () => {
    const r = resolveLegacyWooProductSlug("ocean-drums");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.slug, "ocean-drums");
      assert.equal(r.via, "exact");
    }
  });

  it("C — renamed audited alias", () => {
    const r = resolveLegacyWooProductSlug("engraved-flat-wind-tibetan-gong-for-meditation-sound-therapy");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.slug, "wind-gong-etched");
      assert.equal(r.via, "alias");
    }
    assert.equal(
      LEGACY_WOO_LEAF_ALIASES["engraved-flat-wind-tibetan-gong-for-meditation-sound-therapy"],
      "wind-gong-etched"
    );
  });

  it("maps non-printed-copper-water-bottles to grooved parent (Woo 6071 HIGH), not curved-vintage 5495", () => {
    // Evidence: docs/audit/merchant_woo_sarveda_mapping.tsv — only HIGH leaf match is
    // gla_43480 → grooved-hammered-plain-copper-bottle; curved-vintage rows are medium
    // sku_exact_parent_mismatch (Sarveda parent 5495 vs Woo parent 6071).
    assert.equal(
      LEGACY_WOO_LEAF_ALIASES["non-printed-copper-water-bottles"],
      "grooved-hammered-plain-copper-bottle"
    );
    const r = resolveLegacyWooProductSlug("non-printed-copper-water-bottles");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.slug, "grooved-hammered-plain-copper-bottle");
      assert.equal(r.via, "alias");
      assert.notEqual(r.slug, "copper-bottle-curved-vintage-hammered");
    }
  });

  it("B — case-normalized Product.slug", () => {
    assert.ok(LEGACY_WOO_KNOWN_PRODUCT_SLUGS.has("Copper-Tongue-Cleaner"));
    const r = resolveLegacyWooProductSlug("copper-tongue-cleaner");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.slug, "Copper-Tongue-Cleaner");
      assert.equal(r.via, "case");
    }
  });

  it("leaves elemental-chimes and box-tanpura unresolved", () => {
    assert.ok(LEGACY_WOO_UNRESOLVED_LEAVES.has("elemental-chimes"));
    assert.ok(LEGACY_WOO_UNRESOLVED_LEAVES.has("box-tanpura"));
    assert.deepEqual(resolveLegacyWooProductSlug("elemental-chimes"), {
      ok: false,
      reason: "unresolved_audit"
    });
    assert.deepEqual(resolveLegacyWooProductSlug("box-tanpura"), {
      ok: false,
      reason: "unresolved_audit"
    });
  });

  it("maps proven Yoast product-sitemap aliases", () => {
    const expected: Record<string, string> = {
      "crescent-zafu-cushion-compact": "crescent-zafu-cushion-wide-cotton",
      "cotton-yoga-mat7-chakras": "7-chakras-yoga-mats",
      "artistic-egg-shakers": "painted-egg-shakers",
      "copper-bottle-black-with-7-chakras-vintage": "7-chakras-vintage-copper-bottles",
      "shruthi-thali-gong-plates": "gong-plates-shruti-plates-plain",
      "tuned-pipe": "tuned-pipes",
      "printed-copper-water-bottles": "copper-bottle-blue-tranquillity-meditation",
      "copper-bottle-with-7-chakras-plain": "7-chakras-plain-copper-bottles"
    };
    for (const [leaf, slug] of Object.entries(expected)) {
      assert.equal(LEGACY_WOO_LEAF_ALIASES[leaf], slug);
      const r = resolveLegacyWooProductSlug(leaf);
      assert.equal(r.ok, true, leaf);
      if (r.ok) assert.equal(r.slug, slug);
      assert.ok(LEGACY_WOO_KNOWN_PRODUCT_SLUGS.has(slug), slug);
    }
  });

  it("keeps unproven Yoast leaves as MANUAL_REVIEW (no redirect)", () => {
    Array.from(LEGACY_WOO_MANUAL_REVIEW_LEAVES).forEach((leaf) => {
      assert.deepEqual(resolveLegacyWooProductSlug(leaf), {
        ok: false,
        reason: "unresolved_audit"
      });
      assert.equal(
        resolveStorePathToProductRedirect(`/store/yoga-and-meditation/${leaf}/`),
        null
      );
    });
  });

  it("unknown legacy product does not guess", () => {
    assert.deepEqual(resolveLegacyWooProductSlug("totally-unknown-woo-leaf-xyz"), {
      ok: false,
      reason: "unknown"
    });
  });

  it("rejects unsafe leaf input", () => {
    assert.equal(resolveLegacyWooProductSlug("../etc/passwd").ok, false);
    assert.equal(resolveLegacyWooProductSlug("https://evil.example").ok, false);
  });
});

describe("query preservation + redirect target", () => {
  it("preserves attribute_* params", () => {
    const qs = pickSafeLegacyProductQuery(
      new URLSearchParams({
        "attribute_colour": "Rose",
        "attribute_size": "Medium",
        "wcpbc-manual-country": "IN"
      })
    );
    assert.equal(qs.get("attribute_colour"), "Rose");
    assert.equal(qs.get("attribute_size"), "Medium");
    assert.equal(qs.has("wcpbc-manual-country"), false);
  });

  it("preserves gclid", () => {
    const qs = pickSafeLegacyProductQuery(new URLSearchParams({ gclid: "Cj0KCQjw-gclid" }));
    assert.equal(qs.get("gclid"), "Cj0KCQjw-gclid");
  });

  it("preserves gbraid", () => {
    const qs = pickSafeLegacyProductQuery(new URLSearchParams({ gbraid: "0AAAAA-gbraid" }));
    assert.equal(qs.get("gbraid"), "0AAAAA-gbraid");
  });

  it("preserves wbraid", () => {
    const qs = pickSafeLegacyProductQuery(new URLSearchParams({ wbraid: "0AAAAA-wbraid" }));
    assert.equal(qs.get("wbraid"), "0AAAAA-wbraid");
  });

  it("preserves UTM campaign parameters", () => {
    const qs = pickSafeLegacyProductQuery(
      new URLSearchParams({
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "merchant-cutover",
        utm_term: "singing+bowl",
        utm_content: "ad1",
        utm_id: "camp-42"
      })
    );
    assert.equal(qs.get("utm_source"), "google");
    assert.equal(qs.get("utm_medium"), "cpc");
    assert.equal(qs.get("utm_campaign"), "merchant-cutover");
    assert.equal(qs.get("utm_term"), "singing+bowl");
    assert.equal(qs.get("utm_content"), "ad1");
    assert.equal(qs.get("utm_id"), "camp-42");
  });

  it("drops redirect=https://evil.example", () => {
    const qs = pickSafeLegacyProductQuery(
      new URLSearchParams({
        redirect: "https://evil.example",
        gclid: "keep-me"
      })
    );
    assert.equal(qs.has("redirect"), false);
    assert.equal(qs.get("gclid"), "keep-me");
  });

  it("drops unknown unsafe / destination-like params", () => {
    const qs = pickSafeLegacyProductQuery(
      new URLSearchParams({
        return: "/admin",
        next: "https://evil.example",
        url: "https://evil.example",
        callback: "https://evil.example",
        evil_dest: "https://evil.example",
        token: "secret"
      })
    );
    assert.equal(qs.toString(), "");
  });

  it("drops attribute values that look like absolute URLs", () => {
    const qs = pickSafeLegacyProductQuery(
      new URLSearchParams({
        "attribute_colour": "https://evil.example",
        "attribute_size": "Small"
      })
    );
    assert.equal(qs.has("attribute_colour"), false);
    assert.equal(qs.get("attribute_size"), "Small");
  });

  it("destination remains same-origin /product route", () => {
    const target = buildLegacyProductRedirectTarget(
      "ocean-drums",
      new URLSearchParams({
        "attribute_type": "Dream Catcher",
        gclid: "Cj0KCQjw",
        gbraid: "0AAAAA",
        wbraid: "0BBBBB",
        utm_campaign: "ads",
        "wcpbc-manual-country": "IN",
        redirect: "https://evil.example"
      })
    );
    assert.equal(target.startsWith("/product/ocean-drums"), true);
    assert.equal(target.includes("://"), false);
    assert.match(target, /attribute_type=/);
    assert.match(target, /gclid=/);
    assert.match(target, /gbraid=/);
    assert.match(target, /wbraid=/);
    assert.match(target, /utm_campaign=/);
    assert.equal(target.includes("wcpbc"), false);
    assert.equal(target.includes("redirect"), false);
    assert.equal(target.includes("evil.example"), false);
  });

  it("refuses non-audited slug destinations (open-redirect guard)", () => {
    assert.throws(() => buildLegacyProductRedirectTarget("not-in-audit-set"));
  });
});

describe("resolveStorePathToProductRedirect", () => {
  it("deep category path + matching slug", () => {
    const t = resolveStorePathToProductRedirect(
      "/store/sound-musical-instruments/kids/ocean-drums/",
      new URLSearchParams({ "attribute_size": "30 cms" })
    );
    assert.equal(t, "/product/ocean-drums?attribute_size=30+cms");
  });

  it("renamed alias under deep path", () => {
    const t = resolveStorePathToProductRedirect(
      "/store/sound-musical-instruments/gongs-musical-instruments/engraved-flat-wind-tibetan-gong-for-meditation-sound-therapy/"
    );
    assert.equal(t, "/product/wind-gong-etched");
  });

  it("same leaf under multiple category prefixes → same product", () => {
    const a = resolveStorePathToProductRedirect(
      "/store/musical-instruments/chimes/crystal-pyramid/"
    );
    const b = resolveStorePathToProductRedirect(
      "/store/sound-musical-instruments/crystal-bowls/crystal-pyramid/"
    );
    assert.equal(a, "/product/crystal-pyramid");
    assert.equal(b, "/product/crystal-pyramid");
  });

  it("/store root does not redirect to a product", () => {
    assert.equal(resolveStorePathToProductRedirect("/store"), null);
    assert.equal(resolveStorePathToProductRedirect("/store/"), null);
  });

  it("elemental-chimes and box-tanpura do not redirect", () => {
    assert.equal(
      resolveStorePathToProductRedirect(
        "/store/sound-musical-instruments/chimes/elemental-chimes/"
      ),
      null
    );
    assert.equal(
      resolveStorePathToProductRedirect(
        "/store/sound-musical-instruments/indian-classical/box-tanpura/"
      ),
      null
    );
  });

  it("unknown deep store path does not redirect", () => {
    assert.equal(
      resolveStorePathToProductRedirect("/store/yoga-and-meditation/no-such-product-zzz/"),
      null
    );
  });

  it("current /product route paths are not rewritten by this resolver", () => {
    assert.equal(resolveStorePathToProductRedirect("/product/ocean-drums"), null);
    assert.equal(
      resolveStorePathToProductRedirect("/product/wind-gong-etched?attribute_size=1"),
      null
    );
  });

  it("malicious host-style leaf does not produce external redirect", () => {
    assert.equal(resolveStorePathToProductRedirect("/store/https://evil.example"), null);
    assert.equal(resolveStorePathToProductRedirect("/store/foo@evil.com"), null);
  });
});
