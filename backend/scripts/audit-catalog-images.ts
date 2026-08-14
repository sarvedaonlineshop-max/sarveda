/**
 * Audit shop + PDP image health across active catalog.
 *
 * Usage (Lightsail):
 *   npx tsx scripts/audit-catalog-images.ts
 *   npx tsx scripts/audit-catalog-images.ts --json /tmp/catalog-image-audit.json
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const JSON_OUT = (() => {
  const i = process.argv.indexOf("--json");
  return i >= 0 ? process.argv[i + 1] : null;
})();

function isBrokenProductsPath(url: string): boolean {
  return url.includes("/products/");
}

async function urlOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(12_000) });
    return r.ok;
  } catch {
    return false;
  }
}

function pdpGalleryCount(
  images: Array<{ variantId: string | null; url: string }>,
  defaultVariantId: string | null
): number {
  if (!defaultVariantId) {
    return images.filter((im) => !im.variantId).length || images.length;
  }
  const variantImages = images.filter((im) => im.variantId === defaultVariantId);
  const shared = images.filter((im) => !im.variantId);
  if (variantImages.length >= 2) return variantImages.length;
  if (variantImages.length === 1 && shared.length > 0) {
    const seen = new Set<string>();
    for (const im of [...shared, ...variantImages]) seen.add(im.url);
    return seen.size;
  }
  if (variantImages.length > 0) return variantImages.length;
  return shared.length || images.length;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, status: "ACTIVE", catalogHidden: false },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: {
        where: { status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { saleInPaise: "asc" }],
        take: 1,
        include: { images: { orderBy: { position: "asc" } } }
      }
    },
    orderBy: { slug: "asc" }
  });

  const shopBroken: Array<{ slug: string; url: string; reason: string }> = [];
  const shopMissing: string[] = [];
  const pdpThin: Array<{ slug: string; pdpCount: number; shared: number; variantLinked: number }> = [];
  const brokenPaths: string[] = [];

  for (const p of products) {
    const defaultVariant = p.variants[0] ?? null;
    const shared = p.images.filter((im) => !im.variantId);
    const primary =
      shared.find((im) => im.isPrimary)?.url ??
      shared[0]?.url ??
      p.images[0]?.url ??
      defaultVariant?.images[0]?.url ??
      null;

    if (!primary) {
      shopMissing.push(p.slug);
      continue;
    }

    if (isBrokenProductsPath(primary)) {
      brokenPaths.push(p.slug);
      shopBroken.push({ slug: p.slug, url: primary, reason: "products/ S3 path (403)" });
      continue;
    }

    const ok = await urlOk(primary);
    if (!ok) {
      shopBroken.push({ slug: p.slug, url: primary, reason: "HEAD not OK" });
    }

    const pdpCount = pdpGalleryCount(p.images, defaultVariant?.id ?? null);
    if (pdpCount <= 1 && p.images.length > 1) {
      pdpThin.push({
        slug: p.slug,
        pdpCount,
        shared: shared.length,
        variantLinked: p.images.filter((im) => im.variantId).length
      });
    }
  }

  const report = {
    scannedAt: new Date().toISOString(),
    totalActive: products.length,
    shopMissingPrimary: shopMissing.length,
    shopBrokenUrl: shopBroken.length,
    brokenProductsPath: brokenPaths.length,
    pdpWouldShowOneImage: pdpThin.length,
    shopMissing,
    shopBroken,
    brokenProductsPathSlugs: brokenPaths,
    pdpThinGallery: pdpThin.slice(0, 50)
  };

  console.log(`Active products: ${report.totalActive}`);
  console.log(`Shop — no primary: ${report.shopMissingPrimary}`);
  console.log(`Shop — broken URL: ${report.shopBrokenUrl} (${report.brokenProductsPath} on /products/ path)`);
  console.log(`PDP — would show 1 image but DB has more: ${report.pdpWouldShowOneImage}`);

  if (brokenPaths.length) {
    console.log("\n/products/ path slugs:");
    for (const s of brokenPaths) console.log(`  ${s}`);
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
    console.log(`\nWrote ${JSON_OUT}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
