"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGstDataGaps,
  fetchGstReconciliation,
  fetchGstReportDataGaps,
  fetchGstStatus,
  formatInrPaise,
  type GstReconRow
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  GstPageShell,
  GstSkeleton,
  GstTableWrap,
  GstUnavailableState,
  MonthFilter,
  currentGstMonth,
  gstStatusTone,
  gstTd,
  gstTh,
  humanizeGstStatus,
  moneyClass,
  reconReference
} from "@/components/admin/accounting/gst/gst-ui";

type Filter =
  | "all"
  | "attention"
  | "BUYER_GSTIN_MISSING"
  | "SHIPPING_GST_DATA_GAP"
  | "PARTIAL_REFUND_GST_DATA_GAP"
  | "RCM_DATA_GAP"
  | "GST_DATA_GAP";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs review" },
  { id: "BUYER_GSTIN_MISSING", label: "Buyer GSTIN unavailable" },
  { id: "SHIPPING_GST_DATA_GAP", label: "Shipping GST unavailable" },
  { id: "PARTIAL_REFUND_GST_DATA_GAP", label: "Partial-refund GST unavailable" },
  { id: "RCM_DATA_GAP", label: "Reverse charge unavailable" },
  { id: "GST_DATA_GAP", label: "GST information incomplete" }
];

const ATTENTION = new Set([
  "MISSING_JOURNAL",
  "MISSING_TAX_DOCUMENT",
  "GST_DATA_GAP",
  "AMOUNT_MISMATCH",
  "RATE_MISMATCH",
  "PLACE_OF_SUPPLY_MISMATCH",
  "ITC_UNVERIFIED",
  "PDF_JOURNAL_TAX_DIVERGENCE",
  "SHIPPING_GST_DATA_GAP",
  "PARTIAL_REFUND_GST_DATA_GAP",
  "RCM_DATA_GAP",
  "BUYER_GSTIN_MISSING",
  "GATEWAY_GST_PROVISIONAL",
  "TAX_CLASS_DEFAULTED",
  "HSN_DEFAULTED",
  "INVALID_GSTIN"
]);

export default function GstReconciliationPage() {
  const [month, setMonth] = useState(currentGstMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [reconEnabled, setReconEnabled] = useState(false);
  const [reportingEnabled, setReportingEnabled] = useState(false);
  const [rows, setRows] = useState<GstReconRow[]>([]);
  const [gapRows, setGapRows] = useState<GstReconRow[]>([]);
  const [reportGaps, setReportGaps] = useState<
    Array<{ code: string; count: number; exposureInPaise: number }>
  >([]);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await fetchGstStatus();
      setGstEnabled(st.gstEnabled);
      setReconEnabled(st.gstReconciliationEnabled);
      setReportingEnabled(Boolean(st.gstReportingEnabled));
      if (!st.gstEnabled) return;

      if (st.gstReportingEnabled) {
        const g = await fetchGstReportDataGaps({ month });
        setReportGaps(g.gaps);
      }

      if (st.gstReconciliationEnabled) {
        const [sales, purch, exp, refunds, gaps] = await Promise.all([
          fetchGstReconciliation({ scope: "SALES", limit: 80 }),
          fetchGstReconciliation({ scope: "VENDOR_BILLS", limit: 40 }),
          fetchGstReconciliation({ scope: "EXPENSES", limit: 40 }),
          fetchGstReconciliation({ scope: "FULL_REFUNDS", limit: 40 }),
          fetchGstDataGaps(60)
        ]);
        setRows([...sales.rows, ...purch.rows, ...exp.rows, ...refunds.rows]);
        setGapRows(gaps.rows);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconciliation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const worklist = useMemo(() => {
    const base = filter === "attention" || filter !== "all" ? [...rows, ...gapRows] : rows;
    const dedup = new Map<string, GstReconRow>();
    for (const r of base) {
      const key = `${r.scope}-${r.sourceId}-${r.primaryStatus}`;
      if (!dedup.has(key)) dedup.set(key, r);
    }
    let list = Array.from(dedup.values());
    if (filter === "attention") {
      list = list.filter(
        (r) =>
          ATTENTION.has(r.primaryStatus) ||
          r.statuses.some((s: string) => ATTENTION.has(s))
      );
    } else if (filter !== "all") {
      list = list.filter(
        (r) => r.primaryStatus === filter || r.statuses.includes(filter)
      );
    }
    return list;
  }, [rows, gapRows, filter]);

  return (
    <GstPageShell
      title="GST Reconciliation"
      subtitle="Diagnostic comparison of tax documents and posted GST."
      actions={
        <div className="flex flex-wrap items-end gap-3">
          <MonthFilter month={month} onChange={setMonth} disabled={loading} />
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded-md border border-[#ebe4db] bg-white px-3 py-1.5 text-xs font-semibold text-[#1c352a] hover:bg-[#faf5ec] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      }
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {loading ? <GstSkeleton rows={8} /> : null}

      {!loading && !gstEnabled ? <GstUnavailableState /> : null}

      {!loading && gstEnabled ? (
        <>
          <p className="text-xs leading-relaxed text-[#8a7060]">
            Diagnostic only — this screen does not post adjustments.
          </p>

          {reportingEnabled && reportGaps.length > 0 ? (
            <AccountingSectionCard>
              <AccountingSectionHeader title="Known data gaps" />
              <GstTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={gstTh()}>Gap</th>
                      <th className={gstTh(true)}>Count</th>
                      <th className={gstTh(true)}>Exposure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportGaps.map((g) => (
                      <tr key={g.code} className="border-t border-[#eee8e0]">
                        <td className={gstTd()}>{humanizeGstStatus(g.code)}</td>
                        <td className={`${gstTd(true)} tabular-nums`}>{g.count}</td>
                        <td className={`${gstTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(g.exposureInPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GstTableWrap>
            </AccountingSectionCard>
          ) : null}

          {!reconEnabled ? (
            <AccountingEmptyState
              title="Source reconciliation is not available"
              description="Detailed source comparisons are not enabled. Report data gaps above still apply when reports are available."
            />
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => {
                  const active = filter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${
                        active
                          ? "bg-[#1c352a] text-white"
                          : "border border-[#ebe4db] bg-white text-[#8a7060] hover:bg-[#faf5ec]"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              <AccountingSectionCard>
                <AccountingSectionHeader title="Worklist" />
                {worklist.length === 0 ? (
                  <AccountingEmptyState title="No reconciliation rows for this filter" />
                ) : (
                  <GstTableWrap>
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className={gstTh()}>Area</th>
                          <th className={gstTh()}>Reference</th>
                          <th className={gstTh()}>Status</th>
                          <th className={gstTh()}>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {worklist.slice(0, 200).map((r, i) => (
                          <tr
                            key={`${r.sourceId}-${i}`}
                            className="border-t border-[#eee8e0] hover:bg-[#faf5ec]/40"
                          >
                            <td className={gstTd()}>{humanizeGstStatus(r.scope)}</td>
                            <td className={gstTd()}>{reconReference(r)}</td>
                            <td className={gstTd()}>
                              <AccountingStatusBadge tone={gstStatusTone(r.primaryStatus)}>
                                {humanizeGstStatus(r.primaryStatus)}
                              </AccountingStatusBadge>
                            </td>
                            <td className={gstTd()}>
                              {r.statuses
                                .filter((s: string) => s !== r.primaryStatus)
                                .slice(0, 3)
                                .map((s: string) => humanizeGstStatus(s))
                                .join(" · ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </GstTableWrap>
                )}
              </AccountingSectionCard>
            </>
          )}
        </>
      ) : null}
    </GstPageShell>
  );
}
