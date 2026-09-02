import { describe, expect, it } from "vitest";

import {
  continuityCheck,
  findHighConfidenceSarvedaConflicts,
  merchantIdFromWooOfferId,
  partitionMappingRows,
  preflightCandidates,
  type MappingRow,
  type VariantIdentitySnapshot
} from "../../src/modules/products/merchantIdentityBackfill";

function row(partial: Partial<MappingRow> & Pick<MappingRow, "merchant_id" | "woo_offer_id">): MappingRow {
  return {
    merchant_id: partial.merchant_id,
    merchant_item_group_id: partial.merchant_item_group_id ?? partial.woo_parent_id ?? "",
    merchant_title: partial.merchant_title ?? "Test",
    woo_offer_id: partial.woo_offer_id,
    woo_parent_id: partial.woo_parent_id ?? "100",
    woo_offer_kind: partial.woo_offer_kind ?? "variation",
    woo_sku: partial.woo_sku ?? "SKU",
    woo_attributes: partial.woo_attributes ?? "",
    sarveda_product_id: partial.sarveda_product_id ?? "prod-1",
    sarveda_variant_id: partial.sarveda_variant_id ?? "var-1",
    sarveda_sku: partial.sarveda_sku ?? "SKU",
    match_method: partial.match_method ?? "parent_plus_attributes",
    match_confidence: partial.match_confidence ?? "high"
  };
}

describe("merchant identity backfill filtering", () => {
  it("accepts HIGH-confidence rows into provisional set", () => {
    const { provisional, counts } = partitionMappingRows([
      row({ merchant_id: "gla_43497", woo_offer_id: "43497", woo_parent_id: "5489" })
    ]);
    expect(counts.high).toBe(1);
    expect(provisional).toHaveLength(1);
    expect(provisional[0]?.woo_offer_id).toBe(43497);
  });

  it("rejects MEDIUM confidence", () => {
    const { provisional, reviews, counts } = partitionMappingRows([
      row({
        merchant_id: "gla_1",
        woo_offer_id: "1",
        match_confidence: "medium",
        match_method: "parent_plus_attr_values"
      })
    ]);
    expect(counts.medium).toBe(1);
    expect(provisional).toHaveLength(0);
    expect(reviews[0]?.reason_not_backfilled).toBe("MEDIUM_CONFIDENCE");
  });

  it("rejects ambiguous", () => {
    const { reviews } = partitionMappingRows([
      row({
        merchant_id: "gla_2",
        woo_offer_id: "2",
        match_confidence: "ambiguous",
        match_method: "attr_ambiguous_under_parent"
      })
    ]);
    expect(reviews[0]?.reason_not_backfilled).toBe("AMBIGUOUS");
  });

  it("rejects unmatched", () => {
    const { reviews } = partitionMappingRows([
      row({
        merchant_id: "gla_3",
        woo_offer_id: "3",
        match_confidence: "unmatched",
        sarveda_variant_id: ""
      })
    ]);
    expect(reviews[0]?.reason_not_backfilled).toBe("UNMATCHED");
  });

  it("rejects parent-only rows", () => {
    const { reviews, counts } = partitionMappingRows([
      row({
        merchant_id: "gla_7317",
        woo_offer_id: "7317",
        woo_parent_id: "7317",
        woo_offer_kind: "variable_parent",
        match_method: "parent_only_product_level",
        match_confidence: "medium",
        sarveda_variant_id: ""
      })
    ]);
    expect(counts.parentOnly).toBe(1);
    expect(reviews[0]?.reason_not_backfilled).toBe("PARENT_ONLY");
  });

  it("detects Sarveda-side HIGH conflicts (one variant → many Woo offers)", () => {
    const rows = [
      row({
        merchant_id: "gla_43013",
        woo_offer_id: "43013",
        sarveda_variant_id: "conflict-var",
        woo_parent_id: "9795"
      }),
      row({
        merchant_id: "gla_9908",
        woo_offer_id: "9908",
        sarveda_variant_id: "conflict-var",
        woo_parent_id: "9795"
      })
    ];
    const conflicts = findHighConfidenceSarvedaConflicts(rows);
    expect(conflicts.has("conflict-var")).toBe(true);
    const { provisional, reviews, counts } = partitionMappingRows(rows);
    expect(provisional).toHaveLength(0);
    expect(counts.conflictRows).toBe(2);
    expect(reviews.every((r) => r.reason_not_backfilled === "SARVEDA_CONFLICT")).toBe(true);
  });

  it("rejects duplicate Woo offer IDs in candidate set", () => {
    const rows = [
      row({
        merchant_id: "gla_10",
        woo_offer_id: "10",
        sarveda_variant_id: "v-a",
        sarveda_product_id: "p-a"
      }),
      row({
        merchant_id: "gla_10",
        woo_offer_id: "10",
        sarveda_variant_id: "v-b",
        sarveda_product_id: "p-b"
      })
    ];
    const variants = new Map<string, VariantIdentitySnapshot>([
      [
        "v-a",
        { id: "v-a", productId: "p-a", sku: "A", wooCommerceVariationId: null, productWooCommerceId: 100 }
      ],
      [
        "v-b",
        { id: "v-b", productId: "p-b", sku: "B", wooCommerceVariationId: null, productWooCommerceId: 100 }
      ]
    ]);
    const result = preflightCandidates(rows, variants, new Map());
    expect(result.accepted).toHaveLength(0);
    expect(result.reviews.every((r) => r.reason_not_backfilled === "DUPLICATE_WOO_OFFER")).toBe(true);
  });

  it("rejects duplicate Sarveda targets in candidate set", () => {
    // Should be caught as SARVEDA_CONFLICT first; also covered by DUPLICATE_SARVEDA_TARGET path
    // when conflict detection is bypassed — verify conflict path.
    const rows = [
      row({ merchant_id: "gla_11", woo_offer_id: "11", sarveda_variant_id: "same" }),
      row({ merchant_id: "gla_12", woo_offer_id: "12", sarveda_variant_id: "same" })
    ];
    const result = preflightCandidates(rows, new Map(), new Map());
    expect(result.accepted).toHaveLength(0);
    expect(result.stats.conflictVariantRows).toBe(2);
  });
});

describe("idempotency and conflicts", () => {
  const base = row({
    merchant_id: "gla_43497",
    woo_offer_id: "43497",
    woo_parent_id: "5489",
    sarveda_product_id: "prod-copper",
    sarveda_variant_id: "var-copper",
    woo_offer_kind: "variation"
  });

  it("treats existing same ID as idempotent (no write)", () => {
    const variants = new Map<string, VariantIdentitySnapshot>([
      [
        "var-copper",
        {
          id: "var-copper",
          productId: "prod-copper",
          sku: "CB-C",
          wooCommerceVariationId: 43497,
          productWooCommerceId: 5489
        }
      ]
    ]);
    const result = preflightCandidates([base], variants, new Map([[43497, "var-copper"]]));
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.writeNeeded).toBe(false);
    expect(result.stats.alreadyCorrect).toBe(1);
  });

  it("flags existing different ID as conflict (no overwrite)", () => {
    const variants = new Map<string, VariantIdentitySnapshot>([
      [
        "var-copper",
        {
          id: "var-copper",
          productId: "prod-copper",
          sku: "CB-C",
          wooCommerceVariationId: 99999,
          productWooCommerceId: 5489
        }
      ]
    ]);
    const result = preflightCandidates([base], variants, new Map([[99999, "var-copper"]]));
    expect(result.accepted).toHaveLength(0);
    expect(result.reviews[0]?.reason_not_backfilled).toBe("EXISTING_ID_CONFLICT");
  });
});

describe("simple vs variable offer identity", () => {
  it("stores Woo product ID on variant for simple offers", () => {
    const simple = row({
      merchant_id: "gla_48931",
      woo_offer_id: "48931",
      woo_parent_id: "48931",
      woo_offer_kind: "simple",
      sarveda_product_id: "p-simple",
      sarveda_variant_id: "v-simple",
      match_method: "simple_unique_under_parent"
    });
    const variants = new Map<string, VariantIdentitySnapshot>([
      [
        "v-simple",
        {
          id: "v-simple",
          productId: "p-simple",
          sku: "MI-SB-H",
          wooCommerceVariationId: null,
          productWooCommerceId: 48931
        }
      ]
    ]);
    const result = preflightCandidates([simple], variants, new Map());
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.new_wooCommerceVariationId).toBe(48931);
    expect(result.accepted[0]?.writeNeeded).toBe(true);
  });

  it("stores Woo variation ID for variable offers when parent matches", () => {
    const variable = row({
      merchant_id: "gla_43497",
      woo_offer_id: "43497",
      woo_parent_id: "5489",
      woo_offer_kind: "variation",
      sarveda_product_id: "p-var",
      sarveda_variant_id: "v-var"
    });
    const variants = new Map<string, VariantIdentitySnapshot>([
      [
        "v-var",
        {
          id: "v-var",
          productId: "p-var",
          sku: "CB-C",
          wooCommerceVariationId: null,
          productWooCommerceId: 5489
        }
      ]
    ]);
    const result = preflightCandidates([variable], variants, new Map());
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.new_wooCommerceVariationId).toBe(43497);
  });

  it("rejects variable offer when Product.wooCommerceId mismatches parent", () => {
    const variable = row({
      merchant_id: "gla_43497",
      woo_offer_id: "43497",
      woo_parent_id: "5489",
      woo_offer_kind: "variation",
      sarveda_product_id: "p-var",
      sarveda_variant_id: "v-var"
    });
    const variants = new Map<string, VariantIdentitySnapshot>([
      [
        "v-var",
        {
          id: "v-var",
          productId: "p-var",
          sku: "CB-C",
          wooCommerceVariationId: null,
          productWooCommerceId: 1111
        }
      ]
    ]);
    const result = preflightCandidates([variable], variants, new Map());
    expect(result.accepted).toHaveLength(0);
    expect(result.reviews[0]?.reason_not_backfilled).toBe("PARENT_MISMATCH");
  });
});

describe("Merchant gla_ reconstruction", () => {
  it("reconstructs gla_<wooOfferId>", () => {
    expect(merchantIdFromWooOfferId(43497)).toBe("gla_43497");
  });

  it("continuity check reports exact matches for accepted set", () => {
    const accepted = [
      {
        merchant_id: "gla_43497",
        merchant_item_group_id: "5489",
        merchant_title: "x",
        woo_offer_id: 43497,
        woo_parent_id: 5489,
        woo_offer_kind: "variation",
        woo_sku: "",
        woo_attributes: "",
        sarveda_product_id: "p",
        sarveda_variant_id: "v",
        sarveda_sku: "",
        match_method: "parent_plus_attributes",
        match_confidence: "high" as const,
        previous_wooCommerceVariationId: null,
        new_wooCommerceVariationId: 43497,
        writeNeeded: true
      }
    ];
    const c = continuityCheck(accepted);
    expect(c.exactMerchantMatches).toBe(1);
    expect(c.merchantMismatches).toHaveLength(0);
    expect(c.itemGroupExact).toBe(1);
    expect(c.variableCount).toBe(1);
  });
});
