import { createHash } from "crypto";

import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";

import {
  normalizeStatementDescription,
  normalizeStatementReference,
  STATEMENT_COLUMN_ALIASES
} from "./bank-statement.constants";
import type { NormalizedBankTransaction, StatementParseRowError } from "./bank-statement.types";

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ");
}

function mapHeaders(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((raw, idx) => {
    const norm = normalizeHeader(raw);
    if (!norm) return;
    for (const [key, aliases] of Object.entries(STATEMENT_COLUMN_ALIASES)) {
      if (map.has(key)) continue;
      if (aliases.some((a) => normalizeHeader(a) === norm)) {
        map.set(key, idx);
      }
    }
  });
  return map;
}

function parseMoneyToPaise(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  const raw = String(value).trim().replace(/,/g, "");
  if (!raw || raw === "-") return null;
  const negative = raw.startsWith("(") && raw.endsWith(")");
  let cleaned = raw.replace(/[₹\s()]/g, "");
  cleaned = cleaned.replace(/^Rs\.?/i, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  const paise = Math.round(num * 100);
  return negative ? -paise : paise;
}

function parseStatementDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === "number" && value > 20000 && value < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return new Date(Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1])));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.text != null && String(cell.text).trim() !== "") return String(cell.text).trim();
  if (typeof cell.value === "number") return String(cell.value);
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  return String(cell.value ?? "").trim();
}

export function hashStatementFile(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function buildTransactionFingerprint(input: {
  bankAccountId: string;
  transactionDate: Date;
  valueDate: Date | null;
  debitInPaise: number;
  creditInPaise: number;
  reference: string | null;
  description: string;
  runningBalanceInPaise: number | null;
}): string {
  const payload = [
    input.bankAccountId,
    input.transactionDate.toISOString().slice(0, 10),
    input.valueDate?.toISOString().slice(0, 10) ?? "",
    input.debitInPaise,
    input.creditInPaise,
    normalizeStatementReference(input.reference),
    normalizeStatementDescription(input.description).toLowerCase(),
    input.runningBalanceInPaise ?? ""
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

type ParsedSheet = {
  headers: string[];
  rows: string[][];
  detectedColumns: Record<string, string | null>;
};

function requiredColumnsPresent(map: Map<string, number>): string[] {
  const missing: string[] = [];
  if (!map.has("transactionDate")) missing.push("transactionDate");
  if (!map.has("debit") && !map.has("credit")) missing.push("debit/credit");
  return missing;
}

function normalizeRow(
  rowNumber: number,
  values: string[],
  headerMap: Map<string, number>
): { tx?: NormalizedBankTransaction; error?: StatementParseRowError } {
  const get = (key: string) => {
    const idx = headerMap.get(key);
    if (idx == null) return undefined;
    return values[idx];
  };

  const transactionDate = parseStatementDate(get("transactionDate"));
  if (!transactionDate) {
    return {
      error: {
        rowNumber,
        code: "INVALID_DATE",
        message: "Missing or invalid transaction date"
      }
    };
  }

  const debitRaw = parseMoneyToPaise(get("debit"));
  const creditRaw = parseMoneyToPaise(get("credit"));
  const debitInPaise = debitRaw != null && debitRaw > 0 ? debitRaw : 0;
  const creditInPaise = creditRaw != null && creditRaw > 0 ? creditRaw : 0;

  if (debitInPaise > 0 && creditInPaise > 0) {
    return {
      error: {
        rowNumber,
        code: "DEBIT_AND_CREDIT",
        message: "Row has both debit and credit populated"
      }
    };
  }
  if (debitInPaise === 0 && creditInPaise === 0) {
    return {
      error: {
        rowNumber,
        code: "NO_AMOUNT",
        message: "Row has neither debit nor credit"
      }
    };
  }

  const valueDateRaw = get("valueDate");
  const valueDate = valueDateRaw ? parseStatementDate(valueDateRaw) : null;
  if (valueDateRaw && !valueDate) {
    return {
      error: { rowNumber, code: "INVALID_VALUE_DATE", message: "Invalid value date" }
    };
  }

  const description = normalizeStatementDescription(get("description"));
  const referenceRaw = get("reference");
  const reference = referenceRaw ? String(referenceRaw).trim().slice(0, 128) : null;
  const balanceRaw = parseMoneyToPaise(get("balance"));
  const runningBalanceInPaise = balanceRaw != null ? Math.abs(balanceRaw) : null;

  return {
    tx: {
      rowNumber,
      transactionDate,
      valueDate,
      description: description || "(no description)",
      reference,
      debitInPaise,
      creditInPaise,
      runningBalanceInPaise
    }
  };
}

function rowsFromSheet(sheet: ParsedSheet): {
  transactions: NormalizedBankTransaction[];
  errors: StatementParseRowError[];
  detectedColumns: Record<string, string | null>;
} {
  const headerMap = mapHeaders(sheet.headers);
  const missing = requiredColumnsPresent(headerMap);
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  const detectedColumns: Record<string, string | null> = {};
  for (const key of Object.keys(STATEMENT_COLUMN_ALIASES)) {
    const idx = headerMap.get(key);
    detectedColumns[key] = idx != null ? sheet.headers[idx] ?? null : null;
  }

  const transactions: NormalizedBankTransaction[] = [];
  const errors: StatementParseRowError[] = [];

  sheet.rows.forEach((values, i) => {
    const rowNumber = i + 2;
    const allEmpty = values.every((v) => !String(v ?? "").trim());
    if (allEmpty) return;
    const result = normalizeRow(rowNumber, values, headerMap);
    if (result.error) errors.push(result.error);
    else if (result.tx) transactions.push(result.tx);
  });

  return { transactions, errors, detectedColumns };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Workbook has no sheets");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cellText(cell);
  });

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      values[col - 1] = cellText(cell);
    });
    rows.push(values);
  });

  return { headers, rows, detectedColumns: {} };
}

function parseCsvBuffer(buffer: Buffer): ParsedSheet {
  const records = parseCsv(buffer, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false
  }) as string[][];
  if (records.length === 0) throw new Error("CSV file is empty");
  const headers = records[0].map((h) => String(h ?? "").trim());
  const rows = records.slice(1);
  return { headers, rows, detectedColumns: {} };
}

export async function parseBankStatementFile(input: {
  buffer: Buffer;
  fileName: string;
}): Promise<{
  transactions: NormalizedBankTransaction[];
  errors: StatementParseRowError[];
  detectedColumns: Record<string, string | null>;
}> {
  const lower = input.fileName.toLowerCase();
  const sheet = lower.endsWith(".xlsx")
    ? await parseXlsx(input.buffer)
    : lower.endsWith(".csv")
      ? parseCsvBuffer(input.buffer)
      : null;
  if (!sheet) throw new Error("Unsupported file type — use CSV or XLSX");
  return rowsFromSheet(sheet);
}

export function findDuplicateRowNumbers(transactions: NormalizedBankTransaction[]): number[] {
  const seen = new Map<string, number>();
  const dupes: number[] = [];
  for (const tx of transactions) {
    const key = [
      tx.transactionDate.toISOString().slice(0, 10),
      tx.debitInPaise,
      tx.creditInPaise,
      normalizeStatementReference(tx.reference),
      normalizeStatementDescription(tx.description).toLowerCase()
    ].join("|");
    const prior = seen.get(key);
    if (prior != null) {
      dupes.push(tx.rowNumber, prior);
    } else {
      seen.set(key, tx.rowNumber);
    }
  }
  return [...new Set(dupes)].sort((a, b) => a - b);
}

export function summarizeStatementTransactions(transactions: NormalizedBankTransaction[]) {
  const dates = transactions.map((t) => t.transactionDate.getTime()).sort((a, b) => a - b);
  const debitTotalInPaise = transactions.reduce((s, t) => s + t.debitInPaise, 0);
  const creditTotalInPaise = transactions.reduce((s, t) => s + t.creditInPaise, 0);
  const balances = transactions.filter((t) => t.runningBalanceInPaise != null);
  return {
    statementFrom: dates.length ? new Date(dates[0]) : null,
    statementTo: dates.length ? new Date(dates[dates.length - 1]) : null,
    openingBalanceInPaise:
      balances.length >= 2
        ? balances[0]!.runningBalanceInPaise! -
          (transactions[0]!.creditInPaise - transactions[0]!.debitInPaise)
        : null,
    closingBalanceInPaise:
      balances.length > 0 ? balances[balances.length - 1]!.runningBalanceInPaise : null,
    debitTotalInPaise,
    creditTotalInPaise
  };
}
