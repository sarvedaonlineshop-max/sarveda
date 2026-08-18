import { prisma } from "../../config/db";

const SHIP_ZONES = ["IN", "US", "GB", "OTHER"] as const;
const CORE_ACCORDION = [
  "Key features",
  "How to use",
  "Health benefits",
  "How to play",
  "Care instructions",
  "Shipping and returns",
  "About Sarveda",
] as const;

export type CatalogGapRow = {
  productId: string;
  productName: string;
  productSlug: string;
  variantId: string;
  sku: string;
  issue: string;
  zone?: string;
};

export type CatalogGapsReport = {
  summary: {
    activeProducts: number;
    activeVariants: number;
    pricingGapCount: number;
    shippingGapCount: number;
    imageGapCount: number;
    videoGapCount: number;
    pairWithGapCount: number;
    copyGapCount: number;
    productsWithoutImage: number;
    payment: {
      razorpay: boolean;
      cod: boolean;
      stripe: boolean;
      paypal: boolean;
    };
  };
  pricingGaps: CatalogGapRow[];
  shippingGaps: CatalogGapRow[];
  imageGaps: CatalogGapRow[];
  videoGaps: CatalogGapRow[];
  pairWithGaps: CatalogGapRow[];
  copyGaps: CatalogGapRow[];
  productsWithoutPrimaryImage: Array<{ productId: string; name: string; slug: string }>;
};

function isShopSku(sku: string) {
  return !/^(COURSE|EVENT)-/i.test(sku);
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productBase(p: { id: string; name: string; slug: string }): CatalogGapRow {
  return {
    productId: p.id,
    productName: p.name,
    productSlug: p.slug,
    variantId: "",
    sku: "—",
    issue: "",
  };
}

export async function buildCatalogGapsReport(): Promise<CatalogGapsReport> {
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: { in: ["ACTIVE", "DRAFT"] },
      NOT: [{ slug: { startsWith: "course-checkout-" } }, { slug: { startsWith: "event-checkout-" } }],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      description: true,
      shortDescription: true,
      videoUrl: true,
      images: { select: { id: true, variantId: true, url: true, isPrimary: true } },
      accordionItems: { select: { title: true, content: true } },
      relationsFrom: { where: { type: "PAIR_WITH" }, select: { id: true } },
      variants: {
        select: {
          id: true,
          sku: true,
          status: true,
          saleInPaise: true,
          saleUsdCents: true,
          saleGbpPence: true,
          saleAedFils: true,
          videoUrl: true,
          images: { select: { id: true } },
          shippingRates: {
            select: { country: true, standardPerProduct: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const shop = products.filter((p) => p.variants.every((v) => isShopSku(v.sku)));
  const pricingGaps: CatalogGapRow[] = [];
  const shippingGaps: CatalogGapRow[] = [];
  const imageGaps: CatalogGapRow[] = [];
  const videoGaps: CatalogGapRow[] = [];
  const pairWithGaps: CatalogGapRow[] = [];
  const copyGaps: CatalogGapRow[] = [];
  const productsWithoutPrimaryImage: Array<{ productId: string; name: string; slug: string }> = [];

  let activeVariantCount = 0;

  for (const p of shop) {
    const base = productBase(p);
    const activeVariants = p.variants.filter((v) => v.status === "ACTIVE");
    activeVariantCount += activeVariants.length;

    const desc = stripHtml(p.description || "");
    const short = stripHtml(p.shortDescription || "");
    if (desc.length < 40 && short.length < 40) {
      copyGaps.push({ ...base, issue: "Missing description / short description" });
    }

    const kf = p.accordionItems.find((a) => /key\s*features/i.test(a.title));
    const kfText = stripHtml(kf?.content || "");
    if (kfText.length < 20) {
      copyGaps.push({ ...base, issue: "Missing Key features" });
    }

    const haveTitles = new Set(p.accordionItems.map((a) => a.title.trim().toLowerCase()));
    const missingAcc = CORE_ACCORDION.filter((title) => !haveTitles.has(title.toLowerCase()));
    if (missingAcc.length) {
      copyGaps.push({
        ...base,
        issue: `Accordion missing: ${missingAcc.join(", ")}`,
      });
    }

    if (p.relationsFrom.length === 0) {
      pairWithGaps.push({ ...base, issue: "No pair-with products" });
    }

    const allImages = p.images;
    if (allImages.length === 0) {
      imageGaps.push({ ...base, issue: "Product has no images" });
    }
    if (!allImages.some((im) => im.isPrimary)) {
      productsWithoutPrimaryImage.push({ productId: p.id, name: p.name, slug: p.slug });
    }

    const hasVideo = Boolean((p.videoUrl || "").trim() || activeVariants.some((v) => (v.videoUrl || "").trim()));
    if (!hasVideo) {
      videoGaps.push({ ...base, issue: "No product or variant video" });
    }

    for (const v of p.variants) {
      if (!isShopSku(v.sku)) continue;
      const vBase: CatalogGapRow = {
        productId: p.id,
        productName: p.name,
        productSlug: p.slug,
        variantId: v.id,
        sku: v.sku,
        issue: "",
      };
      const draftNote = v.status === "INACTIVE" ? " [INACTIVE]" : "";

      if (v.saleInPaise <= 0) {
        pricingGaps.push({ ...vBase, issue: `Missing INR sale price${draftNote}`, zone: "IN" });
      }
      if (v.saleUsdCents == null || v.saleUsdCents <= 0) {
        pricingGaps.push({ ...vBase, issue: `Missing USD sale price${draftNote}`, zone: "US" });
      }
      if (v.saleGbpPence == null || v.saleGbpPence <= 0) {
        pricingGaps.push({ ...vBase, issue: `Missing GBP sale price${draftNote}`, zone: "GB" });
      }
      if (v.saleAedFils == null || v.saleAedFils <= 0) {
        pricingGaps.push({ ...vBase, issue: `Missing AED sale price${draftNote}`, zone: "AED" });
      }

      if (v.status === "ACTIVE") {
        const rateCountries = new Set(v.shippingRates.map((r) => r.country));
        for (const zone of SHIP_ZONES) {
          if (!rateCountries.has(zone)) {
            shippingGaps.push({
              ...vBase,
              issue: `No shipping rate row for zone ${zone}`,
              zone,
            });
          } else {
            const row = v.shippingRates.find((r) => r.country === zone)!;
            if (row.standardPerProduct <= 0) {
              shippingGaps.push({
                ...vBase,
                issue: `Shipping standard rate is zero for ${zone}`,
                zone,
              });
            }
          }
        }
      }

      if (v.status === "ACTIVE" && v.images.length === 0 && allImages.length > 0 && activeVariants.length > 1) {
        imageGaps.push({ ...vBase, issue: "Variant has no own images (gallery will not switch)" });
      }
    }

    if (activeVariants.length > 1) {
      const fps = activeVariants
        .map((v) =>
          p.images
            .filter((im) => im.variantId === v.id)
            .map((im) => im.url)
            .sort()
            .join("|")
        )
        .filter(Boolean);
      if (fps.length >= 2 && new Set(fps).size === 1) {
        imageGaps.push({
          ...base,
          issue: "All variants share the same image set (PDP click will not switch gallery)",
        });
      }
    }
  }

  return {
    summary: {
      activeProducts: shop.filter((p) => p.status === "ACTIVE").length,
      activeVariants: activeVariantCount,
      pricingGapCount: pricingGaps.length,
      shippingGapCount: shippingGaps.length,
      imageGapCount: imageGaps.length,
      videoGapCount: videoGaps.length,
      pairWithGapCount: pairWithGaps.length,
      copyGapCount: copyGaps.length,
      productsWithoutImage: productsWithoutPrimaryImage.length,
      payment: {
        razorpay: Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim()),
        cod: !["0", "false", "no"].includes((process.env.ENABLE_COD_CHECKOUT ?? "1").toLowerCase()),
        stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
        paypal: Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim()),
      },
    },
    pricingGaps,
    shippingGaps,
    imageGaps,
    videoGaps,
    pairWithGaps,
    copyGaps,
    productsWithoutPrimaryImage,
  };
}
