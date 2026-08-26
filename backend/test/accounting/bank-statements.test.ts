import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import {
  AccountingBankStatementImportDisabledError,
  BankStatementDuplicateFileError,
  BankStatementImportError
} from "../../src/modules/accounting/accounting-errors";
import { assertBankStatementImportAllowed } from "../../src/modules/accounting/production-guard";
import { createBankAccount } from "../../src/modules/accounting/bank-account.service";
import { createBankTransferDraft } from "../../src/modules/accounting/bank-transfer.service";
import { postBankTransfer } from "../../src/modules/accounting/bank-transfer-posting.service";
import {
  commitBankStatementImport,
  previewBankStatementImport
} from "../../src/modules/accounting/bank-statement-import.service";
import {
  confirmStatementMatch,
  rejectStatementCandidate,
  runStatementMatchingForImport,
  unmatchStatementLine
} from "../../src/modules/accounting/bank-statement-matching.service";
import { buildPaymentGatewaySettledJournal } from "../../src/modules/accounting/settlement-journal.builder";
import { postJournalFromEvent } from "../../src/modules/accounting/posting-event.service";
import { PAYMENT_GATEWAY_SETTLED_EVENT_TYPE } from "../../src/modules/accounting/settlement.constants";
import { buildVendorPaymentMadeJournal } from "../../src/modules/accounting/vendor-payment-journal.builder";
import { seedAccountingChartOfAccounts, getAccountingAccountByCode } from "../../src/modules/accounting/seed-coa";
import { cleanupAccountingTestData, prisma } from "../helpers/commerce";

const bankIds: string[] = [];

function csvStatement(rows: string[][]) {
  const header = "Transaction Date,Description,Reference,Debit,Credit,Balance";
  const body = rows.map((r) => r.join(",")).join("\n");
  return Buffer.from(`${header}\n${body}`, "utf8");
}

async function xlsxStatement(rows: Array<[string, string, string, string, string, string]>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Statement");
  ws.addRow(["Transaction Date", "Description", "Reference", "Debit", "Credit", "Balance"]);
  for (const row of rows) ws.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function createTestBank(code: string, name: string) {
  const row = await createBankAccount({
    name,
    bankName: "TEST",
    glAccountCode: code,
    accountType: "BANK",
    createGlIfMissing: true,
    statementImportEnabled: true
  });
  bankIds.push(row.id);
  return row;
}

async function postSettlementToBank(bankAccountId: string, bankGl: string, utr: string, netInPaise: number) {
  const proposal = buildPaymentGatewaySettledJournal(
    {
      provider: "RAZORPAY",
      providerSettlementId: `setl-${utr}`,
      currency: "INR",
      settledAt: new Date("2026-08-25"),
      utr,
      grossInPaise: netInPaise + 2000,
      feeInPaise: 2000,
      taxInPaise: 0,
      netInPaise,
      sourcePayloadHash: utr,
      header: { id: utr, amount: netInPaise, created_at: 0 },
      reconLines: [],
      mappedLines: [
        {
          lineType: "PAYMENT",
          providerEntityId: "pay_test",
          amountInPaise: netInPaise + 2000,
          feeInPaise: 0,
          taxInPaise: 0,
          debitInPaise: 0,
          creditInPaise: 0,
          providerPaymentId: "pay_test",
          providerRefundId: null,
          paymentId: null,
          orderId: null,
          mappingStatus: "MAPPED",
          rawPayload: {},
          sortOrder: 0
        }
      ]
    },
    { failOnImbalance: false, targetBankGlCode: bankGl }
  );
  const codes = [...new Set(proposal.lines.map((l) => l.accountCode))];
  const accountIds = new Map<string, string>();
  for (const code of codes) {
    const acct = await getAccountingAccountByCode(code);
    if (acct) accountIds.set(code, acct.id);
  }
  const posted = await postJournalFromEvent({
    eventType: PAYMENT_GATEWAY_SETTLED_EVENT_TYPE,
    sourceType: "GATEWAY_SETTLEMENT",
    sourceId: utr,
    uniqueKey: `gateway_settlement:RAZORPAY:${utr}`,
    payloadJson: { utr },
    entryDate: new Date("2026-08-25"),
    memo: proposal.memo,
    currency: "INR",
    lines: proposal.lines.map((line, index) => ({
      accountId: accountIds.get(line.accountCode)!,
      debitInPaise: line.debitInPaise,
      creditInPaise: line.creditInPaise,
      lineMemo: line.lineMemo,
      sortOrder: index
    }))
  });
  await prisma.accountingGatewaySettlement.create({
    data: {
      provider: "RAZORPAY",
      providerSettlementId: `setl-${utr}`,
      currency: "INR",
      settledAt: new Date("2026-08-25"),
      utr,
      targetBankAccountId: bankAccountId,
      grossInPaise: netInPaise + 2000,
      feeInPaise: 2000,
      taxInPaise: 0,
      netInPaise,
      status: "POSTED",
      sourcePayloadHash: utr,
      journalEntryId: posted.journal.id,
      postingEventId: posted.event.id
    }
  });
  return posted;
}

describe("Phase 4C bank statement import + matching", () => {
  const origNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const origBanking = process.env.ACCOUNTING_BANKING_ENABLED;
  const origStmt = process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED;
  const origProd = process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_BANKING_ENABLED = "1";
    process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_BANKING_ENABLED = "1";
    process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    bankIds.length = 0;
  });

  afterEach(async () => {
    for (const id of bankIds.splice(0)) {
      await prisma.accountingBankAccount.deleteMany({ where: { id } }).catch(() => undefined);
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = origNative;
    process.env.ACCOUNTING_BANKING_ENABLED = origBanking;
    process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED = origStmt;
    if (origProd) process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = origProd;
    else delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
  });

  it("previews valid XLSX", async () => {
    const bank = await createTestBank("1044", "TEST-ACC-STMT-XLSX");
    const buf = await xlsxStatement([
      ["2026-08-25", "NEFT CR", "UTR9999999999", "", "100.00", "100.00"]
    ]);
    const preview = await previewBankStatementImport({
      bankAccountId: bank.id,
      fileName: "TEST-ACC-STMT.xlsx",
      buffer: buf
    });
    expect(preview.validRowCount).toBe(1);
    expect(preview.creditTotalInPaise).toBe(10000);
    expect(preview.canCommit).toBe(true);
  });

  it("blocks unsupported file type", async () => {
    const bank = await createTestBank("1045", "TEST-ACC-STMT-BADTYPE");
    await expect(
      previewBankStatementImport({
        bankAccountId: bank.id,
        fileName: "bad.txt",
        buffer: Buffer.from("not a statement")
      })
    ).rejects.toThrow(BankStatementImportError);
  });

  it("flags OFF block statement import", () => {
    process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED = "0";
    expect(() => assertBankStatementImportAllowed()).toThrow(AccountingBankStatementImportDisabledError);
  });

  it("previews valid CSV", async () => {
    const bank = await createTestBank("1031", "TEST-ACC-STMT-BANK");
    const buf = csvStatement([
      ["2026-08-25", "NEFT CR", "UTR1234567890", "", "965.00", "965.00"],
      ["2026-08-26", "Bank charges", "", "590.00", "", "959.10"]
    ]);
    const preview = await previewBankStatementImport({
      bankAccountId: bank.id,
      fileName: "TEST-ACC-STMT.csv",
      buffer: buf
    });
    expect(preview.validRowCount).toBe(2);
    expect(preview.canCommit).toBe(true);
    expect(preview.debitTotalInPaise).toBe(59000);
    expect(preview.creditTotalInPaise).toBe(96500);
  });

  it("blocks cash account statement import", async () => {
    const cash = await createBankAccount({
      name: "TEST-ACC-STMT-CASH",
      glAccountCode: "1032",
      accountType: "CASH",
      createGlIfMissing: true
    });
    bankIds.push(cash.id);
    const buf = csvStatement([["2026-08-25", "x", "", "", "100", "100"]]);
    await expect(
      previewBankStatementImport({
        bankAccountId: cash.id,
        fileName: "t.csv",
        buffer: buf
      })
    ).rejects.toThrow(BankStatementImportError);
  });

  it("blocks malformed debit and credit row", async () => {
    const bank = await createTestBank("1033", "TEST-ACC-STMT-VAL");
    const buf = csvStatement([["2026-08-25", "both", "", "100", "200", ""]]);
    const preview = await previewBankStatementImport({
      bankAccountId: bank.id,
      fileName: "bad.csv",
      buffer: buf
    });
    expect(preview.canCommit).toBe(false);
    expect(preview.invalidRows.length).toBe(1);
  });

  it("blocks duplicate file import", async () => {
    const bank = await createTestBank("1034", "TEST-ACC-STMT-DUP");
    const buf = csvStatement([["2026-08-25", "one", "REF1", "", "1000.00", "1000.00"]]);
    await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "dup.csv",
      buffer: buf
    });
    await expect(
      previewBankStatementImport({ bankAccountId: bank.id, fileName: "dup.csv", buffer: buf })
    ).rejects.toThrow(BankStatementDuplicateFileError);
  });

  it("import creates no GL journal", async () => {
    const bank = await createTestBank("1035", "TEST-ACC-STMT-NOGL");
    const before = await prisma.accountingJournalEntry.count();
    const buf = csvStatement([["2026-08-25", "charge", "", "590", "", ""]]);
    await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "nogl.csv",
      buffer: buf
    });
    const after = await prisma.accountingJournalEntry.count();
    expect(after).toBe(before);
  });

  it("exact Razorpay settlement UTR match auto-confirms", async () => {
    const bank = await createTestBank("1036", "TEST-ACC-STMT-RZP");
    const utr = "TESTACCUTR123456";
    await postSettlementToBank(bank.id, bank.glAccountCode, utr, 96500);
    const buf = csvStatement([["2026-08-25", "Razorpay settlement", utr, "", "965.00", "96500"]]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "rzp.csv",
      buffer: buf
    });
    const line = imp.lines[0]!;
    expect(line.creditInPaise).toBe(96500);
    const matchCount = await prisma.accountingBankStatementMatch.count({
      where: { statementLineId: line.id }
    });
    expect(matchCount).toBeGreaterThan(0);
    expect(line.matchStatus).toBe("MATCHED_EXACT");
    expect(line.matches.some((m) => m.status === "CONFIRMED")).toBe(true);
  });

  it("amount-only line does not auto-match", async () => {
    const bank = await createTestBank("1037", "TEST-ACC-STMT-AMT");
    await postSettlementToBank(bank.id, bank.glAccountCode, "OTHERUTR999999", 50000);
    const buf = csvStatement([["2026-08-30", "unknown credit", "", "", "500.00", "500.00"]]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "amt.csv",
      buffer: buf
    });
    const line = imp.lines[0]!;
    expect(line.matchStatus).not.toBe("MATCHED_EXACT");
    expect(line.matches.filter((m) => m.status === "CONFIRMED")).toHaveLength(0);
  });

  it("bank transfer debit and credit legs match same journal", async () => {
    const hdfc = await createTestBank("1038", "TEST-ACC-STMT-HDFC");
    const icici = await createTestBank("1039", "TEST-ACC-STMT-ICICI");
    const cash = await createBankAccount({
      name: "TEST-ACC-STMT-CASH2",
      glAccountCode: "1040",
      accountType: "CASH",
      createGlIfMissing: true
    });
    bankIds.push(cash.id);
    const draft = await createBankTransferDraft({
      transferDate: new Date("2026-08-25"),
      amountInPaise: 100000,
      transferKind: "INTERNAL_TRANSFER",
      sourceBankAccountId: hdfc.id,
      destinationBankAccountId: icici.id,
      reference: "TESTACCXFER999"
    });
    await postBankTransfer(draft.id, { forcePersist: true });

    const hdfcStmt = csvStatement([
      ["2026-08-25", "Transfer out", "TESTACCXFER999", "1000.00", "", "0"]
    ]);
    const iciciStmt = csvStatement([
      ["2026-08-25", "Transfer in", "TESTACCXFER999", "", "1000.00", "1000.00"]
    ]);
    const hImp = await commitBankStatementImport({
      bankAccountId: hdfc.id,
      fileName: "h.csv",
      buffer: hdfcStmt
    });
    const iImp = await commitBankStatementImport({
      bankAccountId: icici.id,
      fileName: "i.csv",
      buffer: iciciStmt
    });
    expect(hImp.lines[0]!.matchStatus).toBe("MATCHED_EXACT");
    expect(iImp.lines[0]!.matchStatus).toBe("MATCHED_EXACT");
    expect(hImp.lines[0]!.matches[0]?.journalEntryId).toBe(iImp.lines[0]!.matches[0]?.journalEntryId);
  });

  it("unmatched bank charge stays unmatched", async () => {
    const bank = await createTestBank("1041", "TEST-ACC-STMT-CHG");
    const buf = csvStatement([["2026-08-25", "BANK CHARGES", "", "590", "", ""]]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "chg.csv",
      buffer: buf
    });
    expect(imp.lines[0]!.matchStatus).toBe("UNMATCHED");
  });

  it("manual confirm and unmatch", async () => {
    const bank = await createTestBank("1042", "TEST-ACC-STMT-MAN");
    await postSettlementToBank(bank.id, bank.glAccountCode, "MANUALUTR111111", 25000);
    const buf = csvStatement([["2026-08-30", "maybe", "", "", "250.00", "250.00"]]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "man.csv",
      buffer: buf
    });
    const line = imp.lines[0]!;
    const candidate = line.matches.find((m) => m.status === "CANDIDATE");
    expect(candidate).toBeTruthy();
    await confirmStatementMatch({
      lineId: line.id,
      journalEntryId: candidate!.journalEntryId
    });
    const confirmed = await prisma.accountingBankStatementLine.findUniqueOrThrow({
      where: { id: line.id }
    });
    expect(confirmed.matchStatus).toBe("MATCHED_MANUAL");
    await unmatchStatementLine({ lineId: line.id });
    const unmatched = await prisma.accountingBankStatementLine.findUniqueOrThrow({
      where: { id: line.id }
    });
    expect(unmatched.matchStatus).not.toBe("MATCHED_MANUAL");
  });

  it("rerun matching is idempotent for confirmed exact", async () => {
    const bank = await createTestBank("1043", "TEST-ACC-STMT-RE");
    const utr = "REPLAYUTR222222";
    await postSettlementToBank(bank.id, bank.glAccountCode, utr, 10000);
    const buf = csvStatement([["2026-08-25", "settlement", utr, "", "100.00", "100.00"]]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "re.csv",
      buffer: buf
    });
    await runStatementMatchingForImport(imp.id);
    const matches = await prisma.accountingBankStatementMatch.count({
      where: { statementLineId: imp.lines[0]!.id, status: "CONFIRMED" }
    });
    expect(matches).toBe(1);
  });

  it("rejects confirmed match only via unmatch — rejectCandidate forbidden", async () => {
    const bank = await createTestBank("1044", "TEST-ACC-STMT-REJ");
    const utr = "REJECTUTR333333";
    await postSettlementToBank(bank.id, bank.glAccountCode, utr, 15000);
    const buf = csvStatement([["2026-08-25", "settlement", utr, "", "150.00", "150.00"]]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "rej.csv",
      buffer: buf
    });
    const line = imp.lines[0]!;
    const confirmed = line.matches.find((m) => m.status === "CONFIRMED");
    expect(confirmed).toBeTruthy();
    await expect(
      rejectStatementCandidate({ lineId: line.id, matchId: confirmed!.id })
    ).rejects.toMatchObject({ code: "CONFIRMED_MATCH_REJECT_FORBIDDEN" });
    const still = await prisma.accountingBankStatementMatch.findUniqueOrThrow({
      where: { id: confirmed!.id }
    });
    expect(still.status).toBe("CONFIRMED");
  });

  it("blocks confirming same journal on two lines of same bank", async () => {
    const bank = await createTestBank("1045", "TEST-ACC-STMT-DUPJ");
    const utr = "DUPJOURNAL444444";
    await postSettlementToBank(bank.id, bank.glAccountCode, utr, 20000);
    const buf = csvStatement([
      ["2026-08-25", "settlement a", utr, "", "200.00", "200.00"],
      ["2026-08-26", "settlement b amount only", "", "", "200.00", "400.00"]
    ]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "dupj.csv",
      buffer: buf
    });
    const exactLine = imp.lines.find((l) => l.matchStatus === "MATCHED_EXACT")!;
    const otherLine = imp.lines.find((l) => l.id !== exactLine.id)!;
    const journalId = exactLine.matches.find((m) => m.status === "CONFIRMED")!.journalEntryId;
    // Seed a candidate row pointing at the already-confirmed journal (simulates stale UI).
    const forged = await prisma.accountingBankStatementMatch.create({
      data: {
        statementLineId: otherLine.id,
        journalEntryId: journalId,
        matchType: "RAZORPAY_SETTLEMENT",
        confidence: "POSSIBLE",
        status: "CANDIDATE",
        matchedAmountInPaise: 20000,
        bankGlAccountCode: bank.glAccountCode,
        evidenceJson: { forged: true }
      }
    });
    expect(forged.id).toBeTruthy();
    await expect(
      confirmStatementMatch({ lineId: otherLine.id, journalEntryId: journalId })
    ).rejects.toMatchObject({ code: "JOURNAL_ALREADY_MATCHED_SAME_BANK" });
  });
});
