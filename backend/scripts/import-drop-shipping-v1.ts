/**
 * Idempotent drop-ship flag backfill from Inventory workbook (exact SKU match).
 *
 * Usage:
 *   npx tsx scripts/import-drop-shipping-v1.ts --file /path/to/workbook.xlsx --dry-run
 *   npx tsx scripts/import-drop-shipping-v1.ts --file /path/to/workbook.xlsx --apply
 *
 * Artifacts:
 *   docs/audit/drop-shipping-v1/drop_shipping_import_reconciliation.csv
 *   docs/audit/drop-shipping-v1/drop_shipping_import_summary.json
 */
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(REPO_ROOT, "docs/audit/drop-shipping-v1");
const OUT_CSV = path.join(OUT_DIR, "drop_shipping_import_reconciliation.csv");
const OUT_SUMMARY = path.join(OUT_DIR, "drop_shipping_import_summary.json");

const apply = process.argv.includes("--apply");
const dryRun = !apply || process.argv.includes("--dry-run");

function fileArg(): string {
  const i = process.argv.indexOf("--file");
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]!);
  const fallback = path.join(REPO_ROOT, "data/drop_shipping_inventory.xlsx");
  return fallback;
}

type SheetRow = {
  sku: string;
  product: string;
  variant: string;
  spreadsheetOnHand: number | null;
  dropShippingFile: "Y" | "N";
};

function normalizeYn(raw: unknown): "Y" | "N" | null {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (t === "Y" || t === "YES") return "Y";
  if (t === "N" || t === "NO") return "N";
  return null;
}

function escapeCsv(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function readInventorySheet(filePath: string): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet =
    wb.getWorksheet("Inventory") ??
    wb.worksheets.find((ws) => /inventory/i.test(ws.name)) ??
    wb.worksheets[0];
  if (!sheet) throw new Error("No worksheet found in workbook");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cell.text ?? "").trim();
  });

  const col = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
      if (idx >= 0) return idx + 1;
    }
    for (const name of names) {
      const idx = headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
      if (idx >= 0) return idx + 1;
    }
    return -1;
  };

  const skuCol = col(["SKU"]);
  const productCol = col(["Product"]);
  const variantCol = col(["Variant"]);
  const onHandCol = col(["On Hand", "On hand"]);
  const dropCol = col(["Drop Shipping(Y/N)", "Drop Shipping", "Drop shipping"]);

  if (skuCol < 1 || dropCol < 1) {
    throw new Error(`Missing required columns. Headers: ${headers.filter(Boolean).join(" | ")}`);
  }

  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const sku = String(row.getCell(skuCol).text ?? "").trim();
    if (!sku) return;
    const yn = normalizeYn(row.getCell(dropCol).value ?? row.getCell(dropCol).text);
    if (!yn) return;
    const onHandRaw = onHandCol > 0 ? row.getCell(onHandCol).value : null;
    const onHandNum =
      typeof onHandRaw === "number"
        ? onHandRaw
        : Number.parseInt(String(onHandRaw ?? "").trim(), 10);
    rows.push({
      sku,
      product: productCol > 0 ? String(row.getCell(productCol).text ?? "").trim() : "",
      variant: variantCol > 0 ? String(row.getCell(variantCol).text ?? "").trim() : "",
      spreadsheetOnHand: Number.isFinite(onHandNum) ? onHandNum : null,
      dropShippingFile: yn
    });
  });
  return rows;
}

async function main(): Promise<void> {
  const filePath = fileArg();
  if (!existsSync(filePath)) {
    console.error(`Workbook not found: ${filePath}`);
    console.error("Pass --file /path/to/workbook.xlsx (sheet: Inventory, 790 SKU rows expected).");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const fileRows = await readInventorySheet(filePath);

  const fileSkuCounts = new Map<string, number>();
  for (const r of fileRows) {
    fileSkuCounts.set(r.sku, (fileSkuCounts.get(r.sku) ?? 0) + 1);
  }
  const duplicateFileSkus = [...fileSkuCounts.entries()].filter(([, c]) => c > 1).map(([sku]) => sku);

  const skus = [...new Set(fileRows.map((r) => r.sku))];
  const dbVariants = await prisma.productVariant.findMany({
    where: { sku: { in: skus } },
    select: {
      id: true,
      sku: true,
      dropShipEnabled: true,
      inventory: { select: { onHand: true } }
    }
  });
  const dbBySku = new Map(dbVariants.map((v) => [v.sku, v]));

  const dbSkuDupes = await prisma.productVariant.groupBy({
    by: ["sku"],
    _count: { sku: true },
    where: { sku: { in: skus } },
    having: { sku: { _count: { gt: 1 } } }
  });

  let yRows = 0;
  let nRows = 0;
  let matched = 0;
  let unmatched = 0;
  let changed = 0;
  let alreadyCorrect = 0;
  let manualReview = 0;

  const csvLines = [
    [
      "SKU",
      "Product",
      "Variant",
      "Spreadsheet On Hand",
      "DB On Hand",
      "Drop Shipping File",
      "Old dropShipEnabled",
      "New dropShipEnabled",
      "Match Status",
      "Notes"
    ].join(",")
  ];

  const updates: Array<{ id: string; dropShipEnabled: boolean }> = [];

  for (const row of fileRows) {
    if (duplicateFileSkus.includes(row.sku)) continue;
    if (row.dropShippingFile === "Y") yRows++;
    else nRows++;

    const db = dbBySku.get(row.sku);
    const newEnabled = row.dropShippingFile === "Y";
    let status = "MATCHED";
    let notes = "";

    if (!db) {
      status = "UNMATCHED";
      unmatched++;
      notes = "SKU not found in DB";
    } else {
      matched++;
      const oldEnabled = db.dropShipEnabled;
      if (oldEnabled === newEnabled) {
        status = "ALREADY_CORRECT";
        alreadyCorrect++;
      } else {
        status = "CHANGED";
        changed++;
        updates.push({ id: db.id, dropShipEnabled: newEnabled });
      }
    }

    if (duplicateFileSkus.includes(row.sku)) {
      status = "MANUAL_REVIEW";
      manualReview++;
      notes = "Duplicate SKU in file";
    }

    csvLines.push(
      [
        escapeCsv(row.sku),
        escapeCsv(row.product),
        escapeCsv(row.variant),
        escapeCsv(row.spreadsheetOnHand ?? ""),
        escapeCsv(db?.inventory?.onHand ?? ""),
        escapeCsv(row.dropShippingFile),
        escapeCsv(db?.dropShipEnabled ?? ""),
        escapeCsv(db ? newEnabled : ""),
        escapeCsv(status),
        escapeCsv(notes)
      ].join(",")
    );
  }

  for (const sku of duplicateFileSkus) {
    manualReview++;
    csvLines.push(
      [
        escapeCsv(sku),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        escapeCsv("MANUAL_REVIEW"),
        escapeCsv("Duplicate SKU rows in spreadsheet — skipped for apply")
      ].join(",")
    );
  }

  if (apply && !dryRun) {
    for (const u of updates) {
      await prisma.productVariant.update({
        where: { id: u.id },
        data: { dropShipEnabled: u.dropShipEnabled }
      });
    }
  }

  const summary = {
    FILE_ROWS: fileRows.length,
    Y_ROWS: yRows,
    N_ROWS: nRows,
    MATCHED: matched,
    UNMATCHED: unmatched,
    DUPLICATES: duplicateFileSkus.length,
    DUPLICATE_DB_SKUS: dbSkuDupes.length,
    CHANGED: apply && !dryRun ? changed : dryRun ? changed : 0,
    WOULD_CHANGE: dryRun ? changed : undefined,
    ALREADY_CORRECT: alreadyCorrect,
    MANUAL_REVIEW: manualReview,
    apply: apply && !dryRun,
    dryRun,
    filePath,
    database: process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@") ?? "(unset)"
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_CSV, csvLines.join("\n") + "\n", "utf8");
  writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 2) + "\n", "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${OUT_CSV}`);
  console.log(`Wrote ${OUT_SUMMARY}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
