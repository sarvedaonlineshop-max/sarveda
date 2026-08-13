/**
 * Export Lightsail catalog + media gaps for DO pull analysis.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const OUT = path.join(__dirname, "../../data/compare/lightsail-catalog-export.json");
const prisma = new PrismaClient();

function variantLabel(variant: {
  attributeValues: Array<{ attributeValue: { value: string; attribute: { slug: string } } }>;
}) {
  return variant.attributeValues
    .slice()
    .sort((a, b) => a.attributeValue.attribute.slug.localeCompare(b.attributeValue.attribute.slug))
    .map((a) => a.attributeValue.value)
    .join(" / ");
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      catalogHidden: false,
      NOT: {
        OR: [
          { slug: { startsWith: "course-checkout-" } },
          { slug: { startsWith: "event-checkout-" } },
        ],
      },
    },
    include: {
      images: true,
      variants: {
        where: {
          status: "ACTIVE",
          NOT: {
            OR: [{ sku: { startsWith: "COURSE-" } }, { sku: { startsWith: "EVENT-" } }],
          },
        },
        include: {
          attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
          images: true,
        },
      },
    },
    orderBy: { slug: "asc" },
  });

  const rows = products.flatMap((p) => {
    const productImages = p.images.filter((i) => !i.variantId).length;
    const hasDesc = Boolean((p.description || "").trim().length > 50);
    const hasShort = Boolean((p.shortDescription || "").trim().length > 20);
    const base = {
      productId: p.id,
      slug: p.slug,
      name: p.name,
      wooCommerceId: p.wooCommerceId,
      hasDescription: hasDesc,
      hasShortDescription: hasShort,
      productImageCount: productImages,
      productVideoUrl: (p.videoUrl || "").trim(),
      hasProductVideo: Boolean((p.videoUrl || "").trim()),
    };
    if (!p.variants.length) {
      return [{ ...base, variantId: null, sku: "", variantName: "", variantImageCount: 0, variantVideoUrl: "", hasVariantVideo: false, prices: null }];
    }
    return p.variants.map((v) => ({
      ...base,
      variantId: v.id,
      sku: v.sku,
      variantName: variantLabel(v) || "Standard",
      variantImageCount: v.images.length,
      variantVideoUrl: (v.videoUrl || "").trim(),
      hasVariantVideo: Boolean((v.videoUrl || "").trim()),
      prices: {
        inr: { mrp: v.mrpInPaise / 100, sale: v.saleInPaise / 100 },
        usd: { mrp: v.mrpUsdCents != null ? v.mrpUsdCents / 100 : null, sale: v.saleUsdCents != null ? v.saleUsdCents / 100 : null },
        gbp: { mrp: v.mrpGbpPence != null ? v.mrpGbpPence / 100 : null, sale: v.saleGbpPence != null ? v.saleGbpPence / 100 : null },
      },
    }));
  });

  const byName: Record<string, string[]> = {};
  for (const p of products) {
    const k = p.name.trim().replace(/\s+/g, " ").toLowerCase();
    (byName[k] ??= []).push(p.slug);
  }

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        productCount: products.length,
        variantRowCount: rows.length,
        bySlug: Object.fromEntries(products.map((p) => [p.slug.toLowerCase(), p.slug])),
        byName,
        rows,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${OUT} (${products.length} products, ${rows.length} rows)`);
}

main().finally(() => prisma.$disconnect());
