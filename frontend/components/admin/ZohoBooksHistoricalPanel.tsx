"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchZohoBooksAnalytics,
  fetchZohoBooksChannels,
  type ZohoHistoricalAnalyticsData
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

type DateRange = { from: string; to: string };

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currentMonthRange(): DateRange {
  const now = new Date();
  return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIsoDate(now) };
}

function lastDaysRange(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function formatDisplayDate(dateIso: string) {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatRangeLabel(range: DateRange) {
  return `${formatDisplayDate(range.from)} → ${formatDisplayDate(range.to)}`;
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      className="rounded-lg border border-[#e8e2d9] bg-white px-4 py-3"
      style={{ borderBottom: "3px solid rgba(185,138,62,0.3)" }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7060]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#1c352a]">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[#8a7060]">{sub}</p> : null}
    </div>
  );
}

const CHART_COLORS = ["#1c352a", "#b98a3e", "#2d5040", "#c8960a", "#4a7c59", "#8a6200", "#7da58a", "#e0b86a"];

function BarChart({
  title,
  rows,
  valueFormatter
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
  valueFormatter: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-xl border border-[#e8e2d9] bg-white">
      <div className="border-b border-[#f0ece6] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#1c352a]">{title}</h3>
      </div>
      <div className="p-4">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#8a7060]">No data in this range.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={row.label} className="grid grid-cols-[140px_1fr_auto] items-center gap-2">
                <span className="truncate text-xs text-[#4a3f38]" title={row.label}>
                  {row.label}
                </span>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#f5f0e8]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(2, Math.round((row.value / max) * 100))}%`,
                      background: CHART_COLORS[idx % CHART_COLORS.length]
                    }}
                  />
                </div>
                <span className="text-right text-[11px] font-semibold tabular-nums text-[#1c352a]">
                  {valueFormatter(row.value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function ZohoBooksHistoricalPanel() {
  const [draft, setDraft] = useState<DateRange>(currentMonthRange);
  const [applied, setApplied] = useState<DateRange>(currentMonthRange);
  const [channel, setChannel] = useState<string>("ALL");
  const [channels, setChannels] = useState<string[]>([]);
  const [data, setData] = useState<ZohoHistoricalAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const allTimeBounds = useMemo<DateRange>(() => {
    if (data?.range.allTimeFrom && data?.range.allTimeTo) {
      return { from: data.range.allTimeFrom, to: data.range.allTimeTo };
    }
    return { from: "2024-04-01", to: toIsoDate(new Date()) };
  }, [data?.range.allTimeFrom, data?.range.allTimeTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analytics, ch] = await Promise.all([
        fetchZohoBooksAnalytics({
          from: applied.from,
          to: applied.to,
          channel: channel === "ALL" ? undefined : channel
        }),
        fetchZohoBooksChannels()
      ]);
      setData(analytics);
      setChannels(ch.channels);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Zoho Books analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [applied.from, applied.to, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  const moneyInr = (paise: number) => formatMinorFromPaise(paise, "INR");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e8e2d9] bg-[#faf9f7] px-4 py-3 text-sm text-[#4a3f38]">
        <p className="font-semibold text-[#1c352a]">Zoho Books — all-channel historical invoices</p>
        <p className="mt-1 text-xs text-[#8a7060]">
          Separate reference tables (not mixed with website Orders or live marketplace sync). Re-import /
          append on cutover; after launch use Sarveda invoices for ops and this for history.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#e8e2d9] bg-white p-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-[#8a7060]">
          From
          <input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="mt-1 block rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-[#8a7060]">
          To
          <input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="mt-1 block rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-[#8a7060]">
          Channel
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="mt-1 block min-w-[10rem] rounded-md border border-[#e0d8ce] px-2 py-1.5 text-sm text-[#2c2420]"
          >
            <option value="ALL">All channels</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setApplied(draft)}
          className="rounded-md bg-[#1c352a] px-3 py-2 text-sm font-semibold text-[#faf5ec]"
        >
          Filter
        </button>
        <button
          type="button"
          onClick={() => {
            const next = currentMonthRange();
            setDraft(next);
            setApplied(next);
          }}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 bg-[#f0f7f3] text-[#1c352a] ring-[#a8c4b0]"
        >
          This month
        </button>
        <button
          type="button"
          onClick={() => {
            const next = lastDaysRange(7);
            setDraft(next);
            setApplied(next);
          }}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 bg-[#faf5ec] text-[#8a6200] ring-[#e0d4b0]"
        >
          Last 7 days
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(allTimeBounds);
            setApplied(allTimeBounds);
          }}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 bg-[#f5f0e8] text-[#4a3f38] ring-[#e8e2d9]"
        >
          All time
        </button>
        <p className="w-full text-xs text-[#8a7060]">
          Showing <span className="font-medium text-[#1c352a]">{formatRangeLabel(applied)}</span>
          {data?.range.allTimeFrom && data.range.allTimeTo ? (
            <>
              <span className="mx-1.5 text-stone-300">·</span>
              All time covers{" "}
              <span className="font-medium text-[#1c352a]">
                {formatRangeLabel({ from: data.range.allTimeFrom, to: data.range.allTimeTo })}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          {error.toLowerCase().includes("does not exist") || error.toLowerCase().includes("zoho") ? (
            <p className="mt-1 text-xs">
              If tables are empty, run migration then:{" "}
              <code className="rounded bg-red-100 px-1">npm run import:zoho-historical</code> in backend.
            </p>
          ) : null}
        </div>
      ) : null}

      {loading && !data ? (
        <p className="py-10 text-center text-sm text-[#8a7060]">Loading Zoho Books analytics…</p>
      ) : data ? (
        <>
          <section className="rounded-xl border border-[#e8e2d9] bg-white p-4">
            <h3 className="text-sm font-semibold text-[#1c352a]">Period conclusion</h3>
            <ul className="mt-2 space-y-1.5">
              {data.conclusion.map((line) => (
                <li key={line} className="rounded-md bg-[#faf9f7] px-3 py-2 text-sm text-[#4a3f38]">
                  {line}
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Invoices" value={data.totals.invoices.toLocaleString("en-IN")} />
            <MetricCard
              label="Units sold"
              value={data.totals.unitsSold.toLocaleString("en-IN")}
              sub={`${data.totals.lineItems.toLocaleString("en-IN")} line items`}
            />
            <MetricCard
              label="Revenue (reporting INR)"
              value={moneyInr(data.totals.revenueInInrPaise)}
              sub="FX-normalized"
            />
            <MetricCard
              label="Top seller"
              value={data.topSkus[0]?.sku ?? "—"}
              sub={
                data.topSkus[0]
                  ? `${data.topSkus[0].unitsSold} units · ${data.topSkus[0].itemName ?? ""}`
                  : undefined
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <BarChart
              title="Revenue by channel (INR)"
              rows={data.byChannel.slice(0, 12).map((r) => ({
                label: r.channel,
                value: r.revenueInInrPaise
              }))}
              valueFormatter={(v) => moneyInr(v)}
            />
            <BarChart
              title="Invoices by channel"
              rows={data.byChannel.slice(0, 12).map((r) => ({
                label: r.channel,
                value: r.invoices
              }))}
              valueFormatter={(v) => v.toLocaleString("en-IN")}
            />
            <BarChart
              title="Revenue by month (INR)"
              rows={data.byMonth.map((r) => ({
                label: r.month,
                value: r.revenueInInrPaise
              }))}
              valueFormatter={(v) => moneyInr(v)}
            />
            <BarChart
              title="Top SKUs by units"
              rows={data.topSkus.slice(0, 12).map((r) => ({
                label: r.sku,
                value: r.unitsSold
              }))}
              valueFormatter={(v) => String(v)}
            />
          </div>

          <section className="overflow-hidden rounded-xl border border-[#e8e2d9] bg-white">
            <div className="border-b border-[#f0ece6] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#1c352a]">Top SKUs</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#faf9f7] text-left text-[11px] uppercase tracking-wider text-[#8a7060]">
                  <tr>
                    <th className="px-4 py-2">SKU</th>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2 text-right">Units</th>
                    <th className="px-4 py-2 text-right">Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topSkus.map((row) => (
                    <tr key={`${row.sku}-${row.itemName}`} className="border-t border-[#f0ece6]">
                      <td className="px-4 py-2 font-mono text-xs text-[#1c352a]">{row.sku}</td>
                      <td className="px-4 py-2 text-[#4a3f38]">{row.itemName ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.unitsSold}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.invoiceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
