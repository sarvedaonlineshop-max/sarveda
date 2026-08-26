/**
 * Phase 4B Lightsail banking foundation validation.
 *
 *   PHASE4B_LIGHTSAIL_BANKING_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   ACCOUNTING_BANKING_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   npx tsx scripts/phase4b-lightsail-banking-validation.ts
 *
 * Process-scoped flags only — operator must leave Lightsail .env OFF.
 */
import { createHash } from "crypto";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";
import { createBankAccount } from "../src/modules/accounting/bank-account.service";
import { createBankTransferDraft } from "../src/modules/accounting/bank-transfer.service";
import { postBankTransfer } from "../src/modules/accounting/bank-transfer-posting.service";
import { buildPaymentGatewaySettledJournal } from "../src/modules/accounting/settlement-journal.builder";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";

const prisma = new PrismaClient();
const TAG = `TEST-ACC-BANK-${Date.now()}`;

function ok(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

async function main() {
  if (!process.env.PHASE4B_LIGHTSAIL_BANKING_OK) {
    console.error("Set PHASE4B_LIGHTSAIL_BANKING_OK=1 to run on Lightsail");
    process.exit(1);
  }
  if (!isProductionLikeEnvironment()) {
    console.warn("WARN: DATABASE_URL does not look like Lightsail/production-like");
  }

  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_BANKING_ENABLED = "1";
  process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";

  await seedAccountingChartOfAccounts();

  const suffix = String(Date.now() % 100).padStart(2, "0");
  const glHdfc = `10${suffix}`;
  const glIcici = `11${suffix}`;
  const glCash = `12${suffix}`;

  const hdfc = await createBankAccount({
    name: `${TAG}-HDFC`,
    bankName: "TEST",
    glAccountCode: glHdfc,
    accountType: "BANK",
    createGlIfMissing: true,
    razorpaySettlementTarget: true
  });
  const icici = await createBankAccount({
    name: `${TAG}-ICICI`,
    bankName: "TEST",
    glAccountCode: glIcici,
    accountType: "BANK",
    createGlIfMissing: true
  });
  const cash = await createBankAccount({
    name: `${TAG}-CASH`,
    glAccountCode: glCash,
    accountType: "CASH",
    createGlIfMissing: true
  });

  ok("A two bank accounts different GL", hdfc.glAccountCode !== icici.glAccountCode);

  const transfer = await createBankTransferDraft({
    transferDate: new Date("2026-08-25"),
    amountInPaise: 10_000_000,
    transferKind: "INTERNAL_TRANSFER",
    sourceBankAccountId: hdfc.id,
    destinationBankAccountId: icici.id,
    reference: `${TAG}-UTR`
  });

  const post1 = await postBankTransfer(transfer.id, { forcePersist: true });
  const post2 = await postBankTransfer(transfer.id, { forcePersist: true });
  ok("B transfer journal balanced", post1.proposal.balanced);
  ok(
    "B Dr destination / Cr source",
    post1.proposal.lines.find((l) => l.accountCode === glIcici)?.debitInPaise === 10_000_000 &&
      post1.proposal.lines.find((l) => l.accountCode === glHdfc)?.creditInPaise === 10_000_000
  );
  ok("C replay no duplicate journal", post1.duplicate === false && post2.duplicate === true);

  const dep = await createBankTransferDraft({
    transferDate: new Date("2026-08-25"),
    amountInPaise: 50_000,
    transferKind: "CASH_DEPOSIT",
    sourceBankAccountId: cash.id,
    destinationBankAccountId: hdfc.id
  });
  const depPost = await postBankTransfer(dep.id, { forcePersist: true });
  ok(
    "D cash deposit direction",
    depPost.proposal.lines.find((l) => l.accountCode === glHdfc)?.debitInPaise === 50_000 &&
      depPost.proposal.lines.find((l) => l.accountCode === glCash)?.creditInPaise === 50_000
  );

  const legacy1010Count = await prisma.accountingJournalLine.count({
    where: {
      account: { code: "1010" },
      journalEntry: { entryNumber: { in: [post1.journal.entryNumber] } }
    }
  });
  ok("I new transfer not on legacy 1010", legacy1010Count === 0);

  const proposal = buildPaymentGatewaySettledJournal(
    {
      provider: "RAZORPAY",
      providerSettlementId: `${TAG}-setl`,
      currency: "INR",
      settledAt: new Date("2026-08-25"),
      utr: `${TAG}-UTR-SETTLE`,
      grossInPaise: 100_000,
      feeInPaise: 2000,
      taxInPaise: 360,
      netInPaise: 97_640,
      sourcePayloadHash: createHash("sha256").update(TAG).digest("hex"),
      header: { id: `${TAG}-setl`, amount: 100_000, created_at: 0 },
      reconLines: [],
      mappedLines: [
        {
          lineType: "PAYMENT",
          providerEntityId: "pay_x",
          amountInPaise: 100_000,
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
  ok(
    "F settlement targets configured bank GL",
    proposal.lines.find((l) => l.accountCode === hdfc.glAccountCode)?.debitInPaise === 97_640 &&
      Boolean(proposal.utr)
  );

  console.log("\nTagged fixtures (safe to cleanup pre-production):");
  console.log(`  HDFC bankAccountId=${hdfc.id} GL=${hdfc.glAccountCode}`);
  console.log(`  ICICI bankAccountId=${icici.id} GL=${icici.glAccountCode}`);
  console.log(`  transferId=${transfer.id} journal=${post1.journal.entryNumber}`);

  console.log("\nPHASE 4B BANK FOUNDATION VALIDATED");
}

main()
  .catch((e) => {
    console.error("PHASE 4B VALIDATION FAILED —", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    delete process.env.ACCOUNTING_BANKING_ENABLED;
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await prisma.$disconnect();
  });
