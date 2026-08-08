/**
 * Export Zoho Books invoices for Mumbai + Kolkata only.
 *
 * Matching rules (any one):
 *  - billing/shipping city contains Mumbai / Kolkata / Calcutta
 *  - invoice email matches WooCommerce Kolkata/Mumbai customer export emails
 *
 *   cd backend && npx tsx scripts/export-zoho-invoices-city.ts
 *
 * Writes: ../data/Sarveda_Zoho_Kolkata_Mumbai_Invoices.xlsx
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type Address = { city?: string; state?: string; country?: string; phone?: string };
type InvoiceListItem = {
  invoice_id: string;
  invoice_number?: string;
  date?: string;
  due_date?: string;
  status?: string;
  customer_id?: string;
  customer_name?: string;
  email?: string;
  phone?: string;
  total?: number;
  balance?: number;
  currency_code?: string;
  reference_number?: string;
  billing_address?: Address;
  shipping_address?: Address;
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
type InvoiceDetail = InvoiceListItem & {
  contact_persons_details?: Array<{ email?: string; phone?: string; mobile?: string }>;
  line_items?: InvoiceLine[];
  sub_total?: number;
  tax_total?: number;
  discount_total?: number;
  payment_made?: number;
  notes?: string;
};

const OUT_DIR = path.resolve(__dirname, "../../data");
const LIST_CACHE = path.join(OUT_DIR, "zoho_invoices_list.json");
const FULL_CK = path.join(OUT_DIR, "zoho_invoices_checkpoint.json");
const CITY_CK = path.join(OUT_DIR, "zoho_city_invoices_checkpoint.json");
const WOO_TSV = path.join(OUT_DIR, "kolkata_mumbai_orders.tsv");
const OUT_XLSX = path.join(OUT_DIR, "Sarveda_Zoho_Kolkata_Mumbai_Invoices.xlsx");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function cityBucket(city: string | undefined | null): "Mumbai" | "Kolkata" | null {
  const c = (city || "").toLowerCase();
  if (c.includes("mumbai")) return "Mumbai";
  if (c.includes("kolkata") || c.includes("calcutta")) return "Kolkata";
  return null;
}

function loadWooEmails(): Set<string> {
  const emails = new Set<string>();
  if (!fs.existsSync(WOO_TSV)) return emails;
  const text = fs.readFileSync(WOO_TSV, "utf8");
  const lines = text.split(/\r?\n/);
  const header = (lines[0] || "").split("\t");
  const emailIdx = header.indexOf("email");
  if (emailIdx < 0) return emails;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split("\t");
    const e = (cols[emailIdx] || "").trim().toLowerCase();
    if (e) emails.add(e);
  }
  return emails;
}

function invCity(inv: InvoiceListItem | InvoiceDetail): "Mumbai" | "Kolkata" | null {
  return cityBucket(inv.billing_address?.city) || cityBucket(inv.shipping_address?.city);
}

async function main() {
  const missing = [
    "ZOHO_CLIENT_ID",
    "ZOHO_CLIENT_SECRET",
    "ZOHO_REFRESH_TOKEN",
    "ZOHO_ORGANIZATION_ID"
  ].filter((k) => !process.env[k]?.trim());
  if (missing.length) throw new Error(`Missing Zoho env: ${missing.join(", ")}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { zohoGet } = await import("../src/modules/zoho/zoho-client");
  await (await import("../src/modules/zoho/zoho-auth")).getZohoAccessToken();

  let list: InvoiceListItem[] = [];
  if (fs.existsSync(LIST_CACHE)) {
    list = JSON.parse(fs.readFileSync(LIST_CACHE, "utf8")) as InvoiceListItem[];
    console.log(`Loaded invoice list cache: ${list.length}`);
  } else {
    console.log("Listing all invoices (one-time)…");
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
      await sleep(200);
    }
    fs.writeFileSync(LIST_CACHE, JSON.stringify(list));
  }

  const wooEmails = loadWooEmails();
  console.log(`Woo Mumbai/Kolkata emails loaded: ${wooEmails.size}`);

  const candidates = list.filter((inv) => {
    if (invCity(inv)) return true;
    const email = (inv.email || "").trim().toLowerCase();
    return Boolean(email && wooEmails.has(email));
  });
  console.log(`City candidates from list: ${candidates.length}`);

  // Reuse any full details already fetched
  const fullCk = fs.existsSync(FULL_CK)
    ? (JSON.parse(fs.readFileSync(FULL_CK, "utf8")) as { details: Record<string, InvoiceDetail> })
    : { details: {} };

  type CityCk = { details: Record<string, InvoiceDetail> };
  let cityCk: CityCk = fs.existsSync(CITY_CK)
    ? (JSON.parse(fs.readFileSync(CITY_CK, "utf8")) as CityCk)
    : { details: {} };

  for (const inv of candidates) {
    const existing = cityCk.details[inv.invoice_id] || fullCk.details[inv.invoice_id];
    if (existing && Array.isArray(existing.line_items)) {
      cityCk.details[inv.invoice_id] = existing;
    }
  }

  const pending = candidates.filter((inv) => !Array.isArray(cityCk.details[inv.invoice_id]?.line_items));
  console.log(`Need detail fetch: ${pending.length} (already have ${candidates.length - pending.length})`);

  let rateLimitedUntil = 0;
  let sinceSave = 0;
  for (let i = 0; i < pending.length; i++) {
    const inv = pending[i]!;
    const wait = rateLimitedUntil - Date.now();
    if (wait > 0) await sleep(wait);

    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await sleep(450);
        const res = await zohoGet<{ invoice?: InvoiceDetail }>(`/invoices/${inv.invoice_id}`);
        cityCk.details[inv.invoice_id] = res.invoice ?? inv;
        break;
      } catch (err) {
        const msg = (err as Error).message || "";
        if (msg.includes("maximum number of requests") || msg.includes("blocked")) {
          const backoff = 70_000 + attempt * 25_000;
          rateLimitedUntil = Date.now() + backoff;
          console.warn(`  rate-limited — sleep ${Math.round(backoff / 1000)}s`);
          await sleep(backoff);
          continue;
        }
        console.warn(`  skip ${inv.invoice_number}: ${msg}`);
        cityCk.details[inv.invoice_id] = inv;
        break;
      }
    }

    sinceSave += 1;
    if (sinceSave >= 25 || i === pending.length - 1) {
      fs.writeFileSync(CITY_CK, JSON.stringify(cityCk));
      sinceSave = 0;
      console.log(`  details ${i + 1}/${pending.length}`);
    }
  }
  fs.writeFileSync(CITY_CK, JSON.stringify(cityCk));

  const rows = candidates
    .map((inv) => {
      const detail = cityCk.details[inv.invoice_id] ?? inv;
      let group = invCity(detail) || invCity(inv);
      const email = (detail.email || inv.email || "").trim().toLowerCase();
      if (!group && email && wooEmails.has(email)) {
        // Keep as Mumbai/Kolkata via Woo match; refine if detail city exists later
        group = "Mumbai"; // placeholder — better split unknown using woo tsv city
      }
      return { detail, group, email };
    })
    .filter((r) => r.group);

  // Refine woo-matched group using woo TSV billing city when Zoho city empty
  const emailToCity = new Map<string, "Mumbai" | "Kolkata">();
  if (fs.existsSync(WOO_TSV)) {
    const text = fs.readFileSync(WOO_TSV, "utf8");
    const lines = text.split(/\r?\n/);
    const header = (lines[0] || "").split("\t");
    const ei = header.indexOf("email");
    const ci = header.indexOf("billing_city");
    const si = header.indexOf("shipping_city");
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!.split("\t");
      const e = (cols[ei] || "").trim().toLowerCase();
      if (!e) continue;
      const g = cityBucket(cols[ci]) || cityBucket(cols[si]);
      if (g) emailToCity.set(e, g);
    }
  }
  for (const r of rows) {
    if (!invCity(r.detail) && r.email && emailToCity.has(r.email)) {
      r.group = emailToCity.get(r.email)!;
    }
  }

  const mumbai = rows.filter((r) => r.group === "Mumbai");
  const kolkata = rows.filter((r) => r.group === "Kolkata");
  console.log(`Final: ${rows.length} (Mumbai ${mumbai.length}, Kolkata ${kolkata.length})`);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sarveda";
  const summary = wb.addWorksheet("Summary");
  summary.getCell("A1").value = "Sarveda — Zoho invoices (Mumbai + Kolkata only)";
  summary.getCell("A1").font = { bold: true, size: 14 };
  summary.getCell("A3").value = "Exported (UTC)";
  summary.getCell("B3").value = new Date().toISOString();
  summary.getCell("A4").value = "Full Zoho invoice count (org)";
  summary.getCell("B4").value = list.length;
  summary.getCell("A5").value = "This file (Mumbai+Kolkata)";
  summary.getCell("B5").value = rows.length;
  summary.getCell("A6").value = "Match rules";
  summary.getCell("B6").value =
    "1) Zoho billing/shipping city contains Mumbai/Kolkata/Calcutta OR 2) invoice email matches WooCommerce Mumbai/Kolkata customer list";

  const headers = [
    "City Group",
    "Invoice Number",
    "Date",
    "Status",
    "Customer Name",
    "Email",
    "Phone",
    "Billing City",
    "Billing State",
    "Shipping City",
    "Currency",
    "Total",
    "Payment Made",
    "Balance",
    "Reference",
    "Items"
  ];

  function addSheet(name: string, data: typeof rows) {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C352A" } };
    for (const { detail, group } of data) {
      const phone =
        detail.billing_address?.phone ||
        detail.phone ||
        detail.contact_persons_details?.[0]?.phone ||
        detail.contact_persons_details?.[0]?.mobile ||
        "";
      const items = (detail.line_items ?? [])
        .map((li) => {
          const qty = li.quantity ?? 1;
          const n = li.name || li.description || "Item";
          const sku = li.sku ? ` [${li.sku}]` : "";
          return `${n}${sku} (x${qty})`;
        })
        .join(" | ");
      ws.addRow([
        group,
        detail.invoice_number ?? "",
        detail.date ?? "",
        detail.status ?? "",
        detail.customer_name ?? "",
        detail.email ?? "",
        phone,
        detail.billing_address?.city ?? "",
        detail.billing_address?.state ?? "",
        detail.shipping_address?.city ?? "",
        detail.currency_code ?? "",
        detail.total ?? "",
        detail.payment_made ?? "",
        detail.balance ?? "",
        detail.reference_number ?? "",
        items
      ]);
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  }

  addSheet("All City Invoices", rows);
  addSheet("Mumbai", mumbai);
  addSheet("Kolkata", kolkata);

  const lineSheet = wb.addWorksheet("Line Items");
  lineSheet.addRow([
    "City Group",
    "Invoice Number",
    "Date",
    "Customer",
    "Email",
    "Item",
    "SKU",
    "Qty",
    "Rate",
    "Line Total"
  ]);
  lineSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  lineSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C352A" } };
  let lineCount = 0;
  for (const { detail, group } of rows) {
    for (const li of detail.line_items ?? []) {
      lineCount += 1;
      lineSheet.addRow([
        group,
        detail.invoice_number ?? "",
        detail.date ?? "",
        detail.customer_name ?? "",
        detail.email ?? "",
        li.name || li.description || "",
        li.sku ?? "",
        li.quantity ?? "",
        li.rate ?? "",
        li.item_total ?? ""
      ]);
    }
  }
  summary.getCell("A7").value = "Line-item rows";
  summary.getCell("B7").value = lineCount;
  lineSheet.views = [{ state: "frozen", ySplit: 1 }];

  await wb.xlsx.writeFile(OUT_XLSX);
  console.log(`\nDone → ${OUT_XLSX}`);
  console.log(`Invoices: ${rows.length} | Line items: ${lineCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
