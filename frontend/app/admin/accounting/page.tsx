"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Info,
  Landmark,
  Package,
  PieChart,
  Receipt,
  ScrollText,
  ShoppingBag,
  TrendingUp,
  Upload,
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
  severityLabel: string;
};

const kpiIcon = { size: 16, strokeWidth: 2 } as const;
const qaIcon = { size: 16, strokeWidth: 2 } as const;

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

        if (s.reportsEnabled) {
          try {
            const fyCfg = await fetchFinancialYearConfig();
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
              setUnreconciledHint(
                `${gatewayIssues.length} gateway clearing item${gatewayIssues.length === 1 ? "" : "s"} need review`
              );
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
      tone: "error",
      severityLabel: "Critical"
    });
  }
  if (dashboard && (dashboard.pendingPostingEvents ?? 0) > 0) {
    attention.push({
      id: "pending-postings",
      title: `${dashboard.pendingPostingEvents} pending posting event${dashboard.pendingPostingEvents === 1 ? "" : "s"}`,
      detail: "Find unposted transactions from sales or settlements.",
      href: "/admin/accounting/order-paid",
      tone: "warning",
      severityLabel: "Warning"
    });
  }
  if (purchases?.dataQuality.opsPaidNativeUnpaidCount) {
    attention.push({
      id: "ops-paid-native",
      title: `${purchases.dataQuality.opsPaidNativeUnpaidCount} bill(s) marked paid in ops without book payment`,
      detail: "Record vendor payments so accounts payable stays accurate.",
      href: "/admin/accounting/vendor-payments",
      tone: "warning",
      severityLabel: "Warning"
    });
  }
  if (purchases?.expenses.gstDataGapCount) {
    attention.push({
      id: "gst-gaps",
      title: `${purchases.expenses.gstDataGapCount} GST item(s) need attention`,
      detail: "Review GST & ITC for incomplete tax data.",
      href: "/admin/accounting/gst",
      tone: "info",
      severityLabel: "Review"
    });
  }
  if (integrity && integrity.overallStatus === "REVIEW_REQUIRED") {
    attention.push({
      id: "integrity",
      title: "Financial health needs review",
      detail: `${integrity.summary.fail} fail · ${integrity.summary.warning} warning · ${integrity.summary.dataGap} need attention`,
      href: "/admin/accounting/reports",
      tone: "warning",
      severityLabel: "Review"
    });
  }
  if (unreconciledHint) {
    attention.push({
      id: "gateway",
      title: unreconciledHint,
      detail: "Review gateway clearing balances in Banking.",
      href: "/admin/accounting/banking",
      tone: "info",
      severityLabel: "Info"
    });
  }

  const asOfLabel = financial?.asOf
    ? formatShortDate(financial.asOf)
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const purchasesEnabled = isPurchasesEnabled();

  return (
    <div className="space-y-5">
      <AdminAccountingHeader
        title="Accounting Overview"
        subtitle="Monitor your financial position and items that need attention."
        meta={
          <div className="space-y-0.5">
            {fy?.currentFy?.label ? (
              <div className="font-semibold text-[#1c352a]">{fy.currentFy.label}</div>
            ) : null}
            <div>As of {asOfLabel}</div>
          </div>
        }
      />

      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}

      {status && !status.nativeAccountingEnabled ? (
        <AccountingAlert tone="warning" title="Accounting is not enabled">
          Native accounting is turned off on the server. Storefront commerce is unchanged.
        </AccountingAlert>
      ) : null}

      {loading ? <p className="text-sm text-[#8a7060]">Loading overview…</p> : null}

      {financial || purchases ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {financial ? (
            <AccountingMetricCard
              label="Sales"
              value={formatInrPaise(financial.profitAndLoss.netRevenueInPaise)}
              hint="Net sales this FY"
              href="/admin/accounting/reports"
              icon={<TrendingUp {...kpiIcon} />}
            />
          ) : (
            <AccountingMetricCard
              label="Sales"
              unavailable
              hint="Enable financial reports to view"
              icon={<TrendingUp {...kpiIcon} />}
            />
          )}
          {purchases ? (
            <AccountingMetricCard
              label="Purchases"
              value={formatInrPaise(purchases.vendorBills.totalNativeApRecognizedInPaise)}
              hint="Supplier bills recognized in books"
              href="/admin/accounting/purchases"
              icon={<ShoppingBag {...kpiIcon} />}
            />
          ) : (
            <AccountingMetricCard
              label="Purchases"
              unavailable
              hint="Purchase books not loaded"
              icon={<ShoppingBag {...kpiIcon} />}
            />
          )}
          {purchases ? (
            <AccountingMetricCard
              label="Expenses"
              value={formatInrPaise(purchases.expenses.totalPostedStandaloneInPaise)}
              hint="Posted standalone expenses"
              href={purchasesEnabled ? "/admin/purchases/expenses" : "/admin/accounting/expenses"}
              icon={<Wallet {...kpiIcon} />}
            />
          ) : financial ? (
            <AccountingMetricCard
              label="Expenses"
              value={formatInrPaise(financial.profitAndLoss.operatingExpensesInPaise)}
              hint="Operating expenses this FY"
              href="/admin/accounting/reports"
              icon={<Wallet {...kpiIcon} />}
            />
          ) : (
            <AccountingMetricCard label="Expenses" unavailable icon={<Wallet {...kpiIcon} />} />
          )}
          {financial ? (
            <AccountingMetricCard
              label="Net Profit"
              value={formatInrPaise(financial.profitAndLoss.netProfitInPaise)}
              hint="Current FY"
              href="/admin/accounting/reports"
              icon={<PieChart {...kpiIcon} />}
              emphasis
              titleAttr="Net profit based on posted accounting entries for the selected financial period."
            />
          ) : (
            <AccountingMetricCard
              label="Net Profit"
              unavailable
              hint="Enable financial reports to view"
              icon={<PieChart {...kpiIcon} />}
              emphasis
            />
          )}
        </div>
      ) : null}

      {(financial || bankingCashPaise != null || purchases) && (
        <div className="grid gap-3 opacity-95 sm:grid-cols-2 lg:grid-cols-4">
          {bankingCashPaise != null ? (
            <AccountingMetricCard
              label="Bank & Cash"
              value={formatInrPaise(bankingCashPaise)}
              hint="Current book balance"
              href="/admin/accounting/banking"
              icon={<Landmark {...kpiIcon} />}
            />
          ) : financial ? (
            <AccountingMetricCard
              label="Bank & Cash"
              value={formatInrPaise(financial.balanceSheet.cashAndBankInPaise)}
              hint="Current book balance"
              href="/admin/accounting/banking"
              icon={<Landmark {...kpiIcon} />}
            />
          ) : null}
          {financial ? (
            <AccountingMetricCard
              label="Inventory Value"
              value={formatInrPaise(financial.balanceSheet.inventoryInPaise)}
              hint="Current inventory value"
              href="/admin/accounting/inventory"
              icon={<Package {...kpiIcon} />}
            />
          ) : null}
          {purchases ? (
            <AccountingMetricCard
              label="Accounts Payable"
              value={formatInrPaise(purchases.vendorBills.totalNativeOutstandingInPaise)}
              hint={
                purchases.vendorBills.overdueOutstandingInPaise
                  ? `${formatInrPaise(purchases.vendorBills.overdueOutstandingInPaise)} overdue`
                  : "Outstanding supplier bills"
              }
              href="/admin/accounting/vendor-payments"
              icon={<FileText {...kpiIcon} />}
            />
          ) : financial ? (
            <AccountingMetricCard
              label="Accounts Payable"
              value={formatInrPaise(financial.balanceSheet.accountsPayableInPaise)}
              hint="Outstanding supplier bills"
              href="/admin/accounting/vendor-payments"
              icon={<FileText {...kpiIcon} />}
            />
          ) : null}
          {financial ? (
            <AccountingMetricCard
              label="GST Position"
              value={formatInrPaise(
                financial.balanceSheet.outputGstLiabilityInPaise -
                  financial.balanceSheet.inputGstAssetInPaise
              )}
              hint="Estimated net GST payable/credit"
              href="/admin/accounting/gst"
              icon={<Receipt {...kpiIcon} />}
            />
          ) : null}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <AccountingSectionCard className={attention.length <= 1 ? "!p-4" : undefined}>
          <AccountingSectionHeader
            title="Needs Attention"
            description="Items that may need finance follow-up"
          />
          {attention.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
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
                    className="group flex items-start gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-[#faf5ec]/80"
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {item.tone === "error" ? (
                        <AlertTriangle size={16} className="text-red-600" />
                      ) : item.tone === "warning" ? (
                        <AlertTriangle size={16} className="text-amber-600" />
                      ) : (
                        <Info size={16} className="text-slate-600" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-0.5 inline-block text-[10px] font-semibold uppercase tracking-wide text-[#8a7060]">
                        {item.severityLabel}
                      </span>
                      <span className="block text-sm font-semibold text-[#2c2420]">{item.title}</span>
                      {item.detail ? (
                        <span className="mt-0.5 block text-xs text-[#8a7060]">{item.detail}</span>
                      ) : null}
                    </span>
                    <span className="mt-1 inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[#b98a3e] opacity-80 group-hover:opacity-100">
                      View
                      <ArrowRight size={12} aria-hidden />
                    </span>
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
                hint="Create a purchase order"
                icon={<ClipboardList {...qaIcon} />}
              />
            ) : null}
            {purchasesEnabled ? (
              <AccountingQuickAction
                href="/admin/purchases/expenses"
                label="Record Expense"
                hint="Add an operating expense"
                icon={<Wallet {...qaIcon} />}
              />
            ) : (
              <AccountingQuickAction
                href="/admin/accounting/expenses"
                label="Record Expense"
                hint="Add an operating expense"
                icon={<Wallet {...qaIcon} />}
              />
            )}
            {purchasesEnabled ? (
              <AccountingQuickAction
                href="/admin/purchases/bills"
                label="Vendor Bills"
                hint="Review supplier bills"
                icon={<FileText {...qaIcon} />}
              />
            ) : (
              <AccountingQuickAction
                href="/admin/accounting/vendor-bills"
                label="Vendor Bills"
                hint="Review supplier bills"
                icon={<FileText {...qaIcon} />}
              />
            )}
            <AccountingQuickAction
              href="/admin/accounting/vendor-payments"
              label="Vendor Payments"
              hint="Record supplier payment"
              icon={<Wallet {...qaIcon} />}
            />
            <AccountingQuickAction
              href="/admin/accounting/banking"
              label="Import Bank Statement"
              hint="Upload transactions"
              icon={<Upload {...qaIcon} />}
            />
            <AccountingQuickAction
              href="/admin/accounting/reports"
              label="View Profit & Loss"
              hint="Review profitability"
              icon={<PieChart {...qaIcon} />}
            />
            <AccountingQuickAction
              href="/admin/accounting/journals"
              label="View Journals"
              hint="Open ledger entries"
              icon={<ScrollText {...qaIcon} />}
            />
          </div>
        </AccountingSectionCard>
      </div>

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Recent Journals"
          description="Latest ledger activity"
          action={
            <Link
              href="/admin/accounting/journals"
              className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
            >
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
                  {["Date", "Journal #", "Description", "Amount", "Status"].map((h) => (
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
                  <tr
                    key={j.id}
                    className="h-11 border-b border-[#f0ece6] last:border-0 hover:bg-[#faf5ec]/70"
                  >
                    <td className="px-2 py-2 text-[13px] text-[#4a3f38]">
                      {formatShortDate(j.entryDate)}
                    </td>
                    <td className="px-2 py-2 font-mono text-[12px] text-[#6b5c52]">{j.entryNumber}</td>
                    <td className="max-w-[260px] truncate px-2 py-2 text-[13px] text-[#2c2420]">
                      {j.memo?.trim() || "Journal entry"}
                    </td>
                    <td
                      className="px-2 py-2 text-right text-[13px] font-semibold tabular-nums text-[#1c352a]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatInrPaise(j.totalDebitInPaise)}
                    </td>
                    <td className="px-2 py-2">
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

      {dashboard ? (
        <AccountingSectionCard>
          <AccountingSectionHeader
            title="Accounting Health"
            description="Ledger system counts for finance ops"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Chart of Accounts", dashboard.accountCount],
                ["Journals", dashboard.journalCount],
                ["Posted Entries", dashboard.postedJournalCount],
                ["Failed Posting Events", dashboard.failedPostingEvents]
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-[10px] border border-[#e8e2d9] bg-[#faf5ec]/50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-[#1c352a]">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#8a7060]">
            <span>Find unposted transactions from Sales Entries or Gateway Settlements.</span>
            {integrity ? (
              <AccountingStatusBadge
                tone={
                  integrity.overallStatus === "FINANCIAL_REPORTING_ENGINE_HEALTHY" ? "success" : "warning"
                }
              >
                Financial health: {humanizeAccountingStatusCode(integrity.overallStatus)}
              </AccountingStatusBadge>
            ) : null}
          </div>
        </AccountingSectionCard>
      ) : null}
    </div>
  );
}
