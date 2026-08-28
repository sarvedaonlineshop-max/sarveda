"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Landmark,
  Receipt,
  ShoppingCart,
  Wallet
} from "lucide-react";

import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingQuickAction,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  humanizeAccountingStatusCode
} from "@/components/admin/accounting/accounting-ui";
import {
  fetchAccountingDashboard,
  fetchAccountingJournals,
  fetchAccountingStatus,
  fetchBankingDashboard,
  fetchFinancialDashboard,
  fetchFinancialIntegrity,
  fetchFinancialYearConfig,
  fetchPurchaseAccountingDashboard,
  formatInrPaise,
  type AccountingDashboard,
  type AccountingJournalEntry,
  type AccountingStatus,
  type FinancialDashboardReport,
  type FinancialIntegrityReport,
  type FinancialYearSummary,
  type PurchaseAccountingDashboard
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";
import { isPurchasesEnabled } from "@/lib/purchases-api";

type AttentionItem = {
  id: string;
  title: string;
  detail?: string;
  href: string;
  tone: "warning" | "error" | "info";
};

function ymd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminAccountingDashboardPage() {
  const [status, setStatus] = useState<AccountingStatus | null>(null);
  const [dashboard, setDashboard] = useState<AccountingDashboard | null>(null);
  const [fy, setFy] = useState<FinancialYearSummary | null>(null);
  const [financial, setFinancial] = useState<FinancialDashboardReport | null>(null);
  const [purchases, setPurchases] = useState<PurchaseAccountingDashboard | null>(null);
  const [bankingCashPaise, setBankingCashPaise] = useState<number | null>(null);
  const [unreconciledHint, setUnreconciledHint] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<FinancialIntegrityReport | null>(null);
  const [journals, setJournals] = useState<AccountingJournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const s = await fetchAccountingStatus();
        setStatus(s);

        if (!s.nativeAccountingEnabled) {
          setLoading(false);
          return;
        }

        const basic = await fetchAccountingDashboard();
        setDashboard(basic);

        let fyCfg: FinancialYearSummary | null = null;
        if (s.reportsEnabled) {
          try {
            fyCfg = await fetchFinancialYearConfig();
            setFy(fyCfg);
            const from = fyCfg.currentFy.startDate.slice(0, 10);
            const to = ymd(new Date());
            const [fin, integ] = await Promise.all([
              fetchFinancialDashboard({ from, to, asOf: to }),
              fetchFinancialIntegrity({ from, to, asOf: to })
            ]);
            setFinancial(fin);
            setIntegrity(integ);
          } catch {
            /* reports may be gated */
          }
        }

        if (s.purchasesPostingEnabled) {
          try {
            setPurchases(await fetchPurchaseAccountingDashboard());
          } catch {
            /* optional */
          }
        }

        if (s.bankingEnabled) {
          try {
            const bank = await fetchBankingDashboard();
            const cash = (bank.accounts ?? []).reduce((sum, a) => sum + (a.bookBalanceInPaise ?? 0), 0);
            setBankingCashPaise(cash);
            const gatewayIssues = (bank.gatewayControls ?? []).filter(
              (g) => (g.warnings?.length ?? 0) > 0 || String(g.status).toUpperCase().includes("WARN")
            );
            if (gatewayIssues.length) {
              setUnreconciledHint(`${gatewayIssues.length} gateway clearing item(s) need review`);
            }
          } catch {
            /* optional */
          }
        }

        try {
          const j = await fetchAccountingJournals(8, 0);
          setJournals(j.items ?? []);
        } catch {
          /* optional */
        }
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Failed to load accounting overview");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const attention: AttentionItem[] = [];
  if (dashboard && dashboard.failedPostingEvents > 0) {
    attention.push({
      id: "failed-postings",
      title: `${dashboard.failedPostingEvents} failed posting event${dashboard.failedPostingEvents === 1 ? "" : "s"}`,
      detail: "Review sales entries and journals for failed posts.",
      href: "/admin/accounting/order-paid",
      tone: "error"
    });
  }
  if (dashboard && (dashboard.pendingPostingEvents ?? 0) > 0) {
    attention.push({
      id: "pending-postings",
      title: `${dashboard.pendingPostingEvents} pending posting event${dashboard.pendingPostingEvents === 1 ? "" : "s"}`,
      detail: "Find unposted transactions from sales or settlements.",
      href: "/admin/accounting/order-paid",
      tone: "warning"
    });
  }
  if (purchases?.dataQuality.opsPaidNativeUnpaidCount) {
    attention.push({
      id: "ops-paid-native",
      title: `${purchases.dataQuality.opsPaidNativeUnpaidCount} bill(s) marked paid in ops without native payment`,
      detail: "Record vendor payments so AP stays accurate.",
      href: "/admin/accounting/vendor-payments",
      tone: "warning"
    });
  }
  if (purchases?.expenses.gstDataGapCount) {
    attention.push({
      id: "gst-gaps",
      title: `${purchases.expenses.gstDataGapCount} GST item(s) need attention`,
      detail: "Review GST & ITC for incomplete tax data.",
      href: "/admin/accounting/gst",
      tone: "info"
    });
  }
  if (integrity && integrity.overallStatus === "REVIEW_REQUIRED") {
    attention.push({
      id: "integrity",
      title: "Financial health needs review",
      detail: `${integrity.summary.fail} fail · ${integrity.summary.warning} warning · ${integrity.summary.dataGap} need attention`,
      href: "/admin/accounting/reports",
      tone: "warning"
    });
  }
  if (unreconciledHint) {
    attention.push({
      id: "gateway",
      title: unreconciledHint,
      detail: "Open Banking to review gateway clearing balances.",
      href: "/admin/accounting/banking",
      tone: "info"
    });
  }

  const asOfLabel = financial?.asOf
    ? formatShortDate(financial.asOf)
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const purchasesEnabled = isPurchasesEnabled();

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Accounting Overview"
        subtitle="Monitor your financial position and items that need attention."
        meta={
          <div className="space-y-0.5">
            {fy?.currentFy?.label ? <div className="font-semibold text-[#1c352a]">{fy.currentFy.label}</div> : null}
            <div>As of {asOfLabel}</div>
          </div>
        }
      />

      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}

      {status && !status.nativeAccountingEnabled ? (
        <AccountingAlert tone="warning" title="Native accounting is off">
          Enable native accounting on the API server to load books data here. Storefront commerce is unchanged.
        </AccountingAlert>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#8a7060]">Loading overview…</p>
      ) : null}

      {/* Primary KPIs */}
      {financial || purchases ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {financial ? (
            <AccountingMetricCard
              label="Sales"
              value={formatInrPaise(financial.profitAndLoss.netRevenueInPaise)}
              hint="Net product sales this FY to date"
              href="/admin/accounting/reports"
            />
          ) : (
            <AccountingMetricCard label="Sales" unavailable hint="Enable financial reports to view" />
          )}
          {purchases ? (
            <AccountingMetricCard
              label="Purchases"
              value={formatInrPaise(purchases.vendorBills.totalNativeApRecognizedInPaise)}
              hint="Native AP recognized"
              href="/admin/accounting/purchases"
            />
          ) : (
            <AccountingMetricCard label="Purchases" unavailable hint="Purchase books not loaded" />
          )}
          {purchases ? (
            <AccountingMetricCard
              label="Expenses"
              value={formatInrPaise(purchases.expenses.totalPostedStandaloneInPaise)}
              hint={`${purchases.expenses.postedCount} posted standalone expense(s)`}
              href={purchasesEnabled ? "/admin/purchases/expenses" : "/admin/accounting/expenses"}
            />
          ) : financial ? (
            <AccountingMetricCard
              label="Expenses"
              value={formatInrPaise(financial.profitAndLoss.operatingExpensesInPaise)}
              hint="Operating expenses (P&L)"
              href="/admin/accounting/reports"
            />
          ) : (
            <AccountingMetricCard label="Expenses" unavailable />
          )}
          {financial ? (
            <AccountingMetricCard
              label="Net Profit"
              value={formatInrPaise(financial.profitAndLoss.netProfitInPaise)}
              hint="FY to date"
              href="/admin/accounting/reports"
            />
          ) : (
            <AccountingMetricCard label="Net Profit" unavailable hint="Enable financial reports to view" />
          )}
        </div>
      ) : null}

      {/* Second row */}
      {(financial || bankingCashPaise != null || purchases) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {bankingCashPaise != null ? (
            <AccountingMetricCard
              label="Bank & Cash"
              value={formatInrPaise(bankingCashPaise)}
              hint="Book balances from banking"
              href="/admin/accounting/banking"
            />
          ) : financial ? (
            <AccountingMetricCard
              label="Bank & Cash"
              value={formatInrPaise(financial.balanceSheet.cashAndBankInPaise)}
              hint="From balance sheet"
              href="/admin/accounting/banking"
            />
          ) : null}
          {financial ? (
            <AccountingMetricCard
              label="Inventory Value"
              value={formatInrPaise(financial.balanceSheet.inventoryInPaise)}
              hint="Balance sheet inventory"
              href="/admin/accounting/inventory"
            />
          ) : null}
          {purchases ? (
            <AccountingMetricCard
              label="Accounts Payable"
              value={formatInrPaise(purchases.vendorBills.totalNativeOutstandingInPaise)}
              hint={
                purchases.vendorBills.overdueOutstandingInPaise
                  ? `${formatInrPaise(purchases.vendorBills.overdueOutstandingInPaise)} overdue`
                  : "Outstanding AP"
              }
              href="/admin/accounting/vendor-payments"
            />
          ) : financial ? (
            <AccountingMetricCard
              label="Accounts Payable"
              value={formatInrPaise(financial.balanceSheet.accountsPayableInPaise)}
              hint="From balance sheet"
              href="/admin/accounting/vendor-payments"
            />
          ) : null}
          {financial ? (
            <AccountingMetricCard
              label="GST Position"
              value={formatInrPaise(
                financial.balanceSheet.outputGstLiabilityInPaise -
                  financial.balanceSheet.inputGstAssetInPaise
              )}
              hint="Output GST − input GST (estimate)"
              href="/admin/accounting/gst"
            />
          ) : null}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <AccountingSectionCard>
          <AccountingSectionHeader
            title="Needs Attention"
            description="Items that may need finance follow-up"
          />
          {attention.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Nothing urgent right now</p>
                <p className="text-xs text-emerald-800/80">
                  Failed posts, AP mismatches, and financial health checks look clear from available data.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-[#f0ece6]">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 py-3 transition-colors hover:bg-[#faf5ec]/80"
                  >
                    <span className="mt-0.5 shrink-0 text-[#8a7060]" aria-hidden>
                      {item.tone === "error" ? (
                        <AlertTriangle size={16} className="text-red-600" />
                      ) : item.tone === "warning" ? (
                        <AlertTriangle size={16} className="text-amber-600" />
                      ) : (
                        <Info size={16} className="text-slate-600" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#2c2420]">{item.title}</span>
                      {item.detail ? (
                        <span className="mt-0.5 block text-xs text-[#8a7060]">{item.detail}</span>
                      ) : null}
                    </span>
                    <ArrowRight size={14} className="mt-1 shrink-0 text-[#b98a3e]" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AccountingSectionCard>

        <AccountingSectionCard>
          <AccountingSectionHeader title="Quick Actions" description="Common finance workflows" />
          <div className="grid gap-2 sm:grid-cols-2">
            {purchasesEnabled ? (
              <AccountingQuickAction
                href="/admin/purchases/purchase-orders/new"
                label="New Purchase Order"
                hint="Create a PO"
              />
            ) : null}
            {purchasesEnabled ? (
              <AccountingQuickAction href="/admin/purchases/expenses" label="Record Expense" hint="Ops expense" />
            ) : (
              <AccountingQuickAction
                href="/admin/accounting/expenses"
                label="Expense Recognition"
                hint="Post expense journals"
              />
            )}
            {purchasesEnabled ? (
              <AccountingQuickAction href="/admin/purchases/bills" label="Vendor Bills" hint="Ops bills list" />
            ) : (
              <AccountingQuickAction
                href="/admin/accounting/vendor-bills"
                label="Bill Recognition"
                hint="AP postings"
              />
            )}
            <AccountingQuickAction
              href="/admin/accounting/vendor-payments"
              label="Vendor Payments"
              hint="Settle AP"
            />
            <AccountingQuickAction
              href="/admin/accounting/banking"
              label="Import Bank Statement"
              hint="Banking workspace"
            />
            <AccountingQuickAction
              href="/admin/accounting/reports"
              label="View Profit & Loss"
              hint="Financial reports"
            />
            <AccountingQuickAction href="/admin/accounting/journals" label="View Journals" hint="Recent entries" />
          </div>
        </AccountingSectionCard>
      </div>

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Recent Journals"
          description="Latest ledger activity"
          action={
            <Link href="/admin/accounting/journals" className="text-xs font-semibold text-[#1c352a] underline">
              View all
            </Link>
          }
        />
        {journals.length === 0 ? (
          <AccountingEmptyState
            title="No journals to show"
            description="Posted or draft journals will appear here once available."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#e8e2d9] text-left">
                  {["Date", "Transaction", "Reference", "Amount", "Status"].map((h) => (
                    <th
                      key={h}
                      className={`px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a7060] ${
                        h === "Amount" ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journals.map((j) => (
                  <tr key={j.id} className="border-b border-[#f0ece6] last:border-0 hover:bg-[#faf5ec]/70">
                    <td className="px-2 py-[11px] text-[13px] text-[#4a3f38]">{formatShortDate(j.entryDate)}</td>
                    <td className="max-w-[220px] truncate px-2 py-[11px] text-[13px] text-[#2c2420]">
                      {j.memo?.trim() || "Journal entry"}
                    </td>
                    <td className="px-2 py-[11px] font-mono text-[12px] text-[#6b5c52]">{j.entryNumber}</td>
                    <td
                      className="px-2 py-[11px] text-right text-[13px] font-semibold tabular-nums text-[#1c352a]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatInrPaise(j.totalDebitInPaise)}
                    </td>
                    <td className="px-2 py-[11px]">
                      <AccountingStatusBadge
                        tone={
                          j.status === "POSTED" ? "success" : j.status === "VOID" ? "error" : "neutral"
                        }
                      >
                        {j.status}
                      </AccountingStatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AccountingSectionCard>

      {/* System / Accounting Health — secondary */}
      {dashboard ? (
        <AccountingSectionCard>
          <AccountingSectionHeader
            title="System / Accounting Health"
            description="Ledger system counts for finance ops"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[#e8e2d9] bg-[#faf5ec]/50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">Chart of Accounts</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#1c352a]">{dashboard.accountCount}</p>
            </div>
            <div className="rounded-lg border border-[#e8e2d9] bg-[#faf5ec]/50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">Journal entries</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#1c352a]">{dashboard.journalCount}</p>
            </div>
            <div className="rounded-lg border border-[#e8e2d9] bg-[#faf5ec]/50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">Posted journals</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#1c352a]">{dashboard.postedJournalCount}</p>
            </div>
            <div className="rounded-lg border border-[#e8e2d9] bg-[#faf5ec]/50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">Failed posting events</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#1c352a]">{dashboard.failedPostingEvents}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#8a7060]">
            <Landmark size={14} aria-hidden />
            <span>
              Find unposted transactions: use Sales Entries or Gateway Settlements discovery actions.
            </span>
            {integrity ? (
              <AccountingStatusBadge
                tone={integrity.overallStatus === "FINANCIAL_REPORTING_ENGINE_HEALTHY" ? "success" : "warning"}
              >
                Financial health: {humanizeAccountingStatusCode(integrity.overallStatus)}
              </AccountingStatusBadge>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#8a7060]">
            <span className="inline-flex items-center gap-1">
              <ShoppingCart size={12} aria-hidden /> Sales entries
            </span>
            <span className="inline-flex items-center gap-1">
              <Wallet size={12} aria-hidden /> Banking
            </span>
            <span className="inline-flex items-center gap-1">
              <Receipt size={12} aria-hidden /> GST &amp; ITC
            </span>
          </div>
        </AccountingSectionCard>
      ) : null}
    </div>
  );
}
