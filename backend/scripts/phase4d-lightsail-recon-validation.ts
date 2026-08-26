/**
 * Phase 4D Lightsail bank reconciliation + gateway controls validation.
 *
 *   PHASE4D_LIGHTSAIL_RECON_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   ACCOUNTING_BANKING_ENABLED=1 \
 *   ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED=1 \
 *   ACCOUNTING_BANK_RECONCILIATION_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   npx tsx scripts/phase4d-lightsail-recon-validation.ts
 *
 * Process-scoped flags only — leave Lightsail .env OFF.
 */
import { createHash } from "crypto";
import path from "path";
import fs from "fs";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { seedAccountingChartOfAccounts, getAccountingAccountByCode } from "../src/modules/accounting/seed-coa";
import { createBankAccount } from "../src/modules/accounting/bank-account.service";
import { postBankOpeningBalance } from "../src/modules/accounting/bank-opening-posting.service";
import { createBankTransferDraft } from "../src/modules/accounting/bank-transfer.service";
import { postBankTransfer } from "../src/modules/accounting/bank-transfer-posting.service";
import { commitBankStatementImport } from "../src/modules/accounting/bank-statement-import.service";
import {
  createBankReconciliation,
  reconcileBankReconciliation,
  reopenBankReconciliation
} from "../src/modules/accounting/bank-reconciliation.service";
import { categorizeBankCharge } from "../src/modules/accounting/bank-charge-posting.service";
import { categorizeBankInterest } from "../src/modules/accounting/bank-interest-posting.service";
import { getGatewayClearingControls } from "../src/modules/accounting/gateway-clearing-control.service";
import { buildPaymentGatewaySettledJournal } from "../src/modules/accounting/settlement-journal.builder";
import { postJournalFromEvent } from "../src/modules/accounting/posting-event.service";
import { PAYMENT_GATEWAY_SETTLED_EVENT_TYPE } from "../src/modules/accounting/settlement.constants";
import { createSyntheticVendorBill } from "../test/helpers/accounting-purchases";
import { loadVendorBillSnapshotById } from "../src/modules/accounting/vendor-bill-snapshot.service";
import { postVendorBillPostedJournal } from "../src/modules/accounting/vendor-bill-posting.service";
import { createVendorPaymentDraft } from "../src/modules/accounting/vendor-payment.service";
import { postVendorPayment } from "../src/modules/accounting/vendor-payment-posting.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";
import { BankReconciliationLockedError } from "../src/modules/accounting/accounting-errors";
import { unmatchStatementLine } from "../src/modules/accounting/bank-statement-matching.service";

const prisma = new PrismaClient();
const TAG = `TEST-ACC-RECON-${Date.now()}`;
const results: boolean[] = [];

function ok(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  results.push(pass);
  return pass;
}

function csvBuffer(rows: string[][]) {
  const header = "Transaction Date,Description,Reference,Debit,Credit,Balance";
  return Buffer.from(`${header}\n${rows.map((r) => r.join(",")).join("\n")}`, "utf8");
}

async function main() {
  if (!process.env.PHASE4D_LIGHTSAIL_RECON_OK) {
    console.error("Set PHASE4D_LIGHTSAIL_RECON_OK=1 to run on Lightsail");
    process.exit(1);
  }
  if (!isProductionLikeEnvironment()) {
    console.warn("WARN: DATABASE_URL does not look like Lightsail/production-like");
  }

  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_BANKING_ENABLED = "1";
  process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED = "1";
  process.env.ACCOUNTING_BANK_RECONCILIATION_ENABLED = "1";
  process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";
  process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
  process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";

  await seedAccountingChartOfAccounts();

  const suffix = String(Date.now() % 100).padStart(2, "0");
  const glHdfc = `30${suffix}`;
  const glIcici = `31${suffix}`;

  const hdfc = await createBankAccount({
    name: `${TAG}-HDFC`,
    bankName: "TEST",
    glAccountCode: glHdfc,
    accountType: "BANK",
    createGlIfMissing: true,
    statementImportEnabled: true,
    razorpaySettlementTarget: true
  });
  const icici = await createBankAccount({
    name: `${TAG}-ICICI`,
    bankName: "TEST",
    glAccountCode: glIcici,
    accountType: "BANK",
    createGlIfMissing: true,
    statementImportEnabled: true
  });

  const commerceFpBefore = createHash("sha256")
    .update(
      JSON.stringify(
        await prisma.order.findMany({
          take: 5,
          orderBy: { updatedAt: "desc" },
          select: { id: true, orderNumber: true, paymentStatus: true, updatedAt: true }
        })
      )
    )
    .digest("hex");
  const legacy1010Before = await prisma.accountingJournalLine.count({
    where: { account: { code: "1010" } }
  });

  // Opening ₹10,00,000 (10 lakh = 1_000_000 rupees)
  await postBankOpeningBalance(hdfc.id, {
    openingAmountInPaise: 1_000_000,
    openingDate: new Date("2026-08-01"),
    forcePersist: true
  });

  // Vendor payment -₹1,00,000
  const bill = await createSyntheticVendorBill({
    vendor: { name: `${TAG}-VENDOR` },
    lines: [
      {
        variantId: null,
        itemName: "Service",
        quantity: 1,
        rateInPaise: 100_000,
        taxClass: "gst-zero-rate"
      }
    ]
  });
  await postVendorBillPostedJournal(await loadVendorBillSnapshotById(bill.id), {
    forcePersist: true
  });
  const vpUtr = `${TAG}-VPUTR`;
  const draft = await createVendorPaymentDraft({
    vendorId: bill.vendorId,
    paymentDate: new Date("2026-08-10"),
    amountInPaise: 100_000,
    paymentMethod: "BANK_TRANSFER",
    bankAccountId: hdfc.id,
    utr: vpUtr,
    allocations: [{ vendorBillId: bill.id, amountInPaise: 100_000 }]
  });
  await postVendorPayment(draft.id, { forcePersist: true });

  // Razorpay settlement +₹2,00,000
  const rzpUtr = `${TAG}-RZPUTR`;
  const proposal = buildPaymentGatewaySettledJournal(
    {
      provider: "RAZORPAY",
      providerSettlementId: `setl-${rzpUtr}`,
      currency: "INR",
      settledAt: new Date("2026-08-12"),
      utr: rzpUtr,
      grossInPaise: 202_000,
      feeInPaise: 2_000,
      taxInPaise: 0,
      netInPaise: 200_000,
      sourcePayloadHash: rzpUtr,
      header: { id: rzpUtr, amount: 200_000, created_at: 0 },
      reconLines: [],
      mappedLines: [
        {
          lineType: "PAYMENT",
          providerEntityId: "pay_x",
          amountInPaise: 202_000,
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
    { failOnImbalance: false, targetBankGlCode: hdfc.glAccountCode }
  );
  const accountIds = new Map<string, string>();
  for (const code of [...new Set(proposal.lines.map((l) => l.accountCode))]) {
    const acct = await getAccountingAccountByCode(code);
    if (acct) accountIds.set(code, acct.id);
  }
  const settPosted = await postJournalFromEvent({
    eventType: PAYMENT_GATEWAY_SETTLED_EVENT_TYPE,
    sourceType: "GATEWAY_SETTLEMENT",
    sourceId: rzpUtr,
    uniqueKey: `gateway_settlement:RAZORPAY:${rzpUtr}`,
    payloadJson: { utr: rzpUtr },
    entryDate: new Date("2026-08-12"),
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
      providerSettlementId: `setl-${rzpUtr}`,
      currency: "INR",
      settledAt: new Date("2026-08-12"),
      utr: rzpUtr,
      targetBankAccountId: hdfc.id,
      grossInPaise: 202_000,
      feeInPaise: 2_000,
      taxInPaise: 0,
      netInPaise: 200_000,
      status: "POSTED",
      sourcePayloadHash: rzpUtr,
      journalEntryId: settPosted.journal.id,
      postingEventId: settPosted.event.id
    }
  });

  // Transfer -₹50,000
  const xferRef = `${TAG}-XFER`;
  const xfer = await createBankTransferDraft({
    transferDate: new Date("2026-08-15"),
    amountInPaise: 50_000,
    transferKind: "INTERNAL_TRANSFER",
    sourceBankAccountId: hdfc.id,
    destinationBankAccountId: icici.id,
    reference: xferRef
  });
  await postBankTransfer(xfer.id, { forcePersist: true });

  // Pre-adjustment book = 10,00,000 - 1,00,000 + 2,00,000 - 50,000 = 10,50,000
  // Statement also has charge -500 and interest +1000 → closing 10,50,500
  const stmt = csvBuffer([
    ["2026-08-10", "Vendor payment", vpUtr, "1000.00", "", ""],
    ["2026-08-12", "Razorpay settlement", rzpUtr, "", "2000.00", ""],
    ["2026-08-15", "Transfer out", xferRef, "500.00", "", ""],
    ["2026-08-20", "BANK CHARGES", "", "5.00", "", ""],
    ["2026-08-21", "INTEREST CREDIT", "", "", "10.00", "10505.00"]
  ]);

  const journalsBeforeImport = await prisma.accountingJournalEntry.count();
  const imp = await commitBankStatementImport({
    bankAccountId: hdfc.id,
    fileName: `${TAG}.csv`,
    buffer: stmt
  });
  ok(
    "A statement import creates zero GL",
    (await prisma.accountingJournalEntry.count()) === journalsBeforeImport
  );

  const chargeLine = imp.lines.find((l) => l.description === "BANK CHARGES")!;
  const interestLine = imp.lines.find((l) => l.description === "INTEREST CREDIT")!;
  ok("B charge initially unmatched", chargeLine.matchStatus === "UNMATCHED");
  ok("C interest initially unmatched", interestLine.matchStatus === "UNMATCHED");

  // Pre-adj book: 10,00,000 - 1,00,000 + 2,00,000 - 50,000 = 10,50,000
  // Statement closing after charge/interest evidence: 10,50,500
  const reconOpen = await createBankReconciliation({
    bankAccountId: hdfc.id,
    periodStart: new Date("2026-08-01"),
    periodEnd: new Date("2026-08-31"),
    statementImportId: imp.id,
    statementOpeningBalanceInPaise: 1_000_000,
    statementClosingBalanceInPaise: 1_050_500
  });
  ok("D initial difference nonzero", reconOpen.differenceInPaise !== 0, String(reconOpen.differenceInPaise));
  ok("E book closing before adj = 10,50,000", reconOpen.bookClosingBalanceInPaise === 1_050_000);

  await categorizeBankCharge({ statementLineId: chargeLine.id, forcePersist: true });
  await categorizeBankInterest({ statementLineId: interestLine.id, forcePersist: true });

  const { recomputeBankReconciliation } = await import(
    "../src/modules/accounting/bank-reconciliation.service"
  );
  const recomputed = await recomputeBankReconciliation(reconOpen.id);
  ok("F corrected book closing = 10,50,500", recomputed.bookClosingBalanceInPaise === 1_050_500);
  ok("G difference zero", recomputed.differenceInPaise === 0);

  const closed = await reconcileBankReconciliation({ reconciliationId: reconOpen.id });
  ok("H status RECONCILED", closed.status === "RECONCILED");
  ok("I snapshot created", Boolean(closed.snapshotJson));

  let unmatchBlocked = false;
  try {
    await unmatchStatementLine({ lineId: chargeLine.id });
  } catch (e) {
    unmatchBlocked = e instanceof BankReconciliationLockedError;
  }
  ok("J unmatch blocked after reconcile", unmatchBlocked);

  let recatBlocked = false;
  try {
    await categorizeBankCharge({ statementLineId: chargeLine.id, forcePersist: true });
  } catch (e) {
    recatBlocked = e instanceof BankReconciliationLockedError;
  }
  ok("K recategorize blocked after reconcile", recatBlocked);

  const journalsBeforeReopen = await prisma.accountingJournalEntry.count();
  const reopened = await reopenBankReconciliation({
    reconciliationId: closed.id,
    reason: "TEST-ACC-RECON reopen validation"
  });
  ok("L status REOPENED", reopened.status === "REOPENED");
  ok(
    "M reopen does not alter GL",
    (await prisma.accountingJournalEntry.count()) === journalsBeforeReopen
  );

  const controls = await getGatewayClearingControls();
  const rzp = controls.find((c) => c.provider === "RAZORPAY")!;
  const stripe = controls.find((c) => c.provider === "STRIPE")!;
  const paypal = controls.find((c) => c.provider === "PAYPAL")!;
  const cod = controls.find((c) => c.provider === "COD")!;
  ok("N Razorpay 1020 from GL", rzp.glCode === "1020");
  ok(
    "O Stripe DATA_GAP/SETTLEMENT_NOT_CONFIGURED",
    stripe.status === "DATA_GAP" || stripe.status === "SETTLEMENT_NOT_CONFIGURED"
  );
  ok(
    "P PayPal DATA_GAP/SETTLEMENT_NOT_CONFIGURED",
    paypal.status === "DATA_GAP" || paypal.status === "SETTLEMENT_NOT_CONFIGURED"
  );
  ok("Q COD DATA_GAP", cod.status === "DATA_GAP");
  ok(
    "R fulfilled≠collection warning",
    cod.warnings.some((w) => /DELIVERED|FULFILLED|collection/i.test(w))
  );

  const commerceFpAfter = createHash("sha256")
    .update(
      JSON.stringify(
        await prisma.order.findMany({
          take: 5,
          orderBy: { updatedAt: "desc" },
          select: { id: true, orderNumber: true, paymentStatus: true, updatedAt: true }
        })
      )
    )
    .digest("hex");
  ok("S commerce fingerprints unchanged", commerceFpAfter === commerceFpBefore);
  ok(
    "T legacy 1010 unchanged",
    (await prisma.accountingJournalLine.count({ where: { account: { code: "1010" } } })) ===
      legacy1010Before
  );

  const envText = await fs.promises.readFile(path.resolve(__dirname, "../.env"), "utf8").catch(() => "");
  const flagLines = envText
    .split("\n")
    .filter((l) =>
      /^(NATIVE_ACCOUNTING_ENABLED|ACCOUNTING_BANKING_ENABLED|ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED|ACCOUNTING_BANK_RECONCILIATION_ENABLED|ACCOUNTING_PRODUCTION_POSTING_ALLOWED)=/i.test(
        l.trim()
      )
    );
  ok(
    "U persistent flags OFF or absent",
    flagLines.length === 0 ||
      flagLines.every((l) => /=\s*0\s*$/.test(l) || /=\s*false\s*$/i.test(l))
  );

  console.log("\nTagged fixtures:");
  console.log(`  HDFC=${hdfc.id} GL=${hdfc.glAccountCode}`);
  console.log(`  ICICI=${icici.id} GL=${icici.glAccountCode}`);
  console.log(`  reconciliationId=${closed.id}`);
  console.log(`  statementImportId=${imp.id}`);

  if (results.every(Boolean)) {
    console.log("\nPHASE 4D BANK RECONCILIATION VALIDATED");
  } else {
    console.error("\nPHASE 4D VALIDATION FAILED — one or more checks failed");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("PHASE 4D VALIDATION FAILED —", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    delete process.env.ACCOUNTING_BANK_RECONCILIATION_ENABLED;
    delete process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED;
    delete process.env.ACCOUNTING_BANKING_ENABLED;
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await prisma.$disconnect();
  });
