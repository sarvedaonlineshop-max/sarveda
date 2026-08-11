/**
 * Stage 2: remaining mapped products (full + partial + copper vintage split).
 * - Rename product name/slug from sheet
 * - Map: update SKU + variant attrs from sheet
 * - Draft: DB-only gone variants
 * - Create: sheet-only new variants
 * - Vintage split: move variants from Plain umbrella -> Vintage product
 *
 * Usage:
 *   npx tsx scripts/fix-stage2-remaining-mapped.ts
 *   npx tsx scripts/fix-stage2-remaining-mapped.ts --apply
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const BATCH = path.join(__dirname, "../../data/compare/stage2-apply-batch.json");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-stage2-backups");

type Attr = { name: string; slug: string; value: string };
type MapRow = {
  variantId: string;
  fromSku: string;
  toSku: string;
  fromVariant: string;
  toVariant: string;
  attrs: Attr[];
};
type BatchItem = {
  kind: string;
  sheetName: string;
  dbName: string;
  productId: string;
  dbSlug: string;
  sheetSlug: string;
  sourceProductId?: string;
  maps?: MapRow[];
  moves?: MapRow[];
  draft?: Array<{ variantId: string; sku: string; variant: string }>;
  draftStubs?: Array<{ variantId: string; sku: string; variant: string }>;
  create?: Array<{ sku: string; variant: string; attrs: Attr[] }>;
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

async function renameProduct(item: BatchItem, actions: string[]) {
  const product = await prisma.product.findUnique({ where: { id: item.productId } });
  if (!product) return;
  if (product.status !== "ACTIVE") {
    actions.push(`ACTIVATE product (was ${product.status})`);
    if (APPLY) {
      await prisma.product.update({
        where: { id: product.id },
        data: { status: "ACTIVE" },
      });
    }
  }
  if (product.name !== item.sheetName) {
    actions.push(`RENAME "${product.name}" -> "${item.sheetName}"`);
    if (APPLY) {
      await prisma.product.update({
        where: { id: product.id },
        data: { name: item.sheetName },
      });
    }
  }
  if (product.slug !== item.sheetSlug) {
    const clash = await prisma.product.findFirst({
      where: { slug: item.sheetSlug, NOT: { id: product.id }, deletedAt: null },
    });
    if (clash) {
      actions.push(`SLUG KEEP "${product.slug}" (target taken)`);
    } else {
      actions.push(`SLUG "${product.slug}" -> "${item.sheetSlug}"`);
      if (APPLY) {
        await prisma.product.update({
          where: { id: product.id },
          data: { slug: item.sheetSlug },
        });
      }
    }
  }
}

async function applyMaps(maps: MapRow[], actions: string[]) {
  for (const m of maps) {
    const v = await prisma.productVariant.findUnique({ where: { id: m.variantId } });
    if (!v) {
      actions.push(`MISS map ${m.variantId}`);
      continue;
    }
    if (v.sku !== m.toSku) {
      const clash = await prisma.productVariant.findFirst({
        where: { sku: m.toSku, NOT: { id: v.id } },
      });
      if (clash) {
        actions.push(`SKU CONFLICT ${m.fromSku} -> ${m.toSku}`);
        continue;
      }
    }
    actions.push(
      `MAP ${m.fromVariant || "(blank)"} [${m.fromSku}] -> ${m.toVariant || "(blank)"} [${m.toSku}]`
    );
    if (APPLY) {
      if (v.sku !== m.toSku) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { sku: m.toSku },
        });
      }
      if (m.attrs?.length) await syncVariantAttributes(v.id, m.attrs);
    }
  }
}

async function applyDrafts(
  drafts: Array<{ variantId: string; sku: string; variant: string }>,
  actions: string[]
) {
  for (const d of drafts) {
    const v = await prisma.productVariant.findUnique({ where: { id: d.variantId } });
    if (!v) {
      actions.push(`MISS draft ${d.sku}`);
      continue;
    }
    if (v.status === "INACTIVE") continue;
    actions.push(`DRAFT ${d.variant || "(blank)"} [${d.sku}]`);
    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { status: "INACTIVE", isDefault: false },
      });
    }
  }
}

async function applyCreates(
  productId: string,
  creates: Array<{ sku: string; variant: string; attrs: Attr[] }>,
  actions: string[]
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { include: { shippingRates: true } } },
  });
  if (!product) return;
  for (const c of creates) {
    const existing = await prisma.productVariant.findUnique({ where: { sku: c.sku } });
    if (existing) {
      if (existing.productId === productId && existing.status === "INACTIVE") {
        actions.push(`REACTIVATE ${c.sku} (${c.variant || "blank"})`);
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
    if (APPLY) {
      const created = await prisma.productVariant.create({
        data: {
          productId,
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
      if (c.attrs?.length) await syncVariantAttributes(created.id, c.attrs);
      if (sibling?.shippingRates?.length) {
        await prisma.variantShippingRate.createMany({
          data: sibling.shippingRates.map((r) => ({
            variantId: created.id,
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
    }
  }
}

async function applyMoves(item: BatchItem, actions: string[]) {
  for (const m of item.moves || []) {
    const v = await prisma.productVariant.findUnique({ where: { id: m.variantId } });
    if (!v) {
      actions.push(`MISS move ${m.variantId}`);
      continue;
    }
    if (v.sku !== m.toSku) {
      const clash = await prisma.productVariant.findFirst({
        where: { sku: m.toSku, NOT: { id: v.id } },
      });
      if (clash) {
        actions.push(`MOVE SKU CONFLICT ${m.fromSku} -> ${m.toSku}`);
        continue;
      }
    }
    actions.push(
      `MOVE ${m.fromSku} -> ${m.toSku} | ${m.fromVariant} -> ${m.toVariant} (to ${item.sheetName})`
    );
    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: {
          productId: item.productId,
          sku: m.toSku,
          status: "ACTIVE",
          isDefault: false,
        },
      });
      if (m.attrs?.length) await syncVariantAttributes(v.id, m.attrs);
    }
  }
}

async function main() {
  const batch = JSON.parse(fs.readFileSync(BATCH, "utf8")) as BatchItem[];
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Process order: non-vintage first, vintage_split last (after plain maps)
  const ordered = [
    ...batch.filter((b) => b.kind !== "vintage_split"),
    ...batch.filter((b) => b.kind === "vintage_split"),
  ];

  const summary: Record<string, unknown>[] = [];

  for (const item of ordered) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: { variants: true },
    });
    if (!product) {
      console.error("MISSING", item.dbName);
      continue;
    }
    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${product.slug}.json`),
      JSON.stringify(
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          variants: product.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            status: v.status,
            productId: product.id,
          })),
        },
        null,
        2
      )
    );

    const actions: string[] = [];
    console.log(`\n=== [${item.kind}] ${item.sheetName} ===`);

    if (item.kind === "vintage_split") {
      await applyMoves(item, actions);
      await applyDrafts(item.draftStubs || [], actions);
      await applyCreates(item.productId, item.create || [], actions);
      await renameProduct(item, actions);
      if (APPLY) await ensureDefault(item.productId);
    } else {
      await applyMaps(item.maps || [], actions);
      await applyDrafts(item.draft || [], actions);
      await applyCreates(item.productId, item.create || [], actions);
      await renameProduct(item, actions);
      if (APPLY) await ensureDefault(item.productId);
    }

    for (const a of actions) console.log(" ", a);
    summary.push({
      kind: item.kind,
      sheetName: item.sheetName,
      actions,
      mode: APPLY ? "APPLY" : "DRY_RUN",
    });
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
