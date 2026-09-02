import { describe, expect, it } from "vitest";

import {
  resolveVariantIdFromLegacyAttributes,
  resolveVariantIdFromMerchantParams
} from "./merchant-variant-selection";

const variants = [
  {
    id: "v-green-35",
    wooCommerceVariationId: 10009,
    attributeValues: [
      {
        attributeValue: {
          value: "Green",
          slug: "green",
          attribute: { slug: "color", name: "Color" }
        }
      },
      {
        attributeValue: {
          value: "3.5 in",
          slug: "3-5-in",
          attribute: { slug: "size", name: "Size" }
        }
      }
    ]
  },
  {
    id: "v-red-5",
    wooCommerceVariationId: 10010,
    attributeValues: [
      {
        attributeValue: {
          value: "Red",
          slug: "red",
          attribute: { slug: "color", name: "Color" }
        }
      }
    ]
  }
];

describe("merchant variant selection", () => {
  it("selects variant by ?offer= woo id", () => {
    const params = new URLSearchParams("offer=10009");
    expect(resolveVariantIdFromMerchantParams(variants, params)).toBe("v-green-35");
  });

  it("selects variant by native ?offer=sv_<uuid>", () => {
    const params = new URLSearchParams(
      "offer=sv_9aac4a50-5a79-4ee3-b31f-80fa5c5de8fa"
    );
    const nativeVariants = [
      ...variants,
      { id: "9aac4a50-5a79-4ee3-b31f-80fa5c5de8fa", wooCommerceVariationId: 49605, attributeValues: [] }
    ];
    expect(resolveVariantIdFromMerchantParams(nativeVariants, params)).toBe(
      "9aac4a50-5a79-4ee3-b31f-80fa5c5de8fa"
    );
  });

  it("selects variant by legacy attribute query", () => {
    const params = new URLSearchParams("attribute_color=Green&attribute_size=3.5+in");
    expect(resolveVariantIdFromLegacyAttributes(variants, params)).toBe("v-green-35");
  });
});
