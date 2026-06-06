/**
 * Cross-check WooCommerce CSV (source of truth for catalog) vs optional RDS inventory.
 *
 * Usage:
 *   npx tsx scripts/verify-inventory-woo-crosscheck.ts
 *   npx tsx scripts/verify-inventory-woo-crosscheck.ts --csv /path/to/export.csv
 *
 * Requires DATABASE_URL in backend/.env for DB section (optional).
 */
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { shopCatalogProductWhere, shopCatalogVariantSkuWhere } from "../src/utils/shop-catalog";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

type WooSkuRow = {
  sku: string;
  name: string;
  type: string;
  stock: number | null;
  inStockFlag: string;
};

function parseWooCsv(csvPath: string): WooSkuRow[] {
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parse(raw, { relax_column_count: true }) as string[][];
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

  const out: WooSkuRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const type = (row[idx.Type] ?? "").trim().toLowerCase();
    if (type !== "simple" && type !== "variation") continue;

    const sku = (row[idx.SKU] ?? "").trim();
    if (!sku) continue;

    const stockRaw = (row[idx.Stock] ?? "").trim();
    const stock =
      stockRaw && Number.isFinite(parseInt(stockRaw, 10)) ? parseInt(stockRaw, 10) : null;

    out.push({
      sku,
      name: (row[idx.Name] ?? "").trim(),
      type,
      stock,
      inStockFlag: (row[idx["In stock?"]] ?? "").trim()
    });
  }
  return out;
}

async function main() {
  const csvArg = process.argv.find((a) => a.startsWith("--csv="));
  const csvPath =
    csvArg?.slice("--csv=".length) ??
    path.resolve(process.cwd(), "prisma/wc-products.csv");

  if (!fs.existsSync(csvPath)) {
    console.error("CSV not found:", csvPath);
    process.exit(1);
  }

  const wooRows = parseWooCsv(csvPath);
  const wooSkus = new Set(wooRows.map((r) => r.sku));
  const withStock = wooRows.filter((r) => r.stock !== null);
  const withoutStock = wooRows.filter((r) => r.stock === null);

  console.log("\n=== WooCommerce CSV (catalog source) ===");
  console.log("File:", csvPath);
  console.log("Simple + variation rows with SKU:", wooRows.length);
  console.log("Unique SKUs:", wooSkus.size);
  console.log("Rows with numeric Stock column:", withStock.length);
  console.log("Rows with blank Stock column:", withoutStock.length);

  if (!process.env.DATABASE_URL) {
    console.log("\n(No DATABASE_URL — skipping DB cross-check. Set backend/.env to compare RDS.)");
    await prisma.$disconnect();
    return;
  }

  try {
    const [shopVariants, allVariants, wooIdProducts, hiddenProducts] = await Promise.all([
      prisma.productVariant.findMany({
        where: { ...shopCatalogVariantSkuWhere, productRel: shopCatalogProductWhere },
        select: {
          sku: true,
          zohoItemId: true,
          productRel: { select: { name: true, wooCommerceId: true, catalogHidden: true } },
          inventory: { select: { onHand: true } }
        }
      }),
      prisma.productVariant.count({ where: { productRel: { deletedAt: null } } }),
      prisma.product.count({
        where: { deletedAt: null, wooCommerceId: { not: null }, catalogHidden: false }
      }),
      prisma.product.count({ where: { deletedAt: null, catalogHidden: true } })
    ]);

    const dbSkuSet = new Set(shopVariants.map((v) => v.sku));
    const inWooNotDb = [...wooSkus].filter((s) => !dbSkuSet.has(s));
    const inDbNotWoo = shopVariants.filter((v) => !wooSkus.has(v.sku)).map((v) => v.sku);

    console.log("\n=== PostgreSQL (shop catalog only) ===");
    console.log("Shop variants (excl COURSE/EVENT/hidden):", shopVariants.length);
    console.log("All variants in DB:", allVariants);
    console.log("Shop products with wooCommerceId:", wooIdProducts);
    console.log("catalogHidden products:", hiddenProducts);
    console.log("SKUs in Woo CSV but missing in DB:", inWooNotDb.length);
    console.log("SKUs in DB but not in Woo CSV:", inDbNotWoo.length);

    if (inDbNotWoo.length > 0 && inDbNotWoo.length <= 15) {
      console.log("  DB-only samples:", inDbNotWoo.slice(0, 15).join(", "));
    } else if (inDbNotWoo.length > 15) {
      console.log("  DB-only samples (first 15):", inDbNotWoo.slice(0, 15).join(", "));
    }

    let stockMatch = 0;
    let stockMismatch = 0;
    let wooBlank = 0;
    for (const v of shopVariants) {
      const woo = wooRows.find((r) => r.sku === v.sku);
      if (!woo || woo.stock === null) {
        wooBlank++;
        continue;
      }
      const onHand = v.inventory?.onHand ?? 0;
      if (onHand === woo.stock) stockMatch++;
      else stockMismatch++;
    }

    console.log("\n=== Sarveda onHand vs Woo CSV Stock (where CSV has a number) ===");
    console.log("Exact match:", stockMatch);
    console.log("Mismatch:", stockMismatch);
    console.log("Shop SKUs with blank Woo Stock (cannot compare):", wooBlank);

    const zohoLinked = shopVariants.filter((v) => v.zohoItemId).length;
    console.log("\nVariants with zohoItemId set (link only, not imported from Zoho):", zohoLinked);

    console.log(
      "\nNote: Zoho audit counts live in Redis on EC2, not in Postgres. Run Refresh Zoho audit on staging, then check meta.zohoSyncSummary via admin API."
    );
  } catch (err) {
    console.error("DB error:", err instanceof Error ? err.message : err);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
