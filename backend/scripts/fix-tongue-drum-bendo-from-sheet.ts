/**
 * Fix 11 Note Tongue Drum + Bendo Shaker from Website Catalog sheet.
 *
 * Tongue Drum:
 *   - matched leave (ensure sheet SKU + attr labels)
 *   - sheet-only: reactivate if inactive SKU exists, else create
 *
 * Bendo Shaker:
 *   - draft all current active DB variants
 *   - add sheet Small / Large as new variants
 *
 * Usage:
 *   npx tsx scripts/fix-tongue-drum-bendo-from-sheet.ts
 *   npx tsx scripts/fix-tongue-drum-bendo-from-sheet.ts --apply
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-tongue-bendo-backups");

function labelOf(variant: {
  attributeValues: Array<{ attributeValue: { value: string } }>;
}) {
  return variant.attributeValues.map((a) => a.attributeValue.value).join(" / ");
}

function norm(s: string) {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

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

async function cloneFromSibling(
  productId: string,
  newId: string,
  excludeIds: string[] = []
) {
  const sibling = await prisma.productVariant.findFirst({
    where: {
      productId,
      status: "ACTIVE",
      id: { notIn: [newId, ...excludeIds] },
    },
    include: { shippingRates: true },
    orderBy: { createdAt: "asc" },
  });
  // Prefer any variant on product for pricing if no other active
  const donor =
    sibling ||
    (await prisma.productVariant.findFirst({
      where: { productId, id: { not: newId } },
      include: { shippingRates: true },
      orderBy: { createdAt: "asc" },
    }));
  if (!donor) return;
  await prisma.productVariant.update({
    where: { id: newId },
    data: {
      mrpInPaise: donor.mrpInPaise,
      saleInPaise: donor.saleInPaise,
      mrpUsdCents: donor.mrpUsdCents,
      saleUsdCents: donor.saleUsdCents,
      mrpGbpPence: donor.mrpGbpPence,
      saleGbpPence: donor.saleGbpPence,
      weightGrams: donor.weightGrams,
    },
  });
  if (donor.shippingRates.length) {
    await prisma.variantShippingRate.createMany({
      data: donor.shippingRates.map((r) => ({
        variantId: newId,
        country: r.country,
        standardPerProduct: r.standardPerProduct,
        standardAdditional: r.standardAdditional,
        expeditedPerProduct: r.expeditedPerProduct,
        expeditedAdditional: r.expeditedAdditional,
        codPerProduct: r.codPerProduct,
        codAdditional: r.codAdditional,
        estimatedDays: r.estimatedDays,
      })),
      skipDuplicates: true,
    });
  }
}

async function fixTongueDrum() {
  const SHEET = [
    { variant: "6 inches / White", sku: "MI-TD-11N-W-6", size: "6 inches", color: "White" },
    { variant: "6 inches / Blue", sku: "MI-TD-11N-B-6", size: "6 inches", color: "Blue" },
    { variant: "8 inches / White", sku: "MI-TD-11N-W-8", size: "8 inches", color: "White" },
    { variant: "8 inches / Blue", sku: "MI-TD-11N-B-8", size: "8 inches", color: "Blue" },
    { variant: "10 inches / White", sku: "MI-TD-11N-W-10", size: "10 inches", color: "White" },
    { variant: "10 inches / Blue", sku: "MI-TD-11N-B-10", size: "10 inches", color: "Blue" },
    { variant: "12 inches / White", sku: "MI-TD-11N-W-12", size: "12 inches", color: "White" },
    { variant: "12 inches / Blue", sku: "MI-TD-11N-B-12", size: "12 inches", color: "Blue" },
  ];

  const product = await prisma.product.findFirst({
    where: { slug: "11-note-tongue-drum", deletedAt: null },
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
  if (!product) throw new Error("Missing 11 Note Tongue Drum");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(BACKUP_DIR, `${stamp}-11-note-tongue-drum.json`),
    JSON.stringify(product, null, 2)
  );

  const bySku = new Map(product.variants.map((v) => [v.sku, v]));
  const actions: string[] = [];
  let skuUpdates = 0;
  let attrSyncs = 0;
  let reactivated = 0;
  let created = 0;

  for (const row of SHEET) {
    const existing = bySku.get(row.sku);
    const attrs = [
      { name: "Size", slug: "size", value: row.size },
      { name: "Color", slug: "color", value: row.color },
    ];

    if (existing) {
      // Ensure active + sheet labels
      const label = labelOf(existing);
      const needsAttr = norm(label) !== norm(row.variant);
      const needsActivate = existing.status !== "ACTIVE";

      if (needsActivate) {
        actions.push(`REACTIVATE ${row.sku} (${row.variant})`);
        reactivated += 1;
        if (APPLY) {
          await prisma.productVariant.update({
            where: { id: existing.id },
            data: { status: "ACTIVE" },
          });
        }
      } else {
        actions.push(`KEEP matched ${row.sku} (${row.variant})`);
      }

      if (needsAttr || needsActivate) {
        actions.push(`ATTR SYNC ${row.sku} -> ${row.variant}`);
        attrSyncs += 1;
        if (APPLY) {
          await syncVariantAttributes(existing.id, attrs);
        }
      }
      continue;
    }

    // Try match by label among actives with wrong SKU
    const byLabel = product.variants.find(
      (v) => v.status === "ACTIVE" && norm(labelOf(v)) === norm(row.variant)
    );
    if (byLabel) {
      const clash = bySku.get(row.sku);
      if (clash && clash.id !== byLabel.id) {
        actions.push(`SKU CONFLICT ${byLabel.sku} -> ${row.sku}`);
        continue;
      }
      if (byLabel.sku !== row.sku) {
        actions.push(`SKU ${byLabel.sku} -> ${row.sku}`);
        skuUpdates += 1;
        if (APPLY) {
          await prisma.productVariant.update({
            where: { id: byLabel.id },
            data: { sku: row.sku },
          });
        }
        bySku.delete(byLabel.sku);
        bySku.set(row.sku, { ...byLabel, sku: row.sku });
      }
      if (APPLY) await syncVariantAttributes(byLabel.id, attrs);
      attrSyncs += 1;
      continue;
    }

    actions.push(`CREATE ${row.sku} (${row.variant})`);
    created += 1;
    if (APPLY) {
      const sibling = product.variants.find((v) => v.status === "ACTIVE") || product.variants[0];
      const createdV = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: row.sku,
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
      await syncVariantAttributes(createdV.id, attrs);
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
      bySku.set(row.sku, createdV as (typeof product.variants)[0]);
    }
  }

  if (APPLY) {
    await prisma.product.update({
      where: { id: product.id },
      data: { variantAxisOrder: ["size", "color"] },
    });
    await ensureDefault(product.id);
  }

  console.log("\n=== 11 Note Tongue Drum ===");
  console.log(
    `skuUpdates=${skuUpdates} attrSyncs=${attrSyncs} reactivated=${reactivated} created=${created}`
  );
  for (const a of actions) console.log(" ", a);
  return { skuUpdates, attrSyncs, reactivated, created, actions };
}

async function fixBendo() {
  const SHEET = [
    { variant: "Small", sku: "MI-BE-S" },
    { variant: "Large", sku: "MI-BE-L" },
  ];

  const product = await prisma.product.findFirst({
    where: { name: "Bendo Shaker", deletedAt: null },
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
  if (!product) throw new Error("Missing Bendo Shaker");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(BACKUP_DIR, `${stamp}-bendo-shaker.json`),
    JSON.stringify(product, null, 2)
  );

  const actions: string[] = [];
  let drafted = 0;
  let created = 0;
  let reactivated = 0;

  // Draft all current active
  for (const v of product.variants.filter((x) => x.status === "ACTIVE")) {
    // Don't draft if it already is the exact sheet SKU we'll keep — but user said add sheet as NEW and draft OLD.
    // Sheet SKUs don't exist yet on this product (woo-style skus). Draft all actives.
    actions.push(`DRAFT ${v.sku} (${labelOf(v) || "blank"})`);
    drafted += 1;
    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { status: "INACTIVE", isDefault: false },
      });
    }
  }

  for (const row of SHEET) {
    const existing = await prisma.productVariant.findUnique({ where: { sku: row.sku } });
    if (existing) {
      if (existing.productId !== product.id) {
        actions.push(`SKU EXISTS ON OTHER PRODUCT ${row.sku}`);
        continue;
      }
      if (existing.status !== "ACTIVE") {
        actions.push(`REACTIVATE ${row.sku} (${row.variant})`);
        reactivated += 1;
        if (APPLY) {
          await prisma.productVariant.update({
            where: { id: existing.id },
            data: { status: "ACTIVE" },
          });
          await syncVariantAttributes(existing.id, [
            { name: "Size", slug: "size", value: row.variant },
          ]);
        }
      } else {
        actions.push(`KEEP ${row.sku}`);
      }
      continue;
    }

    actions.push(`CREATE ${row.sku} (${row.variant})`);
    created += 1;
    if (APPLY) {
      const sibling = product.variants[0];
      const createdV = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: row.sku,
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
      await syncVariantAttributes(createdV.id, [
        { name: "Size", slug: "size", value: row.variant },
      ]);
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
    }
  }

  if (APPLY) {
    await prisma.product.update({
      where: { id: product.id },
      data: { variantAxisOrder: ["size"] },
    });
    await ensureDefault(product.id);
  }

  console.log("\n=== Bendo Shaker ===");
  console.log(`drafted=${drafted} created=${created} reactivated=${reactivated}`);
  for (const a of actions) console.log(" ", a);
  return { drafted, created, reactivated, actions };
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);
  const tongue = await fixTongueDrum();
  const bendo = await fixBendo();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(BACKUP_DIR, `${stamp}-summary.json`),
    JSON.stringify({ mode: APPLY ? "APPLY" : "DRY_RUN", tongue, bendo }, null, 2)
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
