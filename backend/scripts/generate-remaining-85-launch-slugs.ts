/**
 * Build remaining-85-launch-slugs.json from launch-do-vs-ls-products.xlsx
 * (147 matched pairs minus 41 partial + 21 dead batch slugs).
 *
 * Usage: npx tsx scripts/generate-remaining-85-launch-slugs.ts
 */
import fs from "fs";
import path from "path";

import ExcelJS from "exceljs";

const REPO = path.resolve(__dirname, "../..");
const XLSX = path.join(REPO, "data/compare/launch-do-vs-ls-products.xlsx");
const OUT = path.join(REPO, "data/compare/remaining-85-launch-slugs.json");
const PARTIAL_BLOCK = fs.readFileSync(path.join(__dirname, "sync-do-partial-41-batch.ts"), "utf8");
const DEAD21 = fs.readFileSync(path.join(__dirname, "sync-do-dead-21-batch.ts"), "utf8");

const PARTIAL = [...(PARTIAL_BLOCK.match(/const PARTIAL_SLUGS = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
  (m) => m[1]!
);
const DEAD = [...DEAD21.matchAll(/lsSlug: "([^"]+)"/g)].map((m) => m[1]!);
const done = new Set([...PARTIAL, ...DEAD]);

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const slugs = new Set<string>();

  for (const sheetName of ["Exact Slug Matches", "Exact Woo ID Matches", "Fuzzy Name Matches"]) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    const headers = (ws.getRow(1).values as (string | undefined)[]).map((v) =>
      String(v ?? "").trim()
    );
    const idx = headers.indexOf("Lightsail slug");
    if (idx < 0) throw new Error(`Missing Lightsail slug column on ${sheetName}`);
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const slug = String(row.getCell(idx).value ?? "").trim();
      if (slug) slugs.add(slug);
    });
  }

  const remaining = [...slugs].filter((s) => !done.has(s)).sort();
  const payload = {
    generatedAt: new Date().toISOString(),
    matchedTotal: slugs.size,
    doneBatchCount: done.size,
    remainingCount: remaining.length,
    slugs: remaining,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`Matched ${slugs.size}, done batch ${done.size}, remaining ${remaining.length}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
