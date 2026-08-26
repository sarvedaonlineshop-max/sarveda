/**
 * Phase 2D Lightsail settlement shadow validation (GET-only + Accounting* writes).
 *
 *   PHASE2D_LIGHTSAIL_SETTLEMENT_OK=1 \
 *   NATIVE_ACCOUNTING_ENABLED=1 \
 *   ACCOUNTING_SETTLEMENT_POSTING_ENABLED=1 \
 *   ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
 *   npx tsx scripts/phase2d-lightsail-settlement-validation.ts
 */
import { createHash } from "crypto";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";
import { createRazorpaySettlementReadClient } from "../src/modules/accounting/razorpay-settlement.adapter";
import {
  postRazorpaySettlement,
  previewRazorpaySettlement
} from "../src/modules/accounting/settlement-posting.service";
import { buildSettlementBatchReconciliation } from "../src/modules/accounting/reconciliation.service";
import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";

const prisma = new PrismaClient();

function hash(v: unknown) {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
}

async function commerceFingerprint(paymentIds: string[]) {
  const payments = await prisma.payment.findMany({
    where: { id: { in: paymentIds } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      amountInPaise: true,
      gatewayFeeInPaise: true,
      settledInPaise: true,
      settlementDate: true,
      refundedInPaise: true,
      updatedAt: true
    }
  });
  const orderIds = [
    ...new Set(
      (
        await prisma.payment.findMany({
          where: { id: { in: paymentIds } },
          select: { orderId: true }
        })
      ).map((p) => p.orderId)
    )
  ];
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      grandTotalInPaise: true,
      zohoInvoiceId: true,
      zohoInvoiceNo: true,
      updatedAt: true
    }
  });
  const refunds = await prisma.refund.findMany({
    where: { paymentId: { in: paymentIds } },
    select: { id: true, amountInPaise: true, status: true, providerRefundId: true }
  });
  return {
    payments: hash(payments),
    orders: hash(orders),
    refunds: hash(refunds),
    paymentCount: payments.length,
    orderCount: orders.length
  };
}

async function main() {
  if (process.env.PHASE2D_LIGHTSAIL_SETTLEMENT_OK !== "1") {
    throw new Error("Set PHASE2D_LIGHTSAIL_SETTLEMENT_OK=1");
  }

  const report: Record<string, unknown> = {
    ENVIRONMENT: "PRE-LAUNCH LIGHTSAIL",
    productionLike: isProductionLikeEnvironment(),
    COMMERCE_MODIFICATIONS: "NONE"
  };

  await seedAccountingChartOfAccounts();
  const client = createRazorpaySettlementReadClient();
  const list = await client.listSettlements({ count: 5, skip: 0 });
  report.listedSettlements = list.map((s) => ({
    id: s.id,
    amount: s.amount,
    utr: s.utr,
    created_at: s.created_at
  }));

  // Prefer smallest net for first controlled post
  const sorted = [...list].sort((a, b) => a.amount - b.amount);
  const target = sorted[0];
  if (!target) throw new Error("No settlements returned");
  report.selectedSettlementId = target.id;

  const preview = await previewRazorpaySettlement(target.id, { client });
  report.preview = {
    balanced: preview.proposal?.balanced ?? false,
    imbalance: preview.proposal?.imbalancePaise ?? null,
    debit: preview.proposal?.totalDebitPaise ?? null,
    credit: preview.proposal?.totalCreditPaise ?? null,
    summary: preview.summary,
    diagnostics: preview.proposal?.diagnostics ?? null,
    buildError: preview.buildError ?? null
  };

  const mappedPaymentIds = preview.bundle.mappedLines
    .map((l) => l.paymentId)
    .filter((x): x is string => Boolean(x));
  const beforeFp = await commerceFingerprint(mappedPaymentIds);
  report.commerceFingerprintBefore = beforeFp;

  if (!preview.proposal?.balanced) {
    report.verdict = "PHASE 2D SETTLEMENT VALIDATION FAILED";
    report.reason = "preview unbalanced or unexplained lines";
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = "1";
  process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED = "1";

  const post1 = await postRazorpaySettlement(target.id, { client });
  const post2 = await postRazorpaySettlement(target.id, { client });
  const afterFp = await commerceFingerprint(mappedPaymentIds);
  if (JSON.stringify(beforeFp) !== JSON.stringify(afterFp)) {
    report.verdict = "PHASE 2D SETTLEMENT VALIDATION FAILED";
    report.reason = "COMMERCE MUTATION DETECTED";
    report.afterFp = afterFp;
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const batch = await buildSettlementBatchReconciliation(target.id);
  report.post = {
    duplicateFirst: post1.duplicate,
    journal: post1.journal.entryNumber,
    debit: post1.journal.totalDebitInPaise,
    credit: post1.journal.totalCreditInPaise,
    replayDuplicate: post2.duplicate,
    batch
  };

  // Optional second settlement preview-only (no post) within cap
  const second = sorted[1];
  if (second) {
    const p2 = await previewRazorpaySettlement(second.id, { client });
    report.secondPreviewOnly = {
      id: second.id,
      balanced: p2.proposal?.balanced ?? false,
      summary: p2.summary,
      posted: false
    };
  }

  process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = "0";
  delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;

  report.ACCOUNTING_SHADOW_WRITES = {
    settlementId: target.id,
    journalEntryNumber: post1.journal.entryNumber,
    lines: post1.proposal.lines
  };
  report.verdict = "PHASE 2D SETTLEMENT SHADOW VALIDATED";

  const fs = await import("fs");
  fs.writeFileSync("/tmp/phase2d-settlement-report.json", JSON.stringify(report, null, 2));
  console.log("WROTE_REPORT /tmp/phase2d-settlement-report.json");
  console.log(report.verdict);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
