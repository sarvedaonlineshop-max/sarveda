/**
 * Run: cd frontend && NEXT_PUBLIC_SITE_URL=https://sarveda.com npx tsx --test lib/seo-product.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.NEXT_PUBLIC_SITE_URL = "https://sarveda.com";

import { productJsonLd } from "./seo-product";
import type { ProductDetail, ProductVariantDetail } from "./types";

function variant(partial: Partial<ProductVariantDetail> & Pick<ProductVariantDetail, "id" | "sku">): ProductVariantDetail {
  return {
    mrpInPaise: 10000,
    saleInPaise: 8000,
    isDefault: false,
    inventory: { onHand: 0, reserved: 0 },
    attributeValues: [],
    ...partial
  };
}

function product(variants: ProductVariantDetail[]): ProductDetail {
  return {
    id: "p1",
    slug: "wind-gong-plain",
    name: "Wind Gong - Plain",
    description: null,
    shortDescription: null,
    productType: "VARIABLE",
    hasAudio: false,
    audioUrl: null,
    images: [],
    categories: [],
    accordionItems: [],
    variants
  } as ProductDetail;
}

describe("productJsonLd availability", () => {
  it("marks a zero-warehouse drop-shipped variant in stock with the merchant offer link", () => {
    const ld = productJsonLd(
      product([
        variant({
          id: "v-drop",
          sku: "MI-GO-WI-16",
          isDefault: true,
          dropShipEnabled: true,
          wooCommerceVariationId: 8848
        })
      ])
    );
    const offer = ld.offers as { availability: string; url: string };
    assert.equal(offer.availability, "https://schema.org/InStock");
    assert.equal(offer.url, "https://sarveda.com/product/wind-gong-plain?offer=8848");
  });

  it("marks an empty non-dropship size out of stock even when the default size has stock", () => {
    const ld = productJsonLd(
      product([
        variant({
          id: "v-default",
          sku: "IN",
          isDefault: true,
          wooCommerceVariationId: 10009,
          inventory: { onHand: 7, reserved: 0 }
        }),
        variant({
          id: "v-empty",
          sku: "OUT",
          wooCommerceVariationId: 10021,
          dropShipEnabled: false
        })
      ])
    );
    const offers = ld.offers as Array<{ sku: string; availability: string; url: string }>;
    assert.equal(offers.length, 2);
    assert.equal(offers[0]?.availability, "https://schema.org/InStock");
    assert.equal(offers[1]?.availability, "https://schema.org/OutOfStock");
    assert.equal(offers[1]?.url, "https://sarveda.com/product/wind-gong-plain?offer=10021");
  });

  it("uses the sv_ offer id when the variant has no Woo id", () => {
    const ld = productJsonLd(
      product([
        variant({
          id: "901332ea-005b-45c0-aaaa-bbbbbbbbbbbb",
          sku: "NATIVE",
          isDefault: true,
          dropShipEnabled: true,
          wooCommerceVariationId: null
        })
      ])
    );
    const offer = ld.offers as { url: string; availability: string };
    assert.equal(offer.availability, "https://schema.org/InStock");
    assert.equal(
      offer.url,
      "https://sarveda.com/product/wind-gong-plain?offer=sv_901332ea-005b-45c0-aaaa-bbbbbbbbbbbb"
    );
  });
});
