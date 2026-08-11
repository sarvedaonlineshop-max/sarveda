/**
 * Apply gaps-14 fuzzy map:
 * - matched: replace DB variant attrs + SKU from sheet
 * - draft list + unmatched DB extras: INACTIVE
 * - unmatched sheet: create new variants
 *
 * Usage:
 *   npx tsx scripts/fix-gaps14-fuzzy-from-sheet.ts
 *   npx tsx scripts/fix-gaps14-fuzzy-from-sheet.ts --apply
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const BATCH = path.join(__dirname, "../../data/compare/gaps14-apply-batch.json");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-gaps14-backups");

type Attr = { name: string; slug: string; value: string };
type BatchProduct = {
  name: string;
  slug: string;
  productId: string;
  axisOrder: string[];
  matches: Array<{
    sheet_variant: string;
    sheet_sku: string;
    db_id: string;
    db_sku: string;
    db_variant: string;
    score: number;
    basis: string;
    attrs: Attr[];
  }>;
  draft: Array<{ id: string; sku: string; variant: string; reason: string }>;
  create: Array<{ variant: string; sku: string; attrs: Attr[] }>;
};

async function ensureDefault(productId: string) {
  const actives = await prisma.productVariant.findMany({
    where: { productId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  await prisma.productVariant.updateMany({
    where: { productId },
    data: { isDefault: false },
  });
  if (actives[0]) {
    await prisma.productVariant.update({
      where: { id: actives[0].id },
      data: { isDefault: true },
    });
  }
}

async function main() {
  const batch = JSON.parse(fs.readFileSync(BATCH, "utf8")) as BatchProduct[];
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary: Record<string, unknown>[] = [];

  for (const item of batch) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, deletedAt: null },
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
      console.error("MISSING", item.name);
      continue;
    }

    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${item.slug}.json`),
      JSON.stringify(
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          variants: product.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            status: v.status,
          })),
        },
        null,
        2
      )
    );

    const bySku = new Map(product.variants.map((v) => [v.sku, v]));
    let updated = 0;
    let drafted = 0;
    let created = 0;
    const actions: string[] = [];

    // 1) Maps: SKU + attrs from sheet
    for (const m of item.matches) {
      const v = product.variants.find((x) => x.id === m.db_id);
      if (!v) {
        actions.push(`MISS map id ${m.db_id}`);
        continue;
      }
      if (v.sku !== m.sheet_sku) {
        const clash = bySku.get(m.sheet_sku);
        if (clash && clash.id !== v.id) {
          actions.push(`SKU CONFLICT ${v.sku} -> ${m.sheet_sku}`);
          continue;
        }
      }
      actions.push(
        `MAP ${m.db_variant || "(blank)"} [${v.sku}] -> ${m.sheet_variant || "(blank)"} [${m.sheet_sku}] (${m.score})`
      );
      updated += 1;
      if (APPLY) {
        if (v.sku !== m.sheet_sku) {
          await prisma.productVariant.update({
            where: { id: v.id },
            data: { sku: m.sheet_sku },
          });
          bySku.delete(v.sku);
          bySku.set(m.sheet_sku, { ...v, sku: m.sheet_sku });
        }
        if (m.attrs?.length) {
          await syncVariantAttributes(v.id, m.attrs);
        }
      }
    }

    // 2) Drafts
    for (const d of item.draft) {
      const v = product.variants.find((x) => x.id === d.id) || bySku.get(d.sku);
      if (!v) {
        actions.push(`MISS draft ${d.sku}`);
        continue;
      }
      if (v.status === "INACTIVE") continue;
      actions.push(`DRAFT ${d.variant || "(blank)"} [${d.sku}] (${d.reason})`);
      drafted += 1;
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { status: "INACTIVE", isDefault: false },
        });
      }
    }

    // 3) Creates
    for (const c of item.create) {
      const existing = bySku.get(c.sku);
      if (existing) {
        if (existing.status === "INACTIVE") {
          actions.push(`REACTIVATE ${c.sku} (${c.variant || "blank"})`);
          created += 1;
          if (APPLY) {
            await prisma.productVariant.update({
              where: { id: existing.id },
              data: { status: "ACTIVE" },
            });
            if (c.attrs?.length) await syncVariantAttributes(existing.id, c.attrs);
          }
          continue;
        }
        actions.push(`SKIP create exists ${c.sku}`);
        continue;
      }
      const sibling =
        product.variants.find((v) => v.status === "ACTIVE") || product.variants[0];
      actions.push(`CREATE ${c.sku} (${c.variant || "blank"})`);
      created += 1;
      if (APPLY) {
        const createdV = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: c.sku,
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
        if (c.attrs?.length) await syncVariantAttributes(createdV.id, c.attrs);
        if (sibling?.shippingRates?.length) {
          await prisma.variantShippingRate.createMany({
            data: sibling.shippingRates.map((r) => ({
              variantId: createdV.id,
              country: r.country,
              standardPerProduct: r.standardPerProduct,
              standardAdditional: r.standardAdditional,
              expeditedPerProduct: r.expeditedPerProduct,
              expeditedAdditional: r.expeditedAdditional,
              codPerProduct: r.codPerProduct,
              codAdditional: r.codAdditional,
              estimatedDays: r.estimatedDays,
            })),
          });
        }
        bySku.set(c.sku, createdV as (typeof product.variants)[0]);
      }
    }

    if (APPLY) {
      if (item.axisOrder.length) {
        await prisma.product.update({
          where: { id: product.id },
          data: { variantAxisOrder: item.axisOrder },
        });
      }
      await ensureDefault(product.id);
    }

    summary.push({
      name: item.name,
      updated,
      drafted,
      created,
      mode: APPLY ? "APPLY" : "DRY_RUN",
      actions,
    });
    console.log(
      `\n=== ${item.name} === map=${updated} draft=${drafted} create=${created}`
    );
    for (const a of actions) console.log(" ", a);
  }

  const out = path.join(BACKUP_DIR, `${stamp}-summary.json`);
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`\nMode: ${APPLY ? "APPLY" : "DRY_RUN"}\nSummary: ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
