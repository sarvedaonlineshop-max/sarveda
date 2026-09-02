import { describe, expect, it } from "vitest";

import {
  buildMerchantCanonicalLink,
  buildMerchantProductLink,
  ctxFeedItemGroupId
} from "../../src/modules/merchant/merchantVariantLink";
import {
  escapeXml,
  formatMerchantPriceInr
} from "../../src/modules/merchant/googleMerchantFeed";
import {
  mapCtxOfferToFeedItem,
  parseCtxFeedXml,
  renderCtxCompatibilityRssXml,
  type CtxCompatibilityFeedItem
} from "../../src/modules/merchant/ctxCompatibilityFeed";
import { resolveVariantIdForOffer } from "../../src/modules/merchant/ctxOfferRegistry";
import type { PublishableCtxOffer } from "../../src/modules/merchant/ctxOfferRegistry";

const ORIGIN = "https://sarveda.com";

function samplePublishOffer(overrides: Partial<PublishableCtxOffer> = {}): PublishableCtxOffer {
  const base: PublishableCtxOffer = {
    wooOfferId: 10009,
    wooParentId: 10008,
    ctxProductType: "Sound & Musical Instruments > All > Singing Bowls & Bells > All",
    ctxItemGroupId: "10008",
    ctxTitle: "Sacred Symbols Singing Bowls",
    ctxLegacyLink: "https://sarveda.com/store/example/",
    classification: "PUBLISH",
    excludeReason: null,
    manualAction: null,
    sarvedaVariantId: "var-1",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    sarvedaVariant: {
      id: "var-1",
      sku: "MI-SB-SS-G-3.5",
      status: "ACTIVE",
      saleInPaise: 129500,
      mrpInPaise: 168400,
      wooCommerceVariationId: 10009,
      productId: "prod-1",
      weightGrams: null,
      isDefault: false,
      costInPaise: null,
      mrpUsdCents: null,
      saleUsdCents: null,
      mrpAedFils: null,
      saleAedFils: null,
      mrpGbpPence: null,
      saleGbpPence: null,
      zohoItemId: null,
      videoUrl: null,
      audioUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      inventory: { onHand: 3, reserved: 0, variantId: "var-1", id: "inv-1", lowStockThreshold: 5 },
      attributeValues: [
        {
          attributeValue: {
            id: "av1",
            value: "Green",
            slug: "green",
            attributeId: "a1",
            attribute: { id: "a1", name: "Color", slug: "color" }
          }
        }
      ],
      images: [],
      productRel: {
        id: "prod-1",
        slug: "sacred-symbols-singing-bowls",
        name: "Sacred Symbols Singing Bowls",
        description: "Desc",
        shortDescription: null,
        status: "ACTIVE",
        productType: "VARIABLE",
        catalogHidden: false,
        deletedAt: null,
        wooCommerceId: 10008,
        images: [
          {
            id: "img1",
            url: "https://sarveda-media.s3.amazonaws.com/media/example.jpg",
            altText: null,
            position: 0,
            isPrimary: true,
            productId: "prod-1",
            variantId: null
          }
        ],
        categories: []
      }
    }
  };
  return { ...base, ...overrides, sarvedaVariant: { ...base.sarvedaVariant, ...(overrides.sarvedaVariant as object) } };
}

describe("CTX compatibility feed", () => {
  it("parses 883 rows from authoritative CTX XML fixture shape", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item>
      <g:id>5713</g:id><g:item_group_id>5713</g:item_group_id>
      <title>Shaker</title><link>https://sarveda.com/store/x/</link>
      <g:product_type>Sound &amp; Musical Instruments &gt; All &gt; Kids</g:product_type>
      <g:availability>in_stock</g:availability><g:price>1,229.00 INR</g:price>
    </item></channel></rss>`;
    const rows = parseCtxFeedXml(xml);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.wooOfferId).toBe(5713);
    expect(rows[0]?.ctxProductType).toContain("Sound");
  });

  it("emits bare numeric g:id and exact CTX product_type", () => {
    const mapped = mapCtxOfferToFeedItem(samplePublishOffer(), ORIGIN, {
      NEXT_PUBLIC_MEDIA_CDN_URL: "https://sarveda-media.s3.amazonaws.com"
    });
    expect("exclude" in mapped).toBe(false);
    if ("exclude" in mapped) return;
    expect(mapped.gId).toBe("10009");
    expect(mapped.productType).toBe(
      "Sound & Musical Instruments > All > Singing Bowls & Bells > All"
    );
    expect(mapped.itemGroupId).toBe("10008");
  });

  it("builds offer deep-link for variant preselection", () => {
    expect(buildMerchantProductLink(ORIGIN, "sacred-symbols-singing-bowls", 10009)).toBe(
      "https://sarveda.com/product/sacred-symbols-singing-bowls?offer=10009"
    );
    expect(buildMerchantCanonicalLink(ORIGIN, "sacred-symbols-singing-bowls")).toBe(
      "https://sarveda.com/product/sacred-symbols-singing-bowls"
    );
  });

  it("preserves simple self-referential item_group_id from CTX", () => {
    expect(ctxFeedItemGroupId("5713", 5713, 5713, 5713)).toBe("5713");
  });

  it("renders valid RSS with google namespace and numeric id", () => {
    const item: CtxCompatibilityFeedItem = {
      gId: "5713",
      itemGroupId: "5713",
      title: "Shaker",
      description: "Desc",
      link: buildMerchantProductLink(ORIGIN, "shaker", 5713),
      canonicalLink: buildMerchantCanonicalLink(ORIGIN, "shaker"),
      imageLink: "https://sarveda-media.s3.amazonaws.com/x.jpg",
      additionalImageLinks: [],
      availability: "in_stock",
      condition: "new",
      price: formatMerchantPriceInr(122900),
      salePrice: formatMerchantPriceInr(99000),
      brand: "Sarveda",
      identifierExists: false,
      productType: "Sound & Musical Instruments > All > Kids",
      wooOfferId: 5713,
      wooParentId: 5713,
      sarvedaVariantId: "v1",
      sarvedaSlug: "shaker",
      saleInPaise: 99000,
      mrpInPaise: 122900,
      availableQty: 2
    };
    const xml = renderCtxCompatibilityRssXml([item], ORIGIN);
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<g:id>5713</g:id>");
    expect(xml).not.toContain("gla_5713");
    expect(xml).toContain(escapeXml(item.productType));
    expect(xml).toContain("g:canonical_link");
  });

  it("resolveVariantIdForOffer prefers wooCommerceVariationId", () => {
    const byWoo = new Map<number, string>([[10009, "var-1"]]);
    const r = resolveVariantIdForOffer(10009, byWoo, null, undefined);
    expect(r.variantId).toBe("var-1");
    expect(r.via).toBe("wooCommerceVariationId");
  });
});
