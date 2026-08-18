/**
 * Audit: do variant color/size clicks actually change the linked gallery?
 *
 * Flags VARIABLE products where 2+ active variants with different color (or sole axis)
 * share the exact same variant-linked image URL set — thumbnails won't change on PDP.
 *
 * Usage:
 *   npx tsx scripts/audit-variant-gallery-switch.ts
 *   npx tsx scripts/audit-variant-gallery-switch.ts --slug sacred-symbols-singing-bowls
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SLUG_FILTER = (() => {
  const i = process.argv.indexOf("--slug");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const OUT_JSON = path.join(__dirname, "../../data/compare/variant-gallery-switch-audit.json");
const PULL_V2 = path.join(__dirname, "../../data/compare/do-ls-media-pull-v2.json");
const prisma = new PrismaClient();

/** LS-only SKUs (skip_ls_only in pull map) — sharing galleries across these is OK. */
function loadLsOnlySkus(): Set<string> {
  const out = new Set<string>();
  if (!fs.existsSync(PULL_V2)) return out;
  const raw = JSON.parse(fs.readFileSync(PULL_V2, "utf8")) as {
    rows: Array<{ ls_sku: string; action: string }>;
  };
  for (const r of raw.rows) {
    if (r.action === "skip_ls_only" && r.ls_sku?.trim()) {
      out.add(r.ls_sku.trim());
    }
  }
  return out;
}

type VariantRow = {
  sku: string;
  attrs: Record<string, string>;
  imageUrls: string[];
  imageFingerprint: string;
};

type ProductIssue = {
  slug: string;
  name: string;
  activeVariants: number;
  issue: "shared_gallery" | "missing_images" | "mixed_axes";
  detail: string;
  groups?: Array<{ fingerprint: string; skus: string[]; colors: string[] }>;
  variants?: VariantRow[];
};

function attrMap(
  rows: Array<{
    attributeValue: { value: string; slug: string; attribute: { slug: string } };
  }>
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const r of rows) {
    m[r.attributeValue.attribute.slug] = r.attributeValue.value;
  }
  return m;
}

function fingerprint(urls: string[]): string {
  return [...urls].sort().join("|");
}

function looksLikeSizeValue(value: string): boolean {
  return /\d+(?:\.\d+)?\s*-?\s*(in(?:ch(?:es)?)?|cm(?:s)?)\b/i.test(value.trim());
}

/** Match sync-do-variant-galleries.ts — type/size values are swapped on some LS variants. */
function axisValueForAudit(attrs: Record<string, string>, colorKey: string, sku: string): string {
  const normalized = { ...attrs };
  const typeVal = (normalized.type || "").trim();
  const sizeVal = (normalized.size || "").trim();
  if (typeVal && sizeVal && looksLikeSizeValue(typeVal) && !looksLikeSizeValue(sizeVal)) {
    normalized.type = sizeVal;
    normalized.size = typeVal;
  }
  const direct = (normalized[colorKey] || "").trim();
  if (direct) return direct;
  if (colorKey === "colours" || colorKey === "colour" || colorKey === "color") {
    return (
      (normalized.option || "").trim() ||
      (normalized.colours || "").trim() ||
      (normalized.colour || "").trim() ||
      (normalized.color || "").trim() ||
      sku
    );
  }
  return sku;
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      productType: "VARIABLE",
      ...(SLUG_FILTER ? { slug: SLUG_FILTER } : {}),
    },
    include: {
      variants: {
        where: { status: "ACTIVE" },
        include: {
          attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
          images: { orderBy: { position: "asc" } },
        },
      },
      images: true,
    },
    orderBy: { slug: "asc" },
  });

  const lsOnlySkus = loadLsOnlySkus();
  const issues: ProductIssue[] = [];
  let ok = 0;

  for (const p of products) {
    if (p.variants.length < 2) {
      ok++;
      continue;
    }

    const attrSlugs = new Set<string>();
    for (const v of p.variants) {
      for (const a of v.attributeValues) attrSlugs.add(a.attributeValue.attribute.slug);
    }
    if (attrSlugs.has("option") && (attrSlugs.has("color") || attrSlugs.has("size"))) {
      issues.push({
        slug: p.slug,
        name: p.name,
        activeVariants: p.variants.length,
        issue: "mixed_axes",
        detail: `Mixed axes: ${[...attrSlugs].join(", ")}`,
      });
      continue;
    }

    const allRows: VariantRow[] = p.variants.map((v) => {
      const urls = v.images.map((i) => i.url);
      return {
        sku: v.sku,
        attrs: attrMap(v.attributeValues),
        imageUrls: urls,
        imageFingerprint: fingerprint(urls),
      };
    });

    const rowsForAudit = allRows.filter((r) => !lsOnlySkus.has(r.sku.trim()));
    if (rowsForAudit.length < 2) {
      ok++;
      continue;
    }

    const noImages = rowsForAudit.filter((r) => r.imageUrls.length === 0);
    if (noImages.length) {
      issues.push({
        slug: p.slug,
        name: p.name,
        activeVariants: p.variants.length,
        issue: "missing_images",
        detail: `${noImages.length} active DO-mapped variant(s) with 0 linked images: ${noImages.map((r) => r.sku).join(", ")}`,
        variants: allRows,
      });
      continue;
    }

    const byPrimary = new Map<string, VariantRow[]>();
    for (const r of rowsForAudit) {
      const primary = r.imageUrls[0] || "";
      if (!primary) continue;
      const list = byPrimary.get(primary) || [];
      list.push(r);
      byPrimary.set(primary, list);
    }

    const colorKey = (() => {
      const priority = [
        "color",
        "colour",
        "colours",
        "type",
        "size",
        "style",
        "hertz",
        "no-of-holes",
        "option",
        "tunes",
      ];
      for (const slug of priority) {
        if (attrSlugs.has(slug)) return slug;
      }
      return attrSlugs.values().next().value || null;
    })();
    if (!colorKey) {
      ok++;
      continue;
    }

    const sharedGroups = [...byPrimary.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([primary, group]) => ({
        fingerprint: primary.slice(0, 80) + (primary.length > 80 ? "…" : ""),
        skus: group.map((g) => g.sku),
        colors: [...new Set(group.map((g) => axisValueForAudit(g.attrs, colorKey, g.sku)))],
      }))
      .filter((g) => g.colors.length > 1);

    if (sharedGroups.length) {
      issues.push({
        slug: p.slug,
        name: p.name,
        activeVariants: p.variants.length,
        issue: "shared_gallery",
        detail: `${sharedGroups.length} primary-thumb group(s) cover multiple axis values — PDP won't switch hero image`,
        groups: sharedGroups,
        variants: allRows,
      });
    } else {
      ok++;
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    productsScanned: products.length,
    ok,
    issueCount: issues.length,
    byIssue: {
      shared_gallery: issues.filter((i) => i.issue === "shared_gallery").length,
      missing_images: issues.filter((i) => i.issue === "missing_images").length,
      mixed_axes: issues.filter((i) => i.issue === "mixed_axes").length,
    },
    issues,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));

  console.log(`Scanned ${products.length} variable products`);
  console.log(`OK: ${ok} | Issues: ${issues.length}`);
  console.log(
    `  shared_gallery: ${summary.byIssue.shared_gallery} | missing_images: ${summary.byIssue.missing_images} | mixed_axes: ${summary.byIssue.mixed_axes}`
  );
  console.log(`\nReport: ${OUT_JSON}\n`);

  for (const i of issues.slice(0, 25)) {
    console.log(`• ${i.slug} — ${i.issue}: ${i.detail}`);
    if (i.groups?.length) {
      for (const g of i.groups.slice(0, 2)) {
        console.log(`    colors [${g.colors.join(", ")}] → ${g.skus.join(", ")}`);
      }
    }
  }
  if (issues.length > 25) console.log(`  … and ${issues.length - 25} more`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
