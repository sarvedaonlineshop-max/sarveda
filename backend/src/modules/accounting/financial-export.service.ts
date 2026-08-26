/**
 * Phase 6D financial statement exports — same services as UI.
 * Excel formula-injection neutralization; PDF via pdfkit.
 */
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

import { sanitizeSpreadsheetCell } from "./gst-export.service";
import { buildTrialBalance } from "./trial-balance.service";
import { buildGeneralLedger } from "./general-ledger.service";
import { buildProfitLoss } from "./profit-loss.service";
import { buildBalanceSheet } from "./balance-sheet.service";
import { buildFinancialIntegrityReport } from "./financial-integrity.service";

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width?: number }>,
  rows: Record<string, unknown>[]
) {
  const sheet = wb.addWorksheet(name.slice(0, 31));
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      safe[k] = sanitizeSpreadsheetCell(v);
    }
    sheet.addRow(safe);
  }
}

function paiseToRupees(p: number): number {
  return Math.round(p) / 100;
}

export async function buildFinancialStatementsWorkbook(input: {
  asOf: string;
  from: string;
  to: string;
}): Promise<{ buffer: Buffer; totals: Record<string, number> }> {
  const [tb, pl, bs, integrity] = await Promise.all([
    buildTrialBalance({ asOf: input.asOf }),
    buildProfitLoss({ from: input.from, to: input.to }),
    buildBalanceSheet({ asOf: input.asOf }),
    buildFinancialIntegrityReport({ asOf: input.asOf, from: input.from, to: input.to })
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sarveda Native Accounting";
  wb.created = new Date();
  wb.description =
    "Native financial statements from POSTED GL — not production cutover truth while TEST fixtures remain";

  addSheet(
    wb,
    "Trial Balance",
    [
      { header: "Code", key: "code", width: 10 },
      { header: "Account", key: "name", width: 32 },
      { header: "Class", key: "reportClass", width: 22 },
      { header: "Close Dr (₹)", key: "closeDr", width: 14 },
      { header: "Close Cr (₹)", key: "closeCr", width: 14 }
    ],
    [
      ...tb.rows.map((r) => ({
        code: r.accountCode,
        name: r.accountName,
        reportClass: r.reportClass,
        closeDr: paiseToRupees(r.closingDebitInPaise),
        closeCr: paiseToRupees(r.closingCreditInPaise)
      })),
      {
        code: "TOTAL",
        name: tb.balanced ? "BALANCED" : `OUT OF BALANCE var ${tb.varianceInPaise}`,
        reportClass: "",
        closeDr: paiseToRupees(tb.totals.closingDebitInPaise),
        closeCr: paiseToRupees(tb.totals.closingCreditInPaise)
      }
    ]
  );

  addSheet(
    wb,
    "Profit & Loss",
    [
      { header: "Line", key: "line", width: 40 },
      { header: "Accounts", key: "accounts", width: 20 },
      { header: "Amount (₹)", key: "amount", width: 14 }
    ],
    [
      {
        line: "Gross Product Sales",
        accounts: "4000",
        amount: paiseToRupees(pl.totals.grossProductSalesInPaise)
      },
      {
        line: "Discounts",
        accounts: "4200",
        amount: paiseToRupees(pl.totals.discountsInPaise)
      },
      {
        line: "Net Product Sales",
        accounts: "",
        amount: paiseToRupees(pl.totals.netProductSalesInPaise)
      },
      {
        line: "Shipping Revenue",
        accounts: "4100",
        amount: paiseToRupees(pl.totals.shippingRevenueInPaise)
      },
      {
        line: "Total Operating Revenue",
        accounts: "",
        amount: paiseToRupees(pl.totals.totalOperatingRevenueInPaise)
      },
      { line: "COGS", accounts: "5000", amount: paiseToRupees(pl.totals.cogsInPaise) },
      {
        line: "Gross Profit",
        accounts: "",
        amount: paiseToRupees(pl.totals.grossProfitInPaise)
      },
      {
        line: "Operating Expenses",
        accounts: "",
        amount: paiseToRupees(pl.totals.operatingExpensesInPaise)
      },
      {
        line: "Other Income",
        accounts: "4500",
        amount: paiseToRupees(pl.totals.otherIncomeInPaise)
      },
      {
        line: "Net Profit/(Loss)",
        accounts: "",
        amount: paiseToRupees(pl.totals.netProfitInPaise)
      }
    ]
  );

  const bsRows: Record<string, unknown>[] = [];
  for (const [section, lines] of [
    ["ASSETS", bs.sections.assets],
    ["LIABILITIES", bs.sections.liabilities],
    ["EQUITY", bs.sections.equity]
  ] as const) {
    bsRows.push({ section, line: section, accounts: "", amount: "" });
    for (const l of lines) {
      bsRows.push({
        section,
        line: l.label,
        accounts: l.accountCodes.join(","),
        amount: paiseToRupees(l.amountInPaise)
      });
      for (const c of l.children ?? []) {
        bsRows.push({
          section,
          line: `  ${c.label}`,
          accounts: c.accountCodes.join(","),
          amount: paiseToRupees(c.amountInPaise)
        });
      }
    }
  }
  bsRows.push({
    section: "TOTALS",
    line: bs.totals.balanced ? "BALANCED" : `DIFF ${bs.totals.differenceInPaise}`,
    accounts: "",
    amount: paiseToRupees(bs.totals.totalAssetsInPaise)
  });

  addSheet(
    wb,
    "Balance Sheet",
    [
      { header: "Section", key: "section", width: 14 },
      { header: "Line", key: "line", width: 44 },
      { header: "Accounts", key: "accounts", width: 18 },
      { header: "Amount (₹)", key: "amount", width: 14 }
    ],
    bsRows
  );

  addSheet(
    wb,
    "Integrity Summary",
    [
      { header: "Code", key: "code", width: 36 },
      { header: "Status", key: "status", width: 12 },
      { header: "Severity", key: "severity", width: 10 },
      { header: "Variance (paise)", key: "variance", width: 16 },
      { header: "Message", key: "message", width: 60 }
    ],
    integrity.checks.map((c) => ({
      code: c.code,
      status: c.status,
      severity: c.severity,
      variance: c.varianceInPaise,
      message: c.message
    }))
  );

  // Injection canary sheet
  addSheet(
    wb,
    "Meta",
    [
      { header: "Key", key: "k", width: 24 },
      { header: "Value", key: "v", width: 60 }
    ],
    [
      { k: "asOf", v: input.asOf },
      { k: "from", v: input.from },
      { k: "to", v: input.to },
      { k: "overall", v: integrity.overallStatus },
      { k: "productionCutoverReady", v: "false" },
      { k: "formula_injection_sample", v: "=CMD|' /C calc'!A0" }
    ]
  );

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    buffer,
    totals: {
      tbClosingDebitInPaise: tb.totals.closingDebitInPaise,
      tbClosingCreditInPaise: tb.totals.closingCreditInPaise,
      plNetProfitInPaise: pl.totals.netProfitInPaise,
      bsAssetsInPaise: bs.totals.totalAssetsInPaise,
      bsLiabilitiesInPaise: bs.totals.totalLiabilitiesInPaise,
      bsEquityInPaise: bs.totals.totalEquityInPaise,
      bsDifferenceInPaise: bs.totals.differenceInPaise
    }
  };
}

export async function buildGeneralLedgerWorkbook(input: {
  accountCode: string;
  from: string;
  to: string;
}): Promise<{ buffer: Buffer; closingBalanceInPaise: number }> {
  const gl = await buildGeneralLedger({
    accountCode: input.accountCode,
    from: input.from,
    to: input.to,
    limit: 200,
    offset: 0
  });
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sarveda Native Accounting";
  addSheet(
    wb,
    "General Ledger",
    [
      { header: "Date", key: "date", width: 12 },
      { header: "Journal", key: "journal", width: 16 },
      { header: "Description", key: "desc", width: 40 },
      { header: "Event", key: "event", width: 22 },
      { header: "Debit (₹)", key: "dr", width: 12 },
      { header: "Credit (₹)", key: "cr", width: 12 },
      { header: "Running (₹)", key: "run", width: 12 },
      { header: "Orphan", key: "orphan", width: 10 }
    ],
    [
      {
        date: "",
        journal: "OPENING",
        desc: `${gl.accountCode} ${gl.accountName}`,
        event: "",
        dr: "",
        cr: "",
        run: paiseToRupees(gl.openingBalanceInPaise),
        orphan: ""
      },
      ...gl.lines.map((l) => ({
        date: l.entryDate,
        journal: l.journalNumber,
        desc: l.description ?? l.lineMemo ?? "",
        event: l.eventType ?? "",
        dr: paiseToRupees(l.debitInPaise),
        cr: paiseToRupees(l.creditInPaise),
        run: paiseToRupees(l.runningBalanceInPaise),
        orphan: l.orphanJournal ? "YES" : ""
      })),
      {
        date: "",
        journal: "CLOSING",
        desc: "",
        event: "",
        dr: paiseToRupees(gl.periodDebitInPaise),
        cr: paiseToRupees(gl.periodCreditInPaise),
        run: paiseToRupees(gl.closingBalanceInPaise),
        orphan: ""
      }
    ]
  );
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, closingBalanceInPaise: gl.closingBalanceInPaise };
}

function pdfBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

export async function buildProfitLossPdf(input: {
  from: string;
  to: string;
}): Promise<{ buffer: Buffer; netProfitInPaise: number }> {
  const pl = await buildProfitLoss(input);
  const buffer = await pdfBuffer((doc) => {
    doc.fontSize(16).text("Sarveda — Profit & Loss", { align: "left" });
    doc.fontSize(10).fillColor("#444").text(`Period ${input.from} → ${input.to}`);
    doc.text(`Generated ${new Date().toISOString()}`);
    doc.moveDown();
    doc.fillColor("#000").fontSize(11);
    const rows: Array<[string, number]> = [
      ["Gross Product Sales", pl.totals.grossProductSalesInPaise],
      ["Less: Discounts", pl.totals.discountsInPaise],
      ["Net Product Sales", pl.totals.netProductSalesInPaise],
      ["Shipping Revenue", pl.totals.shippingRevenueInPaise],
      ["Total Operating Revenue", pl.totals.totalOperatingRevenueInPaise],
      ["COGS", pl.totals.cogsInPaise],
      ["Gross Profit", pl.totals.grossProfitInPaise],
      ["Operating Expenses", pl.totals.operatingExpensesInPaise],
      ["Other Income", pl.totals.otherIncomeInPaise],
      ["Net Profit/(Loss)", pl.totals.netProfitInPaise]
    ];
    for (const [label, amt] of rows) {
      doc.text(`${label}: ₹${(amt / 100).toFixed(2)}`);
    }
    doc.moveDown();
    doc.text(
      `Integrity: ${pl.integrity.status} (variance ${pl.integrity.varianceInPaise} paise)`
    );
  });
  return { buffer, netProfitInPaise: pl.totals.netProfitInPaise };
}

export async function buildBalanceSheetPdf(input: {
  asOf: string;
}): Promise<{ buffer: Buffer; assetsInPaise: number; differenceInPaise: number }> {
  const bs = await buildBalanceSheet(input);
  const buffer = await pdfBuffer((doc) => {
    doc.fontSize(16).text("Sarveda — Balance Sheet", { align: "left" });
    doc.fontSize(10).fillColor("#444").text(`As of ${input.asOf} · ${bs.fy.label}`);
    doc.text(`Generated ${new Date().toISOString()}`);
    doc.moveDown();
    doc.fillColor("#000").fontSize(11);
    doc.text(`Total Assets: ₹${(bs.totals.totalAssetsInPaise / 100).toFixed(2)}`);
    doc.text(`Total Liabilities: ₹${(bs.totals.totalLiabilitiesInPaise / 100).toFixed(2)}`);
    doc.text(`Total Equity: ₹${(bs.totals.totalEquityInPaise / 100).toFixed(2)}`);
    doc.text(
      bs.totals.balanced
        ? "BALANCED"
        : `OUT OF BALANCE: ${bs.totals.differenceInPaise} paise`
    );
    doc.moveDown();
    doc.text(
      `Current FY earnings: ₹${(bs.earnings.currentFyEarningsInPaise / 100).toFixed(2)}`
    );
    doc.text(
      `Prior unclosed earnings: ₹${(bs.earnings.priorUnclosedEarningsInPaise / 100).toFixed(2)}`
    );
  });
  return {
    buffer,
    assetsInPaise: bs.totals.totalAssetsInPaise,
    differenceInPaise: bs.totals.differenceInPaise
  };
}

export async function buildTrialBalancePdf(input: {
  asOf: string;
}): Promise<{ buffer: Buffer; closingDebitInPaise: number; closingCreditInPaise: number }> {
  const tb = await buildTrialBalance(input);
  const buffer = await pdfBuffer((doc) => {
    doc.fontSize(16).text("Sarveda — Trial Balance", { align: "left" });
    doc.fontSize(10).fillColor("#444").text(`As of ${input.asOf}`);
    doc.text(`Generated ${new Date().toISOString()}`);
    doc.moveDown();
    doc.fillColor("#000").fontSize(10);
    for (const r of tb.rows.slice(0, 60)) {
      doc.text(
        `${r.accountCode} ${r.accountName}: Dr ${(r.closingDebitInPaise / 100).toFixed(2)}  Cr ${(r.closingCreditInPaise / 100).toFixed(2)}`
      );
    }
    if (tb.rows.length > 60) doc.text(`… ${tb.rows.length - 60} more accounts`);
    doc.moveDown();
    doc.fontSize(11).text(
      `TOTAL Dr ${(tb.totals.closingDebitInPaise / 100).toFixed(2)}  Cr ${(tb.totals.closingCreditInPaise / 100).toFixed(2)}`
    );
    doc.text(tb.balanced ? "BALANCED" : `OUT OF BALANCE ${tb.varianceInPaise} paise`);
  });
  return {
    buffer,
    closingDebitInPaise: tb.totals.closingDebitInPaise,
    closingCreditInPaise: tb.totals.closingCreditInPaise
  };
}
