"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  deleteAdminPickupLocation,
  fetchAdminPickupLocations,
  patchAdminPickupLocation,
  postAdminPickupLocation,
  type AdminPickupLocationRow
} from "@/lib/admin-api";

export default function AdminPickupLocationsPage() {
  const [items, setItems] = useState<AdminPickupLocationRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState("");
  const [shiprocketPickupName, setShiprocketPickupName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [line1, setLine1] = useState("");
  const [isPrimaryNew, setIsPrimaryNew] = useState(false);
  const [sortOrderNew, setSortOrderNew] = useState(0);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const rows = await fetchAdminPickupLocations();
      setItems(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !shiprocketPickupName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await postAdminPickupLocation({
        label: label.trim(),
        shiprocketPickupName: shiprocketPickupName.trim(),
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        line1: line1.trim() || undefined,
        isPrimary: isPrimaryNew,
        sortOrder: sortOrderNew
      });
      setLabel("");
      setShiprocketPickupName("");
      setCity("");
      setState("");
      setPostalCode("");
      setLine1("");
      setIsPrimaryNew(false);
      setSortOrderNew(0);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(id: string) {
    setBusy(true);
    setErr(null);
    try {
      await patchAdminPickupLocation(id, { isPrimary: true, isActive: true });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    if (!window.confirm("Deactivate this warehouse? It will no longer appear for new shipments.")) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAdminPickupLocation(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-amber-700 hover:underline dark:text-amber-400">
          ← Dashboard
        </Link>
        <h1 className="mt-3 font-serif text-3xl italic text-stone-800 dark:text-stone-100">
          Warehouses (Shiprocket pickup)
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
          Mark one location as primary (default for auto shipment). The{" "}
          <strong className="font-medium text-stone-800 dark:text-stone-200">Shiprocket warehouse name</strong> must
          match the pickup name in your Shiprocket dashboard exactly — otherwise label creation will fail.
        </p>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {err}
        </p>
      ) : null}

      <form
        onSubmit={(ev) => void handleAdd(ev)}
        className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900"
      >
        <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Add warehouse</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Display label</span>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
              placeholder="Mysore (primary)"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Shiprocket pickup name</span>
            <input
              required
              value={shiprocketPickupName}
              onChange={(e) => setShiprocketPickupName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
              placeholder="Primary"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Address line (optional)</span>
            <input
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">City / State / PIN</span>
            <div className="mt-1 flex gap-2">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
              />
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
              />
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="PIN"
                className="w-28 rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
              />
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
            <input type="checkbox" checked={isPrimaryNew} onChange={(e) => setIsPrimaryNew(e.target.checked)} />
            Set as primary default
          </label>
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Sort order</span>
            <input
              type="number"
              value={sortOrderNew}
              onChange={(e) => setSortOrderNew(parseInt(e.target.value, 10) || 0)}
              className="mt-1 w-32 rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add warehouse"}
        </button>
      </form>

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">All locations</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">No warehouses yet — add Mysore as primary first.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 dark:border-stone-700">
                <tr>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">Label</th>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">Shiprocket name</th>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">City</th>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">Primary</th>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">Active</th>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                {items.map((row) => (
                  <tr key={row.id} className={row.isActive ? "" : "opacity-60"}>
                    <td className="py-2 pr-4 font-medium text-stone-800 dark:text-stone-100">{row.label}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-stone-600 dark:text-stone-400">{row.shiprocketPickupName}</td>
                    <td className="py-2 pr-4 text-stone-600 dark:text-stone-300">
                      {[row.city, row.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="py-2 pr-4">{row.isPrimary ? "Yes" : "—"}</td>
                    <td className="py-2 pr-4">{row.isActive ? "Yes" : "No"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {row.isActive && !row.isPrimary ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="text-xs font-semibold text-amber-800 underline dark:text-amber-400"
                            onClick={() => void setPrimary(row.id)}
                          >
                            Set primary
                          </button>
                        ) : null}
                        {row.isActive ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="text-xs font-semibold text-red-700 underline dark:text-red-400"
                            onClick={() => void deactivate(row.id)}
                          >
                            Deactivate
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
