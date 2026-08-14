/**
 * Audit 41 partial-batch products: perfect vs partial vs skipped.
 * Usage: npx tsx scripts/audit-partial-41-status.ts
 */
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const REPO = path.resolve(__dirname, "../..");

const ALL_41 = [
  "7-chakras-copper-bottles-with-handle", "7-chakras-plain-copper-bottles", "7-chakras-vintage-copper-bottles",
  "7-chakras-yoga-mats", "angel-tuning-forks", "ankh", "bamboo-castanet", "bamboo-rainstick-wide-80cm",
  "32-bar-rod-chime", "box-tanpura", "caxixi", "chau-gongs", "coconut-maracas-shakers",
  "crescent-zafu-cushion-compact-buck-wheat", "crescent-zafu-cushion-wide-cotton", "large-tuning-fork",
  "dotted-singing-bowl", "elemental-chimes", "etched-gongs", "etched-handmade-singing-bowls",
  "handheld-natural-coconut-shaker", "jala-neti-pot-ceramic-185-ml", "macrame-yoga-mat-straps",
  "mini-coconut-shakers-3-types", "painted-egg-shakers", "plain-yoga-mats", "pulse-tubes",
  "rectangular-yoga-bolster", "sacred-symbols-singing-bowls", "shruti-box", "singing-bowl-bags",
  "singing-bowls-silk-ring-cushion-accessories", "singing-bowls-with-sacred-mantra-printed",
  "thunder-tube-basic-edition", "tingsha-bell", "universal-bowl", "wind-gong-plain",
  "wooden-hand-taal-khartal", "yoga-mats-lotus", "zafu-zabuton-combo-lotus-embroidery", "zafu-zabuton-combo-plain",
];

const WOO_OVERRIDES: Record<string, number> = { "7-chakras-plain-copper-bottles": 5675 };

const GRIP: Record<string, string> = { M: "Moderate", S: "Superior" };
const COL: Record<string, string> = { O: "Orange", P: "Pink", T: "Teal", Y: "Yellow", B: "Blue", G: "Green" };

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenMatch(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const nx = x.replace(/[^a-z0-9]/g, "");
  const ny = y.replace(/[^a-z0-9]/g, "");
  return nx === ny || nx.includes(ny) || ny.includes(nx);
}

function parseAttrs(attrs: string) {
  const out: string[] = [];
  for (const seg of (attrs || "").split(";")) {
    if (!seg.includes("=")) continue;
    const v = seg.split("=").slice(1).join("=").trim().replace(/-/g, " ");
    if (v) out.push(v);
  }
  return out;
}

function decodeYogaSku(sku: string): string[] {
  const m = sku.match(/YO-M-CT(?:-[7CL]+)?-([MS])-([A-Z]+)$/i);
  if (!m) return [];
  return [COL[m[2]!.toUpperCase()] || m[2]!, GRIP[m[1]!.toUpperCase()] || m[1]!];
}

function matchDo(pool: Record<string, string>[], tokens: string[]) {
  const t = tokens.map(norm).filter(Boolean);
  if (!t.length) return null;
  const hits = pool.filter((r) => {
    const vals = parseAttrs(r.attrs || "");
    return t.every((tok) => vals.some((v) => tokenMatch(tok, v)));
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return hits[0];
  return null;
}

async function main() {
  const doVariants = parse(fs.readFileSync(path.join(REPO, "data/compare/do_variants.csv"), "utf8"), {
    columns: true,
    bom: true,
  }) as Record<string, string>[];

  const byParent = new Map<string, Record<string, string>[]>();
  for (const r of doVariants) {
    if ((r.status || "").toLowerCase() !== "publish") continue;
    const list = byParent.get(r.parent_id) || [];
    list.push(r);
    byParent.set(r.parent_id, list);
  }

  const results: Array<{
    slug: string;
    name: string;
    status: string;
    active: number;
    synced: number;
    skipped: number;
    skipSkus: string[];
    note: string;
  }> = [];

  for (const slug of ALL_41) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: { variants: { where: { status: "ACTIVE" }, orderBy: { sku: "asc" } } },
    });

    if (!product) {
      results.push({ slug, name: slug, status: "SKIPPED", active: 0, synced: 0, skipped: 0, skipSkus: [], note: "Not found" });
      continue;
    }

    const woo = String(WOO_OVERRIDES[slug] ?? product.wooCommerceId ?? "");
    const pool = byParent.get(woo) || [];
    const isSimple = pool.length === 0;

    const skipSkus: string[] = [];
    let synced = 0;

    for (const v of product.variants) {
      const full = await prisma.productVariant.findFirst({
        where: { id: v.id },
        include: { attributeValues: { include: { attributeValue: { include: { attribute: true } } } } },
      });

      if (isSimple) {
        synced++;
        continue;
      }

      let tokens = full?.attributeValues.map((a) => a.attributeValue.value) || [];
      if (slug === "plain-yoga-mats" || slug === "7-chakras-yoga-mats" || slug === "yoga-mats-lotus") {
        const fromSku = decodeYogaSku(v.sku);
        if (fromSku.length === 2) tokens = fromSku;
      }

      const hit = matchDo(pool, tokens);
      if (hit) synced++;
      else skipSkus.push(v.sku);
    }

    const active = product.variants.length;
    const skipped = skipSkus.length;

    let status = "PERFECT";
    let note = "All active variants match DO";

    if (active === 0) {
      status = "SKIPPED";
      note = "No active variants";
    } else if (skipped === active) {
      status = "SKIPPED";
      note = "No variants matched DO";
    } else if (skipped > 0) {
      status = "PARTIAL";
      note = `${synced}/${active} synced; ${skipped} skipped (LS-only or no DO match)`;
    }

    results.push({ slug, name: product.name, status, active, synced, skipped, skipSkus, note });
  }

  const perfect = results.filter((r) => r.status === "PERFECT");
  const partial = results.filter((r) => r.status === "PARTIAL");
  const skipped = results.filter((r) => r.status === "SKIPPED");

  const out = { summary: { total: 41, perfect: perfect.length, partial: partial.length, skipped: skipped.length }, perfect, partial, skipped };
  const outPath = path.join(REPO, "data/compare/partial-41-audit-status.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`Perfect: ${perfect.length} | Partial: ${partial.length} | Skipped: ${skipped.length}`);
  console.log(`\n--- PARTIAL (${partial.length}) ---`);
  for (const r of partial) console.log(`  ${r.slug}: ${r.note} → ${r.skipSkus.join(", ")}`);
  console.log(`\n--- SKIPPED (${skipped.length}) ---`);
  for (const r of skipped) console.log(`  ${r.slug}: ${r.note}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
