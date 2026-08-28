"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchPurchasesVendors,
  formatInrPaise,
  patchPurchasesVendor,
  postPurchasesVendor,
  type VendorRow
} from "@/lib/purchases-api";

function VendorForm({
  initial,
  onSave,
  onCancel,
  busy
}: {
  initial?: VendorRow | null;
  onSave: (draft: Partial<VendorRow> & { name: string }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [gstin, setGstin] = useState(initial?.gstin ?? "");
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? "Due on Receipt");
  const [billingCity, setBillingCity] = useState(initial?.billingCity ?? "");
  const [billingState, setBillingState] = useState(initial?.billingState ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
      <h3 className="mb-3 text-sm font-semibold">{initial ? "Edit vendor" : "New vendor"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-stone-600">
          Name *
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-stone-600">
          GSTIN
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Email
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Phone
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Payment terms
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-stone-600">
          City
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={billingCity} onChange={(e) => setBillingCity(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-stone-600 sm:col-span-2">
          State
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={billingState} onChange={(e) => setBillingState(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-stone-600 sm:col-span-2">
          Notes
          <textarea className="mt-1 w-full rounded border px-2 py-1.5 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            void onSave({
              name: name.trim(),
              email: email.trim() || null,
              phone: phone.trim() || null,
              gstin: gstin.trim() || null,
              paymentTerms: paymentTerms.trim() || null,
              billingCity: billingCity.trim() || null,
              billingState: billingState.trim() || null,
              notes: notes.trim() || null
            })
          }
          className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border px-3 py-1.5 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PurchasesVendorsPage() {
  const [items, setItems] = useState<VendorRow[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchPurchasesVendors({ q: q.trim() || undefined });
      setItems(data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load vendors");
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function handleSave(draft: Partial<VendorRow> & { name: string }) {
    setBusy(true);
    setErr(null);
    try {
      if (editing) await patchPurchasesVendor(editing.id, draft);
      else await postPurchasesVendor(draft);
      setEditing(null);
      setCreating(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          className="w-full max-w-sm rounded-md border px-3 py-2 text-sm"
          placeholder="Search vendors…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
          className="rounded-md bg-[#b98a3e] px-3 py-2 text-sm font-semibold text-white"
        >
          + New vendor
        </button>
      </div>

      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}

      {creating || editing ? (
        <VendorForm initial={editing} onSave={handleSave} onCancel={() => { setCreating(false); setEditing(null); }} busy={busy} />
      ) : null}

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-stone-50 dark:bg-stone-800">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">GSTIN</th>
              <th className="px-4 py-2 text-left font-medium">Contact</th>
              <th className="px-4 py-2 text-left font-medium">Terms</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} className="border-b border-stone-100 dark:border-stone-800">
                <td className="px-4 py-2 font-medium">{v.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{v.gstin ?? "—"}</td>
                <td className="px-4 py-2 text-stone-600">{v.email ?? v.phone ?? "—"}</td>
                <td className="px-4 py-2">{v.paymentTerms ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button type="button" className="text-xs font-semibold text-[#1e3a2f]" onClick={() => { setEditing(v); setCreating(false); }}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                  No vendors yet — add your first supplier.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">{items.length} vendor{items.length === 1 ? "" : "s"} · amounts use {formatInrPaise(0).slice(0, 1)} INR</p>
    </div>
  );
}
