/**
 * Fix 6 skipped partial-41 products:
 * - Vintage copper: reorganize to Bottle Type × Size (like live DO), SKUs unchanged
 * - Other 5: LS-only NEW — keep SKU/price/pair-with; ensure variant thumb from product gallery
 *
 * Usage (Lightsail):
 *   npx tsx scripts/fix-skipped-six-products.ts
 *   npx tsx scripts/fix-skipped-six-products.ts --apply
 */
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { mirrorUrlToS3 } from "../src/config/s3";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";
import { parseDecimal, toPaise } from "../src/utils/money";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const REPO = path.resolve(__dirname, "../..");
const DO_VARIANTS = path.join(REPO, "data/compare/do_variants.csv");
const DO_ATTACHMENTS = path.join(REPO, "data/compare/do_attachments.csv");
const BACKUP_DIR = path.join(REPO, "data/compare/live-skipped-six-fix-backups");

const VINTAGE_WOO = 5682;
const VINTAGE_SLUG = "7-chakras-vintage-copper-bottles";

/** LS SKU → DO attrs + do var id for price/image */
const VINTAGE_MAP: Record<
  string,
  { bottleType: string; size: string; doVarId: string }
> = {
  "CB-7C-V": { bottleType: "without-brush", size: "1L", doVarId: "5786" },
  "CB-7C-V-.5": { bottleType: "without-brush", size: "500ml", doVarId: "43491" },
  "CB-7C-V-B": { bottleType: "with-brush", size: "1L", doVarId: "43492" },
  "CB-7C-V-B-.5": { bottleType: "with-brush", size: "500ml", doVarId: "5787" },
};

const LS_ONLY_SLUGS = [
  "ankh",
  "box-tanpura",
  "large-tuning-fork",
  "painted-egg-shakers",
  "wooden-hand-taal-khartal",
];

const actions: string[] = [];
function log(msg: string) {
  console.log(msg);
  actions.push(msg);
}

function loadDoVariants(): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const r of parse(fs.readFileSync(DO_VARIANTS, "utf8"), {
    columns: true,
    bom: true,
  }) as Record<string, string>[]) {
    map.set(r.id, r);
  }
  return map;
}

function loadAttachments(): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(DO_ATTACHMENTS)) return m;
  for (const r of parse(fs.readFileSync(DO_ATTACHMENTS, "utf8"), {
    columns: true,
    bom: true,
  }) as Record<string, string>[]) {
    if (r.url) m.set(String(r.id), r.url.trim());
  }
  return m;
}

function priceFromDo(regular: string, sale: string) {
  const saleN = parseDecimal(sale);
  const regN = parseDecimal(regular);
  const effective = saleN ?? regN;
  if (effective == null || effective <= 0) return null;
  const mrp = regN ?? effective;
  const saleP = saleN ?? regN ?? effective;
  return { mrpInPaise: toPaise(Math.max(mrp, saleP)), saleInPaise: toPaise(saleP) };
}

async function mirrorVariantImage(slug: string, sku: string, url: string): Promise<string> {
  if (!APPLY) return url;
  try {
    const ext = path.extname(new URL(url).pathname) || ".jpg";
    const key = `products/${slug}/variants/${sku}${ext}`;
    return (await mirrorUrlToS3(url, key)) || url;
  } catch {
    return url;
  }
}

async function fixVintageCopper(doVars: Map<string, Record<string, string>>, attachments: Map<string, string>) {
  log(`\n=== Fix ${VINTAGE_SLUG} → Bottle Type × Size ===`);

  const product = await prisma.product.findFirst({
    where: { slug: VINTAGE_SLUG },
    include: { variants: { where: { status: "ACTIVE" } } },
  });
  if (!product) {
    log("SKIP vintage — product not found");
    return;
  }

  const axisOrder = ["bottle-type", "size"];

  if (APPLY) {
    await prisma.product.update({
      where: { id: product.id },
      data: { variantAxisOrder: axisOrder, wooCommerceId: VINTAGE_WOO },
    });
  }

  for (const variant of product.variants) {
    const spec = VINTAGE_MAP[variant.sku];
    if (!spec) {
      log(`  SKIP unknown SKU ${variant.sku}`);
      continue;
    }

    const doRow = doVars.get(spec.doVarId);
    const prices = doRow ? priceFromDo(doRow.regular_price || "", doRow.sale_price || "") : null;

    log(
      `  ${variant.sku} → ${spec.bottleType} / ${spec.size}` +
        (prices ? ` ₹${prices.saleInPaise / 100}` : "")
    );

    if (APPLY) {
      if (prices) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { mrpInPaise: prices.mrpInPaise, saleInPaise: prices.saleInPaise },
        });
      }

      await syncVariantAttributes(variant.id, [
        { name: "Bottle Type", slug: "bottle-type", value: spec.bottleType },
        { name: "Size", slug: "size", value: spec.size },
      ]);

      const thumbId = doRow?.thumb_id || "";
      const imgUrl = thumbId ? attachments.get(String(thumbId)) : null;
      if (imgUrl) {
        const mirrored = await mirrorVariantImage(VINTAGE_SLUG, variant.sku, imgUrl);
        const existing = await prisma.productImage.findFirst({ where: { variantId: variant.id } });
        if (existing) {
          await prisma.productImage.update({ where: { id: existing.id }, data: { url: mirrored } });
        } else {
          await prisma.productImage.create({
            data: {
              productId: product.id,
              variantId: variant.id,
              url: mirrored,
              altText: product.name,
              position: 0,
              isPrimary: false,
            },
          });
        }
      }
    }
  }

  // Clear stray attribute links on inactive variants if any
  const inactive = await prisma.productVariant.findMany({
    where: { productId: product.id, status: "INACTIVE" },
  });
  if (inactive.length && APPLY) {
    for (const v of inactive) {
      await prisma.variantAttributeValue.deleteMany({ where: { variantId: v.id } });
    }
  }
}

async function fixLsOnlyNew(slug: string) {
  log(`\n=== LS-only NEW: ${slug} (keep SKU, price, pair-with) ===`);

  const product = await prisma.product.findFirst({
    where: { slug },
    include: {
      variants: { where: { status: "ACTIVE" }, include: { images: { orderBy: { position: "asc" } } } },
      images: { where: { variantId: null }, orderBy: { position: "asc" } },
      relationsFrom: { where: { type: "PAIR_WITH" } },
    },
  });
  if (!product) {
    log(`  SKIP — not found`);
    return;
  }

  const galleryUrl =
    product.images.find((i) => i.isPrimary)?.url ||
    product.images[0]?.url ||
    product.variants[0]?.images[0]?.url;

  log(`  variants: ${product.variants.length}, gallery: ${product.images.length}, pair-with: ${product.relationsFrom.length}`);

  for (const variant of product.variants) {
    // Simple single-axis cleanup: one default variant, no bogus DO attrs
    if (product.variants.length === 1 && APPLY) {
      await syncVariantAttributes(variant.id, []);
      await prisma.product.update({
        where: { id: product.id },
        data: { variantAxisOrder: [], productType: "SIMPLE" },
      });
    }

    const hasThumb = variant.images.length > 0;
    const srcUrl = hasThumb ? variant.images[0]!.url : galleryUrl;
    if (!srcUrl) {
      log(`  ${variant.sku} — no image source`);
      continue;
    }

    if (!hasThumb) {
      log(`  ${variant.sku} — copy gallery image to variant thumb`);
      if (APPLY) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            variantId: variant.id,
            url: srcUrl,
            altText: product.name,
            position: 0,
            isPrimary: false,
          },
        });
      }
    } else {
      log(`  ${variant.sku} — thumb OK, price ₹${variant.saleInPaise / 100} unchanged`);
    }
  }
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const doVars = loadDoVariants();
  const attachments = loadAttachments();

  log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  await fixVintageCopper(doVars, attachments);
  for (const slug of LS_ONLY_SLUGS) {
    await fixLsOnlyNew(slug);
  }

  if (APPLY) {
    try {
      const { execSync } = await import("child_process");
      execSync(
        `npx tsx scripts/sync-do-variant-galleries.ts --apply --product-slug ${VINTAGE_SLUG}`,
        { cwd: path.resolve(__dirname, ".."), stdio: "pipe" }
      );
      log(`  carousel synced: ${VINTAGE_SLUG}`);
    } catch {
      log(`  carousel warn: ${VINTAGE_SLUG}`);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-actions.json`), JSON.stringify({ actions }, null, 2));
  log(`\nDone.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
