/**
 * Native accounting certification preview against the connected DB.
 * Does NOT post journals. Safe with ACCOUNTING_PRODUCTION_POSTING_ALLOWED=0.
 *
 *   cd backend && npx tsx scripts/certify-native-accounting-preview.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { buildOrderPaidJournal } from "../src/modules/accounting/order-paid-journal.builder";
import { loadOrderPaidSnapshot } from "../src/modules/accounting/order-snapshot.service";
import { buildOrderRefundedFullJournal } from "../src/modules/accounting/order-refunded-full-journal.builder";
import { loadOrderRefundContext } from "../src/modules/accounting/order-refund-snapshot.service";

const prisma = new PrismaClient();

function balance(lines: Array<{ debitInPaise: number; creditInPaise: number }>) {
  const d = lines.reduce((s, l) => s + l.debitInPaise, 0);
  const c = lines.reduce((s, l) => s + l.creditInPaise, 0);
  return { d, c, ok: d === c && d > 0 };
}

async function main() {
  console.log("FLAGS", {
    NATIVE_ACCOUNTING_ENABLED: process.env.NATIVE_ACCOUNTING_ENABLED,
    ACCOUNTING_SALES_POSTING_ENABLED: process.env.ACCOUNTING_SALES_POSTING_ENABLED,
    ACCOUNTING_REFUND_POSTING_ENABLED: process.env.ACCOUNTING_REFUND_POSTING_ENABLED,
    ACCOUNTING_PRODUCTION_POSTING_ALLOWED: process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED
  });

  const results: Array<Record<string, unknown>> = [];

  const paid = await prisma.order.findFirst({
    where: {
      deletedAt: null,
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] },
      paymentStatus: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] },
      currency: "INR"
    },
    orderBy: { placedAt: "desc" },
    select: { id: true, orderNumber: true }
  });

  if (paid) {
    try {
      const snapshot = await loadOrderPaidSnapshot({ orderId: paid.id });
      const proposal = buildOrderPaidJournal(snapshot, { failOnImbalance: false });
      const b = balance(proposal.lines);
      results.push({
        event: "ORDER_PAID",
        orderNumber: paid.orderNumber,
        balanced: b.ok || (b.d === b.c && b.d === 0),
        debitEqualsCredit: b.d === b.c,
        debit: b.d,
        credit: b.c,
        lineCount: proposal.lines.length,
        taxBlock: proposal.diagnostics.taxPostingBlock?.code ?? null,
        warnings: proposal.diagnostics.warnings
      });
    } catch (err) {
      results.push({
        event: "ORDER_PAID",
        orderNumber: paid.orderNumber,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  } else {
    results.push({ event: "ORDER_PAID", skipped: true });
  }

  const refunded = await prisma.order.findFirst({
    where: { deletedAt: null, status: "REFUNDED", currency: "INR" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, orderNumber: true }
  });
  if (refunded) {
    try {
      const ctx = await loadOrderRefundContext({ orderId: refunded.id });
      if (!ctx.originalSale || ctx.originalSale.lines.length === 0) {
        results.push({
          event: "ORDER_REFUNDED_FULL",
          orderNumber: refunded.orderNumber,
          skipped: true,
          reason: "no_native_ORDER_PAID_journal_to_reverse — prospective posting only"
        });
      } else {
        const primaryRefund = ctx.refunds[0];
        if (!primaryRefund) {
          results.push({
            event: "ORDER_REFUNDED_FULL",
            orderNumber: refunded.orderNumber,
            skipped: true,
            reason: "no_refund_rows"
          });
        } else {
          const proposal = buildOrderRefundedFullJournal(
            {
              orderId: ctx.orderId,
              orderNumber: ctx.orderNumber,
              currency: ctx.currency,
              provider: ctx.provider,
              accountingDate: primaryRefund.createdAt,
              refund: primaryRefund,
              originalSale: ctx.originalSale
            },
            { failOnImbalance: false }
          );
          const b = balance(proposal.lines);
          results.push({
            event: "ORDER_REFUNDED_FULL",
            orderNumber: refunded.orderNumber,
            debitEqualsCredit: b.d === b.c,
            debit: b.d,
            credit: b.c,
            lineCount: proposal.lines.length
          });
        }
      }
    } catch (err) {
      results.push({
        event: "ORDER_REFUNDED_FULL",
        orderNumber: refunded.orderNumber,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  } else {
    results.push({ event: "ORDER_REFUNDED_FULL", skipped: true });
  }

  const postedEvents = await prisma.accountingPostingEvent.groupBy({
    by: ["eventType", "status"],
    _count: true
  });

  const journalCounts = await prisma.accountingJournalEntry.groupBy({
    by: ["status"],
    _count: true
  });

  const unbalancedPosted = await prisma.$queryRaw<
    Array<{ id: string; entry_number: string; debit: bigint; credit: bigint }>
  >`
    SELECT je.id, je."entryNumber" as entry_number,
      SUM(jl."debitInPaise")::bigint as debit,
      SUM(jl."creditInPaise")::bigint as credit
    FROM "AccountingJournalEntry" je
    JOIN "AccountingJournalLine" jl ON jl."journalEntryId" = je.id
    WHERE je.status = 'POSTED'
    GROUP BY je.id, je."entryNumber"
    HAVING SUM(jl."debitInPaise") <> SUM(jl."creditInPaise")
    LIMIT 20
  `;

  const missingNativePaid = await prisma.order.count({
    where: {
      deletedAt: null,
      status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] },
      paymentStatus: "CAPTURED",
      placedAt: { gte: new Date("2026-08-01") },
      NOT: {
        id: {
          in: (
            await prisma.accountingPostingEvent.findMany({
              where: { eventType: "ORDER_PAID", status: "POSTED" },
              select: { sourceId: true }
            })
          ).map((e) => e.sourceId)
        }
      }
    }
  });

  console.log(
    JSON.stringify(
      {
        results,
        postedEvents,
        journalCounts,
        unbalancedPostedCount: unbalancedPosted.length,
        unbalancedPosted,
        historicalOrdersMissingNativePaidSinceAug2026: missingNativePaid,
        historicalBackfillRecommendation:
          "PROSPECTIVE_ONLY — do not mass-backfill without explicit reconciliation job"
      },
      null,
      2
    )
  );

  const hardFail = results.some(
    (r) => r.error || r.debitEqualsCredit === false || (r.balanced === false && r.debitEqualsCredit === false)
  );
  process.exit(hardFail || unbalancedPosted.length > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
