"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  discoverOrderPaidAccounting,
  discoverOrderRefundedFullAccounting,
  fetchAccountingDashboard,
  fetchBankingDashboard,
  formatInrPaise,
  listAccountingSettlements
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingQuickAction,
  AccountingSectionCard,
  AccountingSectionHeader,
  SalesPageShell,
  settlementStatusLabel
} from "@/components/admin/accounting/sales/sales-ui";

type AttentionItem = { label: string; href: string; hint?: string };

export default function SalesAccountingOverviewPage() {
  const [salesCount, setSalesCount] = useState<number | null>(null);
  const [refundCount, setRefundCount] = useState<number | null>(null);
  const [settlementCount, setSettlementCount] = useState<number | null>(null);
  const [gatewayOutstanding, setGatewayOutstanding] = useState<number | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      const items: AttentionItem[] = [];
      try {
        const [dash, settlements, banking] = await Promise.all([
          fetchAccountingDashboard().catch(() => null),
          listAccountingSettlements(25).catch(() => null),
          fetchBankingDashboard().catch(() => null)
        ]);

        if (dash?.orderPaidPostedCount != null) setSalesCount(dash.orderPaidPostedCount);
        if (dash?.orderRefundedFullPostedCount != null) {
          setRefundCount(dash.orderRefundedFullPostedCount);
        }
        if (settlements) setSettlementCount(settlements.count);

        const gateways = banking?.gatewayControls ?? [];
        const complete = gateways.filter((g) =>
          ["CLEAR", "OUTSTANDING", "REVIEW_REQUIRED"].includes(g.status)
        );
        if (complete.length > 0) {
          const total = complete.reduce((s, g) => s + g.balanceInPaise, 0);
          setGatewayOutstanding(total);
          if (total > 0 || complete.some((g) => g.status === "OUTSTANDING" || g.status === "REVIEW_REQUIRED")) {
            items.push({
              label: "Gateway clearing outstanding",
              href: "/admin/accounting/banking/gateway",
              hint: formatInrPaise(total)
            });
          }
        }

        if (settlements?.rows?.length) {
          const awaiting = settlements.rows.filter(
            (r) => !r.journalEntryNumber && ["IMPORTED", "PREVIEWED", "FAILED", "MISMATCH"].includes(String(r.status))
          );
          if (awaiting.length > 0) {
            items.push({
              label: "Settlements awaiting review",
              href: "/admin/accounting/settlements",
              hint: `${awaiting.length} · ${settlementStatusLabel(String(awaiting[0]?.status ?? ""))}`
            });
          }
        }

        try {
          const salesDiscover = await discoverOrderPaidAccounting({ dryRun: true, limit: 10 });
          if (salesDiscover.eligible > 0) {
            items.push({
              label: "Eligible sales entries not yet recorded",
              href: "/admin/accounting/order-paid",
              hint: `${salesDiscover.eligible} of ${salesDiscover.scanned} reviewed`
            });
          }
        } catch {
          /* discover optional for overview */
        }

        try {
          const refundDiscover = await discoverOrderRefundedFullAccounting({
            dryRun: true,
            limit: 10
          });
          if (refundDiscover.autoPostable > 0) {
            items.push({
              label: "Refund entries needing attention",
              href: "/admin/accounting/order-refunded-full",
              hint: `${refundDiscover.autoPostable} eligible`
            });
          }
        } catch {
          /* optional */
        }

        setAttention(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sales overview could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SalesPageShell
      title="Sales Accounting"
      subtitle="Review sales entries, refunds and payment gateway settlements."
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {salesCount != null ? (
          <AccountingMetricCard
            label="Sales Entries Recorded"
            value={String(salesCount)}
            hint="Paid orders in the books"
            href="/admin/accounting/order-paid"
          />
        ) : null}
        {refundCount != null ? (
          <AccountingMetricCard
            label="Refunds Recorded"
            value={String(refundCount)}
            hint="Full refunds in the books"
            href="/admin/accounting/order-refunded-full"
          />
        ) : null}
        {settlementCount != null ? (
          <AccountingMetricCard
            label="Settlements Recorded"
            value={String(settlementCount)}
            hint="Imported gateway settlements"
            href="/admin/accounting/settlements"
          />
        ) : null}
        {gatewayOutstanding != null ? (
          <AccountingMetricCard
            label="Gateway Clearing Outstanding"
            value={formatInrPaise(gatewayOutstanding)}
            hint="Awaiting bank settlement"
            href="/admin/accounting/banking/gateway"
          />
        ) : null}
      </div>

      {!loading &&
      salesCount == null &&
      refundCount == null &&
      settlementCount == null &&
      gatewayOutstanding == null ? (
        <AccountingEmptyState
          title="Sales metrics unavailable"
          description="Open Sales Entries, Refunds or Gateway Settlements to work with existing accounting data."
        />
      ) : null}

      <AccountingSectionCard>
        <AccountingSectionHeader title="Needs Attention" />
        {attention.length === 0 ? (
          <AccountingEmptyState title="No sales accounting items need attention." />
        ) : (
          <ul className="space-y-2">
            {attention.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ebe4db] bg-[#faf5ec]/50 px-3 py-2.5 text-sm transition-colors hover:bg-white"
                >
                  <span className="font-medium text-[#2c2420]">{item.label}</span>
                  {item.hint ? (
                    <span className="text-xs tabular-nums text-[#8a7060]">{item.hint}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AccountingSectionCard>

      <AccountingSectionCard>
        <AccountingSectionHeader title="Quick Actions" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <AccountingQuickAction
            href="/admin/accounting/order-paid"
            label="Record Sales Entry"
            hint="Paid customer order"
          />
          <AccountingQuickAction
            href="/admin/accounting/order-refunded-full"
            label="Record Refund"
            hint="Eligible full refund"
          />
          <AccountingQuickAction
            href="/admin/accounting/settlements"
            label="Review Settlements"
            hint="Gateway payouts"
          />
          <AccountingQuickAction
            href="/admin/accounting/banking/gateway"
            label="Open Gateway Clearing"
            hint="Banking balances"
          />
        </div>
      </AccountingSectionCard>
    </SalesPageShell>
  );
}
