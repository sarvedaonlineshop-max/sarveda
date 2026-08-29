"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  AccountingEmptyState,
  AccountingSectionCard,
  SalesPageShell
} from "@/components/admin/accounting/sales/sales-ui";
import {
  formatQuoteMoney,
  listQuotations,
  type QuotationRow
} from "@/lib/quotations-api";

const FILTERS = [
  "ALL",
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "EXPIRED",
  "CONVERTED",
  "CANCELLED"
] as const;

export default function QuotesListPage() {
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("ALL");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<QuotationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listQuotations({ status, q: q.trim() || undefined, page, pageSize: 25 });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load quotes");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SalesPageShell
      title="Quotes"
      subtitle="Pre-sale quotations and proforma invoices — no accounting impact."
      actions={
        <Link
          href="/admin/accounting/quotes/new"
          className="rounded-lg bg-[#1c352a] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#243f33]"
        >
          New Quote
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setPage(1);
              setStatus(f);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === f
                ? "bg-[#1c352a] text-white"
                : "bg-[#f5efe6] text-[#6b5a4e] hover:bg-[#ebe4db]"
            }`}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              void load();
            }
          }}
          placeholder="Search quote #, customer, email, phone"
          className="ml-auto min-w-[220px] flex-1 rounded-lg border border-[#e0d8ce] bg-white px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            setPage(1);
            void load();
          }}
          className="rounded-lg border border-[#e0d8ce] px-3 py-1.5 text-sm"
        >
          Search
        </button>
      </div>

      {err ? <p className="text-sm text-red-700">{err}</p> : null}

      <AccountingSectionCard className="overflow-hidden p-0">
        {loading ? (
          <p className="p-6 text-sm text-[#8a7060]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="p-4">
            <AccountingEmptyState
              title="No quotations have been created yet."
              description="Create a quote for B2B or offline price offers. Proforma invoices are generated from a quote."
            />
            <div className="mt-3 text-center">
              <Link
                href="/admin/accounting/quotes/new"
                className="text-sm font-medium text-[#1c352a] underline"
              >
                Create first quote
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#ebe4db] bg-[#faf5ec]/80 text-xs uppercase tracking-wide text-[#8a7060]">
                <tr>
                  <th className="px-4 py-3 font-medium">Quote #</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Valid until</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-[#f0ebe3]">
                    <td className="px-4 py-3 font-mono text-xs">{row.quoteNumber}</td>
                    <td className="px-4 py-3 text-[#6b5a4e]">
                      {new Date(row.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#1c352a]">{row.customerName}</div>
                      {row.email ? <div className="text-xs text-[#8a7060]">{row.email}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-[#6b5a4e]">
                      {row.validUntil ? new Date(row.validUntil).toLocaleDateString("en-IN") : "—"}
                      {row.expiry?.label ? (
                        <div className="text-xs text-[#8a7060]">{row.expiry.label}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {formatQuoteMoney(row.grandTotalInPaise, row.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[#f5efe6] px-2 py-0.5 text-xs font-medium">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/accounting/quotes/${row.id}`}
                        className="text-sm font-medium text-[#1c352a] underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AccountingSectionCard>

      {total > 25 ? (
        <div className="flex items-center justify-between text-sm text-[#8a7060]">
          <span>
            Page {page} · {total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-[#e0d8ce] px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page * 25 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-[#e0d8ce] px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </SalesPageShell>
  );
}
