/**
 * Import / append Zoho Books historical invoices from xlsx export.
 * Upserts by zohoInvoiceId — safe to re-run and append cutover deltas.
 *
 * Usage:
 *   npx tsx scripts/import-zoho-historical-invoices.ts
 *   npx tsx scripts/import-zoho-historical-invoices.ts --file="../data/All Zoho invoices.xlsx"
 *   npx tsx scripts/import-zoho-historical-invoices.ts --dry-run
 */
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import {
  normalizeZohoChannel,
  reportingInrPaiseFromMinor,
  toMinor,
} from "../src/modules/zoho/zoho-historical-invoices.service";

const prisma = new PrismaClient();

type LineDraft = {
  lineIndex: number;
  itemName: string | null;
  itemDesc: string | null;
  sku: string | null;
  quantity: number;
  unitPriceInMinor: number;
  lineTotalInMinor: number;
  discountInMinor: number;
  taxName: string | null;
  taxPercent: number | null;
  taxAmountInMinor: number;
  hsnSac: string | null;
};

type InvDraft = {
  zohoInvoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  issuedDate: Date | null;
  dueDate: Date | null;
  status: string;
  customerName: string | null;
  customerIdZoho: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  exchangeRate: number | null;
  subtotalInMinor: number;
  discountInMinor: number;
  shippingInMinor: number;
  taxInMinor: number;
  totalInMinor: number;
  balanceInMinor: number;
  reportingTotalInInrPaise: number;
  salesChannelRaw: string | null;
  marketplaceRaw: string | null;
  channelNormalized: string;
  ecomOrderId: string | null;
  ecomInvoiceNo: string | null;
  salesOrderNumber: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingCountry: string | null;
  billingPostalCode: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingCountry: string | null;
  notes: string | null;
  lines: LineDraft[];
};

function str(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s || null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function asDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return new Date(`${m[1]}T00:00:00.000Z`);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  return null;
}

function headerMap(row: ExcelJS.CellValue[]): Map<string, number> {
  const map = new Map<string, number>();
  row.forEach((cell, i) => {
    const h = str(cell);
    if (h) map.set(h, i);
  });
  return map;
}

function cell(row: ExcelJS.CellValue[], headers: Map<string, number>, name: string): unknown {
  const i = headers.get(name);
  if (i == null) return null;
  return row[i];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArgIdx = args.indexOf("--file");
  const defaultXlsx = path.resolve(__dirname, "../../data/All Zoho invoices.xlsx");
  const defaultXls = path.resolve(__dirname, "../../data/All Zoho invoices.xls");
  let file =
    fileArgIdx >= 0 && args[fileArgIdx + 1]
      ? path.resolve(args[fileArgIdx + 1])
      : fs.existsSync(defaultXlsx)
        ? defaultXlsx
        : defaultXls;

  if (!fs.existsSync(file)) {
    console.error("File not found:", file);
    process.exit(1);
  }

  // ExcelJS cannot read classic .xls — convert via LibreOffice if needed
  if (file.toLowerCase().endsWith(".xls") && !file.toLowerCase().endsWith(".xlsx")) {
    const { execSync } = await import("child_process");
    const outDir = path.dirname(file);
    console.log("Converting .xls → .xlsx via LibreOffice…");
    execSync(`libreoffice --headless --convert-to xlsx ${JSON.stringify(file)} --outdir ${JSON.stringify(outDir)}`, {
      stdio: "inherit",
    });
    file = file.replace(/\.xls$/i, ".xlsx");
    if (!fs.existsSync(file)) {
      console.error("Conversion failed, missing:", file);
      process.exit(1);
    }
  }

  console.log("Reading", file, dryRun ? "(dry-run)" : "");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet =
    workbook.getWorksheet("Invoice") ||
    workbook.worksheets.find((w) => /invoice/i.test(w.name)) ||
    workbook.worksheets[0];
  if (!sheet) {
    console.error("No worksheet found");
    process.exit(1);
  }

  const headerRow = sheet.getRow(1).values as ExcelJS.CellValue[];
  // ExcelJS values are 1-indexed
  const values = headerRow.slice(1);
  const headers = headerMap(values);
  console.log("Columns:", headers.size, "Rows:", sheet.rowCount - 1);

  const byId = new Map<string, InvDraft>();
  let lineRows = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const vals = (row.values as ExcelJS.CellValue[]).slice(1);
    const zohoInvoiceId = str(cell(vals, headers, "Invoice ID"));
    const invoiceNumber = str(cell(vals, headers, "Invoice Number"));
    if (!zohoInvoiceId || !invoiceNumber) return;

    lineRows += 1;
    let draft = byId.get(zohoInvoiceId);
    if (!draft) {
      const invoiceDate = asDate(cell(vals, headers, "Invoice Date"));
      if (!invoiceDate) return;

      const currency = (str(cell(vals, headers, "Currency Code")) || "INR").toUpperCase();
      const totalMajor = num(cell(vals, headers, "Total")) || 0;
      const subMajor = num(cell(vals, headers, "SubTotal")) || 0;
      const shipMajor = num(cell(vals, headers, "Shipping Charge")) || 0;
      const discMajor = num(cell(vals, headers, "Entity Discount Amount")) || 0;
      const balMajor = num(cell(vals, headers, "Balance")) || 0;
      const cgst = num(cell(vals, headers, "CGST")) || 0;
      const sgst = num(cell(vals, headers, "SGST")) || 0;
      const igst = num(cell(vals, headers, "IGST")) || 0;
      const taxMajor = cgst + sgst + igst;

      const salesChannelRaw = str(cell(vals, headers, "CF.Sales Channel"));
      const marketplaceRaw = str(cell(vals, headers, "CF.MarketPlace"));
      const customerName = str(cell(vals, headers, "Customer Name"));
      const email = str(cell(vals, headers, "Primary Contact EmailID"));
      const phone =
        str(cell(vals, headers, "Billing Phone")) ||
        str(cell(vals, headers, "Shipping Phone Number")) ||
        str(cell(vals, headers, "Primary Contact Mobile"));

      const totalInMinor = toMinor(totalMajor);
      draft = {
        zohoInvoiceId,
        invoiceNumber,
        invoiceDate,
        issuedDate: asDate(cell(vals, headers, "Issued Date")),
        dueDate: asDate(cell(vals, headers, "Due Date")),
        status: (str(cell(vals, headers, "Invoice Status")) || "unknown").toLowerCase(),
        customerName,
        customerIdZoho: str(cell(vals, headers, "Customer ID")),
        email,
        phone,
        currency,
        exchangeRate: num(cell(vals, headers, "Exchange Rate")),
        subtotalInMinor: toMinor(subMajor),
        discountInMinor: toMinor(discMajor),
        shippingInMinor: toMinor(shipMajor),
        taxInMinor: toMinor(taxMajor),
        totalInMinor,
        balanceInMinor: toMinor(balMajor),
        reportingTotalInInrPaise: reportingInrPaiseFromMinor(currency, totalInMinor),
        salesChannelRaw,
        marketplaceRaw,
        channelNormalized: normalizeZohoChannel({ salesChannelRaw, marketplaceRaw, customerName }),
        ecomOrderId: str(cell(vals, headers, "CF.Ecom Order ID")),
        ecomInvoiceNo: str(cell(vals, headers, "CF.Ecom Sales Invoice No")),
        salesOrderNumber: str(cell(vals, headers, "Sales Order Number")),
        billingCity: str(cell(vals, headers, "Billing City")),
        billingState: str(cell(vals, headers, "Billing State")),
        billingCountry: str(cell(vals, headers, "Billing Country")),
        billingPostalCode: str(cell(vals, headers, "Billing Code")),
        shippingCity: str(cell(vals, headers, "Shipping City")),
        shippingState: str(cell(vals, headers, "Shipping State")),
        shippingCountry: str(cell(vals, headers, "Shipping Country")),
        notes: str(cell(vals, headers, "Notes")),
        lines: [],
      };
      byId.set(zohoInvoiceId, draft);
    }

    draft.lines.push({
      lineIndex: draft.lines.length,
      itemName: str(cell(vals, headers, "Item Name")),
      itemDesc: str(cell(vals, headers, "Item Desc")),
      sku: str(cell(vals, headers, "SKU")),
      quantity: num(cell(vals, headers, "Quantity")) || 0,
      unitPriceInMinor: toMinor(num(cell(vals, headers, "Item Price"))),
      lineTotalInMinor: toMinor(num(cell(vals, headers, "Item Total"))),
      discountInMinor: toMinor(num(cell(vals, headers, "Discount Amount"))),
      taxName: str(cell(vals, headers, "Item Tax")),
      taxPercent: num(cell(vals, headers, "Item Tax %")),
      taxAmountInMinor: toMinor(num(cell(vals, headers, "Item Tax Amount"))),
      hsnSac: str(cell(vals, headers, "HSN/SAC")),
    });
  });

  console.log(`Parsed ${byId.size} invoices from ${lineRows} line rows`);

  if (dryRun) {
    const sample = Array.from(byId.values()).slice(0, 3);
    console.log(JSON.stringify(sample, null, 2));
    await prisma.$disconnect();
    return;
  }

  const sourceFile = path.basename(file);
  let upserted = 0;
  const invoices = Array.from(byId.values());
  const BATCH = 50;

  for (let i = 0; i < invoices.length; i += BATCH) {
    const chunk = invoices.slice(i, i + BATCH);
    await prisma.$transaction(
      async (tx) => {
        for (const inv of chunk) {
          await tx.zohoHistoricalInvoice.upsert({
            where: { zohoInvoiceId: inv.zohoInvoiceId },
            create: {
              zohoInvoiceId: inv.zohoInvoiceId,
              invoiceNumber: inv.invoiceNumber,
              invoiceDate: inv.invoiceDate,
              issuedDate: inv.issuedDate,
              dueDate: inv.dueDate,
              status: inv.status,
              customerName: inv.customerName,
              customerIdZoho: inv.customerIdZoho,
              email: inv.email,
              phone: inv.phone,
              currency: inv.currency,
              exchangeRate: inv.exchangeRate,
              subtotalInMinor: inv.subtotalInMinor,
              discountInMinor: inv.discountInMinor,
              shippingInMinor: inv.shippingInMinor,
              taxInMinor: inv.taxInMinor,
              totalInMinor: inv.totalInMinor,
              balanceInMinor: inv.balanceInMinor,
              reportingTotalInInrPaise: inv.reportingTotalInInrPaise,
              salesChannelRaw: inv.salesChannelRaw,
              marketplaceRaw: inv.marketplaceRaw,
              channelNormalized: inv.channelNormalized,
              ecomOrderId: inv.ecomOrderId,
              ecomInvoiceNo: inv.ecomInvoiceNo,
              salesOrderNumber: inv.salesOrderNumber,
              billingCity: inv.billingCity,
              billingState: inv.billingState,
              billingCountry: inv.billingCountry,
              billingPostalCode: inv.billingPostalCode,
              shippingCity: inv.shippingCity,
              shippingState: inv.shippingState,
              shippingCountry: inv.shippingCountry,
              notes: inv.notes,
              sourceFile,
              lines: {
                create: inv.lines,
              },
            },
            update: {
              invoiceNumber: inv.invoiceNumber,
              invoiceDate: inv.invoiceDate,
              issuedDate: inv.issuedDate,
              dueDate: inv.dueDate,
              status: inv.status,
              customerName: inv.customerName,
              customerIdZoho: inv.customerIdZoho,
              email: inv.email,
              phone: inv.phone,
              currency: inv.currency,
              exchangeRate: inv.exchangeRate,
              subtotalInMinor: inv.subtotalInMinor,
              discountInMinor: inv.discountInMinor,
              shippingInMinor: inv.shippingInMinor,
              taxInMinor: inv.taxInMinor,
              totalInMinor: inv.totalInMinor,
              balanceInMinor: inv.balanceInMinor,
              reportingTotalInInrPaise: inv.reportingTotalInInrPaise,
              salesChannelRaw: inv.salesChannelRaw,
              marketplaceRaw: inv.marketplaceRaw,
              channelNormalized: inv.channelNormalized,
              ecomOrderId: inv.ecomOrderId,
              ecomInvoiceNo: inv.ecomInvoiceNo,
              salesOrderNumber: inv.salesOrderNumber,
              billingCity: inv.billingCity,
              billingState: inv.billingState,
              billingCountry: inv.billingCountry,
              billingPostalCode: inv.billingPostalCode,
              shippingCity: inv.shippingCity,
              shippingState: inv.shippingState,
              shippingCountry: inv.shippingCountry,
              notes: inv.notes,
              sourceFile,
              lines: {
                deleteMany: {},
                create: inv.lines,
              },
            },
          });
          upserted += 1;
        }
      },
      { timeout: 120_000 }
    );
    console.log(`Upserted ${Math.min(i + BATCH, invoices.length)} / ${invoices.length}`);
  }

  console.log(`Done. Upserted ${upserted} invoices. Source: ${sourceFile}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
