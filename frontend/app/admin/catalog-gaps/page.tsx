"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { fetchCatalogGaps, type CatalogGapsReport } from "@/lib/admin-api";

function GapTable({
  rows,
  editHref
}: {
  rows: CatalogGapsReport["pricingGaps"];
  editHref: (productId: string) => string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-stone-500">No gaps in this category.</p>;
  }
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-stone-200 dark:border-stone-700">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-stone-50 text-xs uppercase text-stone-500 dark:bg-stone-800">
          <tr>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Issue</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
          {rows.map((r, i) => (
            <tr key={`${r.variantId}-${r.zone}-${i}`}>
              <td className="px-3 py-2">
                <p className="font-medium text-stone-800 dark:text-stone-100">{r.productName}</p>
                <p className="text-xs text-stone-500">{r.productSlug}</p>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
              <td className="px-3 py-2 text-stone-600 dark:text-stone-300">
                {r.issue}
                {r.zone ? ` (${r.zone})` : ""}
              </td>
              <td className="px-3 py-2">
                <Link
                  href={editHref(r.productId)}
                  className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                >
                  Fix
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CatalogGapsPage() {
  const [report, setReport] = useState<CatalogGapsReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setReport(await fetchCatalogGaps());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editHref = (id: string) => `/admin/products/${id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/products" className="text-sm text-amber-700 hover:underline dark:text-amber-400">
            ← Products
          </Link>
          <h1 className="mt-2 font-serif text-3xl italic text-stone-800 dark:text-stone-100">
            Catalog & payment gaps
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Missing international prices, zone shipping rows, and payment gateway configuration.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-amber-400 dark:bg-stone-700"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="text-sm text-stone-500">Loading…</p> : null}
      {err ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      {report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <p className="text-xs uppercase text-stone-500">Pricing gaps</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                {report.summary.pricingGapCount}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <p className="text-xs uppercase text-stone-500">Shipping gaps</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                {report.summary.shippingGapCount}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <p className="text-xs uppercase text-stone-500">No primary image</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                {report.summary.productsWithoutImage}
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <p className="text-xs uppercase text-stone-500">Active variants</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                {report.summary.activeVariants}
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900">
            <h2 className="font-medium text-stone-800 dark:text-stone-100">Payment gateways (server env)</h2>
            <ul className="mt-3 flex flex-wrap gap-3 text-sm">
              {(
                [
                  ["Razorpay (India)", report.summary.payment.razorpay],
                  ["COD", report.summary.payment.cod],
                  ["Stripe", report.summary.payment.stripe],
                  ["PayPal", report.summary.payment.paypal]
                ] as const
              ).map(([label, ok]) => (
                <li
                  key={label}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    ok
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                  }`}
                >
                  {label}: {ok ? "configured" : "missing keys"}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-medium text-stone-800 dark:text-stone-100">Pricing gaps</h2>
            <GapTable rows={report.pricingGaps} editHref={editHref} />
          </section>

          <section>
            <h2 className="mb-2 font-medium text-stone-800 dark:text-stone-100">Shipping gaps</h2>
            <GapTable rows={report.shippingGaps} editHref={editHref} />
          </section>

          {report.productsWithoutPrimaryImage.length > 0 ? (
            <section>
              <h2 className="mb-2 font-medium text-stone-800 dark:text-stone-100">Products without primary image</h2>
              <ul className="space-y-1 text-sm">
                {report.productsWithoutPrimaryImage.map((p) => (
                  <li key={p.productId}>
                    <Link
                      href={editHref(p.productId)}
                      className="text-amber-700 hover:underline dark:text-amber-400"
                    >
                      {p.name}
                    </Link>
                    <span className="text-stone-500"> — {p.slug}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
