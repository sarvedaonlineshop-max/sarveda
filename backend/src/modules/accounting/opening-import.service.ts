/**
 * Phase 7B — production opening balance CSV/XLSX import + review workbook.
 * Parse/preview only — no DB posting from this module.
 */
import { createHash } from "crypto";

import ExcelJS from "exceljs";

import { prisma } from "../../config/db";

import { AccountingError } from "./accounting-errors";
import { sanitizeSpreadsheetCell } from "./gst-export.service";
import {
  buildOpeningProposal,
  loadOpeningBatchGraph,
  validateOpeningBatch,
  type OpeningBatchGraph
} from "./opening-validation.service";

export type OpeningImportKind =
  | "sku_mapping"
  | "inventory"
  | "bank"
  | "gateway"
  | "ap"
  | "ar"
  | "gst"
  | "equity";

export type OpeningImportRowIssue = {
  rowNumber: number;
  code: string;
  message: string;
  field?: string;
};

export type OpeningImportPreviewResult = {
  kind: OpeningImportKind;
  rowCount: number;
  accepted: number;
  warnings: OpeningImportRowIssue[];
  errors: OpeningImportRowIssue[];
  financialTotals: Record<string, number>;
  proposedGlImpact: Array<{ accountCode: string; debitInPaise: number; creditInPaise: number }>;
  unmappedRefs: string[];
  rows: unknown[];
  formulaInjectionFlags: OpeningImportRowIssue[];
};

const KIND_HEADERS: Record<OpeningImportKind, string[]> = {
  sku_mapping: [
    "NEW_SARVEDA_SKU",
    "LEGACY_SKU",
    "PRODUCT_NAME",
    "VARIANT_LABEL",
    "MATCH_STATUS",
    "OPENING_QTY",
    "UNIT_COST_IN_PAISE",
    "SOURCE",
    "NOTES"
  ],
  inventory: ["SKU", "QUANTITY", "UNIT_COST_IN_PAISE", "SOURCE"],
  bank: [
    "NAME",
    "BANK_NAME",
    "MASKED_ACCOUNT_NUMBER",
    "IFSC",
    "ACCOUNT_TYPE",
    "GL_ACCOUNT_CODE",
    "OPENING_BOOK_BALANCE_IN_PAISE",
    "STATEMENT_BALANCE_IN_PAISE",
    "SOURCE"
  ],
  gateway: [
    "PROVIDER",
    "GL_ACCOUNT_CODE",
    "UNSETTLED_AMOUNT_IN_PAISE",
    "DIRECTION",
    "SOURCE_REFERENCE"
  ],
  ap: [
    "VENDOR_NAME",
    "VENDOR_ID",
    "BILL_NUMBER",
    "BILL_DATE",
    "DUE_DATE",
    "OUTSTANDING_IN_PAISE",
    "GST_COMPONENT_IN_PAISE",
    "TDS_IN_PAISE",
    "CURRENCY",
    "REFERENCE",
    "SOURCE"
  ],
  ar: [
    "CUSTOMER_NAME",
    "CUSTOMER_ID",
    "INVOICE_REFERENCE",
    "INVOICE_DATE",
    "DUE_DATE",
    "OUTSTANDING_IN_PAISE",
    "CURRENCY",
    "SOURCE"
  ],
  gst: ["ACCOUNT_CODE", "BALANCE_IN_PAISE", "SOURCE"],
  equity: ["ACCOUNT_CODE", "AMOUNT_IN_PAISE", "REASON"]
};

function normalizeHeader(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function detectFormulaInjection(value: unknown, rowNumber: number, field: string): OpeningImportRowIssue | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (/^[=+\-@]/.test(s)) {
    return {
      rowNumber,
      code: "FORMULA_INJECTION",
      message: `Cell starts with formula trigger character: ${s.slice(0, 8)}`,
      field
    };
  }
  return null;
}

export function sanitizeImportedString(value: unknown): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (/^[=+\-@]/.test(s)) return s.slice(1).trim();
  return s;
}

function parseIntPaise(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function parseQty(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function mapHeaders(values: ExcelJS.CellValue[], required: string[]): Map<string, number> {
  const map = new Map<string, number>();
  const normalizedRequired = required.map(normalizeHeader);
  values.forEach((cell, idx) => {
    if (idx === 0) return;
    const norm = normalizeHeader(cell);
    if (!norm) return;
    const reqIdx = normalizedRequired.indexOf(norm);
    if (reqIdx >= 0) map.set(required[reqIdx]!, idx);
    else map.set(norm, idx);
  });
  return map;
}

function cellText(row: ExcelJS.Row, headers: Map<string, number>, key: string): string {
  const idx = headers.get(key) ?? headers.get(normalizeHeader(key));
  if (idx == null) return "";
  const cell = row.getCell(idx);
  const raw = cell.text != null && String(cell.text).trim() !== "" ? cell.text : cell.value;
  return sanitizeImportedString(raw);
}

async function loadWorksheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new AccountingError("Workbook has no sheets", "OPENING_IMPORT_MALFORMED");
  return sheet;
}

function parseCsv(buffer: Buffer): string[][] {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    return cols;
  });
}

async function loadRowsFromFile(
  buffer: Buffer,
  filename: string,
  kind: OpeningImportKind
): Promise<Array<{ rowNumber: number; cells: Map<string, string> }>> {
  const required = KIND_HEADERS[kind];
  const lower = filename.toLowerCase();

  if (lower.endsWith(".csv")) {
    const grid = parseCsv(buffer);
    if (grid.length < 2) throw new AccountingError("CSV has no data rows", "OPENING_IMPORT_MALFORMED");
    const headerRow = grid[0]!;
    const headerMap = new Map<string, number>();
    headerRow.forEach((h, i) => headerMap.set(normalizeHeader(h), i));
    for (const req of required) {
      if (!headerMap.has(normalizeHeader(req))) {
        throw new AccountingError(`Missing required column: ${req}`, "OPENING_IMPORT_MALFORMED");
      }
    }
    const out: Array<{ rowNumber: number; cells: Map<string, string> }> = [];
    for (let r = 1; r < grid.length; r++) {
      const row = grid[r]!;
      if (row.every((c) => !String(c).trim())) continue;
      const cells = new Map<string, string>();
      for (const req of required) {
        const idx = headerMap.get(normalizeHeader(req));
        cells.set(req, idx != null ? sanitizeImportedString(row[idx]) : "");
      }
      out.push({ rowNumber: r + 1, cells });
    }
    return out;
  }

  const sheet = await loadWorksheet(buffer);
  const headers = mapHeaders(sheet.getRow(1).values as ExcelJS.CellValue[], required);
  for (const req of required) {
    if (!headers.has(req)) {
      throw new AccountingError(`Missing required column: ${req}`, "OPENING_IMPORT_MALFORMED");
    }
  }
  const out: Array<{ rowNumber: number; cells: Map<string, string> }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = new Map<string, string>();
    let empty = true;
    for (const req of required) {
      const v = cellText(row, headers, req);
      if (v) empty = false;
      cells.set(req, v);
    }
    if (empty) return;
    out.push({ rowNumber, cells });
  });
  return out;
}

function validateMatchStatus(v: string): boolean {
  return ["EXACT", "MANUAL_MATCH", "NEW_SKU", "LEGACY_ONLY", "UNKNOWN"].includes(v.toUpperCase());
}

export async function parseOpeningImportFile(input: {
  kind: OpeningImportKind;
  buffer: Buffer;
  filename: string;
}): Promise<OpeningImportPreviewResult> {
  const { kind, buffer, filename } = input;
  const rawRows = await loadRowsFromFile(buffer, filename, kind);
  const errors: OpeningImportRowIssue[] = [];
  const warnings: OpeningImportRowIssue[] = [];
  const formulaInjectionFlags: OpeningImportRowIssue[] = [];
  const unmappedRefs: string[] = [];
  const parsedRows: unknown[] = [];

  for (const row of rawRows) {
    for (const [field, val] of row.cells) {
      const inj = detectFormulaInjection(val, row.rowNumber, field);
      if (inj) formulaInjectionFlags.push(inj);
    }
  }

  if (formulaInjectionFlags.length > 0) {
    errors.push(...formulaInjectionFlags);
  }

  let financialTotals: Record<string, number> = {};

  switch (kind) {
    case "sku_mapping": {
      for (const row of rawRows) {
        const sku = row.cells.get("NEW_SARVEDA_SKU") ?? "";
        if (!sku) {
          errors.push({ rowNumber: row.rowNumber, code: "MISSING_SKU", message: "NEW_SARVEDA_SKU required" });
          continue;
        }
        const matchStatus = (row.cells.get("MATCH_STATUS") ?? "UNKNOWN").toUpperCase();
        if (!validateMatchStatus(matchStatus)) {
          errors.push({ rowNumber: row.rowNumber, code: "INVALID_MATCH_STATUS", message: "Invalid MATCH_STATUS" });
          continue;
        }
        const qty = parseQty(row.cells.get("OPENING_QTY"));
        const cost = parseIntPaise(row.cells.get("UNIT_COST_IN_PAISE"));
        if (qty == null) errors.push({ rowNumber: row.rowNumber, code: "INVALID_QTY", message: "Invalid OPENING_QTY" });
        if (cost == null)
          errors.push({ rowNumber: row.rowNumber, code: "INVALID_COST", message: "Invalid UNIT_COST_IN_PAISE" });
        const variant = await prisma.productVariant.findUnique({ where: { sku } });
        if (!variant && matchStatus !== "NEW_SKU" && matchStatus !== "LEGACY_ONLY") {
          unmappedRefs.push(sku);
          warnings.push({
            rowNumber: row.rowNumber,
            code: "SKU_NOT_FOUND",
            message: `SKU ${sku} not in catalog`
          });
        }
        parsedRows.push({
          newSarvedaSku: sku,
          legacySku: row.cells.get("LEGACY_SKU") || null,
          productName: row.cells.get("PRODUCT_NAME") || null,
          variantLabel: row.cells.get("VARIANT_LABEL") || null,
          matchStatus,
          openingQty: qty ?? 0,
          unitCostInPaise: cost ?? 0,
          source: row.cells.get("SOURCE") || null,
          notes: row.cells.get("NOTES") || null
        });
      }
      break;
    }
    case "inventory": {
      let totalValue = 0;
      for (const row of rawRows) {
        const sku = row.cells.get("SKU") ?? "";
        if (!sku) {
          errors.push({ rowNumber: row.rowNumber, code: "MISSING_SKU", message: "SKU required" });
          continue;
        }
        const qty = parseQty(row.cells.get("QUANTITY"));
        const cost = parseIntPaise(row.cells.get("UNIT_COST_IN_PAISE"));
        if (qty == null) errors.push({ rowNumber: row.rowNumber, code: "INVALID_QTY", message: "Invalid QUANTITY" });
        if (cost == null)
          errors.push({ rowNumber: row.rowNumber, code: "INVALID_COST", message: "Invalid UNIT_COST_IN_PAISE" });
        const variant = await prisma.productVariant.findUnique({ where: { sku } });
        if (!variant) {
          unmappedRefs.push(sku);
          warnings.push({ rowNumber: row.rowNumber, code: "SKU_NOT_FOUND", message: `SKU ${sku} not found` });
        }
        const lineTotal = (qty ?? 0) * (cost ?? 0);
        totalValue += lineTotal;
        parsedRows.push({
          sku,
          quantity: qty ?? 0,
          unitCostInPaise: cost ?? 0,
          source: row.cells.get("SOURCE") || null
        });
      }
      financialTotals = { inventoryValueInPaise: totalValue };
      break;
    }
    case "bank": {
      let total = 0;
      for (const row of rawRows) {
        const gl = row.cells.get("GL_ACCOUNT_CODE") ?? "";
        const bal = parseIntPaise(row.cells.get("OPENING_BOOK_BALANCE_IN_PAISE"));
        if (!gl) errors.push({ rowNumber: row.rowNumber, code: "MISSING_GL", message: "GL_ACCOUNT_CODE required" });
        if (bal == null)
          errors.push({
            rowNumber: row.rowNumber,
            code: "INVALID_BALANCE",
            message: "Invalid OPENING_BOOK_BALANCE_IN_PAISE"
          });
        total += bal ?? 0;
        parsedRows.push({
          name: row.cells.get("NAME") ?? gl,
          bankName: row.cells.get("BANK_NAME") || null,
          maskedAccountNumber: row.cells.get("MASKED_ACCOUNT_NUMBER") || null,
          ifsc: row.cells.get("IFSC") || null,
          accountType: row.cells.get("ACCOUNT_TYPE") || "BANK",
          glAccountCode: gl,
          openingBookBalanceInPaise: bal ?? 0,
          statementBalanceInPaise: parseIntPaise(row.cells.get("STATEMENT_BALANCE_IN_PAISE")),
          source: row.cells.get("SOURCE") || null
        });
      }
      financialTotals = { bankOpeningInPaise: total };
      break;
    }
    case "gateway": {
      let total = 0;
      for (const row of rawRows) {
        const provider = row.cells.get("PROVIDER") ?? "";
        const gl = row.cells.get("GL_ACCOUNT_CODE") ?? "";
        const amt = parseIntPaise(row.cells.get("UNSETTLED_AMOUNT_IN_PAISE"));
        if (!provider)
          errors.push({ rowNumber: row.rowNumber, code: "MISSING_PROVIDER", message: "PROVIDER required" });
        if (!gl) errors.push({ rowNumber: row.rowNumber, code: "MISSING_GL", message: "GL_ACCOUNT_CODE required" });
        if (amt == null)
          errors.push({ rowNumber: row.rowNumber, code: "INVALID_AMOUNT", message: "Invalid UNSETTLED_AMOUNT_IN_PAISE" });
        total += Math.abs(amt ?? 0);
        parsedRows.push({
          provider: provider.toUpperCase(),
          glAccountCode: gl,
          unsettledAmountInPaise: amt ?? 0,
          direction: (row.cells.get("DIRECTION") || "ASSET").toUpperCase(),
          sourceReference: row.cells.get("SOURCE_REFERENCE") || null
        });
      }
      financialTotals = { gatewayUnsettledInPaise: total };
      break;
    }
    case "ap": {
      let total = 0;
      for (const row of rawRows) {
        const vendor = row.cells.get("VENDOR_NAME") ?? "";
        const bill = row.cells.get("BILL_NUMBER") ?? "";
        const out = parseIntPaise(row.cells.get("OUTSTANDING_IN_PAISE"));
        if (!vendor)
          errors.push({ rowNumber: row.rowNumber, code: "MISSING_VENDOR", message: "VENDOR_NAME required" });
        if (!bill)
          errors.push({ rowNumber: row.rowNumber, code: "MISSING_BILL", message: "BILL_NUMBER required" });
        if (out == null)
          errors.push({
            rowNumber: row.rowNumber,
            code: "INVALID_OUTSTANDING",
            message: "Invalid OUTSTANDING_IN_PAISE"
          });
        total += out ?? 0;
        parsedRows.push({
          vendorName: vendor,
          vendorId: row.cells.get("VENDOR_ID") || null,
          billNumber: bill,
          billDate: row.cells.get("BILL_DATE") || null,
          dueDate: row.cells.get("DUE_DATE") || null,
          outstandingInPaise: out ?? 0,
          gstComponentInPaise: parseIntPaise(row.cells.get("GST_COMPONENT_IN_PAISE")) ?? 0,
          tdsInPaise: parseIntPaise(row.cells.get("TDS_IN_PAISE")) ?? 0,
          currency: row.cells.get("CURRENCY") || "INR",
          reference: row.cells.get("REFERENCE") || null,
          source: row.cells.get("SOURCE") || null
        });
      }
      financialTotals = { apOutstandingInPaise: total };
      break;
    }
    case "ar": {
      let total = 0;
      for (const row of rawRows) {
        const ref = row.cells.get("INVOICE_REFERENCE") ?? "";
        const out = parseIntPaise(row.cells.get("OUTSTANDING_IN_PAISE"));
        if (!ref)
          errors.push({
            rowNumber: row.rowNumber,
            code: "MISSING_INVOICE",
            message: "INVOICE_REFERENCE required"
          });
        if (out == null)
          errors.push({
            rowNumber: row.rowNumber,
            code: "INVALID_OUTSTANDING",
            message: "Invalid OUTSTANDING_IN_PAISE"
          });
        total += out ?? 0;
        parsedRows.push({
          customerName: row.cells.get("CUSTOMER_NAME") ?? ref,
          customerId: row.cells.get("CUSTOMER_ID") || null,
          invoiceReference: ref,
          invoiceDate: row.cells.get("INVOICE_DATE") || null,
          dueDate: row.cells.get("DUE_DATE") || null,
          outstandingInPaise: out ?? 0,
          currency: row.cells.get("CURRENCY") || "INR",
          source: row.cells.get("SOURCE") || null
        });
      }
      financialTotals = { arOutstandingInPaise: total };
      break;
    }
    case "gst": {
      let total = 0;
      for (const row of rawRows) {
        const code = row.cells.get("ACCOUNT_CODE") ?? "";
        const bal = parseIntPaise(row.cells.get("BALANCE_IN_PAISE"));
        if (!code)
          errors.push({ rowNumber: row.rowNumber, code: "MISSING_ACCOUNT", message: "ACCOUNT_CODE required" });
        if (bal == null)
          errors.push({ rowNumber: row.rowNumber, code: "INVALID_BALANCE", message: "Invalid BALANCE_IN_PAISE" });
        total += Math.abs(bal ?? 0);
        parsedRows.push({
          accountCode: code,
          balanceInPaise: bal ?? 0,
          source: row.cells.get("SOURCE") || null
        });
      }
      financialTotals = { gstBalanceInPaise: total };
      break;
    }
    case "equity": {
      let total = 0;
      for (const row of rawRows) {
        const code = row.cells.get("ACCOUNT_CODE") ?? "";
        const amt = parseIntPaise(row.cells.get("AMOUNT_IN_PAISE"));
        if (!code)
          errors.push({ rowNumber: row.rowNumber, code: "MISSING_ACCOUNT", message: "ACCOUNT_CODE required" });
        if (amt == null)
          errors.push({ rowNumber: row.rowNumber, code: "INVALID_AMOUNT", message: "Invalid AMOUNT_IN_PAISE" });
        total += Math.abs(amt ?? 0);
        parsedRows.push({
          accountCode: code,
          amountInPaise: amt ?? 0,
          reason: row.cells.get("REASON") || null
        });
      }
      financialTotals = { equityInPaise: total };
      break;
    }
    default:
      throw new AccountingError(`Unknown import kind: ${kind}`, "OPENING_IMPORT_UNKNOWN_KIND");
  }

  const accepted = parsedRows.length - errors.filter((e) => e.code !== "FORMULA_INJECTION").length;
  const proposedGlImpact = summarizeGlImpact(kind, parsedRows);

  return {
    kind,
    rowCount: rawRows.length,
    accepted: Math.max(0, accepted),
    warnings,
    errors,
    financialTotals,
    proposedGlImpact,
    unmappedRefs: [...new Set(unmappedRefs)],
    rows: parsedRows,
    formulaInjectionFlags
  };
}

function summarizeGlImpact(
  kind: OpeningImportKind,
  rows: unknown[]
): Array<{ accountCode: string; debitInPaise: number; creditInPaise: number }> {
  const impact = new Map<string, { debitInPaise: number; creditInPaise: number }>();
  const add = (code: string, debit: number, credit: number) => {
    const cur = impact.get(code) ?? { debitInPaise: 0, creditInPaise: 0 };
    cur.debitInPaise += debit;
    cur.creditInPaise += credit;
    impact.set(code, cur);
  };

  if (kind === "inventory") {
    const total = (rows as Array<{ quantity: number; unitCostInPaise: number }>).reduce(
      (s, r) => s + r.quantity * r.unitCostInPaise,
      0
    );
    if (total > 0) add("1200", total, 0);
  } else if (kind === "bank") {
    for (const r of rows as Array<{ glAccountCode: string; openingBookBalanceInPaise: number }>) {
      if (r.openingBookBalanceInPaise > 0) add(r.glAccountCode, r.openingBookBalanceInPaise, 0);
      else if (r.openingBookBalanceInPaise < 0) add(r.glAccountCode, 0, -r.openingBookBalanceInPaise);
    }
  } else if (kind === "gateway") {
    for (const r of rows as Array<{
      glAccountCode: string;
      unsettledAmountInPaise: number;
      direction: string;
    }>) {
      const amt = Math.abs(r.unsettledAmountInPaise);
      if (!amt) continue;
      if (r.direction === "LIABILITY" || r.unsettledAmountInPaise < 0) add(r.glAccountCode, 0, amt);
      else add(r.glAccountCode, amt, 0);
    }
  } else if (kind === "ap") {
    const total = (rows as Array<{ outstandingInPaise: number }>).reduce((s, r) => s + r.outstandingInPaise, 0);
    if (total > 0) add("2000", 0, total);
  } else if (kind === "ar") {
    const total = (rows as Array<{ outstandingInPaise: number }>).reduce((s, r) => s + r.outstandingInPaise, 0);
    if (total > 0) add("1100", total, 0);
  } else if (kind === "gst") {
    for (const r of rows as Array<{ accountCode: string; balanceInPaise: number }>) {
      if (r.balanceInPaise > 0) add(r.accountCode, r.balanceInPaise, 0);
      else if (r.balanceInPaise < 0) add(r.accountCode, 0, -r.balanceInPaise);
    }
  } else if (kind === "equity") {
    for (const r of rows as Array<{ accountCode: string; amountInPaise: number }>) {
      if (r.amountInPaise > 0) add(r.accountCode, 0, r.amountInPaise);
      else if (r.amountInPaise < 0) add(r.accountCode, -r.amountInPaise, 0);
    }
  }

  return [...impact.entries()].map(([accountCode, v]) => ({ accountCode, ...v }));
}

export async function buildOpeningTemplateXlsx(kind: OpeningImportKind): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(kind.replace(/_/g, " "));
  const headers = KIND_HEADERS[kind];
  sheet.addRow(headers.map((h) => sanitizeSpreadsheetCell(h)));
  sheet.getRow(1).font = { bold: true };

  if (kind === "inventory") {
    const variants = await prisma.productVariant.findMany({
      where: { inventory: { is: { onHand: { gt: 0 } } } },
      include: { inventory: { select: { onHand: true } } },
      orderBy: { sku: "asc" },
      take: 500
    });
    for (const v of variants) {
      sheet.addRow([
        sanitizeSpreadsheetCell(v.sku),
        v.inventory?.onHand ?? 0,
        "",
        ""
      ]);
    }
  } else if (kind === "gateway") {
    sheet.addRow(["RAZORPAY", "1020", 0, "ASSET", ""]);
    sheet.addRow(["STRIPE", "1021", 0, "ASSET", ""]);
    sheet.addRow(["PAYPAL", "1022", 0, "ASSET", ""]);
  } else if (kind === "gst") {
    for (const code of ["2100", "2101", "2102", "2200", "2201", "2202"]) {
      sheet.addRow([code, 0, ""]);
    }
  } else if (kind === "equity") {
    for (const code of ["3000", "3100", "3900"]) {
      sheet.addRow([code, 0, ""]);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function addReviewSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: string[],
  rows: Record<string, unknown>[]
) {
  const sheet = wb.addWorksheet(name.slice(0, 31));
  sheet.addRow(columns.map((c) => sanitizeSpreadsheetCell(c)));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(columns.map((c) => sanitizeSpreadsheetCell(row[c] ?? "")));
  }
}

export async function buildOpeningReviewWorkbook(batchId: string): Promise<Buffer> {
  const batch = await loadOpeningBatchGraph(batchId);
  if (!batch) throw new AccountingError(`Opening batch not found: ${batchId}`, "OPENING_BATCH_NOT_FOUND", 404);

  const validation = await validateOpeningBatch(batchId);
  const proposal = buildOpeningProposal(batch);

  const wb = new ExcelJS.Workbook();

  addReviewSheet(wb, "Summary", ["Field", "Value"], [
    { Field: "Batch Number", Value: batch.batchNumber },
    { Field: "Status", Value: batch.status },
    { Field: "Effective Date", Value: batch.effectiveDate.toISOString().slice(0, 10) },
    { Field: "Total Debit (paise)", Value: proposal.totalDebitInPaise },
    { Field: "Total Credit (paise)", Value: proposal.totalCreditInPaise },
    { Field: "Balanced", Value: proposal.totalDebitInPaise === proposal.totalCreditInPaise },
    { Field: "Validation", Value: validation.status },
    { Field: "Fingerprint", Value: batch.sourceFingerprint ?? "" }
  ]);

  addReviewSheet(
    wb,
    "Inventory",
    ["SKU", "Qty", "Unit Cost", "Total", "Ops On Hand", "Mismatch", "Review"],
    batch.inventoryLines.map((l) => ({
      SKU: l.sku,
      Qty: l.quantity,
      "Unit Cost": l.unitCostInPaise,
      Total: l.totalCostInPaise,
      "Ops On Hand": l.operationalOnHand,
      Mismatch: l.quantityMismatch,
      Review: l.reviewStatus
    }))
  );

  addReviewSheet(
    wb,
    "Banks",
    ["Name", "GL", "Book Balance", "Statement Balance", "Review"],
    batch.bankLines.map((l) => ({
      Name: l.name,
      GL: l.glAccountCode,
      "Book Balance": l.openingBookBalanceInPaise,
      "Statement Balance": l.statementBalanceInPaise ?? "",
      Review: l.reviewStatus
    }))
  );

  addReviewSheet(
    wb,
    "Gateway",
    ["Provider", "GL", "Unsettled", "Direction", "Review"],
    batch.gatewayLines.map((l) => ({
      Provider: l.provider,
      GL: l.glAccountCode,
      Unsettled: l.unsettledAmountInPaise,
      Direction: l.direction,
      Review: l.reviewStatus
    }))
  );

  addReviewSheet(
    wb,
    "AP",
    ["Vendor", "Bill", "Outstanding", "GST", "Review"],
    batch.apLines.map((l) => ({
      Vendor: l.vendorName,
      Bill: l.billNumber,
      Outstanding: l.outstandingInPaise,
      GST: l.gstComponentInPaise,
      Review: l.reviewStatus
    }))
  );

  addReviewSheet(
    wb,
    "AR",
    ["Customer", "Invoice", "Outstanding", "Review"],
    batch.arLines.map((l) => ({
      Customer: l.customerName,
      Invoice: l.invoiceReference,
      Outstanding: l.outstandingInPaise,
      Review: l.reviewStatus
    }))
  );

  addReviewSheet(
    wb,
    "GST",
    ["Account", "Balance", "Review"],
    batch.gstLines.map((l) => ({
      Account: l.accountCode,
      Balance: l.balanceInPaise,
      Review: l.reviewStatus
    }))
  );

  addReviewSheet(
    wb,
    "Equity",
    ["Account", "Amount", "Review"],
    batch.equityLines.map((l) => ({
      Account: l.accountCode,
      Amount: l.amountInPaise,
      Review: l.reviewStatus
    }))
  );

  addReviewSheet(
    wb,
    "Validation",
    ["Code", "Status", "Message"],
    validation.checks.map((c) => ({
      Code: c.code,
      Status: c.status,
      Message: c.message
    }))
  );

  addReviewSheet(
    wb,
    "Proposed GL",
    ["Account", "Debit", "Credit", "Memo"],
    proposal.lines.map((l) => ({
      Account: l.accountCode,
      Debit: l.debitInPaise,
      Credit: l.creditInPaise,
      Memo: l.memo
    }))
  );

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Merge parsed import rows into staging shape for replaceOpeningStaging. */
export function mapImportRowsToStaging(
  kind: OpeningImportKind,
  rows: unknown[],
  existing: OpeningBatchGraph
): Parameters<typeof import("./opening-batch.service").replaceOpeningStaging>[1] {
  const base = {
    skuMappings: existing.skuMappings.map((m) => ({
      newSarvedaSku: m.newSarvedaSku,
      legacySku: m.legacySku,
      productName: m.productName,
      variantLabel: m.variantLabel,
      matchStatus: m.matchStatus,
      openingQty: m.openingQty,
      unitCostInPaise: m.unitCostInPaise,
      source: m.source,
      reviewStatus: m.reviewStatus,
      notes: m.notes
    })),
    inventoryLines: existing.inventoryLines.map((l) => ({
      sku: l.sku,
      quantity: l.quantity,
      unitCostInPaise: l.unitCostInPaise,
      source: l.source,
      reviewStatus: l.reviewStatus
    })),
    bankLines: existing.bankLines.map((l) => ({
      name: l.name,
      bankName: l.bankName,
      maskedAccountNumber: l.maskedAccountNumber,
      ifsc: l.ifsc,
      accountType: l.accountType,
      glAccountCode: l.glAccountCode,
      openingBookBalanceInPaise: l.openingBookBalanceInPaise,
      statementBalanceInPaise: l.statementBalanceInPaise,
      source: l.source,
      reviewStatus: l.reviewStatus
    })),
    gatewayLines: existing.gatewayLines.map((l) => ({
      provider: l.provider,
      glAccountCode: l.glAccountCode,
      unsettledAmountInPaise: l.unsettledAmountInPaise,
      direction: l.direction,
      sourceReference: l.sourceReference,
      reviewStatus: l.reviewStatus
    })),
    apLines: existing.apLines.map((l) => ({
      vendorName: l.vendorName,
      vendorId: l.vendorId,
      billNumber: l.billNumber,
      billDate: l.billDate?.toISOString().slice(0, 10) ?? null,
      dueDate: l.dueDate?.toISOString().slice(0, 10) ?? null,
      outstandingInPaise: l.outstandingInPaise,
      gstComponentInPaise: l.gstComponentInPaise,
      tdsInPaise: l.tdsInPaise,
      currency: l.currency,
      reference: l.reference,
      source: l.source,
      reviewStatus: l.reviewStatus
    })),
    arLines: existing.arLines.map((l) => ({
      customerName: l.customerName,
      customerId: l.customerId,
      invoiceReference: l.invoiceReference,
      invoiceDate: l.invoiceDate?.toISOString().slice(0, 10) ?? null,
      dueDate: l.dueDate?.toISOString().slice(0, 10) ?? null,
      outstandingInPaise: l.outstandingInPaise,
      currency: l.currency,
      source: l.source,
      reviewStatus: l.reviewStatus
    })),
    gstLines: existing.gstLines.map((l) => ({
      accountCode: l.accountCode,
      balanceInPaise: l.balanceInPaise,
      source: l.source,
      reviewStatus: l.reviewStatus
    })),
    equityLines: existing.equityLines.map((l) => ({
      accountCode: l.accountCode,
      amountInPaise: l.amountInPaise,
      reason: l.reason,
      reviewStatus: l.reviewStatus
    })),
    arApprovedZero: existing.arApprovedZero,
    equity3900Reason: existing.equity3900Reason,
    equity3900Reviewer: existing.equity3900Reviewer,
    equity3900Approved: existing.equity3900Approved
  };

  switch (kind) {
    case "sku_mapping":
      return { ...base, skuMappings: rows as typeof base.skuMappings };
    case "inventory":
      return { ...base, inventoryLines: rows as typeof base.inventoryLines };
    case "bank":
      return { ...base, bankLines: rows as typeof base.bankLines };
    case "gateway":
      return { ...base, gatewayLines: rows as typeof base.gatewayLines };
    case "ap":
      return { ...base, apLines: rows as typeof base.apLines };
    case "ar":
      return { ...base, arLines: rows as typeof base.arLines };
    case "gst":
      return { ...base, gstLines: rows as typeof base.gstLines };
    case "equity":
      return { ...base, equityLines: rows as typeof base.equityLines };
    default:
      return base;
  }
}

export function hashImportPreview(preview: OpeningImportPreviewResult): string {
  return createHash("sha256").update(JSON.stringify(preview.rows)).digest("hex");
}
