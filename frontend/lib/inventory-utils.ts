import type { InventoryRow } from "@/lib/admin-api";

export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export type SortKey = "product" | "onHand" | "sku";
export type SortDir = "asc" | "desc";

export function stockStatus(row: Pick<InventoryRow, "onHand" | "lowStockThreshold">): StockFilter {
  if (row.onHand === 0) return "out_of_stock";
  if (row.onHand > row.lowStockThreshold) return "in_stock";
  return "low_stock";
}

export function matchesStockFilter(
  row: Pick<InventoryRow, "onHand" | "lowStockThreshold">,
  filter: StockFilter
): boolean {
  if (filter === "all") return true;
  return stockStatus(row) === filter;
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Unknown";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

export function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function inventoryToCsv(rows: InventoryRow[]): string {
  const header = ["SKU", "Product", "Variant", "On Hand", "Reserved", "Available", "Threshold"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.sku),
        escapeCsvCell(r.productName),
        escapeCsvCell(r.variantLabel ?? "Default"),
        r.onHand,
        r.reserved,
        r.available,
        r.lowStockThreshold
      ].join(",")
    )
  ];
  return lines.join("\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ParsedImportRow = { sku: string; onHand: number };

export function parseInventoryImportCsv(text: string): ParsedImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const skuIdx = header.findIndex((h) => h === "sku" || h.includes("sku"));
  const qtyIdx = header.findIndex(
    (h) =>
      h === "on hand" ||
      h === "onhand" ||
      h === "qty" ||
      h === "quantity" ||
      h.includes("on hand")
  );
  if (skuIdx < 0 || qtyIdx < 0) return [];

  const out: ParsedImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const sku = cols[skuIdx]?.trim();
    const qty = parseInt(cols[qtyIdx] ?? "", 10);
    if (!sku || !Number.isFinite(qty) || qty < 0) continue;
    out.push({ sku, onHand: qty });
  }
  return out;
}

export function sortInventoryRows(
  rows: InventoryRow[],
  sortKey: SortKey,
  sortDir: SortDir
): InventoryRow[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === "onHand") return (a.onHand - b.onHand) * dir;
    if (sortKey === "sku") return a.sku.localeCompare(b.sku) * dir;
    const cmp = a.productName.localeCompare(b.productName);
    if (cmp !== 0) return cmp * dir;
    return (a.variantLabel ?? "").localeCompare(b.variantLabel ?? "") * dir;
  });
}

export type InventoryStats = {
  total: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
};

export function computeInventoryStats(rows: InventoryRow[]): InventoryStats {
  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  for (const r of rows) {
    const s = stockStatus(r);
    if (s === "in_stock") inStock++;
    else if (s === "low_stock") lowStock++;
    else outOfStock++;
  }
  return { total: rows.length, inStock, lowStock, outOfStock };
}

export type CategoryGroup = {
  slug: string;
  name: string;
  rows: InventoryRow[];
  variantCount: number;
  lowCount: number;
};

export function groupRowsByCategory(rows: InventoryRow[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const r of rows) {
    const slug = r.primaryCategorySlug ?? "__uncategorized__";
    const name = r.primaryCategoryName ?? "Uncategorized";
    let g = map.get(slug);
    if (!g) {
      g = { slug, name, rows: [], variantCount: 0, lowCount: 0 };
      map.set(slug, g);
    }
    g.rows.push(r);
    g.variantCount++;
    if (stockStatus(r) === "low_stock") g.lowCount++;
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
