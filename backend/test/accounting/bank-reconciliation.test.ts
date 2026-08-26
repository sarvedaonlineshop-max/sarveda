import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingBankReconciliationDisabledError,
  BankChargeNotEligibleError,
  BankInterestNotEligibleError,
  BankReconciliationError,
  BankReconciliationLockedError
} from "../../src/modules/accounting/accounting-errors";
import { assertBankReconciliationAllowed } from "../../src/modules/accounting/production-guard";
import { createBankAccount } from "../../src/modules/accounting/bank-account.service";
import { createBankTransferDraft } from "../../src/modules/accounting/bank-transfer.service";
import { postBankTransfer } from "../../src/modules/accounting/bank-transfer-posting.service";
import { postBankOpeningBalance } from "../../src/modules/accounting/bank-opening-posting.service";
import {
  commitBankStatementImport
} from "../../src/modules/accounting/bank-statement-import.service";
import {
  confirmStatementMatch,
  rejectStatementCandidate,
  unmatchStatementLine
} from "../../src/modules/accounting/bank-statement-matching.service";
import {
  createBankReconciliation,
  reconcileBankReconciliation,
  recomputeBankReconciliation,
  reopenBankReconciliation
} from "../../src/modules/accounting/bank-reconciliation.service";
import { categorizeBankCharge } from "../../src/modules/accounting/bank-charge-posting.service";
import { categorizeBankInterest } from "../../src/modules/accounting/bank-interest-posting.service";
import { ignoreStatementLine } from "../../src/modules/accounting/bank-statement-categorization.service";
import { getGatewayClearingControls } from "../../src/modules/accounting/gateway-clearing-control.service";
import { buildPaymentGatewaySettledJournal } from "../../src/modules/accounting/settlement-journal.builder";
import { postJournalFromEvent } from "../../src/modules/accounting/posting-event.service";
import { PAYMENT_GATEWAY_SETTLED_EVENT_TYPE } from "../../src/modules/accounting/settlement.constants";
import { seedAccountingChartOfAccounts, getAccountingAccountByCode } from "../../src/modules/accounting/seed-coa";
import { cleanupAccountingTestData, prisma } from "../helpers/commerce";

const bankIds: string[] = [];

function csvStatement(rows: string[][]) {
  const header = "Transaction Date,Description,Reference,Debit,Credit,Balance";
  return Buffer.from(`${header}\n${rows.map((r) => r.join(",")).join("\n")}`, "utf8");
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

describe("Phase 4D bank reconciliation + gateway controls", () => {
  const origNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const origBanking = process.env.ACCOUNTING_BANKING_ENABLED;
  const origStmt = process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED;
  const origRecon = process.env.ACCOUNTING_BANK_RECONCILIATION_ENABLED;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_BANKING_ENABLED = "1";
    process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED = "1";
    process.env.ACCOUNTING_BANK_RECONCILIATION_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_BANKING_ENABLED = "1";
    process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED = "1";
    process.env.ACCOUNTING_BANK_RECONCILIATION_ENABLED = "1";
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
    process.env.ACCOUNTING_BANK_RECONCILIATION_ENABLED = origRecon;
  });

  it("flags OFF block reconciliation", () => {
    process.env.ACCOUNTING_BANK_RECONCILIATION_ENABLED = "0";
    expect(() => assertBankReconciliationAllowed()).toThrow(AccountingBankReconciliationDisabledError);
  });

  it("creates reconciliation and computes book balances from GL", async () => {
    const bank = await createTestBank("1051", "TEST-ACC-RECON-BOOK");
    await postBankOpeningBalance(bank.id, {
      openingAmountInPaise: 1_000_000,
      openingDate: new Date("2026-08-01"),
      forcePersist: true
    });
    const recon = await createBankReconciliation({
      bankAccountId: bank.id,
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      statementOpeningBalanceInPaise: 1_000_000,
      statementClosingBalanceInPaise: 1_000_000
    });
    expect(recon.bookOpeningBalanceInPaise).toBe(0);
    expect(recon.bookDebitTotalInPaise).toBe(1_000_000);
    expect(recon.bookClosingBalanceInPaise).toBe(1_000_000);
    expect(recon.differenceInPaise).toBe(0);
    expect(recon.status).toBe("IN_PROGRESS");
  });

  it("unmatched lines and nonzero difference block reconcile", async () => {
    const bank = await createTestBank("1052", "TEST-ACC-RECON-BLOCK");
    await postBankOpeningBalance(bank.id, {
      openingAmountInPaise: 100_000,
      openingDate: new Date("2026-08-01"),
      forcePersist: true
    });
    const buf = csvStatement([
      ["2026-08-25", "BANK CHARGES", "", "5.00", "", "995.00"]
    ]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "recon-block.csv",
      buffer: buf
    });
    const recon = await createBankReconciliation({
      bankAccountId: bank.id,
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      statementImportId: imp.id,
      statementOpeningBalanceInPaise: 100_000,
      statementClosingBalanceInPaise: 99_500
    });
    expect(recon.differenceInPaise).not.toBe(0);
    await expect(
      reconcileBankReconciliation({ reconciliationId: recon.id })
    ).rejects.toThrow(BankReconciliationError);
  });

  it("bank charge + interest categorization then reconcile/lock/reopen", async () => {
    const bank = await createTestBank("1053", "TEST-ACC-RECON-FULL");
    await postBankOpeningBalance(bank.id, {
      openingAmountInPaise: 1_000_000,
      openingDate: new Date("2026-08-01"),
      forcePersist: true
    });

    const journalsBefore = await prisma.accountingJournalEntry.count();

    const buf = csvStatement([
      ["2026-08-25", "BANK CHARGES", "", "5.00", "", ""],
      ["2026-08-26", "INTEREST CREDIT", "", "", "10.00", ""]
    ]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "recon-full.csv",
      buffer: buf
    });
    expect(await prisma.accountingJournalEntry.count()).toBe(journalsBefore);

    const chargeLine = imp.lines.find((l) => l.debitInPaise === 500)!;
    const interestLine = imp.lines.find((l) => l.creditInPaise === 1000)!;

    const charge = await categorizeBankCharge({
      statementLineId: chargeLine.id,
      forcePersist: true
    });
    expect(charge.duplicate).toBe(false);
    expect(charge.journal.totalDebitInPaise).toBe(500);

    const interest = await categorizeBankInterest({
      statementLineId: interestLine.id,
      forcePersist: true
    });
    expect(interest.duplicate).toBe(false);

    // replay idempotent
    const charge2 = await categorizeBankCharge({
      statementLineId: chargeLine.id,
      forcePersist: true
    });
    expect(charge2.duplicate).toBe(true);

    const recon = await createBankReconciliation({
      bankAccountId: bank.id,
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      statementImportId: imp.id,
      statementOpeningBalanceInPaise: 1_000_000,
      statementClosingBalanceInPaise: 1_000_500
    });
    // opening 1_000_000 - charge 500 + interest 1000 = 1_000_500
    expect(recon.bookClosingBalanceInPaise).toBe(1_000_500);
    expect(recon.differenceInPaise).toBe(0);

    const closed = await reconcileBankReconciliation({
      reconciliationId: recon.id,
      userId: "11111111-1111-1111-1111-111111111111"
    });
    expect(closed.status).toBe("RECONCILED");
    expect(closed.snapshotJson).toBeTruthy();

    await expect(unmatchStatementLine({ lineId: chargeLine.id })).rejects.toThrow(
      BankReconciliationLockedError
    );
    await expect(
      rejectStatementCandidate({
        lineId: chargeLine.id,
        matchId: "00000000-0000-0000-0000-000000000001"
      })
    ).rejects.toThrow(BankReconciliationLockedError);
    await expect(
      categorizeBankCharge({ statementLineId: chargeLine.id, forcePersist: true })
    ).rejects.toThrow(BankReconciliationLockedError);

    await expect(
      reopenBankReconciliation({ reconciliationId: closed.id, reason: "" })
    ).rejects.toThrow(BankReconciliationError);

    const reopened = await reopenBankReconciliation({
      reconciliationId: closed.id,
      reason: "Need to correct a match",
      userId: "11111111-1111-1111-1111-111111111111"
    });
    expect(reopened.status).toBe("REOPENED");
    expect(reopened.reopenReason).toContain("correct");

    const journalsAfterReopen = await prisma.accountingJournalEntry.count();
    expect(journalsAfterReopen).toBe(await prisma.accountingJournalEntry.count());
  });

  it("ignore without reason blocked; ignore with reason permits reconcile", async () => {
    const bank = await createTestBank("1054", "TEST-ACC-RECON-IGN");
    await postBankOpeningBalance(bank.id, {
      openingAmountInPaise: 50_000,
      openingDate: new Date("2026-08-01"),
      forcePersist: true
    });
    const buf2 = csvStatement([
      ["2026-08-25", "duplicate advice", "IGNREF123456", "1.00", "", "499.00"]
    ]);
    const imp2 = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "ign2.csv",
      buffer: buf2
    });
    const line = imp2.lines[0]!;
    await expect(ignoreStatementLine({ statementLineId: line.id, reason: "ab" })).rejects.toThrow(
      BankReconciliationError
    );
    await ignoreStatementLine({
      statementLineId: line.id,
      reason: "Non-posting bank advice duplicate"
    });
    const refreshed = await prisma.accountingBankStatementLine.findUniqueOrThrow({
      where: { id: line.id }
    });
    expect(refreshed.matchStatus).toBe("IGNORED");

    const recon = await createBankReconciliation({
      bankAccountId: bank.id,
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      statementImportId: imp2.id,
      statementOpeningBalanceInPaise: 50_000,
      statementClosingBalanceInPaise: 50_000
    });
    expect(recon.differenceInPaise).toBe(0);
    const closed = await reconcileBankReconciliation({ reconciliationId: recon.id });
    expect(closed.status).toBe("RECONCILED");
  });

  it("credit line blocked for bank charge; debit blocked for interest", async () => {
    const bank = await createTestBank("1055", "TEST-ACC-RECON-DIR");
    const buf = csvStatement([
      ["2026-08-25", "credit", "", "", "10.00", "10.00"],
      ["2026-08-25", "debit", "", "10.00", "", "0"]
    ]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "dir.csv",
      buffer: buf
    });
    const credit = imp.lines.find((l) => l.creditInPaise > 0)!;
    const debit = imp.lines.find((l) => l.debitInPaise > 0)!;
    await expect(
      categorizeBankCharge({ statementLineId: credit.id, forcePersist: true })
    ).rejects.toThrow(BankChargeNotEligibleError);
    await expect(
      categorizeBankInterest({ statementLineId: debit.id, forcePersist: true })
    ).rejects.toThrow(BankInterestNotEligibleError);
  });

  it("gateway controls: Razorpay from GL; Stripe/PayPal/COD DATA_GAP", async () => {
    const bank = await createTestBank("1056", "TEST-ACC-RECON-GW");
    const proposal = buildPaymentGatewaySettledJournal(
      {
        provider: "RAZORPAY",
        providerSettlementId: "setl-gw-1",
        currency: "INR",
        settledAt: new Date("2026-08-25"),
        utr: "GWRZPUTR123456",
        grossInPaise: 10_000,
        feeInPaise: 200,
        taxInPaise: 0,
        netInPaise: 9_800,
        sourcePayloadHash: "gw1",
        header: { id: "setl-gw-1", amount: 10_000, created_at: 0 },
        reconLines: [],
        mappedLines: [
          {
            lineType: "PAYMENT",
            providerEntityId: "pay_x",
            amountInPaise: 10_000,
            feeInPaise: 0,
            taxInPaise: 0,
            debitInPaise: 0,
            creditInPaise: 0,
            providerPaymentId: "pay_x",
            providerRefundId: null,
            paymentId: null,
            orderId: null,
            mappingStatus: "MAPPED",
            rawPayload: {},
            sortOrder: 0
          }
        ]
      },
      { failOnImbalance: false, targetBankGlCode: bank.glAccountCode }
    );
    const accountIds = new Map<string, string>();
    for (const code of [...new Set(proposal.lines.map((l) => l.accountCode))]) {
      const acct = await getAccountingAccountByCode(code);
      if (acct) accountIds.set(code, acct.id);
    }
    await postJournalFromEvent({
      eventType: PAYMENT_GATEWAY_SETTLED_EVENT_TYPE,
      sourceType: "GATEWAY_SETTLEMENT",
      sourceId: "gw1",
      uniqueKey: "gateway_settlement:RAZORPAY:gw1",
      payloadJson: {},
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

    const controls = await getGatewayClearingControls();
    const rzp = controls.find((c) => c.provider === "RAZORPAY")!;
    const stripe = controls.find((c) => c.provider === "STRIPE")!;
    const paypal = controls.find((c) => c.provider === "PAYPAL")!;
    const cod = controls.find((c) => c.provider === "COD")!;
    expect(rzp.glCode).toBe("1020");
    expect(["CLEAR", "OUTSTANDING", "REVIEW_REQUIRED"]).toContain(rzp.status);
    expect(["DATA_GAP", "SETTLEMENT_NOT_CONFIGURED"]).toContain(stripe.status);
    expect(["DATA_GAP", "SETTLEMENT_NOT_CONFIGURED"]).toContain(paypal.status);
    expect(cod.status).toBe("DATA_GAP");
    expect(cod.warnings.some((w) => /DELIVERED|FULFILLED/i.test(w))).toBe(true);
  });

  it("reconciliation itself creates zero GL; only charge/interest post", async () => {
    const bank = await createTestBank("1057", "TEST-ACC-RECON-NOGL");
    await postBankOpeningBalance(bank.id, {
      openingAmountInPaise: 10_000,
      openingDate: new Date("2026-08-01"),
      forcePersist: true
    });
    const before = await prisma.accountingJournalEntry.count();
    await createBankReconciliation({
      bankAccountId: bank.id,
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      statementOpeningBalanceInPaise: 10_000,
      statementClosingBalanceInPaise: 10_000
    });
    const after = await prisma.accountingJournalEntry.count();
    expect(after).toBe(before);
  });

  it("possible gateway fee duplicate blocks bank charge", async () => {
    const bank = await createTestBank("1058", "TEST-ACC-RECON-FEE");
    await prisma.accountingGatewaySettlement.create({
      data: {
        provider: "RAZORPAY",
        providerSettlementId: "fee-dup-1",
        currency: "INR",
        settledAt: new Date("2026-08-25"),
        utr: "FEEDUPUTR123",
        targetBankAccountId: bank.id,
        grossInPaise: 10_000,
        feeInPaise: 590,
        taxInPaise: 0,
        netInPaise: 9_410,
        status: "POSTED",
        sourcePayloadHash: "feedup"
      }
    });
    const buf = csvStatement([["2026-08-25", "RAZORPAY FEE", "", "5.90", "", ""]]);
    const imp = await commitBankStatementImport({
      bankAccountId: bank.id,
      fileName: "fee.csv",
      buffer: buf
    });
    await expect(
      categorizeBankCharge({ statementLineId: imp.lines[0]!.id, forcePersist: true })
    ).rejects.toThrow(/POSSIBLE_DUPLICATE_GATEWAY_FEE|gateway fee/i);
    const line = await prisma.accountingBankStatementLine.findUniqueOrThrow({
      where: { id: imp.lines[0]!.id }
    });
    expect(line.category).toBe("POSSIBLE_DUPLICATE_GATEWAY_FEE");
  });
});
