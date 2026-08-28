"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  fetchGstDataGaps,
  fetchGstLedger,
  fetchGstReportDataGaps,
  fetchGstReportOverview,
  fetchGstStatus,
  fetchItcSummary,
  formatInrPaise
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingQuickAction,
  AccountingSectionCard,
  AccountingSectionHeader,
  GstPageShell,
  GstSkeleton,
  GstUnavailableState,
  MonthFilter,
  currentGstMonth,
  humanizeGstStatus
} from "@/components/admin/accounting/gst/gst-ui";

type Attention = { label: string; href: string; hint?: string };

export default function GstOverviewPage() {
  const [month, setMonth] = useState(currentGstMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [reportingEnabled, setReportingEnabled] = useState(false);
  const [itcEnabled, setItcEnabled] = useState(false);
  const [outputTotal, setOutputTotal] = useState<number | null>(null);
  const [inputRecognized, setInputRecognized] = useState<number | null>(null);
  const [itcEligible, setItcEligible] = useState<number | null>(null);
  const [estimatedNet, setEstimatedNet] = useState<number | null>(null);
  const [attentionCount, setAttentionCount] = useState<number | null>(null);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [netNote, setNetNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await fetchGstStatus();
      setGstEnabled(st.gstEnabled);
      setReportingEnabled(Boolean(st.gstReportingEnabled));
      setItcEnabled(Boolean(st.itcVerificationEnabled ?? st.itcEligibleWorkflow));
      if (!st.gstEnabled) {
        setAttention([]);
        setAttentionCount(0);
        return;
      }

      const items: Attention[] = [];
      let gapTotal = 0;

      const led = await fetchGstLedger({ month }).catch(() => null);
      if (led?.aggregates) {
        const out =
          led.aggregates.outputCgstClosingInPaise +
          led.aggregates.outputSgstClosingInPaise +
          led.aggregates.outputIgstClosingInPaise;
        const inp =
          led.aggregates.inputCgstRecognizedClosingInPaise +
          led.aggregates.inputSgstRecognizedClosingInPaise +
          led.aggregates.inputIgstRecognizedClosingInPaise;
        setOutputTotal(out);
        setInputRecognized(inp);
      }

      if (st.gstReportingEnabled) {
        const ov = await fetchGstReportOverview({ month });
        const outward = ov.outwardSupplies as Record<string, number> | undefined;
        const inputTax = ov.inputTax as Record<string, number> | undefined;
        const net = ov.netPosition as Record<string, unknown> | undefined;
        if (typeof outward?.totalOutputGstInPaise === "number") {
          setOutputTotal(outward.totalOutputGstInPaise);
        }
        if (typeof inputTax?.recognizedTotalInPaise === "number") {
          setInputRecognized(inputTax.recognizedTotalInPaise);
        }
        if (typeof inputTax?.eligibleItcInPaise === "number") {
          setItcEligible(inputTax.eligibleItcInPaise);
        }
        if (typeof net?.estimatedNetGstPositionInPaise === "number") {
          setEstimatedNet(net.estimatedNetGstPositionInPaise);
        }
        setNetNote(typeof net?.note === "string" ? net.note : null);

        const gaps = await fetchGstReportDataGaps({ month }).catch(() => null);
        const gapRows = gaps?.gaps ?? [];
        for (const g of gapRows) {
          gapTotal += g.count;
          if (g.count > 0) {
            items.push({
              label: humanizeGstStatus(g.code),
              href: "/admin/accounting/gst/reconciliation",
              hint: String(g.count)
            });
          }
        }

        if ((inputTax?.unverifiedItcInPaise ?? 0) > 0 || (inputTax?.dataGapItcInPaise ?? 0) > 0) {
          items.push({
            label: "Input tax credit needs review",
            href: "/admin/accounting/gst/itc",
            hint: undefined
          });
        }
      }

      if (st.itcVerificationEnabled ?? st.itcEligibleWorkflow) {
        const itc = await fetchItcSummary(month).catch(() => null);
        if (itc) {
          setItcEligible(itc.eligibleInputGst.totalGstInPaise);
          if (itc.unverifiedInputGst.count > 0) {
            items.push({
              label: "ITC items awaiting verification",
              href: "/admin/accounting/gst/itc",
              hint: String(itc.unverifiedInputGst.count)
            });
          }
          if (itc.dataGapInputGst.count > 0) {
            items.push({
              label: "ITC information incomplete",
              href: "/admin/accounting/gst/itc",
              hint: String(itc.dataGapInputGst.count)
            });
          }
        }
      }

      if (st.gstReconciliationEnabled) {
        const sourceGaps = await fetchGstDataGaps(40).catch(() => null);
        const n = sourceGaps?.rows?.length ?? 0;
        if (n > 0) {
          gapTotal += n;
          items.push({
            label: "GST differences needing review",
            href: "/admin/accounting/gst/reconciliation",
            hint: String(n)
          });
        }
      }

      // Deduplicate by label
      const seen = new Set<string>();
      const unique = items.filter((i) => {
        if (seen.has(i.label)) return false;
        seen.add(i.label);
        return true;
      });
      setAttention(unique);
      setAttentionCount(Math.max(gapTotal, unique.length));
    } catch (e) {
      setError(e instanceof Error ? e.message : "GST overview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GstPageShell
      title="GST Accounting"
      subtitle="Review output tax, input tax credit position, and management GST summaries for the selected month."
      actions={
        <div className="flex flex-wrap items-end gap-3">
          <MonthFilter month={month} onChange={setMonth} disabled={loading} />
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded-md border border-[#ebe4db] bg-white px-3 py-1.5 text-xs font-semibold text-[#1c352a] transition-colors hover:bg-[#faf5ec] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      }
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {loading ? <GstSkeleton /> : null}

      {!loading && !gstEnabled ? <GstUnavailableState /> : null}

      {!loading && gstEnabled ? (
        <>
          <AccountingAlert tone="info">
            Figures are for accounting management. This workspace does not prepare or file GST returns.
          </AccountingAlert>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccountingMetricCard
              label="Output GST"
              value={outputTotal != null ? formatInrPaise(outputTotal) : "—"}
              hint={reportingEnabled ? "Period output tax (management)" : "From GST ledger closing"}
              href="/admin/accounting/gst/sales"
            />
            <AccountingMetricCard
              label="Input GST Recognised"
              value={inputRecognized != null ? formatInrPaise(inputRecognized) : "—"}
              hint="Posted to Input GST accounts"
              href="/admin/accounting/gst/ledger"
            />
            <AccountingMetricCard
              label="ITC Position"
              value={
                itcEnabled && itcEligible != null
                  ? formatInrPaise(itcEligible)
                  : reportingEnabled && itcEligible != null
                    ? formatInrPaise(itcEligible)
                    : "—"
              }
              hint="Eligible for claimability review (not ledger change)"
              href="/admin/accounting/gst/itc"
            />
            <AccountingMetricCard
              label="Estimated Net GST"
              value={estimatedNet != null ? formatInrPaise(estimatedNet) : "—"}
              hint="Management estimate — not a filing amount"
              href="/admin/accounting/gst/reports"
            />
          </div>

          {netNote ? (
            <p className="text-xs text-[#8a7060]">
              {netNote.includes("statutory") || netNote.includes("Not statutory")
                ? "Estimated net GST is a management accounting view. Filing adjustments are not modeled."
                : netNote}
            </p>
          ) : null}

          <AccountingSectionCard>
            <AccountingSectionHeader title="Needs Attention" />
            {attention.length === 0 ? (
              <AccountingEmptyState title="No GST items need attention for this month." />
            ) : (
              <ul className="space-y-2">
                {attention.map((item) => (
                  <li key={`${item.label}-${item.href}`}>
                    <Link
                      href={item.href}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ebe4db] bg-[#faf5ec]/50 px-3 py-2.5 text-sm transition-colors hover:bg-white"
                    >
                      <span className="font-medium text-[#2c2420]">
                        {item.hint ? `${item.hint} ` : ""}
                        {item.label}
                      </span>
                      <span className="text-xs font-semibold text-[#1c352a]">Review →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {attentionCount != null && attentionCount > 0 ? (
              <p className="mt-2 text-xs text-[#8a7060]">
                {attentionCount} attention signal{attentionCount === 1 ? "" : "s"} this month
              </p>
            ) : null}
          </AccountingSectionCard>

          <AccountingSectionCard>
            <AccountingSectionHeader title="Quick Actions" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <AccountingQuickAction
                label="Review Sales GST"
                hint="Outward supplies and credit notes"
                href="/admin/accounting/gst/sales"
              />
              <AccountingQuickAction
                label="Review Input Tax Credit"
                hint="Verify claimability evidence"
                href="/admin/accounting/gst/itc"
              />
              <AccountingQuickAction
                label="Open GST Ledger"
                hint="Posted Output and Input GST balances"
                href="/admin/accounting/gst/ledger"
              />
              <AccountingQuickAction
                label="GST Reconciliation"
                hint="Diagnostic comparison only"
                href="/admin/accounting/gst/reconciliation"
              />
              <AccountingQuickAction
                label="Reports & Export"
                hint="Management workbook download"
                href="/admin/accounting/gst/reports"
              />
            </div>
          </AccountingSectionCard>
        </>
      ) : null}
    </GstPageShell>
  );
}
