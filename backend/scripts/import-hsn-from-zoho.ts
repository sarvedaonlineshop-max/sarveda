/**
 * Pull latest HSN/SAC from Zoho Books Items API and backfill Product.hsnCode (by SKU).
 *
 * Usage:
 *   cd backend && npx tsx scripts/import-hsn-from-zoho.ts              # dry-run report
 *   cd backend && npx tsx scripts/import-hsn-from-zoho.ts --apply     # write to DB
 *   cd backend && npx tsx scripts/import-hsn-from-zoho.ts --json      # machine-readable summary
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type ZohoItemRow = {
  item_id: string;
  sku?: string;
  name?: string;
  hsn_or_sac?: string | number;
  status?: string;
};

export type ZohoCatalogItem = {
  sku: string;
  name: string;
  hsn: string;
};

export type ZohoHsnMap = Map<string, string>;

function normalizeHsn(raw: string | number | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.split(".")[0];
}

/** Paginate Zoho Books /items (live API). */
export async function fetchZohoItemCatalog(opts?: {
  status?: "active" | "inactive" | "all";
}): Promise<{
  catalog: ZohoCatalogItem[];
  map: ZohoHsnMap;
  totalItems: number;
  withHsn: number;
  withSku: number;
}> {
  const { zohoGet } = await import("../src/modules/zoho/zoho-client");
  const status = opts?.status ?? "active";
  const map: ZohoHsnMap = new Map();
  const catalog: ZohoCatalogItem[] = [];
  let page = 1;
  let hasMore = true;
  let totalItems = 0;
  let withHsn = 0;
  let withSku = 0;

  while (hasMore) {
    const statusParam = status === "all" ? "" : `&status=${status}`;
    const res = await zohoGet<{
      items: ZohoItemRow[];
      page_context: { has_more_page: boolean };
    }>(`/items?page=${page}&per_page=200${statusParam}`);

    for (const item of res.items ?? []) {
      totalItems++;
      const sku = item.sku?.trim();
      if (!sku) continue;
      withSku++;
      const hsn = normalizeHsn(item.hsn_or_sac);
      if (!hsn) continue;
      withHsn++;
      const key = sku.toUpperCase();
      if (!map.has(key)) map.set(key, hsn);
      catalog.push({ sku, name: (item.name ?? "").trim(), hsn });
    }

    hasMore = res.page_context?.has_more_page ?? false;
    page++;
  }

  return { catalog, map, totalItems, withHsn, withSku };
}

/** Paginate Zoho Books /items and return SKU → HSN (latest from API). */
export async function fetchZohoSkuHsnMap(opts?: {
  status?: "active" | "inactive" | "all";
}): Promise<{ map: ZohoHsnMap; totalItems: number; withHsn: number; withSku: number }> {
  const { map, totalItems, withHsn, withSku } = await fetchZohoItemCatalog(opts);
  return { map, totalItems, withHsn, withSku };
}

type ProductHsnPlan = {
  productId: string;
  slug: string;
  name: string;
  status: string;
  currentHsn: string | null;
  nextHsn: string;
  matchedSkus: string[];
};

function pickProductHsn(
  variantMatches: Array<{ sku: string; hsn: string }>
): { hsn: string; skus: string[] } | null {
  if (variantMatches.length === 0) return null;
  const byHsn = new Map<string, string[]>();
  for (const { sku, hsn } of variantMatches) {
    const list = byHsn.get(hsn) ?? [];
    list.push(sku);
    byHsn.set(hsn, list);
  }
  let bestHsn = "";
  let bestSkus: string[] = [];
  for (const [hsn, skus] of byHsn) {
    if (skus.length > bestSkus.length) {
      bestHsn = hsn;
      bestSkus = skus;
    }
  }
  return { hsn: bestHsn, skus: bestSkus };
}

async function buildPlan(zohoMap: ZohoHsnMap): Promise<{
  plans: ProductHsnPlan[];
  unmatchedZohoSkus: string[];
  variantMatchCount: number;
}> {
  const variants = await prisma.productVariant.findMany({
    where: { productRel: { deletedAt: null } },
    select: {
      sku: true,
      productId: true,
      productRel: { select: { id: true, slug: true, name: true, status: true, hsnCode: true } }
    }
  });

  const byProduct = new Map<string, ProductHsnPlan>();
  let variantMatchCount = 0;
  const matchedZohoSkus = new Set<string>();

  for (const v of variants) {
    const sku = v.sku.trim();
    const hsn = zohoMap.get(sku.toUpperCase());
    if (!hsn) continue;
    variantMatchCount++;
    matchedZohoSkus.add(sku.toUpperCase());

    const p = v.productRel;
    let plan = byProduct.get(p.id);
    if (!plan) {
      plan = {
        productId: p.id,
        slug: p.slug,
        name: p.name,
        status: p.status,
        currentHsn: p.hsnCode?.trim() || null,
        nextHsn: hsn,
        matchedSkus: [sku]
      };
      byProduct.set(p.id, plan);
    } else {
      plan.matchedSkus.push(sku);
    }
  }

  for (const plan of byProduct.values()) {
    const picks = plan.matchedSkus.map((sku) => ({
      sku,
      hsn: zohoMap.get(sku.toUpperCase())!
    }));
    const picked = pickProductHsn(picks);
    if (picked) plan.nextHsn = picked.hsn;
  }

  const unmatchedZohoSkus = [...zohoMap.keys()].filter((k) => !matchedZohoSkus.has(k));

  return {
    plans: [...byProduct.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    unmatchedZohoSkus,
    variantMatchCount
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const jsonOut = process.argv.includes("--json");
  const includeInactive = process.argv.includes("--include-inactive");

  const { map: zohoMap, totalItems, withHsn, withSku } = await fetchZohoSkuHsnMap({
    status: includeInactive ? "all" : "active"
  });

  const { plans, unmatchedZohoSkus, variantMatchCount } = await buildPlan(zohoMap);

  const totalProducts = await prisma.product.count({ where: { deletedAt: null } });
  const toUpdate = plans.filter((p) => p.currentHsn !== p.nextHsn);
  const alreadySet = plans.filter((p) => p.currentHsn === p.nextHsn);
  const activeShop = plans.filter((p) => p.status === "ACTIVE");

  const summary = {
    zoho: {
      itemsFetched: totalItems,
      itemsWithSku: withSku,
      itemsWithHsn: withHsn,
      distinctSkuHsn: zohoMap.size
    },
    sarveda: {
      totalProducts,
      variantSkuMatches: variantMatchCount,
      productsWithZohoHsn: plans.length,
      productsNeedingUpdate: toUpdate.length,
      productsAlreadyCorrect: alreadySet.length,
      activeProductsCoverable: activeShop.length,
      zohoSkusNotInDb: unmatchedZohoSkus.length
    }
  };

  if (jsonOut) {
    console.log(JSON.stringify({ summary, toUpdate: toUpdate.slice(0, 50) }, null, 2));
  } else {
    console.log("\n=== Zoho HSN pull (live API) ===\n");
    console.log("Zoho items fetched:        ", summary.zoho.itemsFetched);
    console.log("Zoho items with SKU:       ", summary.zoho.itemsWithSku);
    console.log("Zoho items with HSN/SAC:   ", summary.zoho.itemsWithHsn);
    console.log("Distinct SKU→HSN pairs:    ", summary.zoho.distinctSkuHsn);
    console.log("");
    console.log("Sarveda products (total):  ", summary.sarveda.totalProducts);
    console.log("Variant SKU matches:       ", summary.sarveda.variantSkuMatches);
    console.log("Products coverable:        ", summary.sarveda.productsWithZohoHsn);
    console.log("  → need DB update:        ", summary.sarveda.productsNeedingUpdate);
    console.log("  → already same HSN:      ", summary.sarveda.productsAlreadyCorrect);
    console.log("Active products coverable: ", summary.sarveda.activeProductsCoverable);
    console.log("Zoho SKUs not in Sarveda:  ", summary.sarveda.zohoSkusNotInDb);

    console.log("\n--- Sample updates (first 12) ---");
    for (const p of toUpdate.slice(0, 12)) {
      console.log(
        `  ${p.slug}: ${p.currentHsn ?? "(empty)"} → ${p.nextHsn}  [${p.matchedSkus.slice(0, 2).join(", ")}${p.matchedSkus.length > 2 ? "…" : ""}]`
      );
    }

    console.log("\n--- Sample: no Sarveda variant for Zoho SKU ---");
    for (const sku of unmatchedZohoSkus.slice(0, 8)) {
      console.log(`  ${sku} → HSN ${zohoMap.get(sku)}`);
    }
  }

  const outDir = path.resolve(__dirname, "../../data/compare");
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "zoho-hsn-pull-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary,
        updates: toUpdate,
        unmatchedZohoSkus: unmatchedZohoSkus.slice(0, 500)
      },
      null,
      2
    )
  );
  if (!jsonOut) console.log(`\nFull report: ${reportPath}`);

  if (apply) {
    let updated = 0;
    for (const p of toUpdate) {
      await prisma.product.update({
        where: { id: p.productId },
        data: { hsnCode: p.nextHsn }
      });
      updated++;
    }
    console.log(`\nApplied: ${updated} products updated with hsnCode from Zoho.`);
  } else if (!jsonOut) {
    console.log("\nDry run only. Re-run with --apply to write Product.hsnCode.");
  }
}

const isDirectRun =
  typeof require !== "undefined" && require.main === module
    ? true
    : Boolean(process.argv[1]?.includes("import-hsn-from-zoho"));

if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
