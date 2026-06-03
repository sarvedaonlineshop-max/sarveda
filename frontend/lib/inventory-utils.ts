import type { InventoryRow } from "@/lib/admin-api";

export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock" | "not_in_zoho";

export type SortKey = "product" | "onHand" | "sku";
export type SortDir = "asc" | "desc";

export function stockStatus(row: Pick<InventoryRow, "onHand" | "lowStockThreshold">): StockFilter {
  if (row.onHand === 0) return "out_of_stock";
  if (row.onHand > row.lowStockThreshold) return "in_stock";
  return "low_stock";
}

export function matchesStockFilter(
  row: Pick<InventoryRow, "onHand" | "lowStockThreshold" | "inZohoBooks">,
  filter: StockFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "not_in_zoho") return row.inZohoBooks === false;
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
  const header = ["SKU", "Product", "Variant", "Available", "Reserved", "In Zoho", "Threshold"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.sku),
        escapeCsvCell(r.productName),
        escapeCsvCell(r.variantLabel ?? "Default"),
        r.available,
        r.reserved,
        r.inZohoBooks === true ? "yes" : r.inZohoBooks === false ? "no" : "unknown",
        r.lowStockThreshold
      ].join(",")
    )
  ];
  return lines.join("\n");
}

/** First variant row per productId in display order (for product-level actions in flat list). */
export function firstVariantRowByProduct(rows: InventoryRow[]): Set<string> {
  const seen = new Set<string>();
  const first = new Set<string>();
  for (const r of rows) {
    if (!seen.has(r.productId)) {
      seen.add(r.productId);
      first.add(r.variantId);
    }
  }
  return first;
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

export type CategoryFilterOption = { slug: string; label: string };

/** Categories that actually appear on inventory rows — one entry per slug; disambiguate duplicate names. */
export function buildCategoryFilterOptions(rows: InventoryRow[]): CategoryFilterOption[] {
  const bySlug = new Map<string, string>();
  for (const r of rows) {
    for (const c of r.categories) {
      if (c.slug) bySlug.set(c.slug, c.name);
    }
  }
  const nameCount = new Map<string, number>();
  for (const name of Array.from(bySlug.values())) {
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  return Array.from(bySlug.entries())
    .map(([slug, name]) => ({
      slug,
      label: (nameCount.get(name) ?? 0) > 1 ? `${name} (${slug})` : name
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type ProductInventoryGroup = {
  productId: string;
  productName: string;
  productSlug: string;
  rows: InventoryRow[];
  variantCount: number;
  totalAvailable: number;
  totalReserved: number;
  lowCount: number;
  outCount: number;
  zohoUnmatched: number;
  zohoMatched: number;
};

export function groupRowsByProduct(rows: InventoryRow[]): ProductInventoryGroup[] {
  const map = new Map<string, ProductInventoryGroup>();
  for (const r of rows) {
    let g = map.get(r.productId);
    if (!g) {
      g = {
        productId: r.productId,
        productName: r.productName,
        productSlug: r.productSlug,
        rows: [],
        variantCount: 0,
        totalAvailable: 0,
        totalReserved: 0,
        lowCount: 0,
        outCount: 0,
        zohoUnmatched: 0,
        zohoMatched: 0
      };
      map.set(r.productId, g);
    }
    g.rows.push(r);
    g.variantCount++;
    g.totalAvailable += r.available;
    g.totalReserved += r.reserved;
    if (stockStatus(r) === "low_stock") g.lowCount++;
    if (stockStatus(r) === "out_of_stock") g.outCount++;
    if (r.inZohoBooks === false) g.zohoUnmatched++;
    if (r.inZohoBooks === true) g.zohoMatched++;
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.rows.sort((a: InventoryRow, b: InventoryRow) =>
      (a.variantLabel ?? "").localeCompare(b.variantLabel ?? "")
    );
  }
  return groups.sort((a, b) => a.productName.localeCompare(b.productName));
}

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
