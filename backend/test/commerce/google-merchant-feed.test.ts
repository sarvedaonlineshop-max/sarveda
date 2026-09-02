import { describe, expect, it } from "vitest";

import {
  buildFeedTitle,
  escapeXml,
  formatMerchantPriceInr,
  mapVariantToFeedItem,
  normalizeAbsoluteHttpsImageUrl,
  renderGoogleMerchantRssXml,
  resolveMerchantFeedSiteOrigin,
  sanitizeFeedText,
  validateFeedHistoricalContinuity,
  availableQty,
  type MerchantFeedItem
} from "../../src/modules/merchant/googleMerchantFeed";

function baseVariant(overrides: Record<string, unknown> = {}) {
  const productRelOverride = (overrides.productRel as Record<string, unknown> | undefined) || {};
  const { productRel: _ignore, ...rest } = overrides;
  void _ignore;
  const productRel = {
    id: "prod-1",
    name: "Ocean Drums",
    slug: "ocean-drums",
    description: "<p>Handcrafted &amp; sacred</p>",
    shortDescription: null,
    status: "ACTIVE",
    productType: "VARIABLE" as const,
    catalogHidden: false,
    deletedAt: null,
    wooCommerceId: 9529,
    images: [
      {
        url: "https://sarveda-media.s3.amazonaws.com/media/ocean.jpg",
        isPrimary: true,
        position: 0,
        variantId: null
      }
    ],
    categories: [{ category: { name: "Kids", slug: "kids", parentId: null } }],
    ...productRelOverride
  };
  return {
    id: "var-1",
    sku: "MI-OD-D-30",
    status: "ACTIVE",
    saleInPaise: 123300,
    mrpInPaise: 150000,
    wooCommerceVariationId: 9536,
    productId: "prod-1",
    inventory: { onHand: 5, reserved: 1 },
    attributeValues: [
      {
        attributeValue: {
          value: "Dream Catcher",
          attribute: { name: "Type", slug: "type" }
        }
      },
      {
        attributeValue: {
          value: "30 cms",
          attribute: { name: "Size", slug: "size" }
        }
      }
    ],
    images: [],
    ...rest,
    productRel
  };
}

describe("merchant feed helpers", () => {
  it("escapes XML special characters", () => {
    expect(escapeXml(`a&b<c>"d"'e`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e");
  });

  it("sanitizes HTML and unicode control chars", () => {
    expect(sanitizeFeedText("<script>x</script><p>Hello\u0001World</p>")).toBe("Hello World");
  });

  it("formats INR price from paise without float drift", () => {
    expect(formatMerchantPriceInr(123300)).toBe("1233.00 INR");
    expect(formatMerchantPriceInr(99)).toBe("0.99 INR");
    expect(() => formatMerchantPriceInr(0)).toThrow();
  });

  it("computes available qty like cart", () => {
    expect(availableQty(5, 1)).toBe(4);
    expect(availableQty(0, 0)).toBe(0);
    expect(availableQty(2, 5)).toBe(0);
  });

  it("resolves site origin from MERCHANT_FEED_SITE_URL first", () => {
    expect(
      resolveMerchantFeedSiteOrigin({
        MERCHANT_FEED_SITE_URL: "https://sarveda.com/",
        FRONTEND_URL: "https://sarveda-demo.xyz"
      })
    ).toBe("https://sarveda.com");
  });

  it("uses FRONTEND_URL when no explicit merchant origin (staging-safe)", () => {
    expect(
      resolveMerchantFeedSiteOrigin({
        FRONTEND_URL: "https://sarveda-demo.xyz,https://other.example"
      })
    ).toBe("https://sarveda-demo.xyz");
  });

  it("normalizes absolute https images", () => {
    expect(normalizeAbsoluteHttpsImageUrl("https://cdn.example/a.jpg")).toBe(
      "https://cdn.example/a.jpg"
    );
    expect(normalizeAbsoluteHttpsImageUrl("http://cdn.example/a.jpg")).toBe(
      "https://cdn.example/a.jpg"
    );
    expect(normalizeAbsoluteHttpsImageUrl("/media/a.jpg", { AWS_CLOUDFRONT_URL: "https://cdn.x" })).toBe(
      "https://cdn.x/media/a.jpg"
    );
    expect(normalizeAbsoluteHttpsImageUrl("not-a-url")).toBe(null);
  });
});

describe("mapVariantToFeedItem", () => {
  const origin = "https://sarveda.com";

  it("builds historical variable offer with gla_* and item_group_id", () => {
    const mapped = mapVariantToFeedItem(baseVariant() as never, origin);
    expect("item" in mapped).toBe(true);
    if (!("item" in mapped)) return;
    expect(mapped.item.gId).toBe("gla_9536");
    expect(mapped.item.itemGroupId).toBe("9529");
    expect(mapped.item.link).toBe("https://sarveda.com/product/ocean-drums");
    expect(mapped.item.availability).toBe("in_stock");
    expect(mapped.item.salePrice).toBe("1233.00 INR");
    expect(mapped.item.price).toBe("1500.00 INR");
    expect(mapped.item.size).toBe("30 cms");
    expect(mapped.item.link.includes("/store/")).toBe(false);
  });

  it("marks zero-stock dropship variant in_stock in feed mapper", () => {
    const mapped = mapVariantToFeedItem(
      baseVariant({ inventory: { onHand: 0, reserved: 0 }, dropShipEnabled: true }) as never,
      origin
    );
    expect("item" in mapped).toBe(true);
    if (!("item" in mapped)) return;
    expect(mapped.item.availability).toBe("in_stock");
  });

  it("marks zero-stock non-dropship out_of_stock", () => {
    const mapped = mapVariantToFeedItem(
      baseVariant({ inventory: { onHand: 0, reserved: 0 }, dropShipEnabled: false }) as never,
      origin
    );
    expect("item" in mapped).toBe(true);
    if (!("item" in mapped)) return;
    expect(mapped.item.availability).toBe("out_of_stock");
  });

  it("matches commerce selling price (saleInPaise) for non-sale items", () => {
    const mapped = mapVariantToFeedItem(
      baseVariant({ saleInPaise: 99900, mrpInPaise: 99900 }) as never,
      origin
    );
    expect("item" in mapped).toBe(true);
    if (!("item" in mapped)) return;
    expect(mapped.item.price).toBe("999.00 INR");
    expect(mapped.item.salePrice).toBe(null);
    expect(mapped.item.saleInPaise).toBe(99900);
  });

  it("emits item_group_id when parent Woo id differs even if productType is SIMPLE", () => {
    const mapped = mapVariantToFeedItem(
      baseVariant({
        wooCommerceVariationId: 49864,
        productRel: {
          productType: "SIMPLE",
          wooCommerceId: 49817,
          name: "DNA Tuning Fork",
          slug: "large-tuning-fork"
        }
      }) as never,
      origin
    );
    expect("item" in mapped).toBe(true);
    if (!("item" in mapped)) return;
    expect(mapped.item.gId).toBe("gla_49864");
    expect(mapped.item.itemGroupId).toBe("49817");
  });

  it("omits item_group_id for simple products", () => {
    const mapped = mapVariantToFeedItem(
      baseVariant({
        wooCommerceVariationId: 48931,
        productRel: {
          productType: "SIMPLE",
          wooCommerceId: 48931,
          name: "Singing Bowl with Handle",
          slug: "singing-bowl-with-handle"
        }
      }) as never,
      origin
    );
    expect("item" in mapped).toBe(true);
    if (!("item" in mapped)) return;
    expect(mapped.item.gId).toBe("gla_48931");
    expect(mapped.item.itemGroupId).toBe(null);
  });

  it("marks out_of_stock when available qty is 0", () => {
    const mapped = mapVariantToFeedItem(
      baseVariant({ inventory: { onHand: 1, reserved: 1 } }) as never,
      origin
    );
    expect("item" in mapped).toBe(true);
    if (!("item" in mapped)) return;
    expect(mapped.item.availability).toBe("out_of_stock");
  });

  it("excludes inactive product and variant", () => {
    expect(
      mapVariantToFeedItem(
        baseVariant({ productRel: { status: "DRAFT" } }) as never,
        origin
      )
    ).toEqual({ exclude: "INACTIVE_PRODUCT" });
    expect(
      mapVariantToFeedItem(baseVariant({ status: "INACTIVE" }) as never, origin)
    ).toEqual({ exclude: "INACTIVE_VARIANT" });
  });

  it("excludes NULL identity / invalid price / missing image", () => {
    expect(
      mapVariantToFeedItem(baseVariant({ wooCommerceVariationId: 0 }) as never, origin)
    ).toEqual({ exclude: "NULL_IDENTITY" });
    expect(
      mapVariantToFeedItem(baseVariant({ saleInPaise: 0 }) as never, origin)
    ).toEqual({ exclude: "INVALID_PRICE" });
    expect(
      mapVariantToFeedItem(
        baseVariant({ productRel: { images: [] }, images: [] }) as never,
        origin
      )
    ).toEqual({ exclude: "MISSING_IMAGE" });
  });

  it("does not invent IDs from UUID", () => {
    const mapped = mapVariantToFeedItem(baseVariant() as never, origin);
    if (!("item" in mapped)) throw new Error("expected item");
    expect(mapped.item.gId.includes("var-1")).toBe(false);
    expect(mapped.item.gId.startsWith("gla_")).toBe(true);
  });
});

describe("XML render + continuity", () => {
  it("renders valid Google namespace RSS with escaped unicode", () => {
    const items: MerchantFeedItem[] = [
      {
        gId: "gla_1",
        itemGroupId: "10",
        title: 'Bowl <Large> & "Etched"',
        description: "Desc & more",
        link: "https://sarveda.com/product/bowl",
        imageLink: "https://cdn.example/a.jpg",
        availability: "in_stock",
        condition: "new",
        price: "100.00 INR",
        salePrice: "90.00 INR",
        brand: "Sarveda",
        identifierExists: false,
        sku: "SKU",
        color: null,
        size: "Large",
        productType: "Sound",
        wooOfferId: 1,
        wooParentId: 10,
        productTypeEnum: "VARIABLE",
        productSlug: "bowl",
        saleInPaise: 9000,
        mrpInPaise: 10000,
        availableQty: 2
      },
      {
        gId: "gla_2",
        itemGroupId: null,
        title: "Simple ॐ",
        description: "Plain",
        link: "https://sarveda.com/product/simple",
        imageLink: "https://cdn.example/b.jpg",
        availability: "out_of_stock",
        condition: "new",
        price: "50.00 INR",
        salePrice: null,
        brand: "Sarveda",
        identifierExists: false,
        sku: "S2",
        color: null,
        size: null,
        productType: null,
        wooOfferId: 2,
        wooParentId: 2,
        productTypeEnum: "SIMPLE",
        productSlug: "simple",
        saleInPaise: 5000,
        mrpInPaise: 5000,
        availableQty: 0
      }
    ];
    const xml = renderGoogleMerchantRssXml(items, "https://sarveda.com");
    expect(xml.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")).toBe(true);
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<g:id>gla_1</g:id>");
    expect(xml).toContain("<g:item_group_id>10</g:item_group_id>");
    expect(xml).toContain("Bowl &lt;Large&gt; &amp; &quot;Etched&quot;");
    expect(xml).toContain("<g:sale_price>90.00 INR</g:sale_price>");
    expect(xml).toContain("<g:id>gla_2</g:id>");
    expect(xml.indexOf("<g:item_group_id>", xml.indexOf("gla_2"))).toBe(-1);
    expect(xml).toContain("ॐ");
    expect(xml).not.toContain("/store/");
    expect(xml).not.toContain("sarveda-demo.xyz");
  });

  it("validates historical continuity exact matches", () => {
    const items: MerchantFeedItem[] = [
      {
        gId: "gla_43497",
        itemGroupId: "5489",
        title: "t",
        description: "d",
        link: "https://sarveda.com/product/x",
        imageLink: "https://cdn.example/a.jpg",
        availability: "in_stock",
        condition: "new",
        price: "1.00 INR",
        salePrice: null,
        brand: "Sarveda",
        identifierExists: false,
        sku: "s",
        color: null,
        size: null,
        productType: null,
        wooOfferId: 43497,
        wooParentId: 5489,
        productTypeEnum: "VARIABLE",
        productSlug: "x",
        saleInPaise: 100,
        mrpInPaise: 100,
        availableQty: 1
      }
    ];
    const c = validateFeedHistoricalContinuity(items, [
      { woo_offer_id: "43497", woo_parent_id: "5489", merchant_id: "gla_43497" }
    ]);
    expect(c.exactIdMatches).toBe(1);
    expect(c.idMismatches).toHaveLength(0);
    expect(c.itemGroupExact).toBe(1);
    expect(c.itemGroupMismatches).toHaveLength(0);
  });

  it("buildFeedTitle is deterministic and avoids duplicate attrs", () => {
    expect(buildFeedTitle("Ocean Drums", "VARIABLE", ["Dream Catcher", "30 cms"])).toBe(
      "Ocean Drums - Dream Catcher / 30 cms"
    );
    expect(buildFeedTitle("Ocean Drums Dream Catcher", "VARIABLE", ["Dream Catcher"])).toBe(
      "Ocean Drums Dream Catcher"
    );
  });
});

describe("deterministic ordering in XML", () => {
  it("keeps input order in render (caller sorts)", () => {
    const mk = (id: number, group: number | null): MerchantFeedItem => ({
      gId: `gla_${id}`,
      itemGroupId: group == null ? null : String(group),
      title: `t${id}`,
      description: "d",
      link: `https://sarveda.com/product/p${id}`,
      imageLink: "https://cdn.example/a.jpg",
      availability: "in_stock",
      condition: "new",
      price: "1.00 INR",
      salePrice: null,
      brand: "Sarveda",
      identifierExists: false,
      sku: `s${id}`,
      color: null,
      size: null,
      productType: null,
      wooOfferId: id,
      wooParentId: group,
      productTypeEnum: group == null ? "SIMPLE" : "VARIABLE",
      productSlug: `p${id}`,
      saleInPaise: 100,
      mrpInPaise: 100,
      availableQty: 1
    });
    const xml = renderGoogleMerchantRssXml([mk(2, 1), mk(1, 1)], "https://sarveda.com");
    expect(xml.indexOf("gla_2")).toBeLessThan(xml.indexOf("gla_1"));
  });
});
