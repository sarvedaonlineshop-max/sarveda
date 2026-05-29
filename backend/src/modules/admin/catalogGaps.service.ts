import { prisma } from "../../config/db";

const ZONES = ["IN", "US", "GB", "OTHER"] as const;

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
  productsWithoutPrimaryImage: Array<{ productId: string; name: string; slug: string }>;
};

export async function buildCatalogGapsReport(): Promise<CatalogGapsReport> {
  const variants = await prisma.productVariant.findMany({
    where: {
      status: "ACTIVE",
      productRel: { deletedAt: null, status: { in: ["ACTIVE", "DRAFT"] } }
    },
    include: {
      productRel: { select: { id: true, name: true, slug: true } },
      shippingRates: true
    },
    orderBy: { sku: "asc" }
  });

  const pricingGaps: CatalogGapRow[] = [];
  const shippingGaps: CatalogGapRow[] = [];

  for (const v of variants) {
    const sku = v.sku ?? "";
    /** Course enrollments use COURSE-* SKUs — not physical shop catalog. */
    if (sku.startsWith("COURSE-")) continue;

    const base = {
      productId: v.productRel.id,
      productName: v.productRel.name,
      productSlug: v.productRel.slug,
      variantId: v.id,
      sku
    };

    if (v.saleUsdCents == null || v.saleUsdCents <= 0) {
      pricingGaps.push({ ...base, issue: "Missing USD sale price", zone: "US" });
    }
    if (v.saleGbpPence == null || v.saleGbpPence <= 0) {
      pricingGaps.push({ ...base, issue: "Missing GBP sale price", zone: "GB" });
    }
    if (v.saleInPaise <= 0) {
      pricingGaps.push({ ...base, issue: "Missing INR sale price", zone: "IN" });
    }

    const rateCountries = new Set(v.shippingRates.map((r) => r.country));
    for (const zone of ZONES) {
      if (!rateCountries.has(zone)) {
        shippingGaps.push({
          ...base,
          issue: `No shipping rate row for zone ${zone}`,
          zone
        });
      } else {
        const row = v.shippingRates.find((r) => r.country === zone)!;
        if (row.standardPerProduct <= 0) {
          shippingGaps.push({
            ...base,
            issue: `Shipping standard rate is zero for ${zone}`,
            zone
          });
        }
      }
    }
  }

  const productsWithoutImage = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: { in: ["ACTIVE", "DRAFT"] },
      images: { none: { isPrimary: true } }
    },
    select: { id: true, name: true, slug: true },
    take: 200,
    orderBy: { name: "asc" }
  });

  const activeProducts = await prisma.product.count({
    where: { deletedAt: null, status: { in: ["ACTIVE", "DRAFT"] } }
  });

  return {
    summary: {
      activeProducts,
      activeVariants: variants.length,
      pricingGapCount: pricingGaps.length,
      shippingGapCount: shippingGaps.length,
      productsWithoutImage: productsWithoutImage.length,
      payment: {
        razorpay: Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim()),
        cod: !["0", "false", "no"].includes((process.env.ENABLE_COD_CHECKOUT ?? "1").toLowerCase()),
        stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
        paypal: Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim())
      }
    },
    pricingGaps: pricingGaps.slice(0, 500),
    shippingGaps: shippingGaps.slice(0, 500),
    productsWithoutPrimaryImage: productsWithoutImage.map((p) => ({
      productId: p.id,
      name: p.name,
      slug: p.slug
    }))
  };
}
