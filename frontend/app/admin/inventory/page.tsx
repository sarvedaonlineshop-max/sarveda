"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import type { InventoryRow } from "@/lib/admin-api";
import {
  fetchAdminInventory,
  patchAdminInventoryVariant,
  syncStockFromZohoAdmin
} from "@/lib/admin-api";

const PAGE_SIZE = 25;

export default function AdminInventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [zohoSyncing, setZohoSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const pushToast = useCallback((message: string, error = false) => {
    setToast({ message, error });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchAdminInventory({ page, limit: PAGE_SIZE });
      setRows(data.items);
      setPagination(data.pagination);
      const d: Record<string, string> = {};
      for (const r of data.items) d[r.variantId] = String(r.onHand);
      setDrafts(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load inventory");
      setRows([]);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRow(variantId: string) {
    const raw = drafts[variantId];
    const val = parseInt(raw, 10);
    if (!Number.isFinite(val) || val < 0) {
      setErr("Enter a non-negative integer quantity");
      return;
    }
    setBusy(variantId);
    setErr(null);
    try {
      await patchAdminInventoryVariant(variantId, val);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function syncFromZoho() {
    setZohoSyncing(true);
    setErr(null);
    try {
      const result = await syncStockFromZohoAdmin();
      pushToast(`✅ Synced ${result.synced} products from Zoho Books`);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Zoho stock sync failed";
      pushToast(message, true);
    } finally {
      setZohoSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.error
              ? "border-red-300 bg-red-950 text-red-50 dark:border-red-800"
              : "border-stone-300 bg-stone-900 text-amber-50 dark:border-stone-600"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Inventory</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            One row per variant (SKU). Adjust physical stock and watch low-stock badges.
          </p>
        </div>
        <button
          type="button"
          disabled={zohoSyncing}
          onClick={() => void syncFromZoho()}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {zohoSyncing ? (
            <>
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-900 border-t-transparent"
                aria-hidden
              />
              Syncing…
            </>
          ) : (
            "Sync from Zoho"
          )}
        </button>
      </div>

      <aside className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
        <p className="font-medium text-stone-800 dark:text-stone-100">What this section is for</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-amber-600 dark:marker:text-amber-500">
          <li>
            <strong>On hand</strong> — units you count in the warehouse or store (editable).
          </li>
          <li>
            <strong>Reserved</strong> — units held for unpaid or in-progress checkouts (when the platform uses
            reservations).
          </li>
          <li>
            <strong>Available</strong> — approx. on hand minus reserved; what you can promise to new buyers.
          </li>
        </ul>
        <p className="mt-3 text-stone-600 dark:text-stone-400">
          <strong>Products</strong> is catalogue + pricing; <strong>Orders</strong> is what customers bought.{" "}
          <strong>Inventory</strong> is stock numbers tied to each SKU.
        </p>
      </aside>

      {err ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
            <tr>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Product</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Variant</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">SKU</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">On hand</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Reserved</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Available</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
            {rows.map((r) => (
              <tr
                key={r.variantId}
                className={r.low ? "bg-red-50/80 dark:bg-red-950/30" : undefined}
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/product/${r.productSlug}`}
                    className="font-medium text-amber-800 hover:underline dark:text-amber-400"
                  >
                    {r.productName}
                  </Link>
                  {r.low ? (
                    <span className="ml-2 rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-900 dark:bg-red-900/70 dark:text-red-100">
                      Low
                    </span>
                  ) : null}
                </td>
                <td className="max-w-[10rem] px-4 py-3 text-xs text-stone-600 dark:text-stone-400">
                  {r.variantLabel ?? "Default"}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{r.sku}</td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    value={drafts[r.variantId] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [r.variantId]: e.target.value
                      }))
                    }
                    className={`w-20 rounded-md border px-2 py-1 font-mono text-sm dark:bg-stone-950 dark:text-stone-100 ${
                      r.low ? "border-red-300 dark:border-red-700" : "border-stone-300 dark:border-stone-600"
                    }`}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-sm">{r.reserved}</td>
                <td className="px-4 py-3 font-mono text-sm">{r.available}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={busy === r.variantId}
                    onClick={() => void saveRow(r.variantId)}
                    className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-medium text-amber-400 disabled:opacity-50 dark:bg-stone-700 dark:text-amber-300"
                  >
                    {busy === r.variantId ? "…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        itemLabel="SKUs"
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
      />
    </div>
  );
}
