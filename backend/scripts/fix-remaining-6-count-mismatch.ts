/**
 * Apply remaining 6 count-mismatch products from Website Catalog sheet.
 * Matched → sheet SKU; only-sheet → create; only-DB → INACTIVE.
 *
 * Usage:
 *   npx tsx scripts/fix-remaining-6-count-mismatch.ts
 *   npx tsx scripts/fix-remaining-6-count-mismatch.ts --apply
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const BATCH_PATH = path.join(__dirname, "../../data/compare/remaining-6-apply-batch.json");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-remaining-6-backups");

type Attr = { slug: string; name: string; value: string };
type BatchProduct = {
  name: string;
  slug: string;
  axisOrder: string[];
  matches: Array<{
    sheet: { variant: string; sku: string };
    db: { variant: string; sku: string; status: string; attrs: Attr[] };
    basis: string;
  }>;
  only_sheet: Array<{ variant: string; sku: string }>;
  only_db: Array<{ variant: string; sku: string; status: string; attrs: Attr[] }>;
};

function normalizeSizeToken(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(\d+(?:\.\d+)?)\s*in(?:ches)?\b/i, "$1 in");
}

function parseSheetAttrs(label: string, axisOrder: string[], template: Attr[]): Attr[] {
  const raw = (label || "").trim();
  if (!raw) return [];
  const parts = raw.split("/").map((p) => p.trim()).filter(Boolean);

  if (axisOrder.length === 1) {
    const t = template.find((a) => a.slug === axisOrder[0]) || template[0];
    return [
      {
        slug: axisOrder[0],
        name: t?.name || axisOrder[0],
        value: normalizeSizeToken(raw),
      },
    ];
  }

  // Two-axis labels like "Gold / 3.5 Inches", "Plain /Medium", "Matte / 5 in"
  if (
    parts.length >= 2 &&
    (axisOrder.includes("size") || axisOrder.includes("colour") || axisOrder.includes("color"))
  ) {
    const sizeSlug = axisOrder.includes("size") ? "size" : null;
    const otherSlug =
      axisOrder.find((s) => s !== "size") ||
      axisOrder.find((s) => s === "type" || s === "color" || s === "colour") ||
      axisOrder[0];
    const sizeVal = sizeSlug ? normalizeSizeToken(parts[parts.length - 1]) : "";
    const otherVal = parts.slice(0, sizeSlug ? -1 : undefined).join(" / ").trim();
    return axisOrder.map((slug) => {
      const t = template.find((a) => a.slug === slug);
      let value = "";
      if (slug === "size") value = sizeVal;
      else if (slug === otherSlug) value = otherVal;
      else value = parts[axisOrder.indexOf(slug)] || "";
      return { slug, name: t?.name || slug, value };
    });
  }

  if (parts.length === axisOrder.length) {
    return axisOrder.map((slug, i) => {
      const t = template.find((a) => a.slug === slug);
      return {
        slug,
        name: t?.name || slug,
        value: slug === "size" ? normalizeSizeToken(parts[i]) : parts[i],
      };
    });
  }

  return axisOrder.map((slug, i) => {
    const t = template.find((a) => a.slug === slug);
    const value = parts[i] ?? raw;
    return {
      slug,
      name: t?.name || slug,
      value: slug === "size" ? normalizeSizeToken(value) : value,
    };
  });
}

async function main() {
  const batch = JSON.parse(fs.readFileSync(BATCH_PATH, "utf8")) as BatchProduct[];
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary: Record<string, unknown>[] = [];

  for (const item of batch) {
    const product = await prisma.product.findFirst({
      where: { slug: item.slug, deletedAt: null },
      include: {
        variants: {
          include: {
            attributeValues: {
              include: { attributeValue: { include: { attribute: true } } },
            },
            shippingRates: true,
          },
        },
      },
    });
    if (!product) {
      console.error("MISSING PRODUCT", item.name);
      continue;
    }

    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${item.slug}.json`),
      JSON.stringify(product, null, 2)
    );

    const bySku = new Map(product.variants.map((v) => [v.sku, v]));
    const template =
      product.variants
        .find((v) => v.status === "ACTIVE" && v.attributeValues.length)
        ?.attributeValues.map((av) => ({
          slug: av.attributeValue.attribute.slug,
          name: av.attributeValue.attribute.name,
          value: av.attributeValue.value,
        })) || [];

    let skuUpdates = 0;
    let drafted = 0;
    let created = 0;
    const actions: string[] = [];

    for (const m of item.matches) {
      const v = bySku.get(m.db.sku);
      if (!v) {
        actions.push(`MISS match db sku ${m.db.sku}`);
        continue;
      }
      if (v.sku === m.sheet.sku) continue;
      const clash = bySku.get(m.sheet.sku);
      if (clash && clash.id !== v.id) {
        actions.push(`SKU CONFLICT ${m.db.sku} -> ${m.sheet.sku}`);
        continue;
      }
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { sku: m.sheet.sku },
        });
      }
      bySku.delete(m.db.sku);
      bySku.set(m.sheet.sku, { ...v, sku: m.sheet.sku });
      skuUpdates += 1;
      actions.push(`SKU ${m.db.sku} -> ${m.sheet.sku} [${m.basis}]`);
    }

    for (const d of item.only_db) {
      const v = bySku.get(d.sku);
      if (!v) {
        actions.push(`MISS draft ${d.sku}`);
        continue;
      }
      if (v.status === "INACTIVE") continue;
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { status: "INACTIVE", isDefault: false },
        });
      }
      drafted += 1;
      actions.push(`DRAFT ${d.sku} (${d.variant || "blank"})`);
    }

    for (const s of item.only_sheet) {
      const existing = bySku.get(s.sku);
      if (existing) {
        if (existing.status === "INACTIVE") {
          if (APPLY) {
            await prisma.productVariant.update({
              where: { id: existing.id },
              data: { status: "ACTIVE" },
            });
          }
          created += 1;
          actions.push(`REACTIVATE ${s.sku} (${s.variant || "blank"})`);
          continue;
        }
        actions.push(`SKIP create exists ${s.sku}`);
        continue;
      }

      const attrs = parseSheetAttrs(s.variant, item.axisOrder, template).filter((a) => a.value);
      const sibling =
        product.variants.find((v) => v.status === "ACTIVE") || product.variants[0];

      if (APPLY) {
        const createdV = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: s.sku,
            mrpInPaise: sibling?.mrpInPaise ?? 0,
            saleInPaise: sibling?.saleInPaise ?? 0,
            mrpUsdCents: sibling?.mrpUsdCents ?? null,
            saleUsdCents: sibling?.saleUsdCents ?? null,
            mrpGbpPence: sibling?.mrpGbpPence ?? null,
            saleGbpPence: sibling?.saleGbpPence ?? null,
            weightGrams: sibling?.weightGrams ?? null,
            isDefault: false,
            status: "ACTIVE",
            inventory: { create: { onHand: 0 } },
          },
        });
        if (attrs.length) {
          await syncVariantAttributes(
            createdV.id,
            attrs.map((a) => ({ name: a.name, slug: a.slug, value: a.value }))
          );
        }
        if (sibling?.shippingRates?.length) {
          await prisma.variantShippingRate.createMany({
            data: sibling.shippingRates.map((rate) => ({
              variantId: createdV.id,
              country: rate.country,
              standardPerProduct: rate.standardPerProduct,
              standardAdditional: rate.standardAdditional,
              expeditedPerProduct: rate.expeditedPerProduct,
              expeditedAdditional: rate.expeditedAdditional,
              codPerProduct: rate.codPerProduct,
              codAdditional: rate.codAdditional,
              estimatedDays: rate.estimatedDays,
            })),
          });
        }
        bySku.set(s.sku, createdV as (typeof product.variants)[0]);
      }
      created += 1;
      actions.push(
        `CREATE ${s.sku} (${s.variant || "blank"}) attrs=${JSON.stringify(attrs)}`
      );
    }

    if (APPLY) {
      const actives = await prisma.productVariant.findMany({
        where: { productId: product.id, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      });
      if (actives.length) {
        await prisma.productVariant.updateMany({
          where: { productId: product.id },
          data: { isDefault: false },
        });
        await prisma.productVariant.update({
          where: { id: actives[0].id },
          data: { isDefault: true },
        });
      }
      if (item.axisOrder.length) {
        await prisma.product.update({
          where: { id: product.id },
          data: { variantAxisOrder: item.axisOrder },
        });
      }
    }

    summary.push({
      name: item.name,
      slug: item.slug,
      skuUpdates,
      drafted,
      created,
      mode: APPLY ? "APPLY" : "DRY_RUN",
      actions,
    });
    console.log(
      `\n=== ${item.name} ===\nSKU updates: ${skuUpdates} | Draft: ${drafted} | Create: ${created}`
    );
    for (const a of actions) console.log(" ", a);
  }

  const out = path.join(BACKUP_DIR, `${stamp}-summary.json`);
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`\nMode: ${APPLY ? "APPLY" : "DRY_RUN"}`);
  console.log(`Summary: ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
