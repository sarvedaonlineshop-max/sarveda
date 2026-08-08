/**
 * Export all Zoho Books invoices (with line items) to Excel — fast parallel version.
 *
 *   cd backend && npx tsx scripts/export-zoho-invoices.ts
 *
 * Writes: ../data/Sarveda_Zoho_Invoices.xlsx
 * Checkpoint: ../data/zoho_invoices_checkpoint.json (resume-safe)
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type InvoiceListItem = {
  invoice_id: string;
  invoice_number?: string;
  date?: string;
  due_date?: string;
  status?: string;
  customer_id?: string;
  customer_name?: string;
  email?: string;
  total?: number;
  balance?: number;
  currency_code?: string;
  reference_number?: string;
};

type InvoiceLine = {
  name?: string;
  description?: string;
  sku?: string;
  quantity?: number;
  rate?: number;
  item_total?: number;
  tax_name?: string;
};

type Address = {
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  zip?: string;
};

type InvoiceDetail = InvoiceListItem & {
  billing_address?: Address;
  shipping_address?: Address;
  contact_persons_details?: Array<{
    email?: string;
    phone?: string;
    mobile?: string;
  }>;
  line_items?: InvoiceLine[];
  sub_total?: number;
  tax_total?: number;
  discount_total?: number;
  payment_made?: number;
  notes?: string;
};

const OUT_DIR = path.resolve(__dirname, "../../data");
const CHECKPOINT = path.join(OUT_DIR, "zoho_invoices_checkpoint.json");
const LIST_CACHE = path.join(OUT_DIR, "zoho_invoices_list.json");
const OUT_XLSX = path.join(OUT_DIR, "Sarveda_Zoho_Invoices.xlsx");
const CONCURRENCY = 2;
const REQUEST_GAP_MS = 350; // stay under Zoho per-minute limits
const RETRY_MISSING_LINES = process.env.ZOHO_EXPORT_RETRY_MISSING !== "0";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function requireZohoEnv() {
  const missing = [
    "ZOHO_CLIENT_ID",
    "ZOHO_CLIENT_SECRET",
    "ZOHO_REFRESH_TOKEN",
    "ZOHO_ORGANIZATION_ID"
  ].filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    throw new Error(`Missing Zoho env: ${missing.join(", ")}`);
  }
}

function needsDetailRefresh(inv: InvoiceDetail | InvoiceListItem | undefined): boolean {
  if (!inv) return true;
  // List-only stubs (rate-limited skips) have no line_items key / empty array and no billing city
  const detail = inv as InvoiceDetail;
  if (!Array.isArray(detail.line_items)) return true;
  // Still refresh empties that look like list stubs (no billing_address object at all)
  if (detail.line_items.length === 0 && detail.billing_address === undefined && detail.sub_total === undefined) {
    return true;
  }
  return false;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
      done += 1;
      onProgress?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  requireZohoEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { zohoGet } = await import("../src/modules/zoho/zoho-client");

  let list: InvoiceListItem[] = [];
  if (fs.existsSync(LIST_CACHE) && !process.env.ZOHO_EXPORT_REFRESH_LIST) {
    list = JSON.parse(fs.readFileSync(LIST_CACHE, "utf8")) as InvoiceListItem[];
    console.log(`Loaded invoice list cache: ${list.length}`);
  } else {
    console.log("Listing Zoho invoices…");
    let page = 1;
    for (;;) {
      const res = await zohoGet<{
        invoices?: InvoiceListItem[];
        page_context?: { has_more_page?: boolean };
      }>(`/invoices?page=${page}&per_page=200&sort_column=date&sort_order=A`);
      const batch = res.invoices ?? [];
      list.push(...batch);
      console.log(`  page ${page}: +${batch.length} (total ${list.length})`);
      if (!res.page_context?.has_more_page || batch.length === 0) break;
      page += 1;
      await sleep(100);
    }
    fs.writeFileSync(LIST_CACHE, JSON.stringify(list));
    console.log(`Cached list → ${LIST_CACHE}`);
  }

  type Checkpoint = { details: Record<string, InvoiceDetail> };
  let checkpoint: Checkpoint = { details: {} };
  if (fs.existsSync(CHECKPOINT)) {
    checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT, "utf8")) as Checkpoint;
    console.log(`Resuming checkpoint: ${Object.keys(checkpoint.details).length} details already fetched`);
  }

  const pending = list.filter((inv) => {
    const existing = checkpoint.details[inv.invoice_id];
    if (!existing) return true;
    return RETRY_MISSING_LINES && needsDetailRefresh(existing);
  });
  console.log(`Fetching details for ${pending.length} remaining of ${list.length}…`);

  let sinceSave = 0;
  const saveCheckpoint = () => {
    fs.writeFileSync(CHECKPOINT, JSON.stringify(checkpoint));
    sinceSave = 0;
  };

  let rateLimitedUntil = 0;

  await mapPool(
    pending,
    CONCURRENCY,
    async (inv) => {
      // Back off globally when Zoho rate-limits us
      const wait = rateLimitedUntil - Date.now();
      if (wait > 0) await sleep(wait);

      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await sleep(REQUEST_GAP_MS);
          const res = await zohoGet<{ invoice?: InvoiceDetail }>(`/invoices/${inv.invoice_id}`);
          checkpoint.details[inv.invoice_id] = res.invoice ?? inv;
          break;
        } catch (err) {
          const msg = (err as Error).message || "";
          if (msg.includes("maximum number of requests") || msg.includes("blocked for some time")) {
            const backoff = 60_000 + attempt * 30_000;
            rateLimitedUntil = Date.now() + backoff;
            console.warn(`  rate-limited — sleeping ${Math.round(backoff / 1000)}s (attempt ${attempt + 1})`);
            await sleep(backoff);
            continue;
          }
          console.warn(`  skip ${inv.invoice_number ?? inv.invoice_id}:`, msg);
          if (!checkpoint.details[inv.invoice_id]) checkpoint.details[inv.invoice_id] = inv;
          break;
        }
      }
      sinceSave += 1;
      if (sinceSave >= 50) saveCheckpoint();
      return true;
    },
    (done, total) => {
      if (done % 50 === 0 || done === total) {
        const withLines = Object.values(checkpoint.details).filter(
          (d) => Array.isArray((d as InvoiceDetail).line_items)
        ).length;
        console.log(
          `  progress ${done}/${total} this run | checkpoint ${Object.keys(checkpoint.details).length}/${list.length} | with details ${withLines}`
        );
      }
    }
  );
  saveCheckpoint();

  const details = list.map((inv) => checkpoint.details[inv.invoice_id] ?? inv);

  console.log("Writing Excel…");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sarveda";

  const summary = wb.addWorksheet("Summary");
  summary.getCell("A1").value = "Sarveda — Zoho Books invoices (all-time)";
  summary.getCell("A1").font = { bold: true, size: 14 };
  summary.getCell("A3").value = "Exported (UTC)";
  summary.getCell("B3").value = new Date().toISOString();
  summary.getCell("A4").value = "Invoice count";
  summary.getCell("B4").value = details.length;
  summary.getCell("A5").value = "Source";
  summary.getCell("B5").value = "Zoho Books API GET /invoices (+ detail per invoice)";

  const invSheet = wb.addWorksheet("Invoices");
  const headers = [
    "Invoice ID",
    "Invoice Number",
    "Date",
    "Due Date",
    "Status",
    "Customer Name",
    "Email",
    "Phone",
    "Billing City",
    "Billing State",
    "Billing Country",
    "Shipping City",
    "Currency",
    "Sub Total",
    "Tax Total",
    "Discount",
    "Total",
    "Payment Made",
    "Balance",
    "Reference",
    "Items",
    "Notes"
  ];
  invSheet.addRow(headers);
  invSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  invSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1C352A" }
  };

  const lineSheet = wb.addWorksheet("Line Items");
  const lineHeaders = [
    "Invoice Number",
    "Date",
    "Customer Name",
    "Email",
    "Item Name",
    "SKU",
    "Qty",
    "Rate",
    "Line Total",
    "Tax"
  ];
  lineSheet.addRow(lineHeaders);
  lineSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  lineSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1C352A" }
  };

  let lineCount = 0;
  for (const inv of details) {
    const items = (inv.line_items ?? [])
      .map((li) => {
        const qty = li.quantity ?? 1;
        const name = li.name || li.description || "Item";
        const sku = li.sku ? ` [${li.sku}]` : "";
        return `${name}${sku} (x${qty})`;
      })
      .join(" | ");
    const phone =
      inv.billing_address?.phone ||
      inv.shipping_address?.phone ||
      inv.contact_persons_details?.[0]?.phone ||
      inv.contact_persons_details?.[0]?.mobile ||
      "";
    invSheet.addRow([
      inv.invoice_id,
      inv.invoice_number ?? "",
      inv.date ?? "",
      inv.due_date ?? "",
      inv.status ?? "",
      inv.customer_name ?? "",
      inv.email ?? inv.contact_persons_details?.[0]?.email ?? "",
      phone,
      inv.billing_address?.city ?? "",
      inv.billing_address?.state ?? "",
      inv.billing_address?.country ?? "",
      inv.shipping_address?.city ?? "",
      inv.currency_code ?? "",
      inv.sub_total ?? "",
      inv.tax_total ?? "",
      inv.discount_total ?? "",
      inv.total ?? "",
      inv.payment_made ?? "",
      inv.balance ?? "",
      inv.reference_number ?? "",
      items,
      inv.notes ?? ""
    ]);

    for (const li of inv.line_items ?? []) {
      lineCount += 1;
      lineSheet.addRow([
        inv.invoice_number ?? "",
        inv.date ?? "",
        inv.customer_name ?? "",
        inv.email ?? "",
        li.name || li.description || "",
        li.sku ?? "",
        li.quantity ?? "",
        li.rate ?? "",
        li.item_total ?? "",
        li.tax_name ?? ""
      ]);
    }
  }

  summary.getCell("A6").value = "Line-item rows";
  summary.getCell("B6").value = lineCount;

  invSheet.views = [{ state: "frozen", ySplit: 1 }];
  invSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };
  lineSheet.views = [{ state: "frozen", ySplit: 1 }];
  lineSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: lineHeaders.length }
  };

  await wb.xlsx.writeFile(OUT_XLSX);
  console.log(`\nDone. Wrote ${OUT_XLSX}`);
  console.log(`Invoices: ${details.length} | Line items: ${lineCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
