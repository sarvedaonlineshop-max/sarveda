import { describe, expect, it } from "vitest";

import { mapCtxOfferToFeedItem } from "../../src/modules/merchant/ctxCompatibilityFeed";
import {
  nativeMerchantGroupId,
  nativeMerchantOfferId,
  parseNativeMerchantOfferId
} from "../../src/modules/merchant/nativeMerchantIdentity";
import {
  mapNativeShopVariantToFeedItem,
  sarvedaProductTypePath
} from "../../src/modules/merchant/sarvedaProductsFeed";
import { buildNativeMerchantProductLink } from "../../src/modules/merchant/merchantVariantLink";
import type { ProductType, ProductStatus, VariantStatus } from "@prisma/client";

const VARIANT_ID = "9aac4a50-5a79-4ee3-b31f-80fa5c5de8fa";
const PRODUCT_ID = "323be7f3-cc3b-435f-b36d-310fefa463e6";

function makeNativeVariant() {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: "MI-CB-MA-B",
    mrpInPaise: 175_000,
    saleInPaise: 160_000,
    status: "ACTIVE" as VariantStatus,
    wooCommerceVariationId: 49605,
    attributeValues: [
      {
        attributeValue: {
          value: "Ball Mallet",
          attribute: { slug: "type", name: "Type" }
        }
      }
    ],
    images: [],
    inventory: { onHand: 10, reserved: 0 },
    productRel: {
      id: PRODUCT_ID,
      slug: "crystal-bowl-accessories",
      name: "Crystal Bowl Mallets",
      description: "<p>Mallets</p>",
      shortDescription: null,
      productType: "VARIABLE" as ProductType,
      status: "ACTIVE" as ProductStatus,
      catalogHidden: false,
      deletedAt: null,
      wooCommerceId: 49604,
      images: [
        {
          id: "img1",
          url: "https://sarveda-media.s3.amazonaws.com/media/wp/uploads/2026/04/Crystal-bowl-accessories.jpg",
          isPrimary: true,
          position: 0,
          variantId: null
        }
      ],
      categories: [
        {
          categoryId: "cat-leaf",
          category: { id: "cat-leaf", name: "Accessories", parentId: "cat-mid" }
        }
      ]
    }
  };
}

describe("nativeMerchantIdentity", () => {
  it("builds stable sv_ offer and group ids", () => {
    expect(nativeMerchantOfferId(VARIANT_ID)).toBe(`sv_${VARIANT_ID}`);
    expect(nativeMerchantGroupId(PRODUCT_ID)).toBe(`sv_group_${PRODUCT_ID}`);
    expect(parseNativeMerchantOfferId(`sv_${VARIANT_ID}`)).toBe(VARIANT_ID);
    expect(parseNativeMerchantOfferId("49605")).toBeNull();
  });
});

describe("sarvedaProductTypePath", () => {
  it("builds deepest category breadcrumb", () => {
    const byId = new Map([
      ["cat-root", { id: "cat-root", name: "Sound & Musical Instruments", parentId: null }],
      ["cat-mid", { id: "cat-mid", name: "Crystal Bowls", parentId: "cat-root" }],
      ["cat-leaf", { id: "cat-leaf", name: "Accessories", parentId: "cat-mid" }]
    ]);
    const path = sarvedaProductTypePath(
      [{ categoryId: "cat-leaf", category: byId.get("cat-leaf")! }],
      byId
    );
    expect(path).toBe("Sound & Musical Instruments > Crystal Bowls > Accessories");
  });
});

describe("mapNativeShopVariantToFeedItem", () => {
  it("emits sv_ id, native group, category product_type, and ?offer=sv_ link", () => {
    const byId = new Map([
      ["cat-root", { id: "cat-root", name: "Sound & Musical Instruments", parentId: null }],
      ["cat-mid", { id: "cat-mid", name: "Crystal Bowls", parentId: "cat-root" }],
      ["cat-leaf", { id: "cat-leaf", name: "Accessories", parentId: "cat-mid" }]
    ]);
    const mapped = mapNativeShopVariantToFeedItem(
      makeNativeVariant() as never,
      3,
      byId,
      "https://sarveda.com"
    );
    expect("exclude" in mapped).toBe(false);
    if ("exclude" in mapped) return;
    expect(mapped.gId).toBe(`sv_${VARIANT_ID}`);
    expect(mapped.itemGroupId).toBe(`sv_group_${PRODUCT_ID}`);
    expect(mapped.productType).toContain("Crystal Bowls");
    expect(mapped.link).toBe(
      buildNativeMerchantProductLink("https://sarveda.com", "crystal-bowl-accessories", VARIANT_ID)
    );
    expect(mapped.link).toContain("offer=sv_");
    expect(mapped.canonicalLink).toBe("https://sarveda.com/product/crystal-bowl-accessories");
  });
});

describe("historical vs native id namespaces", () => {
  it("historical items use bare numeric g:id", () => {
    const variant = makeNativeVariant();
    const offer = {
      wooOfferId: 49605,
      wooParentId: 49604,
      ctxProductType: "Sound > Crystal Bowls > Accessories",
      ctxItemGroupId: "49604",
      ctxTitle: "Crystal Bowl Mallets - Ball Mallet",
      ctxLegacyLink: "https://example.com",
      classification: "PUBLISH" as const,
      excludeReason: null,
      manualAction: null,
      sarvedaVariantId: VARIANT_ID,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      sarvedaVariant: variant as never
    };
    const mapped = mapCtxOfferToFeedItem(offer as never, "https://sarveda.com");
    expect("exclude" in mapped).toBe(false);
    if ("exclude" in mapped) return;
    expect(mapped.gId).toBe("49605");
    expect(mapped.gId).not.toContain("sv_");
  });
});
