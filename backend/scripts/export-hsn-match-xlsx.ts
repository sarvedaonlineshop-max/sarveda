/**
 * HSN match workbook: Lightsail shop products vs Zoho Item.xls — product NAME only.
 *
 * ALWAYS uses live Lightsail catalog via sarveda-demo.xyz API — never local Docker Postgres.
 *
 * Match tiers:
 *   1. exact_name — normalized LS product name = Zoho Item Name
 *   2. fuzzy_name — token sort ratio ≥ threshold (LS name vs Zoho Item Name)
 *   3. unmatched
 *
 * Product scope = same as /shop: status ACTIVE, catalogHidden false, not deleted.
 *
 * Usage:
 *   cd backend && npx tsx scripts/export-hsn-match-xlsx.ts
 *   cd backend && npx tsx scripts/export-hsn-match-xlsx.ts --file=/home/radha/Downloads/Item.xls
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import ExcelJS from "exceljs";

import type { ZohoCatalogItem } from "./import-hsn-from-zoho";

const DEFAULT_ZOHO_XLS = path.join(os.homedir(), "Downloads", "Item.xls");
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_XLSX = path.join(REPO_ROOT, "data/compare/hsn-match-ls-zoho.xlsx");
const OUT_JSON = path.join(REPO_ROOT, "data/compare/hsn-match-ls-zoho-summary.json");
const LOAD_PY = path.join(__dirname, "load-zoho-items-file.py");

const FUZZY_MIN = 82;
/** Lightsail staging shop — sole product source for this script. */
const LS_API_BASE = process.env.STAGING_API_BASE ?? "https://sarveda-demo.xyz";

type LsProduct = {
  id: string;
  slug: string;
  name: string;
  hsnCode: string | null;
  defaultSku: string;
};

type HsnRow = {
  lsSlug: string;
  lsName: string;
  zohoName: string;
  hsnOurs: string;
  hsnZoho: string;
  matchMethod: "exact_name" | "fuzzy_name" | "unmatched";
  matchScore: number | null;
  matchDetail: string;
};

function normText(s: string): string {
  return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function ratio(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const longer = s1.length >= s2.length ? s1 : s2;
  if (!longer.length) return 1;
  return (longer.length - levenshtein(s1, s2)) / longer.length;
}

function tokenSortRatio(a: string, b: string): number {
  const ta = normText(a).split(" ").filter(Boolean).sort().join(" ");
  const tb = normText(b).split(" ").filter(Boolean).sort().join(" ");
  return Math.round(ratio(ta, tb) * 1000) / 10;
}

function parseArgs(): string {
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  if (fileArg) return fileArg.slice("--file=".length);
  if (fs.existsSync(DEFAULT_ZOHO_XLS)) return DEFAULT_ZOHO_XLS;
  if (fs.existsSync(path.join(REPO_ROOT, "data/compare/zoho-items-latest.xls"))) {
    return path.join(REPO_ROOT, "data/compare/zoho-items-latest.xls");
  }
  throw new Error(`Pass --file=/path/to/Item.xls`);
}

function loadZohoFromSpreadsheet(filePath: string): {
  catalog: ZohoCatalogItem[];
  source: string;
  totalRows: number;
  withSkuAndHsn: number;
} {
  const abs = path.resolve(filePath);
  const raw = execFileSync("python3", [LOAD_PY, abs], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const parsed = JSON.parse(raw) as {
    catalog: ZohoCatalogItem[];
    source: string;
    stats?: { total_rows: number; with_sku_and_hsn: number };
  };
  return {
    catalog: parsed.catalog ?? [],
    source: parsed.source ?? abs,
    totalRows: parsed.stats?.total_rows ?? (parsed.catalog?.length ?? 0),
    withSkuAndHsn: parsed.stats?.with_sku_and_hsn ?? (parsed.catalog?.length ?? 0)
  };
}

/** Group Zoho rows by normalized Item Name → majority HSN + display name. */
function zohoByNormalizedName(catalog: ZohoCatalogItem[]): Map<
  string,
  { displayName: string; hsn: string; rowCount: number }
> {
  const groups = new Map<string, Array<{ name: string; hsn: string }>>();
  for (const row of catalog) {
    const key = normText(row.name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({ name: row.name.trim(), hsn: row.hsn });
    groups.set(key, list);
  }

  const out = new Map<string, { displayName: string; hsn: string; rowCount: number }>();
  for (const [key, rows] of groups) {
    const hsnCounts = new Map<string, number>();
    for (const r of rows) hsnCounts.set(r.hsn, (hsnCounts.get(r.hsn) ?? 0) + 1);
    let bestHsn = rows[0].hsn;
    let bestN = 0;
    for (const [hsn, n] of hsnCounts) {
      if (n > bestN) {
        bestHsn = hsn;
        bestN = n;
      }
    }
    out.set(key, { displayName: rows[0].name, hsn: bestHsn, rowCount: rows.length });
  }
  return out;
}

function matchExactName(
  product: LsProduct,
  byNormName: Map<string, { displayName: string; hsn: string; rowCount: number }>
): { hsn: string; zohoName: string; detail: string } | null {
  const key = normText(product.name);
  const hit = byNormName.get(key);
  if (!hit) return null;
  return {
    hsn: hit.hsn,
    zohoName: hit.displayName,
    detail: hit.rowCount > 1 ? `${hit.rowCount} Zoho rows with this item name` : ""
  };
}

function matchFuzzyName(
  product: LsProduct,
  catalog: ZohoCatalogItem[]
): { hsn: string; zohoName: string; score: number } | null {
  let bestScore = 0;
  let best: { hsn: string; zohoName: string } | null = null;

  for (const z of catalog) {
    if (!z.name?.trim()) continue;
    const score = tokenSortRatio(product.name, z.name);
    if (score > bestScore) {
      bestScore = score;
      best = { hsn: z.hsn, zohoName: z.name.trim() };
    }
  }

  if (!best || bestScore < FUZZY_MIN) return null;
  return { ...best, score: bestScore };
}

type ApiListResponse = {
  success: boolean;
  data?: {
    items: Array<{ id: string; slug: string; name: string }>;
    pagination?: { total: number; page: number; limit: number };
  };
};

type ApiVariant = { sku?: string; isDefault?: boolean };
type ApiDetailResponse = {
  success: boolean;
  data?: { product?: { hsnCode?: string | null; variants?: ApiVariant[] } };
};

type PendingRow = {
  name: string;
  sku: string;
  hsn: string;
};

/** Live Lightsail shop catalog (same data as /shop on sarveda-demo.xyz). */
async function loadLightsailShopProducts(): Promise<{ products: LsProduct[]; total: number }> {
  const all: LsProduct[] = [];
  let total = 0;
  let page = 1;
  const limit = 100;

  while (true) {
    const res = await fetch(`${LS_API_BASE}/api/products?limit=${limit}&page=${page}`);
    if (!res.ok) throw new Error(`Lightsail API ${res.status}: ${LS_API_BASE}/api/products?page=${page}`);
    const json = (await res.json()) as ApiListResponse;
    const items = json.data?.items ?? [];
    total = json.data?.pagination?.total ?? total;
    for (const p of items) {
      all.push({ id: p.id, slug: p.slug, name: p.name, hsnCode: null, defaultSku: "" });
    }
    if (items.length === 0 || all.length >= total) break;
    page++;
  }

  const batchSize = 10;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (p) => {
        try {
          const res = await fetch(`${LS_API_BASE}/api/products/${encodeURIComponent(p.slug)}`);
          if (!res.ok) return;
          const json = (await res.json()) as ApiDetailResponse;
          const prod = json.data?.product;
          const hsn = prod?.hsnCode?.trim();
          if (hsn) p.hsnCode = hsn;
          const variants = prod?.variants ?? [];
          const def = variants.find((v) => v.isDefault) ?? variants[0];
          if (def?.sku) p.defaultSku = def.sku.trim();
        } catch {
          /* keep null */
        }
      })
    );
  }

  return { products: all.sort((a, b) => a.slug.localeCompare(b.slug)), total };
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  row.alignment = { vertical: "middle", wrapText: true };
}

function buildRemainingZohoRows(
  catalog: ZohoCatalogItem[],
  matchedZohoNormNames: Set<string>
): PendingRow[] {
  return catalog
    .filter((z) => !matchedZohoNormNames.has(normText(z.name)))
    .map((z) => ({ name: z.name.trim(), sku: z.sku.trim(), hsn: z.hsn.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));
}

async function writeWorkbook(rows: {
  exact: HsnRow[];
  fuzzy: HsnRow[];
  unmatched: HsnRow[];
  pendingLs: PendingRow[];
  remainingZoho: PendingRow[];
  summary: Record<string, number | string>;
}) {
  const wb = new ExcelJS.Workbook();
  const headers = [
    "LS Slug",
    "Product Name (Lightsail)",
    "Product Name (Zoho Item.xls)",
    "HSN Code (Ours / LS)",
    "HSN Code (Zoho Item.xls)",
    "Match Method",
    "Match Score",
    "Match Detail"
  ];

  const addSheet = (title: string, data: HsnRow[], tabColor: string) => {
    const ws = wb.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.properties.tabColor = { argb: tabColor };
    ws.addRow(headers);
    styleHeader(ws.getRow(1));
    for (const r of data) {
      ws.addRow([
        r.lsSlug,
        r.lsName,
        r.zohoName,
        r.hsnOurs,
        r.hsnZoho,
        r.matchMethod,
        r.matchScore ?? "",
        r.matchDetail
      ]);
    }
    ws.columns = [
      { width: 28 },
      { width: 44 },
      { width: 44 },
      { width: 16 },
      { width: 18 },
      { width: 14 },
      { width: 12 },
      { width: 48 }
    ];
  };

  const sum = wb.addWorksheet("Summary");
  sum.addRow(["HSN match — Lightsail shop products vs Zoho Item.xls (product name only)"]);
  sum.addRow(["Generated", new Date().toISOString()]);
  sum.addRow([]);
  for (const [k, v] of Object.entries(rows.summary)) sum.addRow([k, v]);

  addSheet("Matched Exact Name", rows.exact, "FF70AD47");
  addSheet("Matched Fuzzy", rows.fuzzy, "FF5B9BD5");
  addSheet("Unmatched", rows.unmatched, "FFED7D31");

  const pendingHeaders = ["Product Name", "SKU", "HSN Code"];
  const addPendingSheet = (title: string, data: PendingRow[], tabColor: string) => {
    const ws = wb.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.properties.tabColor = { argb: tabColor };
    ws.addRow(pendingHeaders);
    styleHeader(ws.getRow(1));
    for (const r of data) ws.addRow([r.name, r.sku, r.hsn]);
    ws.columns = [{ width: 48 }, { width: 22 }, { width: 14 }];
  };

  addPendingSheet("Pending on LS", rows.pendingLs, "FFFFC000");
  addPendingSheet("Remaining on Zoho", rows.remainingZoho, "FFA5A5A5");

  await wb.xlsx.writeFile(OUT_XLSX);
}

async function main() {
  const zohoFile = parseArgs();
  console.log(`Loading Zoho Item.xls: ${zohoFile}`);
  const { catalog, source, totalRows, withSkuAndHsn } = loadZohoFromSpreadsheet(zohoFile);
  const byNormName = zohoByNormalizedName(catalog);
  console.log(`  ${withSkuAndHsn} Zoho rows, ${byNormName.size} distinct item names`);

  console.log(`  Loading Lightsail shop products from ${LS_API_BASE}/api/products …`);
  const { products, total } = await loadLightsailShopProducts();
  console.log(`  Lightsail shop products: ${products.length} (API total: ${total})`);

  const exactRows: HsnRow[] = [];
  const fuzzyRows: HsnRow[] = [];
  const unmatchedRows: HsnRow[] = [];
  const matchedZohoNormNames = new Set<string>();

  for (const p of products) {
    const base = {
      lsSlug: p.slug,
      lsName: p.name,
      hsnOurs: p.hsnCode ?? ""
    };

    const exact = matchExactName(p, byNormName);
    if (exact) {
      matchedZohoNormNames.add(normText(exact.zohoName));
      exactRows.push({
        ...base,
        zohoName: exact.zohoName,
        hsnZoho: exact.hsn,
        matchMethod: "exact_name",
        matchScore: 100,
        matchDetail: exact.detail
      });
      continue;
    }

    const fuzzy = matchFuzzyName(p, catalog);
    if (fuzzy) {
      matchedZohoNormNames.add(normText(fuzzy.zohoName));
      fuzzyRows.push({
        ...base,
        zohoName: fuzzy.zohoName,
        hsnZoho: fuzzy.hsn,
        matchMethod: "fuzzy_name",
        matchScore: fuzzy.score,
        matchDetail: `Fuzzy name match (${fuzzy.score}%)`
      });
      continue;
    }

    unmatchedRows.push({
      ...base,
      zohoName: "",
      hsnZoho: "",
      matchMethod: "unmatched",
      matchScore: null,
      matchDetail: ""
    });
  }

  const pendingLs: PendingRow[] = products
    .filter((p) => unmatchedRows.some((u) => u.lsSlug === p.slug))
    .map((p) => ({ name: p.name, sku: p.defaultSku, hsn: "" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const remainingZoho = buildRemainingZohoRows(catalog, matchedZohoNormNames);

  const summary: Record<string, number | string> = {
    "Product source": `Lightsail (${LS_API_BASE})`,
    "Shop products in export": products.length,
    "Zoho Item.xls source": source,
    "Zoho file rows": totalRows,
    "Zoho rows with SKU+HSN": withSkuAndHsn,
    "Zoho distinct item names": byNormName.size,
    "Matched exact name": exactRows.length,
    "Matched fuzzy name (≥82)": fuzzyRows.length,
    Unmatched: unmatchedRows.length,
    "Pending on LS (sheet)": pendingLs.length,
    "Remaining on Zoho (sheet)": remainingZoho.length,
    "Fuzzy threshold": FUZZY_MIN,
    "Match rule": "Product name only — no SKU matching"
  };

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), summary, exact: exactRows, fuzzy: fuzzyRows, unmatched: unmatchedRows },
      null,
      2
    )
  );

  await writeWorkbook({
    exact: exactRows,
    fuzzy: fuzzyRows,
    unmatched: unmatchedRows,
    pendingLs,
    remainingZoho,
    summary
  });

  console.log("\n=== HSN export (name match only) ===");
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
  console.log(`\nWrote ${OUT_XLSX}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
