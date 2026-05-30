/**
 * Link WooCommerce variation attributes (Type, Size, etc.) to ProductVariant rows.
 * Matches variants by SKU `woo-var-{wpPostId}` from seed.ts.
 *
 * Usage:
 *   npx tsx scripts/import-variant-attributes.ts [--dry-run] [path/to/variations.xml]
 *
 * Default XML: ../../data/variations.xml
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { slugify } from "../src/utils/slugify";
import { may30 } from "./migration-paths";
import { cdata, parseIntSafe, parseMeta, readWxr } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath = process.argv.find((a) => a.endsWith(".xml")) ?? may30.variations();

const UNTRACKED_ON_HAND = 999;

const AXIS_ORDER = ["type", "size", "comb-type", "comb_type", "packs", "bottle-type", "finish"];

const AXIS_LABELS: Record<string, string> = {
  type: "Type",
  size: "Size",
  "comb-type": "Comb Types",
  comb_type: "Comb Types",
  packs: "Packs",
  "bottle-type": "Bottle Type",
  finish: "Finish"
};

type AttrRow = { slug: string; name: string; value: string };

function axisLabel(slug: string): string {
  return AXIS_LABELS[slug] ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractAttributes(meta: Record<string, string>, excerpt: string): AttrRow[] {
  const rows: AttrRow[] = [];

  for (const [key, raw] of Object.entries(meta)) {
    if (!key.startsWith("attribute_")) continue;
    const value = raw.trim();
    if (!value) continue;
    let slug = key.slice("attribute_".length);
    if (slug.startsWith("pa_")) slug = slug.slice(3);
    rows.push({ slug, name: axisLabel(slug), value });
  }

  if (rows.length === 0 && excerpt) {
    const parts = excerpt.split(",").map((p) => p.trim());
    for (const part of parts) {
      const m = part.match(/^([^:]+):\s*(.+)$/);
      if (!m) continue;
      const name = m[1].trim();
      const value = m[2].trim();
      rows.push({ slug: slugify(name), name, value });
    }
  }

  rows.sort((a, b) => {
    const ai = AXIS_ORDER.indexOf(a.slug);
    const bi = AXIS_ORDER.indexOf(b.slug);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return rows;
}

function stockOnHand(meta: Record<string, string>): number {
  const status = (meta._stock_status ?? "instock").toLowerCase();
  if (status === "outofstock") return 0;
  const manage = meta._manage_stock === "yes";
  const qty = parseInt(meta._stock ?? "", 10);
  if (manage && Number.isFinite(qty) && qty >= 0) return qty;
  return UNTRACKED_ON_HAND;
}

async function ensureAttribute(slug: string, name: string): Promise<string> {
  const row = await prisma.productAttribute.upsert({
    where: { slug },
    create: { slug, name },
    update: { name }
  });
  return row.id;
}

async function ensureAttributeValue(attributeId: string, value: string): Promise<string> {
  const valueSlug = slugify(value);
  const existing = await prisma.attributeValue.findFirst({
    where: { attributeId, slug: valueSlug }
  });
  if (existing) return existing.id;
  const created = await prisma.attributeValue.create({
    data: { attributeId, value, slug: valueSlug }
  });
  return created.id;
}

async function main(): Promise<void> {
  const xml = readWxr(xmlPath);
  const blocks = xml.split(/\s*<item>/).slice(1);

  let linked = 0;
  let skipped = 0;
  let missingVariant = 0;

  for (const block of blocks) {
    if (!block.includes("<wp:post_type><![CDATA[product_variation]]></wp:post_type>")) continue;
    if (!block.includes("<wp:status><![CDATA[publish]]></wp:status>")) continue;

    const wpPostId = parseIntSafe(cdata("wp:post_id", block));
    if (!wpPostId) continue;

    const legacySku = `woo-var-${wpPostId}`;
    const meta = parseMeta(block);
    const xmlSku = (meta._sku ?? "").trim();
    const candidateSkus = [legacySku, xmlSku].filter(Boolean);

    let variant = null as Awaited<ReturnType<typeof prisma.productVariant.findUnique>>;
    let matchedSku = "";
    for (const candidate of candidateSkus) {
      const row = await prisma.productVariant.findUnique({ where: { sku: candidate } });
      if (row) {
        variant = row;
        matchedSku = candidate;
        break;
      }
    }

    if (!variant) {
      missingVariant++;
      continue;
    }

    const excerpt = cdata("excerpt:encoded", block);
    const attrs = extractAttributes(meta, excerpt);
    if (!attrs.length) {
      skipped++;
      continue;
    }

    const onHand = stockOnHand(meta);

    if (!dryRun) {
      await prisma.variantAttributeValue.deleteMany({ where: { variantId: variant.id } });

      for (const attr of attrs) {
        const attributeId = await ensureAttribute(attr.slug, attr.name);
        const attributeValueId = await ensureAttributeValue(attributeId, attr.value);
        await prisma.variantAttributeValue.upsert({
          where: {
            variantId_attributeValueId: { variantId: variant.id, attributeValueId }
          },
          create: { variantId: variant.id, attributeValueId },
          update: {}
        });
      }

      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand },
        update: { onHand }
      });
    }

    linked++;
    if (linked <= 5 || linked % 500 === 0) {
      console.log(`→ ${matchedSku}: ${attrs.map((a) => `${a.name}=${a.value}`).join(", ")} (stock ${onHand})`);
    }
  }

  console.log(
    `\nDone. Linked ${linked} variations. Skipped ${skipped} (no attrs). Missing variant rows ${missingVariant}.${dryRun ? " (dry-run)" : ""}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
