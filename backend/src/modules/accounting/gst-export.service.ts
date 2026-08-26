/**
 * Phase 5D GST XLSX export — same services as UI.
 * Neutralizes spreadsheet formula injection on text cells.
 */
import ExcelJS from "exceljs";

import {
  buildB2bReport,
  buildB2cReport,
  buildCreditNoteReport,
  buildGstDataGapDashboard,
  buildGstReportIntegrity,
  buildGstReportingOverview,
  buildHsnSummaryReport,
  buildOutwardSupplyReport,
  buildRateSummaryReport,
  type GstPeriodOpts
} from "./gst-reporting.service";
import { buildGstLedger } from "./gst-ledger.service";
import { buildItcSummary } from "./itc.service";

/** Prevent Excel formula execution for user-controlled strings. */
export function sanitizeSpreadsheetCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const s = String(value);
  if (/^[=+\-@]/.test(s)) return `'${s}`;
  return s;
}

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width?: number }>,
  rows: Record<string, unknown>[]
) {
  const sheet = wb.addWorksheet(name.slice(0, 31));
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      safe[k] = sanitizeSpreadsheetCell(v);
    }
    sheet.addRow(safe);
  }
}

export async function buildGstExportWorkbook(opts: GstPeriodOpts): Promise<Buffer> {
  const [
    overview,
    outward,
    b2b,
    b2c,
    credit,
    hsn,
    rates,
    ledger,
    itc,
    gaps,
    integrity
  ] = await Promise.all([
    buildGstReportingOverview(opts),
    buildOutwardSupplyReport(opts),
    buildB2bReport(opts),
    buildB2cReport(opts),
    buildCreditNoteReport(opts),
    buildHsnSummaryReport(opts),
    buildRateSummaryReport(opts),
    buildGstLedger(opts),
    buildItcSummary({ month: opts.month }),
    buildGstDataGapDashboard(opts),
    buildGstReportIntegrity(opts)
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sarveda Accounting GST";
  wb.created = new Date();
  wb.description =
    "GSTR-STYLE MANAGEMENT REPORT — NOT A FILED GST RETURN — NOT GSTN SUBMISSION";

  addSheet(
    wb,
    "Overview",
    [
      { header: "Metric", key: "metric", width: 40 },
      { header: "Value (paise)", key: "value", width: 18 },
      { header: "Note", key: "note", width: 50 }
    ],
    [
      { metric: "Disclaimer", value: "", note: overview.disclaimer },
      { metric: "Period from", value: overview.period.from, note: "" },
      { metric: "Period to", value: overview.period.to, note: "" },
      {
        metric: "Output CGST (period)",
        value: overview.outwardSupplies.outputCgstInPaise,
        note: ""
      },
      {
        metric: "Output SGST (period)",
        value: overview.outwardSupplies.outputSgstInPaise,
        note: ""
      },
      {
        metric: "Output IGST (period)",
        value: overview.outwardSupplies.outputIgstInPaise,
        note: ""
      },
      {
        metric: "Total Output GST",
        value: overview.outwardSupplies.totalOutputGstInPaise,
        note: ""
      },
      {
        metric: "Input recognized",
        value: overview.inputTax.recognizedTotalInPaise,
        note: "GL 2200-2202 period"
      },
      {
        metric: "ITC Eligible",
        value: overview.inputTax.eligibleItcInPaise,
        note: "Evidence ELIGIBLE only"
      },
      {
        metric: "ITC Unverified",
        value: overview.inputTax.unverifiedItcInPaise,
        note: ""
      },
      { metric: "ITC Blocked", value: overview.inputTax.blockedItcInPaise, note: "" },
      { metric: "ITC Data Gap", value: overview.inputTax.dataGapItcInPaise, note: "" },
      {
        metric: "Gateway provisional",
        value: overview.inputTax.gatewayProvisionalInPaise,
        note: "5100 — not eligible"
      },
      {
        metric: "ESTIMATED NET GST POSITION",
        value: overview.netPosition.estimatedNetGstPositionInPaise,
        note: overview.netPosition.note
      },
      { metric: "Integrity", value: integrity.status, note: "" }
    ]
  );

  addSheet(
    wb,
    "Outward",
    [
      { header: "Order", key: "orderNumber" },
      { header: "Date", key: "entryDate" },
      { header: "Class", key: "classification" },
      { header: "Supply", key: "supplyType" },
      { header: "POS", key: "placeOfSupplyCode" },
      { header: "Taxable", key: "taxableValueInPaise" },
      { header: "CGST", key: "cgstInPaise" },
      { header: "SGST", key: "sgstInPaise" },
      { header: "IGST", key: "igstInPaise" },
      { header: "Warnings", key: "warnings" }
    ],
    outward.rows.map((r) => ({
      ...r,
      warnings: r.warnings.join("|")
    }))
  );

  addSheet(
    wb,
    "B2B",
    [
      { header: "GSTIN", key: "gstin" },
      { header: "Invoice", key: "invoiceReference" },
      { header: "Date", key: "invoiceDate" },
      { header: "POS", key: "placeOfSupply" },
      { header: "Taxable", key: "taxableValueInPaise" },
      { header: "CGST", key: "cgstInPaise" },
      { header: "SGST", key: "sgstInPaise" },
      { header: "IGST", key: "igstInPaise" },
      { header: "Total", key: "invoiceTotalInPaise" }
    ],
    b2b.rows.length
      ? b2b.rows
      : [{ gstin: "", invoiceReference: b2b.note ?? "No B2B rows", invoiceDate: "", placeOfSupply: "", taxableValueInPaise: 0, cgstInPaise: 0, sgstInPaise: 0, igstInPaise: 0, invoiceTotalInPaise: 0 }]
  );

  addSheet(
    wb,
    "B2C",
    [
      { header: "POS", key: "placeOfSupplyCode" },
      { header: "Supply", key: "supplyType" },
      { header: "Rate", key: "gstRate" },
      { header: "Taxable", key: "taxableValueInPaise" },
      { header: "CGST", key: "cgstInPaise" },
      { header: "SGST", key: "sgstInPaise" },
      { header: "IGST", key: "igstInPaise" },
      { header: "Txns", key: "transactionCount" }
    ],
    b2c.aggregates
  );

  addSheet(
    wb,
    "Credit Notes",
    [
      { header: "Order", key: "orderNumber" },
      { header: "Date", key: "entryDate" },
      { header: "CGST", key: "cgstInPaise" },
      { header: "SGST", key: "sgstInPaise" },
      { header: "IGST", key: "igstInPaise" },
      { header: "Note", key: "note" }
    ],
    credit.fullRefunds
  );

  addSheet(
    wb,
    "HSN Summary",
    [
      { header: "HSN", key: "hsnSac" },
      { header: "Source", key: "hsnSource" },
      { header: "Rate", key: "gstRate" },
      { header: "Taxable", key: "taxableValueInPaise" },
      { header: "CGST", key: "cgstInPaise" },
      { header: "SGST", key: "sgstInPaise" },
      { header: "IGST", key: "igstInPaise" },
      { header: "Warning", key: "warning" }
    ],
    hsn.rows
  );

  addSheet(
    wb,
    "Rate Summary",
    [
      { header: "Rate", key: "rateLabel" },
      { header: "Taxable", key: "taxableValueInPaise" },
      { header: "CGST", key: "cgstInPaise" },
      { header: "SGST", key: "sgstInPaise" },
      { header: "IGST", key: "igstInPaise" },
      { header: "Refund tax", key: "refundTaxInPaise" },
      { header: "Net tax", key: "netTaxInPaise" }
    ],
    rates.rows
  );

  addSheet(
    wb,
    "ITC",
    [
      { header: "Bucket", key: "bucket" },
      { header: "CGST", key: "cgstInPaise" },
      { header: "SGST", key: "sgstInPaise" },
      { header: "IGST", key: "igstInPaise" },
      { header: "Total", key: "totalGstInPaise" },
      { header: "Count", key: "count" }
    ],
    [
      { bucket: "Recognized (Input GL)", ...itc.recognizedInputGst },
      { bucket: "Eligible", ...itc.eligibleInputGst },
      { bucket: "Unverified", ...itc.unverifiedInputGst },
      { bucket: "Blocked", ...itc.blockedInputGst },
      { bucket: "Data gap", ...itc.dataGapInputGst },
      { bucket: "Gateway provisional", ...itc.gatewayProvisionalGst }
    ]
  );

  addSheet(
    wb,
    "GST Ledger",
    [
      { header: "Account", key: "accountCode" },
      { header: "Name", key: "accountName" },
      { header: "Opening", key: "openingBalanceInPaise" },
      { header: "Debit", key: "periodDebitInPaise" },
      { header: "Credit", key: "periodCreditInPaise" },
      { header: "Closing", key: "closingBalanceInPaise" }
    ],
    ledger.accounts
  );

  addSheet(
    wb,
    "Data Gaps",
    [
      { header: "Code", key: "code" },
      { header: "Count", key: "count" },
      { header: "Exposure paise", key: "exposureInPaise" }
    ],
    gaps.gaps
  );

  addSheet(
    wb,
    "Reconciliation",
    [
      { header: "Check", key: "name" },
      { header: "Report", key: "reportTotalInPaise" },
      { header: "Authority", key: "authorityTotalInPaise" },
      { header: "Delta", key: "deltaInPaise" },
      { header: "Pass", key: "pass" },
      { header: "Note", key: "note" }
    ],
    integrity.checks.map((c) => ({
      name: c.name,
      reportTotalInPaise: c.reportTotalInPaise,
      authorityTotalInPaise: c.authorityTotalInPaise,
      deltaInPaise: c.deltaInPaise,
      pass: c.pass,
      note: "note" in c ? (c as { note?: string }).note ?? "" : ""
    }))
  );

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
