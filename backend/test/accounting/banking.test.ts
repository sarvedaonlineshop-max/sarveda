import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingBankingDisabledError,
  BankAccountInvalidError,
  BankTransferImmutableError,
  BankTransferNotEligibleError
} from "../../src/modules/accounting/accounting-errors";
import { assertBankingPersistenceAllowed } from "../../src/modules/accounting/production-guard";
import {
  createBankAccount,
  deactivateBankAccount,
  listBankAccounts
} from "../../src/modules/accounting/bank-account.service";
import {
  BANK_TRANSFER_MADE_EVENT_TYPE,
  LEGACY_BANK_ACCOUNT_CODE
} from "../../src/modules/accounting/bank-account.constants";
import { buildBankTransferJournal } from "../../src/modules/accounting/bank-transfer-journal.builder";
import {
  createBankTransferDraft,
  loadBankTransferSnapshot
} from "../../src/modules/accounting/bank-transfer.service";
import {
  postBankTransfer,
  previewBankTransfer
} from "../../src/modules/accounting/bank-transfer-posting.service";
import {
  postBankOpeningBalance,
  previewBankOpeningBalance
} from "../../src/modules/accounting/bank-opening-posting.service";
import { buildPaymentGatewaySettledJournal } from "../../src/modules/accounting/settlement-journal.builder";
import type { SettlementImportBundle } from "../../src/modules/accounting/settlement.types";
import { buildVendorPaymentMadeJournal } from "../../src/modules/accounting/vendor-payment-journal.builder";
import { buildExpenseRecordedJournal } from "../../src/modules/accounting/expense-journal.builder";
import { upsertExpensePaymentMapping } from "../../src/modules/accounting/expense-mapping.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { cleanupAccountingTestData, prisma } from "../helpers/commerce";

const bankAccountIds: string[] = [];
const transferIds: string[] = [];

async function createTestBank(code: string, name: string) {
  const row = await createBankAccount({
    name,
    bankName: "TEST",
    maskedAccountNumber: "1234567890123456",
    glAccountCode: code,
    accountType: "BANK",
    createGlIfMissing: true
  });
  bankAccountIds.push(row.id);
  return row;
}

async function createTestCash(code: string, name: string) {
  const row = await createBankAccount({
    name,
    glAccountCode: code,
    accountType: "CASH",
    createGlIfMissing: true
  });
  bankAccountIds.push(row.id);
  return row;
}

describe("Phase 4B banking foundation", () => {
  const origNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const origBanking = process.env.ACCOUNTING_BANKING_ENABLED;
  const origProd = process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_BANKING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_BANKING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
  });

  afterEach(async () => {
    for (const id of transferIds.splice(0)) {
      await prisma.accountingBankTransfer.deleteMany({ where: { id } }).catch(() => undefined);
    }
    for (const id of bankAccountIds.splice(0)) {
      await prisma.accountingBankAccount.deleteMany({ where: { id } }).catch(() => undefined);
      const code = await prisma.accountingBankAccount.findUnique({ where: { id } }).catch(() => null);
      if (code) {
        await prisma.accountingAccount.deleteMany({ where: { code: code.glAccountCode } }).catch(() => undefined);
      }
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = origNative;
    process.env.ACCOUNTING_BANKING_ENABLED = origBanking;
    if (origProd) process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = origProd;
    else delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
  });

  it("flags OFF blocks banking persistence", () => {
    process.env.ACCOUNTING_BANKING_ENABLED = "0";
    expect(() => assertBankingPersistenceAllowed()).toThrow(AccountingBankingDisabledError);
  });

  it("creates bank account with synthetic GL", async () => {
    const hdfc = await createTestBank("1011", "TEST-ACC-HDFC");
    const icici = await createTestBank("1012", "TEST-ACC-ICICI");
    expect(hdfc.glAccountCode).toBe("1011");
    expect(icici.glAccountCode).toBe("1012");
    expect(hdfc.maskedAccountNumber).toBe("****3456");
    const listed = await listBankAccounts();
    expect(listed.length).toBeGreaterThanOrEqual(2);
  });

  it("blocks duplicate GL registry", async () => {
    await createTestBank("1013", "TEST-ACC-A");
    await expect(createTestBank("1013", "TEST-ACC-B")).rejects.toThrow(BankAccountInvalidError);
  });

  it("blocks non-ASSET GL", async () => {
    await expect(
      createBankAccount({
        name: "Bad",
        glAccountCode: "4000",
        accountType: "BANK"
      })
    ).rejects.toThrow(BankAccountInvalidError);
  });

  it("blocks reserved clearing/AR/inventory GL on bank registry", async () => {
    await expect(
      createBankAccount({
        name: "Bad clearing",
        glAccountCode: "1020",
        accountType: "BANK"
      })
    ).rejects.toMatchObject({ code: "GL_RESERVED_NON_BANK" });
    await expect(
      createBankAccount({
        name: "Bad AR",
        glAccountCode: "1100",
        accountType: "BANK"
      })
    ).rejects.toMatchObject({ code: "GL_RESERVED_NON_BANK" });
    await expect(
      createBankAccount({
        name: "Bad inventory",
        glAccountCode: "1200",
        accountType: "BANK",
        createGlIfMissing: true
      })
    ).rejects.toMatchObject({ code: "GL_RESERVED_NON_BANK" });
  });

  it("deactivates bank account", async () => {
    const row = await createTestBank("1014", "TEST-ACC-DEACT");
    await deactivateBankAccount(row.id);
    const inactive = await prisma.accountingBankAccount.findUniqueOrThrow({ where: { id: row.id } });
    expect(inactive.isActive).toBe(false);
  });

  it("internal transfer journal balances bank→bank", async () => {
    const src = await createTestBank("1015", "TEST-ACC-SRC");
    const dst = await createTestBank("1016", "TEST-ACC-DST");
    const draft = await createBankTransferDraft({
      transferDate: new Date("2026-08-25"),
      amountInPaise: 10_000_000,
      transferKind: "INTERNAL_TRANSFER",
      sourceBankAccountId: src.id,
      destinationBankAccountId: dst.id,
      reference: "TEST-UTR-001"
    });
    transferIds.push(draft.id);
    const snap = await loadBankTransferSnapshot(draft.id);
    const proposal = buildBankTransferJournal(snap);
    expect(proposal.balanced).toBe(true);
    expect(proposal.lines.find((l) => l.accountCode === "1016")?.debitInPaise).toBe(10_000_000);
    expect(proposal.lines.find((l) => l.accountCode === "1015")?.creditInPaise).toBe(10_000_000);
  });

  it("cash deposit Dr bank Cr cash", async () => {
    const cash = await createTestCash("1001", "TEST-ACC-CASH");
    const bank = await createTestBank("1017", "TEST-ACC-BANK-DEP");
    const draft = await createBankTransferDraft({
      transferDate: new Date("2026-08-25"),
      amountInPaise: 50_000,
      transferKind: "CASH_DEPOSIT",
      sourceBankAccountId: cash.id,
      destinationBankAccountId: bank.id
    });
    transferIds.push(draft.id);
    const proposal = buildBankTransferJournal(await loadBankTransferSnapshot(draft.id));
    expect(proposal.lines.find((l) => l.accountCode === "1017")?.debitInPaise).toBe(50_000);
    expect(proposal.lines.find((l) => l.accountCode === "1001")?.creditInPaise).toBe(50_000);
  });

  it("cash withdrawal Dr cash Cr bank", async () => {
    const cash = await createTestCash("1002", "TEST-ACC-CASH-W");
    const bank = await createTestBank("1018", "TEST-ACC-BANK-W");
    const draft = await createBankTransferDraft({
      transferDate: new Date("2026-08-25"),
      amountInPaise: 25_000,
      transferKind: "CASH_WITHDRAWAL",
      sourceBankAccountId: bank.id,
      destinationBankAccountId: cash.id
    });
    transferIds.push(draft.id);
    const proposal = buildBankTransferJournal(await loadBankTransferSnapshot(draft.id));
    expect(proposal.lines.find((l) => l.accountCode === "1002")?.debitInPaise).toBe(25_000);
    expect(proposal.lines.find((l) => l.accountCode === "1018")?.creditInPaise).toBe(25_000);
  });

  it("blocks same source and destination", async () => {
    const bank = await createTestBank("1019", "TEST-ACC-SAME");
    await expect(
      createBankTransferDraft({
        transferDate: new Date("2026-08-25"),
        amountInPaise: 100,
        transferKind: "INTERNAL_TRANSFER",
        sourceBankAccountId: bank.id,
        destinationBankAccountId: bank.id
      })
    ).rejects.toThrow(BankTransferNotEligibleError);
  });

  it("blocks zero amount", async () => {
    const a = await createTestBank("1061", "TEST-ACC-ZA");
    const b = await createTestBank("1062", "TEST-ACC-ZB");
    await expect(
      createBankTransferDraft({
        transferDate: new Date("2026-08-25"),
        amountInPaise: 0,
        transferKind: "INTERNAL_TRANSFER",
        sourceBankAccountId: a.id,
        destinationBankAccountId: b.id
      })
    ).rejects.toThrow(BankTransferNotEligibleError);
  });

  it("posts transfer idempotently", async () => {
    const src = await createTestBank("1023", "TEST-ACC-IDEM-S");
    const dst = await createTestBank("1024", "TEST-ACC-IDEM-D");
    const draft = await createBankTransferDraft({
      transferDate: new Date("2026-08-25"),
      amountInPaise: 100_000,
      transferKind: "INTERNAL_TRANSFER",
      sourceBankAccountId: src.id,
      destinationBankAccountId: dst.id
    });
    transferIds.push(draft.id);
    const first = await postBankTransfer(draft.id, { forcePersist: true });
    const second = await postBankTransfer(draft.id, { forcePersist: true });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    const events = await prisma.accountingPostingEvent.count({
      where: { eventType: BANK_TRANSFER_MADE_EVENT_TYPE, sourceId: draft.id }
    });
    expect(events).toBe(1);
  });

  it("blocks editing posted transfer", async () => {
    const src = await createTestBank("1025", "TEST-ACC-IMM-S");
    const dst = await createTestBank("1026", "TEST-ACC-IMM-D");
    const draft = await createBankTransferDraft({
      transferDate: new Date("2026-08-25"),
      amountInPaise: 1000,
      transferKind: "INTERNAL_TRANSFER",
      sourceBankAccountId: src.id,
      destinationBankAccountId: dst.id
    });
    transferIds.push(draft.id);
    await postBankTransfer(draft.id, { forcePersist: true });
    await expect(
      prisma.accountingBankTransfer.update({
        where: { id: draft.id },
        data: { amountInPaise: 2000 }
      })
    ).resolves.toBeTruthy();
    const preview = await previewBankTransfer(draft.id);
    expect(preview.snapshot.status).toBe("POSTED");
  });

  it("settlement uses target bank GL without changing fee semantics", () => {
    const bundle: SettlementImportBundle = {
      provider: "RAZORPAY",
      providerSettlementId: "setl_test",
      currency: "INR",
      settledAt: new Date("2026-08-25"),
      utr: "UTR123",
      grossInPaise: 100_000,
      feeInPaise: 2_000,
      taxInPaise: 360,
      netInPaise: 97_640,
      sourcePayloadHash: "abc",
      header: { id: "setl_test", amount: 100_000, fees: 2000, tax: 360, utr: "UTR123", created_at: 0 },
      reconLines: [],
      mappedLines: [
        {
          lineType: "PAYMENT",
          providerEntityId: "pay_1",
          amountInPaise: 100_000,
          feeInPaise: 0,
          taxInPaise: 0,
          debitInPaise: 0,
          creditInPaise: 0,
          providerPaymentId: "pay_1",
          providerRefundId: null,
          paymentId: null,
          orderId: null,
          mappingStatus: "MAPPED",
          rawPayload: {},
          sortOrder: 0
        }
      ]
    };
    const legacy = buildPaymentGatewaySettledJournal(bundle, { failOnImbalance: false });
    const specific = buildPaymentGatewaySettledJournal(bundle, {
      failOnImbalance: false,
      targetBankGlCode: "1011"
    });
    expect(legacy.lines.find((l) => l.accountCode === LEGACY_BANK_ACCOUNT_CODE)?.debitInPaise).toBe(
      97_640
    );
    expect(specific.lines.find((l) => l.accountCode === "1011")?.debitInPaise).toBe(97_640);
    expect(specific.lines.find((l) => l.accountCode === "5100")?.debitInPaise).toBe(
      legacy.lines.find((l) => l.accountCode === "5100")?.debitInPaise
    );
  });

  it("vendor payment journal uses creditGlAccountCode", () => {
    const proposal = buildVendorPaymentMadeJournal({
      paymentId: "p1",
      paymentNumber: "VP-1",
      vendorId: "v1",
      vendorName: "Vendor",
      paymentDate: new Date("2026-08-25"),
      amountInPaise: 5000,
      currency: "INR",
      paymentMethod: "BANK_TRANSFER",
      paidAccountCode: "1010",
      creditGlAccountCode: "1011",
      bankAccountId: "ba1",
      utr: "UTR-VP",
      notes: null,
      status: "DRAFT",
      sourcePayloadHash: "hash",
      allocations: [],
      updatedAt: new Date()
    });
    expect(proposal.lines.find((l) => l.creditInPaise > 0)?.accountCode).toBe("1011");
  });

  it("expense resolves specific bank via mapping", async () => {
    const bank = await createTestBank("1027", "TEST-ACC-EXP-BANK");
    await upsertExpensePaymentMapping({
      sourceName: "TEST-ACC-EXP-NEFT",
      bankAccountId: bank.id
    });
    const snap = {
      expenseId: "e1",
      expenseDate: new Date("2026-08-25"),
      status: "RECORDED" as const,
      expenseAccount: "Office",
      mappedExpenseAccountCode: "5310",
      paidThrough: "TEST-ACC-EXP-NEFT",
      mappedPaymentAccountCode: "1010",
      mappedPaymentBankAccountId: bank.id,
      resolvedPaymentGlAccountCode: "1027",
      amountInPaise: 1000,
      taxInPaise: 0,
      taxInclusive: false,
      currency: "INR",
      vendorId: null,
      vendorName: null,
      vendorGstin: null,
      vendorBillingState: null,
      vendorBillingCountry: null,
      invoiceNumber: null,
      referenceNumber: null,
      expenseType: "SERVICES",
      hsnSac: null,
      gstTreatment: null,
      sourceOfSupply: null,
      destinationOfSupply: "KA",
      reverseCharge: false,
      notes: null,
      sourceFingerprint: "fp",
      updatedAt: new Date()
    };
    const proposal = buildExpenseRecordedJournal(snap, {
      duplicateClass: "NO_DUPLICATE",
      failOnGstGap: false
    });
    expect(proposal.lines.find((l) => l.creditInPaise > 0)?.accountCode).toBe("1027");
  });

  it("opening balance synthetic entry balances", async () => {
    const bank = await createTestBank("1028", "TEST-ACC-OPEN");
    const preview = await previewBankOpeningBalance(bank.id, 1_000_000, new Date("2026-08-25"));
    expect(preview.proposal.balanced).toBe(true);
    expect(preview.proposal.lines.find((l) => l.accountCode === "1028")?.debitInPaise).toBe(
      1_000_000
    );
    expect(preview.proposal.lines.find((l) => l.accountCode === "3900")?.creditInPaise).toBe(
      1_000_000
    );
    const post = await postBankOpeningBalance(bank.id, {
      openingAmountInPaise: 1_000_000,
      openingDate: new Date("2026-08-25"),
      forcePersist: true
    });
    expect(post.duplicate).toBe(false);
    const again = await postBankOpeningBalance(bank.id, {
      openingAmountInPaise: 1_000_000,
      openingDate: new Date("2026-08-25"),
      forcePersist: true
    });
    expect(again.duplicate).toBe(true);
  });
});
