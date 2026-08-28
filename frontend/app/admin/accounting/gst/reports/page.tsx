"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiBase } from "@/lib/api";
import {
  fetchGstReport3b,
  fetchGstReportDataGaps,
  fetchGstReportHsn,
  fetchGstReportIntegrity,
  fetchGstReportOverview,
  fetchGstReportPos,
  fetchGstReportRates,
  fetchGstStatus,
  formatInrPaise,
  gstExportUrl
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  GstPageShell,
  GstSkeleton,
  GstTableWrap,
  GstUnavailableState,
  MonthFilter,
  accountingButtonClass,
  currentGstMonth,
  gstStatusTone,
  gstTd,
  gstTh,
  humanizeGstStatus,
  humanizeSupplyType,
  moneyClass
} from "@/components/admin/accounting/gst/gst-ui";

type ReportTab = "overview" | "hsn" | "rates" | "pos" | "summary3b" | "integrity" | "gaps";

const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "hsn", label: "HSN" },
  { id: "rates", label: "Rate summary" },
  { id: "pos", label: "Place of supply" },
  { id: "summary3b", label: "3B-style summary" },
  { id: "integrity", label: "Integrity" },
  { id: "gaps", label: "Data gaps" }
];

type Row = Record<string, unknown>;

export default function GstReportsPage() {
  const [month, setMonth] = useState(currentGstMonth);
  const [tab, setTab] = useState<ReportTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [reportingEnabled, setReportingEnabled] = useState(false);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [hsn, setHsn] = useState<Row[]>([]);
  const [rates, setRates] = useState<Row[]>([]);
  const [summary3b, setSummary3b] = useState<Record<string, unknown> | null>(null);
  const [integrity, setIntegrity] = useState<{
    status: string;
    checks: Row[];
  } | null>(null);
  const [gaps, setGaps] = useState<Array<{ code: string; count: number; exposureInPaise: number }>>(
    []
  );
  const [posRows, setPosRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await fetchGstStatus();
      setGstEnabled(st.gstEnabled);
      setReportingEnabled(Boolean(st.gstReportingEnabled));
      if (!st.gstEnabled || !st.gstReportingEnabled) return;

      const [ov, h, r, s3, integ, g, pos] = await Promise.all([
        fetchGstReportOverview({ month }),
        fetchGstReportHsn({ month }),
        fetchGstReportRates({ month }),
        fetchGstReport3b({ month }),
        fetchGstReportIntegrity({ month }),
        fetchGstReportDataGaps({ month }),
        fetchGstReportPos({ month }).catch(() => null)
      ]);
      setOverview(ov);
      setHsn((h.rows as Row[]) ?? []);
      setRates((r.rows as Row[]) ?? []);
      setSummary3b(s3);
      setIntegrity({ status: integ.status, checks: integ.checks ?? [] });
      setGaps(g.gaps ?? []);
      const posList = (pos?.rows as Row[] | undefined) ?? [];
      setPosRows(posList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "GST reports could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const outward = overview?.outwardSupplies as Record<string, number> | undefined;
  const inputTax = overview?.inputTax as Record<string, number> | undefined;
  const net = overview?.netPosition as Record<string, unknown> | undefined;
  const s3Out = summary3b?.outwardSupplies as Record<string, number> | undefined;
  const s3In = summary3b?.inputTax as Record<string, number> | undefined;
  const s3Net = summary3b?.netPosition as Record<string, unknown> | undefined;

  return (
    <GstPageShell
      title="GST Reports & Export"
      subtitle="Management GST summaries and workbook download. Not GSTN filing."
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
          {reportingEnabled ? (
            <a
              className={accountingButtonClass("secondary", true)}
              href={`${getApiBase()}${gstExportUrl({ month })}`}
            >
              Download GST management workbook
            </a>
          ) : null}
        </div>
      }
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {loading ? <GstSkeleton rows={8} /> : null}

      {!loading && !gstEnabled ? <GstUnavailableState /> : null}

      {!loading && gstEnabled && !reportingEnabled ? (
        <AccountingEmptyState
          title="GST reports are not available"
          description="Management GST reports are not enabled for this environment."
        />
      ) : null}

      {!loading && gstEnabled && reportingEnabled ? (
        <>
          <AccountingAlert tone="info">
            These are accounting management reports. They are not filed GST returns and are not GSTN
            submissions.
          </AccountingAlert>

          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${
                    active
                      ? "bg-[#1c352a] text-white"
                      : "border border-[#ebe4db] bg-white text-[#8a7060] hover:bg-[#faf5ec]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === "overview" && overview ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AccountingMetricCard
                  label="Output GST"
                  value={formatInrPaise(Number(outward?.totalOutputGstInPaise ?? 0))}
                />
                <AccountingMetricCard
                  label="Input recognised"
                  value={formatInrPaise(Number(inputTax?.recognizedTotalInPaise ?? 0))}
                />
                <AccountingMetricCard
                  label="ITC eligible"
                  value={formatInrPaise(Number(inputTax?.eligibleItcInPaise ?? 0))}
                />
                <AccountingMetricCard
                  label="Estimated net GST"
                  value={formatInrPaise(Number(net?.estimatedNetGstPositionInPaise ?? 0))}
                  hint="Management estimate — not a filing amount"
                />
              </div>
            </div>
          ) : null}

          {tab === "hsn" ? (
            <AccountingSectionCard>
              <AccountingSectionHeader title="HSN summary" />
              {hsn.length === 0 ? (
                <AccountingEmptyState title="No HSN rows" />
              ) : (
                <GstTableWrap>
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className={gstTh()}>HSN</th>
                        <th className={gstTh()}>Source</th>
                        <th className={gstTh()}>Rate</th>
                        <th className={gstTh(true)}>Taxable</th>
                        <th className={gstTh(true)}>CGST</th>
                        <th className={gstTh(true)}>SGST</th>
                        <th className={gstTh(true)}>IGST</th>
                        <th className={gstTh()}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hsn.map((r, i) => (
                        <tr key={i} className="border-t border-[#eee8e0] hover:bg-[#faf5ec]/40">
                          <td className={gstTd()}>{String(r.hsnSac ?? "—")}</td>
                          <td className={gstTd()}>{humanizeGstStatus(String(r.hsnSource ?? ""))}</td>
                          <td className={gstTd()}>{String(r.gstRate ?? "—")}%</td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.taxableValueInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.cgstInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.sgstInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.igstInPaise ?? 0))}
                          </td>
                          <td className={gstTd()}>
                            {r.warning ? humanizeGstStatus(String(r.warning)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </GstTableWrap>
              )}
            </AccountingSectionCard>
          ) : null}

          {tab === "rates" ? (
            <AccountingSectionCard>
              <AccountingSectionHeader title="Rate summary" />
              {rates.length === 0 ? (
                <AccountingEmptyState title="No rate rows" />
              ) : (
                <GstTableWrap>
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className={gstTh()}>Rate</th>
                        <th className={gstTh(true)}>Taxable</th>
                        <th className={gstTh(true)}>CGST</th>
                        <th className={gstTh(true)}>SGST</th>
                        <th className={gstTh(true)}>IGST</th>
                        <th className={gstTh(true)}>Refund tax</th>
                        <th className={gstTh(true)}>Net tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rates.map((r, i) => (
                        <tr key={i} className="border-t border-[#eee8e0] hover:bg-[#faf5ec]/40">
                          <td className={gstTd()}>{String(r.rateLabel ?? "—")}</td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.taxableValueInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.cgstInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.sgstInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.igstInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.refundTaxInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.netTaxInPaise ?? 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </GstTableWrap>
              )}
            </AccountingSectionCard>
          ) : null}

          {tab === "pos" ? (
            <AccountingSectionCard>
              <AccountingSectionHeader
                title="Place of supply"
                description="Aggregated from outward sales tax snapshots for this month."
              />
              {posRows.length === 0 ? (
                <AccountingEmptyState title="No place-of-supply rows" />
              ) : (
                <GstTableWrap>
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className={gstTh()}>Place of supply</th>
                        <th className={gstTh()}>Supply</th>
                        <th className={gstTh(true)}>Taxable</th>
                        <th className={gstTh(true)}>CGST</th>
                        <th className={gstTh(true)}>SGST</th>
                        <th className={gstTh(true)}>IGST</th>
                        <th className={gstTh(true)}>Transactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posRows.map((r, i) => (
                        <tr key={i} className="border-t border-[#eee8e0] hover:bg-[#faf5ec]/40">
                          <td className={gstTd()}>
                            {String(r.placeOfSupplyCode ?? "—").match(/^\d{2}$/)
                              ? `State code ${r.placeOfSupplyCode}`
                              : String(r.placeOfSupplyCode ?? "—")}
                          </td>
                          <td className={gstTd()}>
                            {humanizeSupplyType(String(r.supplyType ?? ""))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.taxableValueInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.cgstInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.sgstInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(r.igstInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} tabular-nums`}>
                            {String(r.count ?? r.transactionCount ?? "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </GstTableWrap>
              )}
            </AccountingSectionCard>
          ) : null}

          {tab === "summary3b" && summary3b ? (
            <div className="space-y-4">
              <AccountingAlert tone="warning" title="GST management summary — not a filed GSTR-3B return.">
                This view mirrors 3B-style totals for internal reconciliation. It is not a statutory
                return and must not be submitted to the GST portal.
              </AccountingAlert>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AccountingMetricCard
                  label="Output GST (period)"
                  value={formatInrPaise(Number(s3Out?.totalOutputGstInPaise ?? 0))}
                />
                <AccountingMetricCard
                  label="Input recognised"
                  value={formatInrPaise(Number(s3In?.recognizedTotalInPaise ?? 0))}
                />
                <AccountingMetricCard
                  label="Eligible ITC"
                  value={formatInrPaise(Number(s3In?.eligibleItcInPaise ?? 0))}
                />
                <AccountingMetricCard
                  label="Estimated net"
                  value={formatInrPaise(Number(s3Net?.estimatedNetGstPositionInPaise ?? 0))}
                  hint="Management estimate"
                />
              </div>
            </div>
          ) : null}

          {tab === "integrity" && integrity ? (
            <AccountingSectionCard>
              <AccountingSectionHeader
                title="Report integrity"
                description="Compares management report totals with ledger authority."
                action={
                  <AccountingStatusBadge tone={gstStatusTone(integrity.status)}>
                    {humanizeGstStatus(integrity.status)}
                  </AccountingStatusBadge>
                }
              />
              {integrity.checks.length === 0 ? (
                <AccountingEmptyState title="No integrity checks returned" />
              ) : (
                <GstTableWrap>
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className={gstTh()}>Check</th>
                        <th className={gstTh(true)}>Report</th>
                        <th className={gstTh(true)}>Ledger</th>
                        <th className={gstTh(true)}>Difference</th>
                        <th className={gstTh()}>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {integrity.checks.map((c, i) => (
                        <tr key={i} className="border-t border-[#eee8e0]">
                          <td className={gstTd()}>
                            {humanizeGstStatus(String(c.name ?? c.check ?? "Check"))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(c.reportTotalInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(c.authorityTotalInPaise ?? 0))}
                          </td>
                          <td className={`${gstTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(Number(c.deltaInPaise ?? 0))}
                          </td>
                          <td className={gstTd()}>
                            {c.pass === true || c.pass === "true"
                              ? "Aligned"
                              : c.pass === false || c.pass === "false"
                                ? "Needs review"
                                : humanizeGstStatus(String(c.pass ?? "—"))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </GstTableWrap>
              )}
            </AccountingSectionCard>
          ) : null}

          {tab === "gaps" ? (
            <AccountingSectionCard>
              <AccountingSectionHeader title="Data gaps" />
              {gaps.length === 0 ? (
                <AccountingEmptyState title="No report data gaps for this month" />
              ) : (
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
                      {gaps.map((g) => (
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
              )}
            </AccountingSectionCard>
          ) : null}
        </>
      ) : null}
    </GstPageShell>
  );
}
