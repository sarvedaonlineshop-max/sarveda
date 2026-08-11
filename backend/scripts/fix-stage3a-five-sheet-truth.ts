/**
 * Stage 3a: Ankh, Rainstick, Kenari Shaker, Ocarina Big, NA Flute Triple — sheet truth.
 *
 * Usage:
 *   npx tsx scripts/fix-stage3a-five-sheet-truth.ts
 *   npx tsx scripts/fix-stage3a-five-sheet-truth.ts --apply
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-stage3a-backups");

type SheetVariant = {
  sku: string;
  label: string;
  attrs: Array<{ name: string; slug: string; value: string }>;
};

type Spec = {
  slug: string;
  sheetName: string;
  sheetSlug: string;
  sheetVariants: SheetVariant[];
};

const SPECS: Spec[] = [
  {
    slug: "ankh-sound-healing-instrument",
    sheetName: "Ankh",
    sheetSlug: "ankh",
    sheetVariants: [{ sku: "MI-AH", label: "", attrs: [] }],
  },
  {
    slug: "bamboo-rainstick-49779",
    sheetName: "Bamboo Rainstick Wide-80cm",
    sheetSlug: "bamboo-rainstick-wide-80cm",
    sheetVariants: [
      {
        sku: "MI-RS-W-80",
        label: "Wide 80cm",
        attrs: [{ name: "Type", slug: "type", value: "Wide 80cm" }],
      },
    ],
  },
  {
    slug: "kenari-seed-shell-shaker-with-handle",
    sheetName: "Kenari Shaker",
    sheetSlug: "kenari-shaker",
    sheetVariants: [
      {
        sku: "MI-KR-S",
        label: "Standard",
        attrs: [{ name: "Type", slug: "type", value: "Standard" }],
      },
    ],
  },
  {
    slug: "ocarina-instruments",
    sheetName: "Ocarina - Big",
    sheetSlug: "ocarina-big",
    sheetVariants: [
      {
        sku: "MI-OC-B",
        label: "Big",
        attrs: [{ name: "Type", slug: "type", value: "Big" }],
      },
    ],
  },
  {
    slug: "native-american-style-flute-handcrafted-wooden-melody-maker",
    sheetName: "Native American Flute - Triple",
    sheetSlug: "native-american-flute-triple",
    sheetVariants: [
      {
        sku: "MI-NF-T",
        label: "Triple",
        attrs: [{ name: "Type", slug: "type", value: "Triple" }],
      },
    ],
  },
];

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
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary: Record<string, unknown>[] = [];

  for (const spec of SPECS) {
    const product = await prisma.product.findFirst({
      where: { slug: spec.slug, deletedAt: null },
      include: { variants: { include: { shippingRates: true } } },
    });
    if (!product) {
      console.error("MISSING", spec.slug);
      continue;
    }

    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${product.slug}.json`),
      JSON.stringify(product, null, 2)
    );

    const actions: string[] = [];
    console.log(`\n=== ${spec.sheetName} ===`);
    console.log(`  from: ${product.name} (${product.slug}) status=${product.status}`);

    const targetSkus = new Set(spec.sheetVariants.map((s) => s.sku.toLowerCase()));
    const claimedVariantIds = new Set<string>();

    // Ensure each sheet variant
    for (const sv of spec.sheetVariants) {
      const existingSku = await prisma.productVariant.findUnique({ where: { sku: sv.sku } });

      if (existingSku && existingSku.productId === product.id) {
        actions.push(`USE existing ${sv.sku} (${sv.label || "blank"})`);
        claimedVariantIds.add(existingSku.id);
        if (APPLY) {
          await prisma.productVariant.update({
            where: { id: existingSku.id },
            data: { status: "ACTIVE", isDefault: false },
          });
          await syncVariantAttributes(existingSku.id, sv.attrs);
        }
        continue;
      }

      if (existingSku && existingSku.productId !== product.id) {
        actions.push(`SKU CONFLICT ${sv.sku} on other product`);
        continue;
      }

      // Rewrite one current active (or any) variant on this product to the sheet SKU
      const candidate =
        product.variants.find((v) => v.status === "ACTIVE" && !claimedVariantIds.has(v.id)) ||
        product.variants.find((v) => !claimedVariantIds.has(v.id));

      if (candidate) {
        actions.push(
          `REWRITE ${candidate.sku} -> ${sv.sku} (${sv.label || "blank"})`
        );
        claimedVariantIds.add(candidate.id);
        if (APPLY) {
          await prisma.productVariant.update({
            where: { id: candidate.id },
            data: { sku: sv.sku, status: "ACTIVE", isDefault: false },
          });
          await syncVariantAttributes(candidate.id, sv.attrs);
        }
        continue;
      }

      // Create
      const donor = product.variants[0];
      actions.push(`CREATE ${sv.sku} (${sv.label || "blank"})`);
      if (APPLY) {
        const created = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: sv.sku,
            mrpInPaise: donor?.mrpInPaise ?? 0,
            saleInPaise: donor?.saleInPaise ?? 0,
            mrpUsdCents: donor?.mrpUsdCents ?? null,
            saleUsdCents: donor?.saleUsdCents ?? null,
            mrpGbpPence: donor?.mrpGbpPence ?? null,
            saleGbpPence: donor?.saleGbpPence ?? null,
            weightGrams: donor?.weightGrams ?? null,
            isDefault: false,
            status: "ACTIVE",
            inventory: { create: { onHand: 0 } },
          },
        });
        claimedVariantIds.add(created.id);
        await syncVariantAttributes(created.id, sv.attrs);
        if (donor?.shippingRates?.length) {
          await prisma.variantShippingRate.createMany({
            data: donor.shippingRates.map((r) => ({
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

    // Draft leftover actives not claimed
    for (const v of product.variants) {
      if (claimedVariantIds.has(v.id)) continue;
      if (v.status !== "ACTIVE" && !APPLY) {
        // still report if it would remain non-sheet
        if (!targetSkus.has(v.sku.toLowerCase())) {
          // ignore already inactive
        }
        continue;
      }
      // After apply, re-read status; for dry-run draft any active not claimed
      if (v.status === "ACTIVE" || APPLY) {
        const fresh = APPLY
          ? await prisma.productVariant.findUnique({ where: { id: v.id } })
          : v;
        if (!fresh) continue;
        if (fresh.status === "ACTIVE" && !claimedVariantIds.has(v.id) && !targetSkus.has(fresh.sku.toLowerCase())) {
          actions.push(`DRAFT leftover ${fresh.sku}`);
          if (APPLY) {
            await prisma.productVariant.update({
              where: { id: v.id },
              data: { status: "INACTIVE", isDefault: false },
            });
          }
        } else if (!APPLY && v.status === "ACTIVE" && !claimedVariantIds.has(v.id)) {
          actions.push(`DRAFT leftover ${v.sku}`);
        }
      }
    }

    // For dry-run: claimed set doesn't prevent showing drafts of other actives
    if (!APPLY) {
      for (const v of product.variants) {
        if (v.status !== "ACTIVE") continue;
        if (claimedVariantIds.has(v.id)) continue;
        if (!actions.some((a) => a.includes(`DRAFT leftover ${v.sku}`))) {
          actions.push(`DRAFT leftover ${v.sku}`);
        }
      }
    }

    // Activate + rename
    if (product.status !== "ACTIVE") {
      actions.push(`ACTIVATE product`);
      if (APPLY) {
        await prisma.product.update({
          where: { id: product.id },
          data: { status: "ACTIVE" },
        });
      }
    }
    if (product.name !== spec.sheetName) {
      actions.push(`RENAME -> "${spec.sheetName}"`);
      if (APPLY) {
        await prisma.product.update({
          where: { id: product.id },
          data: { name: spec.sheetName },
        });
      }
    }
    if (product.slug !== spec.sheetSlug) {
      const clash = await prisma.product.findFirst({
        where: { slug: spec.sheetSlug, NOT: { id: product.id }, deletedAt: null },
      });
      if (clash) actions.push(`SLUG KEEP (target taken by ${clash.name})`);
      else {
        actions.push(`SLUG -> "${spec.sheetSlug}"`);
        if (APPLY) {
          await prisma.product.update({
            where: { id: product.id },
            data: { slug: spec.sheetSlug },
          });
        }
      }
    }

    if (APPLY) {
      // Draft any still-active non-target
      const actives = await prisma.productVariant.findMany({
        where: { productId: product.id, status: "ACTIVE" },
      });
      for (const v of actives) {
        if (!targetSkus.has(v.sku.toLowerCase())) {
          actions.push(`DRAFT leftover ${v.sku}`);
          await prisma.productVariant.update({
            where: { id: v.id },
            data: { status: "INACTIVE", isDefault: false },
          });
        }
      }
      await ensureDefault(product.id);
    }

    for (const a of actions) console.log(" ", a);
    summary.push({ sheetName: spec.sheetName, actions, mode: APPLY ? "APPLY" : "DRY_RUN" });
  }

  const out = path.join(BACKUP_DIR, `${stamp}-summary.json`);
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`\nMode: ${APPLY ? "APPLY" : "DRY_RUN"}\n${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
