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
  AccountingStatusBadge,
  GstPageShell,
  GstSkeleton,
  GstUnavailableState,
  MonthFilter,
  currentGstMonth,
  gstAttentionKindFromCode,
  humanizeGstStatus,
  type GstAttentionKind
} from "@/components/admin/accounting/gst/gst-ui";

type Attention = {
  label: string;
  href: string;
  hint?: string;
  kind: GstAttentionKind;
  code?: string;
};

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
  const [attention, setAttention] = useState<Attention[]>([]);

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
        return;
      }

      const items: Attention[] = [];

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

        const gaps = await fetchGstReportDataGaps({ month }).catch(() => null);
        for (const g of gaps?.gaps ?? []) {
          if (g.count <= 0) continue;
          const label = humanizeGstStatus(g.code);
          items.push({
            label,
            href: "/admin/accounting/gst/reconciliation",
            hint: String(g.count),
            kind: gstAttentionKindFromCode(g.code),
            code: g.code
          });
        }

        if ((inputTax?.unverifiedItcInPaise ?? 0) > 0 || (inputTax?.dataGapItcInPaise ?? 0) > 0) {
          items.push({
            label: "Input tax credit needs review",
            href: "/admin/accounting/gst/itc",
            kind: "action"
          });
        }
      }

      if (st.itcVerificationEnabled ?? st.itcEligibleWorkflow) {
        const itc = await fetchItcSummary(month).catch(() => null);
        if (itc) {
          setItcEligible(itc.eligibleInputGst.totalGstInPaise);
          if (itc.unverifiedInputGst.count > 0) {
            items.push({
              label: "ITC awaiting verification",
              href: "/admin/accounting/gst/itc",
              hint: String(itc.unverifiedInputGst.count),
              kind: "action"
            });
          }
          if (itc.dataGapInputGst.count > 0) {
            items.push({
              label: "ITC information incomplete",
              href: "/admin/accounting/gst/itc",
              hint: String(itc.dataGapInputGst.count),
              kind: "action"
            });
          }
          if (itc.gatewayProvisionalGst.count > 0) {
            items.push({
              label: "Payment fee tax",
              href: "/admin/accounting/gst/itc",
              hint: String(itc.gatewayProvisionalGst.count),
              kind: "info",
              code: "GATEWAY_GST_PROVISIONAL"
            });
          }
        }
      }

      if (st.gstReconciliationEnabled) {
        const sourceGaps = await fetchGstDataGaps(40).catch(() => null);
        const n = sourceGaps?.rows?.length ?? 0;
        if (n > 0) {
          items.push({
            label: "GST differences needing review",
            href: "/admin/accounting/gst/reconciliation",
            hint: String(n),
            kind: "action"
          });
        }
      }

      const seen = new Set<string>();
      const unique = items.filter((i) => {
        const key = `${i.label}|${i.href}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      unique.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "action" ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
      setAttention(unique);
    } catch (e) {
      setError(e instanceof Error ? e.message : "GST overview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionItems = attention.filter((a) => a.kind === "action");
  const infoItems = attention.filter((a) => a.kind === "info");

  return (
    <GstPageShell
      title="GST Accounting"
      subtitle="Review output tax, input tax credit, and GST summaries for the selected month."
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
          <p className="text-xs leading-relaxed text-[#8a7060]">
            Figures are for accounting management. This workspace does not prepare or file GST
            returns.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccountingMetricCard
              label="Output GST"
              value={outputTotal != null ? formatInrPaise(outputTotal) : "—"}
              hint={reportingEnabled ? "Period output tax" : "From GST ledger"}
              href="/admin/accounting/gst/sales"
            />
            <AccountingMetricCard
              label="Input GST Recognised"
              value={inputRecognized != null ? formatInrPaise(inputRecognized) : "—"}
              hint="Posted Input GST balances"
              href="/admin/accounting/gst/ledger"
            />
            <AccountingMetricCard
              label="ITC Position"
              value={
                (itcEnabled || reportingEnabled) && itcEligible != null
                  ? formatInrPaise(itcEligible)
                  : "—"
              }
              hint="Claimability review status"
              href="/admin/accounting/gst/itc"
            />
            <AccountingMetricCard
              label="Estimated Net GST"
              value={estimatedNet != null ? formatInrPaise(estimatedNet) : "—"}
              hint="Accounting estimate"
              href="/admin/accounting/gst/reports"
            />
          </div>

          <AccountingSectionCard>
            <AccountingSectionHeader title="Needs Attention" />
            {attention.length === 0 ? (
              <AccountingEmptyState title="No GST items need attention for this month." />
            ) : (
              <div className="space-y-4">
                {actionItems.length > 0 ? (
                  <ul className="space-y-2">
                    {actionItems.map((item) => (
                      <AttentionRow key={`a-${item.label}-${item.href}`} item={item} />
                    ))}
                  </ul>
                ) : null}
                {infoItems.length > 0 ? (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">
                      Known limitations
                    </p>
                    <ul className="space-y-2">
                      {infoItems.map((item) => (
                        <AttentionRow key={`i-${item.label}-${item.href}`} item={item} />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
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
                hint="Output and Input GST balances"
                href="/admin/accounting/gst/ledger"
              />
              <AccountingQuickAction
                label="GST Reconciliation"
                hint="Diagnostic comparison"
                href="/admin/accounting/gst/reconciliation"
              />
              <AccountingQuickAction
                label="Reports & Export"
                hint="Summaries and workbook"
                href="/admin/accounting/gst/reports"
              />
            </div>
          </AccountingSectionCard>
        </>
      ) : null}
    </GstPageShell>
  );
}

function AttentionRow({ item }: { item: Attention }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ebe4db] bg-[#faf5ec]/50 px-3 py-2.5 text-sm transition-colors hover:bg-white"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <AccountingStatusBadge tone={item.kind === "action" ? "warning" : "neutral"}>
            {item.kind === "action" ? "Review" : "Limitation"}
          </AccountingStatusBadge>
          <span className="font-medium text-[#2c2420]">
            {item.hint ? (
              <span className="tabular-nums text-[#1c352a]">{item.hint} </span>
            ) : null}
            {item.label}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-[#1c352a]">Open →</span>
      </Link>
    </li>
  );
}
