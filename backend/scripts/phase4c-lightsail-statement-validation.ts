/**
 * Phase 4C Lightsail bank statement import + matching validation.
 *
 *   PHASE4C_LIGHTSAIL_STATEMENT_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   ACCOUNTING_BANKING_ENABLED=1 \
 *   ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   npx tsx scripts/phase4c-lightsail-statement-validation.ts
 *
 * Process-scoped flags only — operator must leave Lightsail .env OFF.
 */
import { createHash } from "crypto";
import path from "path";

import dotenv from "dotenv";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { seedAccountingChartOfAccounts, getAccountingAccountByCode } from "../src/modules/accounting/seed-coa";
import { createBankAccount } from "../src/modules/accounting/bank-account.service";
import { createBankTransferDraft } from "../src/modules/accounting/bank-transfer.service";
import { postBankTransfer } from "../src/modules/accounting/bank-transfer-posting.service";
import {
  commitBankStatementImport,
  previewBankStatementImport
} from "../src/modules/accounting/bank-statement-import.service";
import { buildPaymentGatewaySettledJournal } from "../src/modules/accounting/settlement-journal.builder";
import { postJournalFromEvent } from "../src/modules/accounting/posting-event.service";
import { PAYMENT_GATEWAY_SETTLED_EVENT_TYPE } from "../src/modules/accounting/settlement.constants";
import { postVendorBillPostedJournal } from "../src/modules/accounting/vendor-bill-posting.service";
import { loadVendorBillSnapshotById } from "../src/modules/accounting/vendor-bill-snapshot.service";
import { createVendorPaymentDraft } from "../src/modules/accounting/vendor-payment.service";
import { postVendorPayment } from "../src/modules/accounting/vendor-payment-posting.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";
import { BankStatementDuplicateFileError } from "../src/modules/accounting/accounting-errors";
import { createSyntheticVendorBill } from "../test/helpers/accounting-purchases";

const prisma = new PrismaClient();
const TAG = `TEST-ACC-STMT-${Date.now()}`;

function ok(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

function csvBuffer(rows: string[][]) {
  const header = "Transaction Date,Description,Reference,Debit,Credit,Balance";
  const body = rows.map((r) => r.join(",")).join("\n");
  return Buffer.from(`${header}\n${body}`, "utf8");
}

async function xlsxBuffer(rows: string[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Statement");
  ws.addRow(["Transaction Date", "Description", "Reference", "Debit", "Credit", "Balance"]);
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function postSettlement(
  bankAccountId: string,
  bankGl: string,
  utr: string,
  netInPaise: number
) {
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
  const accountIds = new Map<string, string>();
  for (const code of [...new Set(proposal.lines.map((l) => l.accountCode))]) {
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

async function postVendorPaymentToBank(
  bankAccountId: string,
  utr: string,
  amountInPaise: number
) {
  process.env.ACCOUNTING_PURCHASES_POSTING_ENABLED = "1";
  process.env.ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED = "1";
  const bill = await createSyntheticVendorBill({
    vendor: { name: `${TAG}-VENDOR` },
    lines: [{ variantId: null, itemName: "Service", quantity: 1, rateInPaise: amountInPaise, taxClass: "gst-zero-rate" }]
  });
  const snap = await loadVendorBillSnapshotById(bill.id);
  await postVendorBillPostedJournal(snap, { forcePersist: true });
  const draft = await createVendorPaymentDraft({
    vendorId: bill.vendorId,
    paymentDate: new Date("2026-08-25"),
    amountInPaise,
    paymentMethod: "BANK_TRANSFER",
    bankAccountId,
    utr,
    allocations: [{ vendorBillId: bill.id, amountInPaise }]
  });
  return postVendorPayment(draft.id, { forcePersist: true });
}

async function main() {
  if (!process.env.PHASE4C_LIGHTSAIL_STATEMENT_OK) {
    console.error("Set PHASE4C_LIGHTSAIL_STATEMENT_OK=1 to run on Lightsail");
    process.exit(1);
  }
  if (!isProductionLikeEnvironment()) {
    console.warn("WARN: DATABASE_URL does not look like Lightsail/production-like");
  }

  const results: boolean[] = [];
  const check = (label: string, pass: boolean, detail?: string) => {
    results.push(ok(label, pass, detail));
    return pass;
  };

  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_BANKING_ENABLED = "1";
  process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED = "1";
  process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";

  await seedAccountingChartOfAccounts();

  const suffix = String(Date.now() % 100).padStart(2, "0");
  const glHdfc = `20${suffix}`;
  const glIcici = `21${suffix}`;

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

  const rzpUtr = `${TAG}-RZPUTR`;
  const vpUtr = `${TAG}-VPUTR`;
  const xferRef = `${TAG}-XFER`;
  await postSettlement(hdfc.id, hdfc.glAccountCode, rzpUtr, 96_500);
  await postVendorPaymentToBank(hdfc.id, vpUtr, 35_000);

  const transfer = await createBankTransferDraft({
    transferDate: new Date("2026-08-25"),
    amountInPaise: 100_000,
    transferKind: "INTERNAL_TRANSFER",
    sourceBankAccountId: hdfc.id,
    destinationBankAccountId: icici.id,
    reference: xferRef
  });
  const xferPost = await postBankTransfer(transfer.id, { forcePersist: true });

  const journalBeforeImport = await prisma.accountingJournalEntry.count();

  const csv = csvBuffer([
    ["2026-08-25", "Razorpay settlement", rzpUtr, "", "965.00", "965.00"],
    ["2026-08-25", "Vendor payment", vpUtr, "350.00", "", "615.00"],
    ["2026-08-25", "Transfer out", xferRef, "1000.00", "", "0"],
    ["2026-08-30", "Unknown credit", "", "", "500.00", "500.00"],
    ["2026-08-30", "Bank charges", "", "59.00", "", "441.00"]
  ]);

  check("A CSV preview valid", (await previewBankStatementImport({
    bankAccountId: hdfc.id,
    fileName: `${TAG}.csv`,
    buffer: csv
  })).canCommit);

  const xlsx = await xlsxBuffer([["2026-08-25", "XLSX smoke", "XLSXREF123456", "", "10.00", "10.00"]]);
  check(
    "B XLSX preview valid",
    (
      await previewBankStatementImport({
        bankAccountId: hdfc.id,
        fileName: `${TAG}.xlsx`,
        buffer: xlsx
      })
    ).validRowCount === 1
  );

  const csvImp = await commitBankStatementImport({
    bankAccountId: hdfc.id,
    fileName: `${TAG}-commit.csv`,
    buffer: csv
  });

  let dupBlocked = false;
  try {
    await previewBankStatementImport({
      bankAccountId: hdfc.id,
      fileName: `${TAG}-commit.csv`,
      buffer: csv
    });
  } catch (e) {
    dupBlocked = e instanceof BankStatementDuplicateFileError;
  }
  check("C duplicate file blocked", dupBlocked);

  const rzpLine = csvImp.lines.find((l) => l.reference === rzpUtr);
  const vpLine = csvImp.lines.find((l) => l.reference === vpUtr);
  const xferLine = csvImp.lines.find((l) => l.reference === xferRef);
  const amtLine = csvImp.lines.find((l) => l.description === "Unknown credit");
  const chgLine = csvImp.lines.find((l) => l.description === "Bank charges");

  check("D exact Razorpay settlement match", rzpLine?.matchStatus === "MATCHED_EXACT");
  check("E exact VendorPayment match", vpLine?.matchStatus === "MATCHED_EXACT");
  check("F bank transfer debit leg match", xferLine?.matchStatus === "MATCHED_EXACT");

  const iciciStmt = csvBuffer([["2026-08-25", "Transfer in", xferRef, "", "1000.00", "1000.00"]]);
  const iciciImp = await commitBankStatementImport({
    bankAccountId: icici.id,
    fileName: `${TAG}-icici.csv`,
    buffer: iciciStmt
  });
  check(
    "G transfer credit leg same journal",
    iciciImp.lines[0]?.matchStatus === "MATCHED_EXACT" &&
      iciciImp.lines[0]?.matches[0]?.journalEntryId === xferPost.journal.id
  );

  check(
    "H amount-only NOT auto-matched",
    amtLine?.matchStatus !== "MATCHED_EXACT" &&
      !amtLine?.matches.some((m) => m.status === "CONFIRMED")
  );
  check("I bank charge stays unmatched", chgLine?.matchStatus === "UNMATCHED");

  const journalAfter = await prisma.accountingJournalEntry.count();
  check("J import/matching created ZERO GL journals", journalAfter === journalBeforeImport);

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
  check("K commerce fingerprints unchanged", commerceFpAfter === commerceFpBefore);

  const legacy1010After = await prisma.accountingJournalLine.count({
    where: { account: { code: "1010" } }
  });
  check("L legacy 1010 history unchanged", legacy1010After === legacy1010Before);

  const envText = await import("fs").then((fs) =>
    fs.promises.readFile(path.resolve(__dirname, "../.env"), "utf8").catch(() => "")
  );
  const flagLines = envText
    .split("\n")
    .filter((l) =>
      /^(NATIVE_ACCOUNTING_ENABLED|ACCOUNTING_BANKING_ENABLED|ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED)=/i.test(
        l.trim()
      )
    );
  check(
    "M persistent flags OFF or absent",
    flagLines.length === 0 ||
      flagLines.every((l) => /=\s*0\s*$/.test(l) || /=\s*false\s*$/i.test(l))
  );

  console.log("\nTagged fixtures (safe to retain pre-production):");
  console.log(`  HDFC bankAccountId=${hdfc.id} GL=${hdfc.glAccountCode}`);
  console.log(`  ICICI bankAccountId=${icici.id} GL=${icici.glAccountCode}`);
  console.log(`  statementImportId=${csvImp.id}`);
  console.log(`  transferJournal=${xferPost.journal.entryNumber}`);

  if (results.every(Boolean)) {
    console.log("\nPHASE 4C BANK STATEMENTS & MATCHING VALIDATED");
  } else {
    console.error("\nPHASE 4C VALIDATION FAILED — one or more checks failed");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("PHASE 4C VALIDATION FAILED —", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    delete process.env.ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED;
    delete process.env.ACCOUNTING_BANKING_ENABLED;
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await prisma.$disconnect();
  });
