/**
 * Fetch Zoho invoice line details for invoices in a date window (missing line_items),
 * then report Wind Gong variant sales. Also writes a JSON summary for analysis.
 *
 *   cd backend && npx tsx scripts/fetch-wind-gong-analytics.ts
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const OUT_DIR = path.resolve(__dirname, "../../data");
const CHECKPOINT = path.join(OUT_DIR, "zoho_invoices_checkpoint.json");
const LIST_CACHE = path.join(OUT_DIR, "zoho_invoices_list.json");
const OUT_JSON = path.join(OUT_DIR, "wind_gong_analytics_3m.json");

const START = "2026-05-10";
const END = "2026-08-10";
const CONCURRENCY = 2;
const REQUEST_GAP_MS = 400;

type Line = {
  name?: string;
  sku?: string;
  quantity?: number;
  rate?: number;
  item_total?: number;
  tax_name?: string;
};

type InvoiceDetail = {
  invoice_id: string;
  invoice_number?: string;
  date?: string;
  status?: string;
  customer_name?: string;
  email?: string;
  reference_number?: string;
  total?: number;
  line_items?: Line[];
  billing_address?: unknown;
  sub_total?: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isWindGong(sku: string | undefined, name: string | undefined): boolean {
  const s = (sku || "").trim().toUpperCase();
  const n = (name || "").toLowerCase();
  if (
    n.includes("wind gong") ||
    n.includes("plain/wind") ||
    n.includes("plain / wind") ||
    n.includes("etched plain") ||
    n.includes("plain wind")
  ) {
    return true;
  }
  if (n.includes("gong-plain") || n.includes("gong-etched") || n.includes("gong etched") || n.includes("gong plain")) {
    return true;
  }
  if (s.startsWith("MI-G-P-") || s.startsWith("MI-G-ET-") || s.startsWith("MI-EPWGON")) {
    return true;
  }
  // etched wind family sometimes uses MI-SB-H-ET-TR-* in catalog
  if (s.startsWith("MI-SB-H-ET-TR-") && n.includes("gong")) return true;
  if (n.includes("etched") && n.includes("gong") && (n.includes("mandala") || n.includes("flower") || n.includes("chakra"))) {
    return true;
  }
  return false;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const missing = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORGANIZATION_ID"].filter(
    (k) => !process.env[k]?.trim()
  );
  if (missing.length) throw new Error(`Missing Zoho env: ${missing.join(", ")}`);

  const { zohoGet } = await import("../src/modules/zoho/zoho-client");

  const list: Array<{ invoice_id: string; date?: string; invoice_number?: string }> = fs.existsSync(LIST_CACHE)
    ? (JSON.parse(fs.readFileSync(LIST_CACHE, "utf8")) as Array<{ invoice_id: string; date?: string }>)
    : [];
  if (!list.length) throw new Error("No zoho_invoices_list.json — run export-zoho-invoices.ts first");

  type Checkpoint = { details: Record<string, InvoiceDetail> };
  const checkpoint: Checkpoint = fs.existsSync(CHECKPOINT)
    ? (JSON.parse(fs.readFileSync(CHECKPOINT, "utf8")) as Checkpoint)
    : { details: {} };

  const inWindow = list.filter((inv) => {
    const d = (inv.date || "").slice(0, 10);
    return d >= START && d <= END;
  });
  console.log(`Invoices in window ${START}..${END}: ${inWindow.length}`);

  const pending = inWindow.filter((inv) => {
    const existing = checkpoint.details[inv.invoice_id];
    if (!existing) return true;
    if (!Array.isArray(existing.line_items)) return true;
    // empty stub
    if (existing.line_items.length === 0 && existing.sub_total === undefined) return true;
    return false;
  });
  console.log(`Need detail fetch: ${pending.length}`);

  let done = 0;
  let sinceSave = 0;
  await mapPool(pending, CONCURRENCY, async (inv) => {
    await sleep(REQUEST_GAP_MS);
    try {
      const res = await zohoGet<{ invoice?: InvoiceDetail }>(`/invoices/${inv.invoice_id}`);
      if (res.invoice) {
        checkpoint.details[inv.invoice_id] = { ...res.invoice, invoice_id: inv.invoice_id };
      }
    } catch (e) {
      console.warn(`fail ${inv.invoice_id}:`, e instanceof Error ? e.message : e);
    }
    done += 1;
    sinceSave += 1;
    if (done % 25 === 0) console.log(`  fetched ${done}/${pending.length}`);
    if (sinceSave >= 40) {
      fs.writeFileSync(CHECKPOINT, JSON.stringify(checkpoint));
      sinceSave = 0;
    }
    return null;
  });
  fs.writeFileSync(CHECKPOINT, JSON.stringify(checkpoint));
  console.log("Checkpoint saved");

  // Aggregate wind gongs
  type Agg = { qty: number; revenue: number; name: string; invoices: Set<string> };
  const bySku = new Map<string, Agg>();
  const byMonth = new Map<string, { qty: number; revenue: number; invoices: Set<string> }>();
  const lines: Array<Record<string, unknown>> = [];
  const channel = new Map<string, number>();

  for (const inv of inWindow) {
    const detail = checkpoint.details[inv.invoice_id];
    if (!detail) continue;
    const status = (detail.status || "").toLowerCase();
    if (status === "draft" || status === "void") continue;
    const d = (detail.date || inv.date || "").slice(0, 10);
    const month = d.slice(0, 7);
    for (const li of detail.line_items || []) {
      if (!isWindGong(li.sku, li.name)) continue;
      const sku = (li.sku || "").trim() || String(li.name || "UNKNOWN");
      const qty = Number(li.quantity || 0);
      const total = Number(li.item_total || 0);
      const invNo = detail.invoice_number || inv.invoice_id;
      const cur = bySku.get(sku) || { qty: 0, revenue: 0, name: li.name || "", invoices: new Set() };
      cur.qty += qty;
      cur.revenue += total;
      cur.name = li.name || cur.name;
      cur.invoices.add(invNo);
      bySku.set(sku, cur);
      const m = byMonth.get(month) || { qty: 0, revenue: 0, invoices: new Set() };
      m.qty += qty;
      m.revenue += total;
      m.invoices.add(invNo);
      byMonth.set(month, m);
      lines.push({
        date: d,
        invoice: invNo,
        customer: detail.customer_name,
        status,
        sku,
        name: li.name,
        qty,
        total,
        ref: detail.reference_number || ""
      });
      const cust = (detail.customer_name || "").toLowerCase();
      const ch = cust.includes("amazon") ? "Amazon" : cust.includes("flipkart") ? "Flipkart" : "Direct/Other";
      channel.set(ch, (channel.get(ch) || 0) + 1);
    }
  }

  const summary = {
    period: { start: START, end: END },
    source: "Zoho Books (live detail fetch + checkpoint)",
    fetched_in_run: pending.length,
    invoices_in_window: inWindow.length,
    totals: {
      qty: [...bySku.values()].reduce((a, b) => a + b.qty, 0),
      revenue: [...bySku.values()].reduce((a, b) => a + b.revenue, 0),
      line_count: lines.length,
      sku_count: bySku.size,
      invoice_count: new Set(lines.map((l) => l.invoice)).size
    },
    by_month: [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({
        month,
        qty: v.qty,
        revenue: v.revenue,
        invoices: v.invoices.size
      })),
    by_sku: [...bySku.entries()]
      .sort((a, b) => b[1].qty - a[1].qty || b[1].revenue - a[1].revenue)
      .map(([sku, v]) => ({
        sku,
        name: v.name,
        qty: v.qty,
        revenue: v.revenue,
        invoices: v.invoices.size
      })),
    channel_lines: Object.fromEntries(channel),
    lines
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.totals, null, 2));
  console.log("by_month", summary.by_month);
  console.log("Wrote", OUT_JSON);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
