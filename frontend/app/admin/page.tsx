"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { DashboardData } from "@/lib/admin-api";
import { fetchAdminDashboard } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

type ChartRange = "7d" | "30d" | "12m";

type ChartPoint = { label: string; revenueInPaise: number };

function shortInrFromPaise(paise: number): string {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
}

function RevenueChart({ points, kind }: { points: ChartPoint[]; kind: "bar" | "line" }) {
  const w = 720;
  const h = 220;
  const pad = { t: 32, r: 16, b: 40, l: 16 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = Math.max(1, ...points.map((p) => p.revenueInPaise));
  const n = Math.max(1, points.length);
  const slot = iw / n;

  const bars =
    kind === "bar"
      ? points.map((p, i) => {
          const bw = Math.max(4, slot * 0.55);
          const x = pad.l + i * slot + (slot - bw) / 2;
          const bh = (p.revenueInPaise / max) * ih;
          const y = pad.t + ih - bh;
          const label = shortInrFromPaise(p.revenueInPaise);
          return (
            <g key={p.label}>
              <text
                x={x + bw / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-stone-600 dark:fill-stone-300"
                fontSize={9}
                fontWeight={600}
              >
                {label}
              </text>
              <rect
                x={x}
                y={y}
                width={bw}
                height={Math.max(bh, 2)}
                rx={4}
                className="fill-amber-500 dark:fill-amber-400"
              />
              <text
                x={x + bw / 2}
                y={h - 10}
                textAnchor="middle"
                className="fill-stone-500 dark:fill-stone-400"
                fontSize={9}
              >
                {p.label}
              </text>
            </g>
          );
        })
      : null;

  const linePath =
    kind === "line"
      ? points
          .map((p, i) => {
            const x = pad.l + i * slot + slot / 2;
            const y = pad.t + ih - (p.revenueInPaise / max) * ih;
            return `${i === 0 ? "M" : "L"}${x},${y}`;
          })
          .join(" ")
      : "";

  const lineDots =
    kind === "line"
      ? points.map((p, i) => {
          const x = pad.l + i * slot + slot / 2;
          const y = pad.t + ih - (p.revenueInPaise / max) * ih;
          return <circle key={p.label} cx={x} cy={y} r={3.5} className="fill-amber-600 dark:fill-amber-400" />;
        })
      : null;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full max-w-full" role="img" aria-label="Revenue chart">
      <rect width={w} height={h} rx={12} className="fill-stone-50 dark:fill-stone-950/40" />
      {kind === "bar" ? bars : null}
      {kind === "line" ? (
        <>
          <path
            d={linePath}
            fill="none"
            strokeWidth={2.5}
            className="stroke-amber-600 dark:stroke-amber-400"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {lineDots}
          {points.map((p, i) => {
            const x = pad.l + i * slot + slot / 2;
            return (
              <text
                key={`t-${p.label}`}
                x={x}
                y={h - 10}
                textAnchor="middle"
                className="fill-stone-500 dark:fill-stone-400"
                fontSize={9}
              >
                {p.label}
              </text>
            );
          })}
        </>
      ) : null}
    </svg>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>("7d");
  const [chartKind, setChartKind] = useState<"bar" | "line">("bar");

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    fetchAdminDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Dashboard failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    if (chartRange === "7d") {
      return data.revenueByDayLast7.map((r) => ({ label: r.date.slice(5), revenueInPaise: r.revenueInPaise }));
    }
    if (chartRange === "30d") {
      return data.revenueByDayLast30.map((r) => ({ label: r.date.slice(5), revenueInPaise: r.revenueInPaise }));
    }
    return data.revenueByMonthLast12.map((r) => ({
      label: r.month.slice(5),
      revenueInPaise: r.revenueInPaise
    }));
  }, [data, chartRange]);

  if (err) {
    return (
      <div>
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-stone-500 dark:text-stone-400" role="status">
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Net sales (excl. tax & shipping), paid date in IST — aligned with Woo Analytics.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Lifetime revenue
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-50">
            {formatINRFromPaise(data.totalRevenueInPaise)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Revenue today
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-50">
            {formatINRFromPaise(data.revenueInPaise.today)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Last 7 days
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-50">
            {formatINRFromPaise(data.revenueInPaise.last7Days)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            This month
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-50">
            {formatINRFromPaise(data.revenueInPaise.thisMonth)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Orders today
          </p>
          <p className="mt-1 text-xl font-semibold text-stone-900 dark:text-stone-50">{data.ordersCount.today}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Orders (7 days)
          </p>
          <p className="mt-1 text-xl font-semibold text-stone-900 dark:text-stone-50">{data.ordersCount.thisWeek}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Orders (month)
          </p>
          <p className="mt-1 text-xl font-semibold text-stone-900 dark:text-stone-50">{data.ordersCount.thisMonth}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-stone-800 dark:text-stone-100">Products</h2>
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <dl className="grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="text-xs uppercase text-stone-400 dark:text-stone-500">Active</dt>
                <dd className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">{data.productsByStatus.active}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-stone-400 dark:text-stone-500">Draft</dt>
                <dd className="text-xl font-semibold text-amber-700 dark:text-amber-400">{data.productsByStatus.draft}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-stone-400 dark:text-stone-500">Archived</dt>
                <dd className="text-xl font-semibold text-stone-500 dark:text-stone-400">{data.productsByStatus.archived}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-amber-50 p-5 shadow-sm dark:border-violet-900/50 dark:from-violet-950/40 dark:via-stone-900 dark:to-amber-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Commerce insights</h2>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:bg-violet-900/60 dark:text-violet-200">
                Rule-based
              </span>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-stone-700 dark:text-stone-200">
              {data.insights.tips.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-violet-500 dark:text-violet-400">✦</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Fast movers (30d units)
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {data.insights.fastMovers.length === 0 ? (
                    <li className="text-stone-500 dark:text-stone-400">No data yet</li>
                  ) : (
                    data.insights.fastMovers.map((p) => (
                      <li key={p.productId} className="flex justify-between gap-2">
                        <Link
                          href={`/admin/products/${p.productId}`}
                          className="truncate text-amber-800 hover:underline dark:text-amber-300"
                          title={p.name}
                        >
                          {p.name}
                        </Link>
                        <span className="flex-shrink-0 font-mono text-xs text-stone-600 dark:text-stone-300">
                          {p.unitsSold}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Slow movers (&lt;2 units / 30d)
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {data.insights.slowMovers.length === 0 ? (
                    <li className="text-stone-500 dark:text-stone-400">None flagged</li>
                  ) : (
                    data.insights.slowMovers.map((p) => (
                      <li key={p.productId} className="flex justify-between gap-2">
                        <span className="truncate text-stone-700 dark:text-stone-200" title={p.name}>
                          {p.name}
                        </span>
                        <span className="flex-shrink-0 font-mono text-xs text-stone-500">{p.unitsSold}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Revenue chart</h2>
              <div className="flex flex-wrap gap-2">
                <div className="flex rounded-full border border-stone-200 p-0.5 dark:border-stone-600">
                  {(
                    [
                      ["7d", "7 days"],
                      ["30d", "30 days"],
                      ["12m", "12 months"]
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setChartRange(v)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        chartRange === v
                          ? "bg-stone-900 text-amber-400"
                          : "text-stone-600 dark:text-stone-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-full border border-stone-200 p-0.5 dark:border-stone-600">
                  <button
                    type="button"
                    onClick={() => setChartKind("bar")}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      chartKind === "bar" ? "bg-stone-900 text-amber-400" : "text-stone-600 dark:text-stone-300"
                    }`}
                  >
                    Bar
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartKind("line")}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      chartKind === "line" ? "bg-stone-900 text-amber-400" : "text-stone-600 dark:text-stone-300"
                    }`}
                  >
                    Line
                  </button>
                </div>
              </div>
            </div>
            <RevenueChart points={chartPoints} kind={chartKind} />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Low stock</h2>
            <Link
              href="/admin/inventory"
              className="text-sm text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
            >
              View all →
            </Link>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <ul className="divide-y divide-stone-100 dark:divide-stone-700">
              {data.lowStockAlerts.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
                  No low-stock SKUs
                </li>
              ) : (
                data.lowStockAlerts.map((a) => (
                  <li key={a.variantId} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{a.productName}</p>
                      <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                        SKU {a.sku} · on hand {a.onHand} (thresh {a.lowStockThreshold})
                      </p>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/50 dark:text-red-200">
                      Low
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Recent orders</h2>
          <Link
            href="/admin/orders"
            className="text-sm text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
          >
            All orders →
          </Link>
        </div>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
              <tr>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Order</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Customer</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Amount</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Status</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {data.recentOrders.map((o) => (
                <tr key={o.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono text-amber-700 hover:underline dark:text-amber-400"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{o.email}</td>
                  <td className="px-4 py-3">{formatINRFromPaise(o.grandTotalInPaise)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-500 dark:text-stone-400">
                    {new Date(o.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
