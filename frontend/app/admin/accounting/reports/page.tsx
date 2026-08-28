"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import {
  AccountingEmptyState,
  accountingButtonClass,
  accountingInputClass,
  accountingTabClass
} from "@/components/admin/accounting/accounting-ui";
import {
  downloadFinancialStatementPdf,
  downloadFinancialStatementsXlsx,
  downloadGeneralLedgerXlsx,
  fetchBalanceSheet,
  fetchFinancialDashboard,
  fetchFinancialIntegrity,
  fetchFinancialYearConfig,
  fetchGeneralLedger,
  fetchProfitLoss,
  fetchReportAccounts,
  fetchTrialBalance,
  formatInrPaise,
  type BalanceSheetReport,
  type FinancialDashboardReport,
  type FinancialIntegrityReport,
  type FinancialYearSummary,
  type GeneralLedgerReport,
  type ProfitLossReport,
  type ReportAccountRow,
  type StatementLine,
  type TrialBalanceReport
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";

type TabId = "overview" | "tb" | "gl" | "pl" | "bs" | "integrity";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tb", label: "Trial Balance" },
  { id: "gl", label: "General Ledger" },
  { id: "pl", label: "Profit & Loss" },
  { id: "bs", label: "Balance Sheet" },
  { id: "integrity", label: "Reconciliation & Checks" }
];

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function PaiseCell({ value }: { value: number }) {
  if (!value) return <span className="text-neutral-300">—</span>;
  return <span className="tabular-nums">{formatInrPaise(value)}</span>;
}

function StatementRows({
  lines,
  onDrill
}: {
  lines: StatementLine[];
  onDrill: (codes: string[]) => void;
}) {
  return (
    <>
      {lines.map((line) => (
        <div key={line.key} className="border-t border-neutral-100">
          <div
            className={`flex items-center justify-between gap-4 px-3 py-2 text-sm ${
              line.kind === "total"
                ? "bg-neutral-50 font-semibold"
                : line.kind === "subtotal"
                  ? "font-medium"
                  : ""
            }`}
          >
            <div className="min-w-0">
              {line.accountCodes.length > 0 && line.kind === "line" ? (
                <button
                  type="button"
                  className="text-left text-[#1e3a2f] underline"
                  onClick={() => onDrill(line.accountCodes)}
                >
                  {line.label}
                </button>
              ) : (
                <span>{line.label}</span>
              )}
              {line.warning ? (
                <p className="text-xs text-amber-700">{line.warning}</p>
              ) : null}
            </div>
            <span className="shrink-0 tabular-nums">{formatInrPaise(line.amountInPaise)}</span>
          </div>
          {line.children?.length ? (
            <div className="border-l-2 border-neutral-200 pl-4">
              <StatementRows lines={line.children} onDrill={onDrill} />
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

export default function AdminAccountingReportsPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [fy, setFy] = useState<FinancialYearSummary | null>(null);
  const [accounts, setAccounts] = useState<ReportAccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [asOf, setAsOf] = useState(todayYmd());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayYmd());

  const [tbMode, setTbMode] = useState<"asOf" | "period">("asOf");
  const [includeZero, setIncludeZero] = useState(false);
  const [tb, setTb] = useState<TrialBalanceReport | null>(null);
  const [tbLoading, setTbLoading] = useState(false);

  const [glAccount, setGlAccount] = useState("1010");
  const [glFrom, setGlFrom] = useState("");
  const [glTo, setGlTo] = useState(todayYmd());
  const [gl, setGl] = useState<GeneralLedgerReport | null>(null);
  const [glLoading, setGlLoading] = useState(false);
  const [glOffset, setGlOffset] = useState(0);

  const [pl, setPl] = useState<ProfitLossReport | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plFetchedFor, setPlFetchedFor] = useState<{ from: string; to: string } | null>(null);
  const [plAutoLoaded, setPlAutoLoaded] = useState(false);
  const [bs, setBs] = useState<BalanceSheetReport | null>(null);
  const [bsLoading, setBsLoading] = useState(false);
  const [bsFetchedFor, setBsFetchedFor] = useState<string | null>(null);
  const [bsAutoLoaded, setBsAutoLoaded] = useState(false);
  const [dash, setDash] = useState<FinancialDashboardReport | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [integrity, setIntegrity] = useState<FinancialIntegrityReport | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [fyData, acctData] = await Promise.all([
          fetchFinancialYearConfig(),
          fetchReportAccounts()
        ]);
        setFy(fyData);
        setAccounts(acctData.items);
        if (!from) setFrom(fyData.currentFy.startDate);
        if (!glFrom) setGlFrom(fyData.currentFy.startDate);
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Failed to load report metadata");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFy = useCallback((startDate: string, endDate: string) => {
    setFrom(startDate);
    setTo(endDate);
    setGlFrom(startDate);
    setGlTo(endDate);
    setAsOf(endDate);
    setTbMode("period");
  }, []);

  const loadTb = useCallback(async () => {
    setTbLoading(true);
    setError(null);
    try {
      setTb(
        await fetchTrialBalance(
          tbMode === "asOf"
            ? { asOf, includeZeroBalanceAccounts: includeZero }
            : { from, to, includeZeroBalanceAccounts: includeZero }
        )
      );
    } catch (err) {
      setTb(null);
      setError(err instanceof AdminApiError ? err.message : "Trial Balance failed");
    } finally {
      setTbLoading(false);
    }
  }, [tbMode, asOf, from, to, includeZero]);

  const loadGl = useCallback(
    async (opts?: { accountCode?: string; from?: string; to?: string; offset?: number }) => {
      const code = opts?.accountCode ?? glAccount;
      const f = opts?.from ?? glFrom;
      const t = opts?.to ?? glTo;
      const offset = opts?.offset ?? 0;
      setGlLoading(true);
      setError(null);
      try {
        const data = await fetchGeneralLedger({
          accountCode: code,
          from: f,
          to: t,
          limit: 50,
          offset
        });
        setGl(data);
        setGlOffset(offset);
      } catch (err) {
        setGl(null);
        setError(err instanceof AdminApiError ? err.message : "General Ledger failed");
      } finally {
        setGlLoading(false);
      }
    },
    [glAccount, glFrom, glTo]
  );

  const openGl = useCallback(
    (codes: string[]) => {
      const code = codes[0];
      if (!code) return;
      const nextFrom = from || fy?.currentFy.startDate || "1970-01-01";
      const nextTo = to || asOf;
      setGlAccount(code);
      setGlFrom(nextFrom);
      setGlTo(nextTo);
      setTab("gl");
      void loadGl({ accountCode: code, from: nextFrom, to: nextTo, offset: 0 });
    },
    [from, to, asOf, fy, loadGl]
  );

  const loadPl = useCallback(async (opts?: { from?: string; to?: string }) => {
    const f = (opts?.from ?? from).trim();
    const t = (opts?.to ?? to).trim();
    if (!f || !t) return;
    setPlLoading(true);
    setError(null);
    try {
      const data = await fetchProfitLoss({ from: f, to: t, comparison: true });
      setPl(data);
      setPlFetchedFor({ from: f, to: t });
    } catch (err) {
      setPl(null);
      setPlFetchedFor(null);
      setError(err instanceof AdminApiError ? err.message : "P&L failed");
    } finally {
      setPlLoading(false);
    }
  }, [from, to]);

  const loadBs = useCallback(async (opts?: { asOf?: string }) => {
    const d = (opts?.asOf ?? asOf).trim();
    if (!d) return;
    setBsLoading(true);
    setError(null);
    try {
      const data = await fetchBalanceSheet({ asOf: d, comparison: true });
      setBs(data);
      setBsFetchedFor(d);
    } catch (err) {
      setBs(null);
      setBsFetchedFor(null);
      setError(err instanceof AdminApiError ? err.message : "Balance Sheet failed");
    } finally {
      setBsLoading(false);
    }
  }, [asOf]);

  /** First open of P&L / BS auto-loads once dates are ready. Filter edits do not refetch. */
  useEffect(() => {
    if (tab !== "pl" || plAutoLoaded || !from || !to || plLoading) return;
    setPlAutoLoaded(true);
    void loadPl();
  }, [tab, plAutoLoaded, from, to, plLoading, loadPl]);

  useEffect(() => {
    if (tab !== "bs" || bsAutoLoaded || !asOf || bsLoading) return;
    setBsAutoLoaded(true);
    void loadBs();
  }, [tab, bsAutoLoaded, asOf, bsLoading, loadBs]);

  const openProfitLoss = useCallback(
    (opts?: { from?: string; to?: string }) => {
      if (opts?.from) setFrom(opts.from);
      if (opts?.to) setTo(opts.to);
      setTab("pl");
      setPlAutoLoaded(true);
      void loadPl({ from: opts?.from ?? from, to: opts?.to ?? to });
    },
    [from, to, loadPl]
  );

  const openBalanceSheet = useCallback(
    (opts?: { asOf?: string }) => {
      if (opts?.asOf) setAsOf(opts.asOf);
      setTab("bs");
      setBsAutoLoaded(true);
      void loadBs({ asOf: opts?.asOf ?? asOf });
    },
    [asOf, loadBs]
  );

  const plFiltersStale =
    Boolean(pl && plFetchedFor && (plFetchedFor.from !== from || plFetchedFor.to !== to));
  const bsFiltersStale = Boolean(bs && bsFetchedFor && bsFetchedFor !== asOf);

  function statementHasLines(lines: StatementLine[]): boolean {
    for (const line of lines) {
      if (line.kind === "line") return true;
      if (line.children?.length && statementHasLines(line.children)) return true;
    }
    return false;
  }

  const loadDash = useCallback(async () => {
    setDashLoading(true);
    setError(null);
    try {
      setDash(await fetchFinancialDashboard({ from, to, asOf }));
    } catch (err) {
      setDash(null);
      setError(err instanceof AdminApiError ? err.message : "Dashboard failed");
    } finally {
      setDashLoading(false);
    }
  }, [from, to, asOf]);

  const loadIntegrity = useCallback(async () => {
    setIntegrityLoading(true);
    setError(null);
    try {
      setIntegrity(await fetchFinancialIntegrity({ asOf, from, to }));
    } catch (err) {
      setIntegrity(null);
      setError(err instanceof AdminApiError ? err.message : "Integrity report failed");
    } finally {
      setIntegrityLoading(false);
    }
  }, [asOf, from, to]);

  const runExport = useCallback(
    async (fn: () => Promise<void>) => {
      setExportBusy(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Export failed");
      } finally {
        setExportBusy(false);
      }
    },
    []
  );

  const accountOptions = useMemo(
    () => accounts.filter((a) => a.hasPostedActivity || a.isBankRegistryGl || a.isSystem),
    [accounts]
  );

  const integrityStatusColor = (s: string) => {
    if (s === "PASS") return "bg-emerald-100 text-emerald-900";
    if (s === "WARNING") return "bg-amber-100 text-amber-950";
    if (s === "FAIL") return "bg-red-100 text-red-900";
    return "bg-sky-100 text-sky-950";
  };

  return (
    <div className="space-y-5">
      <AdminAccountingHeader
        title="Financial Reports"
        subtitle="Review financial statements, ledgers and reconciliation reports."
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={accountingTabClass(tab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Shared period / FY filters for statement tabs */}
      {(tab === "overview" || tab === "pl" || tab === "bs" || tab === "integrity") && (
        <div className="rounded-[12px] border border-[#e8e2d9] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[12rem] flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">Period</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <label className="text-xs text-[#8a7060]">
                  From
                  <input
                    type="date"
                    className={accountingInputClass()}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="text-xs text-[#8a7060]">
                  To
                  <input
                    type="date"
                    className={accountingInputClass()}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <label className="text-xs text-[#8a7060]">
              <span className="hidden sm:inline">Balance Sheet Date</span>
              <span className="sm:hidden">BS Date</span>
              <input
                type="date"
                className={accountingInputClass()}
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </label>
            {fy ? (
              <label className="text-xs text-[#8a7060]">
                Financial Year
                <select
                  className={accountingInputClass()}
                  defaultValue=""
                  onChange={(e) => {
                    const opt = fy.options.find((o) => o.label === e.target.value);
                    if (opt) applyFy(opt.startDate, opt.endDate);
                  }}
                >
                  <option value="">Select FY…</option>
                  {fy.options.map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label} ({o.startDate} → {o.endDate})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {tab === "overview" ? (
                <button
                  type="button"
                  onClick={() => void loadDash()}
                  disabled={dashLoading || !from || !to}
                  className={accountingButtonClass("primary")}
                >
                  {dashLoading ? "Refreshing…" : "Refresh Report"}
                </button>
              ) : tab === "integrity" ? (
                <button
                  type="button"
                  onClick={() => void loadIntegrity()}
                  disabled={integrityLoading || !from || !to}
                  className={accountingButtonClass("primary")}
                >
                  {integrityLoading ? "Running…" : "Refresh Report"}
                </button>
              ) : tab === "pl" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void loadPl()}
                    disabled={plLoading || !from || !to}
                    className={accountingButtonClass("primary")}
                  >
                    {plLoading ? "Loading…" : "Refresh Report"}
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy || plLoading || !from || !to || !pl}
                    className={accountingButtonClass("secondary")}
                    onClick={() =>
                      void runExport(() =>
                        downloadFinancialStatementPdf({ kind: "profit-loss", from, to })
                      )
                    }
                  >
                    PDF
                  </button>
                </>
              ) : tab === "bs" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void loadBs()}
                    disabled={bsLoading || !asOf}
                    className={accountingButtonClass("primary")}
                  >
                    {bsLoading ? "Loading…" : "Refresh Report"}
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy || bsLoading || !asOf || !bs}
                    className={accountingButtonClass("secondary")}
                    onClick={() =>
                      void runExport(() =>
                        downloadFinancialStatementPdf({ kind: "balance-sheet", asOf })
                      )
                    }
                  >
                    PDF
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled={exportBusy || !from || !to || !asOf}
                className={accountingButtonClass("secondary")}
                onClick={() =>
                  void runExport(() => downloadFinancialStatementsXlsx({ asOf, from, to }))
                }
              >
                {exportBusy ? "Exporting…" : "Export XLSX"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "integrity" ? (
        <div className="space-y-4">
          {integrity ? (
            <>
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  integrity.overallStatus === "FINANCIAL_REPORTING_ENGINE_HEALTHY"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-amber-300 bg-amber-50 text-amber-950"
                }`}
              >
                <p className="font-semibold tracking-wide">
                  {integrity.overallStatus === "FINANCIAL_REPORTING_ENGINE_HEALTHY"
                    ? "Financial reports look healthy"
                    : "Review required"}
                </p>
                <p className="mt-1 text-xs">
                  Automated checks against posted ledger balances. Use this to find variances before
                  relying on statements.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-neutral-600">Pass</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{integrity.summary.pass}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-neutral-600">Warning</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {integrity.summary.warning}
                  </p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-neutral-600">Fail</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{integrity.summary.fail}</p>
                </div>
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-neutral-600">Needs attention</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {integrity.summary.dataGap}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Check</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Severity</th>
                      <th className="px-3 py-2 text-right">Variance</th>
                      <th className="px-3 py-2">Message</th>
                      <th className="px-3 py-2">Drill</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrity.checks.map((c) => (
                      <tr key={c.code} className="border-t border-neutral-100 align-top">
                        <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${integrityStatusColor(c.status)}`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{c.severity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.varianceInPaise == null ? "—" : formatInrPaise(c.varianceInPaise)}
                        </td>
                        <td className="px-3 py-2 max-w-md text-xs text-neutral-700">{c.message}</td>
                        <td className="px-3 py-2 text-xs">
                          {c.code === "INVENTORY_GL_VS_FIFO" ? (
                            <button
                              type="button"
                              className="text-[#1e3a2f] underline"
                              onClick={() => openGl(["1200"])}
                            >
                              GL 1200
                            </button>
                          ) : null}
                          {c.code === "AP_GL_VS_SUBLEDGER" ? (
                            <button
                              type="button"
                              className="text-[#1e3a2f] underline"
                              onClick={() => openGl(["2000"])}
                            >
                              GL 2000
                            </button>
                          ) : null}
                          {c.code === "ORPHAN_JOURNALS" ? (
                            <Link
                              href="/admin/accounting/journals"
                              className="text-[#1e3a2f] underline"
                            >
                              Journals
                            </Link>
                          ) : null}
                          {c.code === "GST_GL_VS_GST_REPORT" ? (
                            <Link href="/admin/accounting/gst" className="text-[#1e3a2f] underline">
                              GST
                            </Link>
                          ) : null}
                          {c.code === "PURCHASE_CLEARING_1210_CONTROL" ? (
                            <button
                              type="button"
                              className="text-[#1e3a2f] underline"
                              onClick={() => openGl(["1210"])}
                            >
                              GL 1210
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-700">
                <p className="font-medium">Items still pending for go-live readiness</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {integrity.phase7CarryForward.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <AccountingEmptyState
              title="No reconciliation results yet"
              description="Select a reporting period and refresh to run automated ledger checks."
            />
          )}
        </div>
      ) : null}

      {tab === "overview" ? (
        <div className="space-y-4">
          {dash ? (
            <>
              <p className="text-xs text-neutral-500">
                {dash.fy.label} · Period {dash.period.from} → {dash.period.to} · As of {dash.asOf}
                {!dash.balanceSheet.balanced ? (
                  <span className="ml-2 text-red-700">Balance sheet out of balance</span>
                ) : (
                  <span className="ml-2 text-emerald-700">Balance sheet balanced</span>
                )}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Revenue", dash.profitAndLoss.revenueInPaise, () => openProfitLoss()],
                  ["Net Revenue", dash.profitAndLoss.netRevenueInPaise, () => openProfitLoss()],
                  ["COGS", dash.profitAndLoss.cogsInPaise, () => openProfitLoss()],
                  ["Gross Profit", dash.profitAndLoss.grossProfitInPaise, () => openProfitLoss()],
                  [
                    "Gross Margin %",
                    dash.profitAndLoss.grossMarginPercent,
                    () => openProfitLoss(),
                    true
                  ],
                  ["OpEx", dash.profitAndLoss.operatingExpensesInPaise, () => openProfitLoss()],
                  ["Net Profit", dash.profitAndLoss.netProfitInPaise, () => openProfitLoss()],
                  ["Cash + Bank", dash.balanceSheet.cashAndBankInPaise, () => openBalanceSheet()],
                  ["AR", dash.balanceSheet.accountsReceivableInPaise, () => openBalanceSheet()],
                  ["AP", dash.balanceSheet.accountsPayableInPaise, () => openBalanceSheet()],
                  ["Inventory", dash.balanceSheet.inventoryInPaise, () => openBalanceSheet()],
                  ["Gateway Clearing", dash.balanceSheet.gatewayClearingInPaise, () => openBalanceSheet()],
                  ["Input GST", dash.balanceSheet.inputGstAssetInPaise, () => openBalanceSheet()],
                  ["Output GST", dash.balanceSheet.outputGstLiabilityInPaise, () => openBalanceSheet()]
                ].map(([label, val, go, pct]) => (
                  <button
                    key={String(label)}
                    type="button"
                    onClick={go as () => void}
                    className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:border-[#1e3a2f]"
                  >
                    <p className="text-xs uppercase tracking-wide text-neutral-500">{label as string}</p>
                    <p className="mt-1 text-lg font-medium tabular-nums">
                      {pct
                        ? val == null
                          ? "—"
                          : `${val}%`
                        : formatInrPaise(val as number)}
                    </p>
                  </button>
                ))}
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
                {dash.disclosures.map((d) => (
                  <div key={d}>{d}</div>
                ))}
                {dash.comparison.previousPeriodNetProfitInPaise != null ? (
                  <div>
                    Prior period net:{" "}
                    {formatInrPaise(dash.comparison.previousPeriodNetProfitInPaise)}
                  </div>
                ) : null}
                {dash.comparison.ytdNetProfitInPaise != null ? (
                  <div>YTD net: {formatInrPaise(dash.comparison.ytdNetProfitInPaise)}</div>
                ) : null}
              </div>
            </>
          ) : (
            <AccountingEmptyState
              title="No report figures yet"
              description="Select a reporting period and refresh to view the latest financial figures."
            />
          )}
        </div>
      ) : null}

      {tab === "pl" ? (
        <div className="space-y-4">
          {plFiltersStale ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Filters changed since this statement was loaded. Click <strong>Refresh Report</strong> to
              update.
            </p>
          ) : null}
          {plLoading && !pl ? (
            <p className="rounded-[12px] border border-[#e8e2d9] bg-white px-4 py-8 text-center text-sm text-[#8a7060]">
              Loading Profit &amp; Loss…
            </p>
          ) : null}
          {pl ? (
            <>
              {plLoading ? (
                <p className="text-xs text-[#8a7060]">Refreshing Profit &amp; Loss…</p>
              ) : null}
              {(() => {
                const lines = [
                  ...pl.sections.revenue,
                  ...pl.sections.cogs,
                  ...pl.sections.operatingExpenses,
                  ...pl.sections.otherIncome,
                  ...pl.sections.otherExpenses
                ];
                if (!statementHasLines(lines)) {
                  return (
                    <AccountingEmptyState
                      title="No transactions found for this period."
                      description="Try changing the reporting dates."
                    />
                  );
                }
                return (
                  <>
                    <div
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        pl.integrity.status === "PASS"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-red-200 bg-red-50 text-red-900"
                      }`}
                    >
                      Net Profit {formatInrPaise(pl.totals.netProfitInPaise)}
                      {pl.totals.grossMarginPercent != null
                        ? ` · Gross margin ${pl.totals.grossMarginPercent}%`
                        : " · Gross margin n/a"}
                      {" · "}
                      {pl.integrity.status === "PASS"
                        ? "Checks passed"
                        : `Checks failed · variance ${pl.integrity.varianceInPaise}`}
                    </div>
                    {pl.comparison ? (
                      <p className="text-xs text-neutral-600">
                        Prior period net:{" "}
                        {pl.comparison.previousPeriod
                          ? formatInrPaise(pl.comparison.previousPeriod.netProfitInPaise)
                          : "—"}
                        {pl.comparison.ytd
                          ? ` · YTD (${pl.comparison.ytd.from}→${pl.comparison.ytd.to}): ${formatInrPaise(pl.comparison.ytd.netProfitInPaise)}`
                          : null}
                      </p>
                    ) : null}
                    <div className="rounded-lg border border-neutral-200 bg-white">
                      <StatementRows lines={lines} onDrill={openGl} />
                    </div>
                  </>
                );
              })()}
            </>
          ) : !plLoading && plAutoLoaded ? (
            <AccountingEmptyState
              title="No transactions found for this period."
              description="Try changing the reporting dates."
            />
          ) : !plLoading ? (
            <p className="rounded-[12px] border border-[#e8e2d9] bg-white px-4 py-8 text-center text-sm text-[#8a7060]">
              Preparing reporting period…
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "bs" ? (
        <div className="space-y-4">
          {bsFiltersStale ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Balance Sheet Date changed since this statement was loaded. Click{" "}
              <strong>Refresh Report</strong> to update.
            </p>
          ) : null}
          {bsLoading && !bs ? (
            <p className="rounded-[12px] border border-[#e8e2d9] bg-white px-4 py-8 text-center text-sm text-[#8a7060]">
              Loading Balance Sheet…
            </p>
          ) : null}
          {bs ? (
            <>
              {bsLoading ? (
                <p className="text-xs text-[#8a7060]">Refreshing Balance Sheet…</p>
              ) : null}
              {(() => {
                const allLines = [
                  ...bs.sections.assets,
                  ...bs.sections.liabilities,
                  ...bs.sections.equity
                ];
                if (!statementHasLines(allLines)) {
                  return (
                    <AccountingEmptyState
                      title="No transactions found for this period."
                      description="Try changing the reporting dates."
                    />
                  );
                }
                return (
                  <>
                    <div
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        bs.totals.balanced
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-red-200 bg-red-50 text-red-900"
                      }`}
                    >
                      {bs.totals.balanced ? (
                        <strong>BALANCED</strong>
                      ) : (
                        <>
                          <strong>OUT OF BALANCE</strong> — difference{" "}
                          {formatInrPaise(Math.abs(bs.totals.differenceInPaise))}
                        </>
                      )}
                      <span className="ml-2 text-neutral-600">
                        · {bs.fy.label} · Current earnings{" "}
                        {formatInrPaise(bs.earnings.currentFyEarningsInPaise)} (
                        {bs.earnings.currentFyFrom} → {bs.earnings.currentFyTo})
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">{bs.earnings.formula}</p>
                    {bs.disclosures.warnings.length ? (
                      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                        {bs.disclosures.warnings.map((w) => (
                          <div key={w}>{w}</div>
                        ))}
                        <div>{bs.disclosures.arSubledger}</div>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">{bs.disclosures.arSubledger}</p>
                    )}
                    <div className="grid gap-4 lg:grid-cols-3">
                      {(
                        [
                          ["Assets", bs.sections.assets, bs.totals.totalAssetsInPaise],
                          ["Liabilities", bs.sections.liabilities, bs.totals.totalLiabilitiesInPaise],
                          ["Equity", bs.sections.equity, bs.totals.totalEquityInPaise]
                        ] as const
                      ).map(([title, lines, total]) => (
                        <div key={title} className="rounded-lg border border-neutral-200 bg-white">
                          <div className="border-b border-neutral-100 px-3 py-2 font-medium">{title}</div>
                          <StatementRows lines={lines} onDrill={openGl} />
                          <div className="flex justify-between border-t border-neutral-200 px-3 py-2 text-sm font-semibold">
                            <span>Total</span>
                            <span className="tabular-nums">{formatInrPaise(total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="text-sm text-[#1e3a2f] underline"
                      onClick={() =>
                        openProfitLoss({
                          from: bs.earnings.currentFyFrom,
                          to: bs.earnings.currentFyTo
                        })
                      }
                    >
                      Open P&amp;L for current earnings period
                    </button>
                  </>
                );
              })()}
            </>
          ) : !bsLoading && bsAutoLoaded ? (
            <AccountingEmptyState
              title="No transactions found for this period."
              description="Try changing the reporting dates."
            />
          ) : !bsLoading ? (
            <p className="rounded-[12px] border border-[#e8e2d9] bg-white px-4 py-8 text-center text-sm text-[#8a7060]">
              Preparing reporting period…
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "tb" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
            <label className="text-sm">
              Mode
              <select
                className="mt-1 block rounded border border-neutral-300 px-2 py-1.5"
                value={tbMode}
                onChange={(e) => setTbMode(e.target.value as "asOf" | "period")}
              >
                <option value="asOf">As-of</option>
                <option value="period">From / To</option>
              </select>
            </label>
            {tbMode === "asOf" ? (
              <label className="text-sm">
                As of
                <input
                  type="date"
                  className="mt-1 block rounded border border-neutral-300 px-2 py-1.5"
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                />
              </label>
            ) : (
              <>
                <label className="text-sm">
                  From
                  <input
                    type="date"
                    className="mt-1 block rounded border border-neutral-300 px-2 py-1.5"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  To
                  <input
                    type="date"
                    className="mt-1 block rounded border border-neutral-300 px-2 py-1.5"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeZero}
                onChange={(e) => setIncludeZero(e.target.checked)}
              />
              Include zero balances
            </label>
            <button
              type="button"
              onClick={() => void loadTb()}
              disabled={tbLoading}
              className="rounded-md bg-[#1e3a2f] px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {tbLoading ? "Loading…" : "Run Trial Balance"}
            </button>
            <button
              type="button"
              disabled={exportBusy || !asOf}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
              onClick={() =>
                void runExport(() =>
                  downloadFinancialStatementPdf({ kind: "trial-balance", asOf })
                )
              }
            >
              PDF
            </button>
          </div>
          {tb ? (
            <>
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  tb.balanced
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {tb.balanced ? <strong>BALANCED</strong> : (
                  <>
                    <strong>OUT OF BALANCE</strong> — Variance{" "}
                    {formatInrPaise(Math.abs(tb.varianceInPaise))}
                  </>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2">Class</th>
                      <th className="px-3 py-2 text-right">Close Dr</th>
                      <th className="px-3 py-2 text-right">Close Cr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tb.rows.map((row) => (
                      <tr key={row.accountId} className="border-t border-neutral-100">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="font-mono text-[#1e3a2f] underline"
                            onClick={() => openGl([row.accountCode])}
                          >
                            {row.accountCode}
                          </button>
                        </td>
                        <td className="px-3 py-2">{row.accountName}</td>
                        <td className="px-3 py-2 text-xs text-neutral-500">{row.reportClass}</td>
                        <td className="px-3 py-2 text-right">
                          <PaiseCell value={row.closingDebitInPaise} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <PaiseCell value={row.closingCreditInPaise} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "gl" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
            <label className="text-sm">
              Account
              <select
                className="mt-1 block min-w-[220px] rounded border border-neutral-300 px-2 py-1.5"
                value={glAccount}
                onChange={(e) => setGlAccount(e.target.value)}
              >
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              From
              <input
                type="date"
                className="mt-1 block rounded border border-neutral-300 px-2 py-1.5"
                value={glFrom}
                onChange={(e) => setGlFrom(e.target.value)}
              />
            </label>
            <label className="text-sm">
              To
              <input
                type="date"
                className="mt-1 block rounded border border-neutral-300 px-2 py-1.5"
                value={glTo}
                onChange={(e) => setGlTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void loadGl({ offset: 0 })}
              disabled={glLoading}
              className="rounded-md bg-[#1e3a2f] px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {glLoading ? "Loading…" : "Run General Ledger"}
            </button>
            <button
              type="button"
              disabled={exportBusy || !glFrom || !glTo || !glAccount}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
              onClick={() =>
                void runExport(() =>
                  downloadGeneralLedgerXlsx({
                    accountCode: glAccount,
                    from: glFrom,
                    to: glTo
                  })
                )
              }
            >
              GL XLSX
            </button>
          </div>
          {gl ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ["Opening", gl.openingBalanceInPaise],
                  ["Period Debits", gl.periodDebitInPaise],
                  ["Period Credits", gl.periodCreditInPaise],
                  ["Closing", gl.closingBalanceInPaise]
                ].map(([label, val]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg border border-neutral-200 bg-white px-4 py-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
                    <p className="mt-1 text-lg font-medium tabular-nums">
                      {formatInrPaise(val as number)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Journal</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Event</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Running</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gl.lines.map((line) => (
                      <tr key={line.lineId} className="border-t border-neutral-100">
                        <td className="px-3 py-2 whitespace-nowrap">{line.entryDate}</td>
                        <td className="px-3 py-2">
                          <Link
                            href="/admin/accounting/journals"
                            className="font-mono text-[#1e3a2f] underline"
                          >
                            {line.journalNumber}
                          </Link>
                          {line.orphanJournal ? (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-900">
                              Orphan
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 max-w-xs truncate">
                          {line.description ?? line.lineMemo ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">{line.eventType ?? "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <PaiseCell value={line.debitInPaise} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <PaiseCell value={line.creditInPaise} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatInrPaise(line.runningBalanceInPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={glOffset <= 0 || glLoading}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
                  onClick={() => void loadGl({ offset: Math.max(0, glOffset - 50) })}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!gl.pagination.hasMore || glLoading}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
                  onClick={() => void loadGl({ offset: glOffset + 50 })}
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
