/**
 * Export variant-level detail for 20 partial fuzzy-match products.
 * Usage: npx tsx scripts/export-partial-41-variant-detail.ts
 */
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const REPO = path.resolve(__dirname, "../..");

const PARTIAL_SLUGS = [
  "7-chakras-yoga-mats",
  "angel-tuning-forks",
  "chau-gongs",
  "crescent-zafu-cushion-wide-cotton",
  "dotted-singing-bowl",
  "etched-handmade-singing-bowls",
  "jala-neti-pot-ceramic-185-ml",
  "macrame-yoga-mat-straps",
  "mini-coconut-shakers-3-types",
  "plain-yoga-mats",
  "pulse-tubes",
  "rectangular-yoga-bolster",
  "sacred-symbols-singing-bowls",
  "singing-bowl-bags",
  "singing-bowls-silk-ring-cushion-accessories",
  "singing-bowls-with-sacred-mantra-printed",
  "tingsha-bell",
  "yoga-mats-lotus",
  "zafu-zabuton-combo-lotus-embroidery",
  "zafu-zabuton-combo-plain",
];

const SUMMARY_GLOB = path.join(REPO, "data/compare/live-partial-41-sync-backups");
const OUT_JSON = path.join(REPO, "data/compare/partial-41-variant-detail.json");

type LogEntry = {
  status: "synced" | "pending";
  lsSku: string;
  doVarId: string | null;
  price: string | null;
  lsTokens: string;
};

function latestSummaryFile(): string {
  const files = fs
    .readdirSync(SUMMARY_GLOB)
    .filter((f) => f.endsWith("-summary.json"))
    .sort()
    .reverse();
  if (!files[0]) throw new Error("No partial-41 summary backup found");
  return path.join(SUMMARY_GLOB, files[0]);
}

function parseLogLine(line: string): LogEntry {
  const miss = line.startsWith("MISS");
  const sku = line.split(/\s+/)[1]!;
  const doVarId = line.match(/DO var (\d+)/)?.[1] ?? null;
  const price = line.match(/₹(\d+)/)?.[1] ?? null;
  const lsTokens = line.match(/\[(.*)\]$/)?.[1] ?? "";
  return { status: miss ? "pending" : "synced", lsSku: sku, doVarId, price, lsTokens };
}

function loadApplyLog(): Map<string, { name: string; woo: string; bySku: Map<string, LogEntry> }> {
  const summary = JSON.parse(fs.readFileSync(latestSummaryFile(), "utf8")) as {
    actions: string[];
  };
  const out = new Map<string, { name: string; woo: string; bySku: Map<string, LogEntry> }>();
  let cur: string | null = null;
  for (const line of summary.actions.join("\n").split("\n")) {
    const hm = line.match(/=== (.+?) \(([^)]+)\) DO woo (\d+)/);
    if (hm) {
      cur = hm[2]!;
      out.set(cur, { name: hm[1]!, woo: hm[3]!, bySku: new Map() });
      continue;
    }
    if (!cur || (!line.startsWith("  OK ") && !line.startsWith("  MISS "))) continue;
    const entry = parseLogLine(line.trim());
    out.get(cur)!.bySku.set(entry.lsSku, entry);
  }
  return out;
}

function lsVariantLabel(
  attributeValues: Array<{
    attributeValue: { value: string; attribute: { slug: string } };
  }>,
  axisOrder?: string[] | null
): string {
  const rows = [...attributeValues];
  if (axisOrder?.length) {
    const order = new Map(axisOrder.map((s, i) => [s, i]));
    rows.sort(
      (a, b) =>
        (order.get(a.attributeValue.attribute.slug) ?? 999) -
        (order.get(b.attributeValue.attribute.slug) ?? 999)
    );
  }
  const vals = rows.map((r) => r.attributeValue.value).filter(Boolean);
  return vals.length ? vals.join(" / ") : "(default / simple)";
}

async function main() {
  const applyLog = loadApplyLog();
  const doProducts = parse(fs.readFileSync(path.join(REPO, "data/compare/do_products.csv"), "utf8"), {
    columns: true,
    bom: true,
  }) as Record<string, string>[];
  const doVariants = parse(fs.readFileSync(path.join(REPO, "data/compare/do_variants.csv"), "utf8"), {
    columns: true,
    bom: true,
  }) as Record<string, string>[];

  const doProdMap = new Map(doProducts.map((r) => [r.id, r.name]));
  const doVarMap = new Map(doVariants.map((r) => [r.id, r]));

  const rows: Array<Record<string, string>> = [];

  for (const slug of PARTIAL_SLUGS) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: {
        variants: {
          where: { status: "ACTIVE" },
          include: {
            attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
          },
          orderBy: { sku: "asc" },
        },
      },
    });
    if (!product) continue;

    const log = applyLog.get(slug);
    const wooId = log?.woo ?? String(product.wooCommerceId ?? "");
    const doProductName = doProdMap.get(wooId) ?? log?.name ?? product.name;

    for (const variant of product.variants) {
      const lsVariant = lsVariantLabel(variant.attributeValues, product.variantAxisOrder);
      const entry = log?.bySku.get(variant.sku);

      let doVariant = "";
      let doSku = "";
      let note = "";

      if (entry?.status === "synced" && entry.doVarId) {
        const dv = doVarMap.get(entry.doVarId);
        doVariant = (dv?.title || entry.lsTokens).replace(/^.*?-\s*/, "").trim() || entry.lsTokens;
        doSku = dv?.sku || "";
        note = `Synced from DO var ${entry.doVarId}: INR ${entry.price}, stock 100, variant image/video updated. LS SKU unchanged.`;
      } else if (entry?.status === "pending") {
        note = `Not synced — no DO match for attributes [${entry.lsTokens}]. LS SKU/price left as-is. Likely discontinued or label mismatch on DO.`;
      } else {
        note = "Active variant not listed in partial-41 apply log.";
      }

      rows.push({
        lsProductName: product.name,
        lsVariantName: lsVariant,
        lsSku: variant.sku,
        doProductName,
        doVariantName: doVariant,
        doSku,
        syncStatus: entry?.status ?? "unknown",
        note,
      });
    }
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows to ${OUT_JSON}`);
  console.log(`Synced: ${rows.filter((r) => r.syncStatus === "synced").length}`);
  console.log(`Pending: ${rows.filter((r) => r.syncStatus === "pending").length}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
