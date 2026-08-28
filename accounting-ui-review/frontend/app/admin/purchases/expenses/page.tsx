"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchExpenses, formatInrPaise, postExpense, type ExpenseRow } from "@/lib/purchases-api";
import { fetchPurchasesVendors, type VendorRow } from "@/lib/purchases-api";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN");
  } catch {
    return iso;
  }
}

export default function ExpensesPage() {
  const [items, setItems] = useState<ExpenseRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidThrough, setPaidThrough] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchExpenses({ q: q.trim() || undefined });
      setItems(data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [q]);

  useEffect(() => {
    void fetchPurchasesVendors({ activeOnly: true }).then((d) => setVendors(d.items));
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function saveExpense() {
    const amountInPaise = Math.round(parseFloat(amount || "0") * 100);
    if (!account.trim() || amountInPaise <= 0) {
      setErr("Account and amount required");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await postExpense({
        expenseAccount: account.trim(),
        vendorId: vendorId || null,
        amountInPaise,
        paidThrough: paidThrough.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        expenseType: "SERVICES"
      });
      setShowForm(false);
      setAccount("");
      setAmount("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className="rounded-md border px-3 py-2 text-sm" placeholder="Search expenses…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={() => setShowForm(true)} className="ml-auto rounded-md bg-[#1e3a2f] px-3 py-2 text-sm font-semibold text-white">
          + Record expense
        </button>
      </div>

      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}

      {showForm ? (
        <div className="rounded-lg border bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <h3 className="mb-3 text-sm font-semibold">Record expense</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">Expense account *
              <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. Bank Fees" />
            </label>
            <label className="text-xs font-medium">Amount (₹) *
              <input type="number" min={0} step={0.01} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="text-xs font-medium">Paid through
              <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={paidThrough} onChange={(e) => setPaidThrough(e.target.value)} placeholder="ICICI Bank" />
            </label>
            <label className="text-xs font-medium">Vendor
              <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Optional</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium sm:col-span-2">Invoice#
              <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void saveExpense()} className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-sm font-semibold text-white">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-white dark:border-stone-700 dark:bg-stone-900">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-stone-50 dark:bg-stone-800">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Account</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Paid through</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="px-4 py-2">{fmtDate(e.expenseDate)}</td>
                <td className="px-4 py-2 font-medium">{e.expenseAccount}</td>
                <td className="px-4 py-2">{e.vendor?.name ?? "—"}</td>
                <td className="px-4 py-2">{e.paidThrough ?? "—"}</td>
                <td className="px-4 py-2 text-right font-mono">{formatInrPaise(e.amountInPaise)}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-500">No expenses recorded.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        Recurring expenses, vendor credits & payments made — phase 2. Bills sync to Zoho — phase 2.
      </p>
    </div>
  );
}
