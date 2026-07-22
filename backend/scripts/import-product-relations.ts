/**
 * Import curated product relations for PDP "Complete Your Journey".
 *
 * Priority sources:
 * 1. ACF pair_it_with_*_select_product_12 (PAIR_WITH)
 * 2. ACF simple_pair_it_with_* (PAIR_WITH)
 * 3. Woo _upsell_ids / CSV Upsells (UPSELL)
 * 4. Woo _crosssell_ids / CSV Cross-sells (CROSS_SELL)
 *
 * Usage:
 *   npx tsx scripts/import-product-relations.ts [--dry-run]
 *   npx tsx scripts/import-product-relations.ts --xml=/path/to/products.xml
 */
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient, ProductRelationType } from "@prisma/client";

import { may30 } from "./migration-paths";
import { cdata, parseItems, parseMeta, readWxr } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function productsXmlPath(): string {
  const arg = process.argv.find((a) => a.startsWith("--xml="))?.slice("--xml=".length);
  if (arg) return path.resolve(arg);
  const rich = path.resolve(__dirname, "../../data/sarveda.WordPress.2026-05-29-products.xml");
  if (fs.existsSync(rich)) return rich;
  return may30.products();
}

/** PHP-serialized list of ints: a:2:{i:0;i:6530;i:1;i:6689;} */
function parsePhpIntList(raw: string): number[] {
  const ids: number[] = [];
  for (const m of raw.matchAll(/i:\d+;i:(\d+);/g)) {
    ids.push(Number(m[1]));
  }
  if (ids.length) return [...new Set(ids)];
  for (const part of raw.split(/[,\s]+/)) {
    const n = parseInt(part.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  return [...new Set(ids)];
}

/** CSV Upsells: "id:5769, TC-R-1, id:5038" */
function parseCsvRelationTokens(raw: string): { wooIds: number[]; skus: string[] } {
  const wooIds: number[] = [];
  const skus: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const idMatch = /^id:(\d+)$/i.exec(t);
    if (idMatch) {
      wooIds.push(Number(idMatch[1]));
      continue;
    }
    if (/^\d+$/.test(t)) {
      wooIds.push(Number(t));
      continue;
    }
    skus.push(t);
  }
  return { wooIds: [...new Set(wooIds)], skus: [...new Set(skus)] };
}

type Pending = {
  fromWooId: number;
  toWooId?: number;
  toSku?: string;
  type: ProductRelationType;
  position: number;
};

async function main(): Promise<void> {
  const xmlPath = productsXmlPath();
  if (!fs.existsSync(xmlPath)) throw new Error(`Missing products WXR: ${xmlPath}`);
  console.log(`Products WXR: ${xmlPath}`);

  const pending: Pending[] = [];
  const items = parseItems(readWxr(xmlPath));

  for (const block of items) {
    if (!block.includes("<wp:post_type><![CDATA[product]]></wp:post_type>")) continue;
    const fromWooId = parseInt(cdata("wp:post_id", block), 10);
    if (!Number.isFinite(fromWooId) || fromWooId <= 0) continue;
    const meta = parseMeta(block);

    // ACF pair_it_with_N_select_product_12
    const pairKeys = Object.keys(meta)
      .filter((k) => /pair_it_with_product_pair_it_with_\d+_select_product_12$/.test(k) && !k.startsWith("_"))
      .sort((a, b) => {
        const ai = Number(/_(\d+)_select_product_12$/.exec(a)?.[1] ?? 0);
        const bi = Number(/_(\d+)_select_product_12$/.exec(b)?.[1] ?? 0);
        return ai - bi;
      });
    pairKeys.forEach((key, idx) => {
      const toId = parseInt((meta[key] ?? "").trim(), 10);
      if (Number.isFinite(toId) && toId > 0 && toId !== fromWooId) {
        pending.push({ fromWooId, toWooId: toId, type: "PAIR_WITH", position: idx });
      }
    });

    // simple_pair_it_with_* — may be serialized list or single id
    for (const [key, value] of Object.entries(meta)) {
      if (key.startsWith("_")) continue;
      if (!key.includes("simple_pair_it_with")) continue;
      if (key.endsWith("_product_linked_with") || key.match(/simple_pair_it_with_product_product_linked_with_\d+$/)) {
        const ids = parsePhpIntList(value);
        if (!ids.length) {
          const n = parseInt(value.trim(), 10);
          if (Number.isFinite(n) && n > 0) ids.push(n);
        }
        ids.forEach((toId, idx) => {
          if (toId !== fromWooId) {
            pending.push({ fromWooId, toWooId: toId, type: "PAIR_WITH", position: 100 + idx });
          }
        });
      }
    }

    const upsell = meta._upsell_ids ?? meta.upsell_ids ?? "";
    if (upsell.trim()) {
      parsePhpIntList(upsell).forEach((toId, idx) => {
        if (toId !== fromWooId) {
          pending.push({ fromWooId, toWooId: toId, type: "UPSELL", position: idx });
        }
      });
    }

    const cross = meta._crosssell_ids ?? meta.crosssell_ids ?? "";
    if (cross.trim()) {
      parsePhpIntList(cross).forEach((toId, idx) => {
        if (toId !== fromWooId) {
          pending.push({ fromWooId, toWooId: toId, type: "CROSS_SELL", position: idx });
        }
      });
    }
  }

  // CSV Upsells / Cross-sells supplement
  const csvPath = may30.wcProductsCsv();
  if (fs.existsSync(csvPath)) {
    const rows = parse(fs.readFileSync(csvPath, "utf8"), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true
    }) as Record<string, string>[];

    const idKey = Object.keys(rows[0] ?? {}).find((k) => k.replace(/^\ufeff/, "") === "ID") ?? "ID";

    for (const row of rows) {
      const type = (row.Type ?? "").trim().toLowerCase();
      if (type === "variation") continue;
      const fromWooId = parseInt((row[idKey] ?? "").trim(), 10);
      if (!Number.isFinite(fromWooId) || fromWooId <= 0) continue;

      const upsells = (row.Upsells ?? "").trim();
      if (upsells) {
        const { wooIds, skus } = parseCsvRelationTokens(upsells);
        wooIds.forEach((toId, idx) => {
          if (toId !== fromWooId) {
            pending.push({ fromWooId, toWooId: toId, type: "UPSELL", position: 200 + idx });
          }
        });
        skus.forEach((sku, idx) => {
          pending.push({ fromWooId, toSku: sku, type: "UPSELL", position: 250 + idx });
        });
      }

      const crosses = (row["Cross-sells"] ?? row.Crosssells ?? "").trim();
      if (crosses) {
        const { wooIds, skus } = parseCsvRelationTokens(crosses);
        wooIds.forEach((toId, idx) => {
          if (toId !== fromWooId) {
            pending.push({ fromWooId, toWooId: toId, type: "CROSS_SELL", position: 300 + idx });
          }
        });
        skus.forEach((sku, idx) => {
          pending.push({ fromWooId, toSku: sku, type: "CROSS_SELL", position: 350 + idx });
        });
      }
    }
  }

  console.log(`Pending relation edges: ${pending.length}`);

  const products = await prisma.product.findMany({
    where: { deletedAt: null, wooCommerceId: { not: null } },
    select: { id: true, wooCommerceId: true }
  });
  const byWooId = new Map(products.map((p) => [p.wooCommerceId!, p.id]));

  const variants = await prisma.productVariant.findMany({
    select: { sku: true, productId: true }
  });
  const productIdBySku = new Map(variants.map((v) => [v.sku, v.productId]));

  let upserted = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (const edge of pending) {
    const fromId = byWooId.get(edge.fromWooId);
    if (!fromId) {
      skipped++;
      continue;
    }
    let toId: string | undefined;
    if (edge.toWooId) toId = byWooId.get(edge.toWooId);
    if (!toId && edge.toSku) toId = productIdBySku.get(edge.toSku);
    if (!toId || toId === fromId) {
      skipped++;
      continue;
    }

    const key = `${fromId}|${toId}|${edge.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!dryRun) {
      await prisma.productRelation.upsert({
        where: {
          fromProductId_toProductId_type: {
            fromProductId: fromId,
            toProductId: toId,
            type: edge.type
          }
        },
        create: {
          fromProductId: fromId,
          toProductId: toId,
          type: edge.type,
          position: edge.position
        },
        update: { position: edge.position }
      });
    }
    upserted++;
  }

  console.log(`\nDone${dryRun ? " (dry-run)" : ""}. Upserted: ${upserted}, skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
