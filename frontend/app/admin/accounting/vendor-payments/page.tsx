"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAccountingVendorPayment,
  deleteAccountingVendorPayment,
  fetchAccountingStatus,
  fetchVendorPaymentOpenBills,
  listAccountingVendorPayments,
  listBankAccounts,
  postAccountingVendorPayment,
  previewAccountingVendorPayment,
  type VendorPaymentMethod
} from "@/lib/accounting-api";
import { AdminAccountingHeader, AdminAccountingNav } from "@/components/admin/accounting/AdminAccountingNav";
import { fetchPurchasesVendors } from "@/lib/purchases-api";

function formatPaise(p: number | undefined | null) {
  if (p == null) return "—";
  return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

type OpenBill = {
  id: string;
  billNumber: string;
  totalInPaise: number;
  paidInPaise: number;
  status: string;
  nativeOutstandingInPaise: number;
};

export default function VendorPaymentsAccountingPage() {
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [vendorId, setVendorId] = useState("");
  const [openBills, setOpenBills] = useState<OpenBill[]>([]);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<VendorPaymentMethod>("BANK_TRANSFER");
  const [utr, setUtr] = useState("");
  const [notes, setNotes] = useState("");
  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [flagOn, setFlagOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; name: string; glAccountCode: string; accountType: string }>>([]);

  const allocatedTotal = useMemo(
    () => Object.values(alloc).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0),
    [alloc]
  );

  const refreshPayments = useCallback(async () => {
    const data = await listAccountingVendorPayments({
      vendorId: vendorId || undefined,
      limit: 40
    });
    setPayments(data.payments);
  }, [vendorId]);

  useEffect(() => {
    void (async () => {
      try {
        const status = await fetchAccountingStatus();
        setFlagOn(Boolean(status.vendorPaymentPostingEnabled));
        const v = await fetchPurchasesVendors({ activeOnly: true, page: 1 });
        setVendors(v.items.map((x) => ({ id: x.id, name: x.name })));
        const banks = await listBankAccounts();
        setBankAccounts(banks.accounts);
      } catch {
        /* ignore initial */
      }
    })();
  }, []);

  async function loadOpenBills(id: string) {
    setBusy(true);
    setErr(null);
    try {
      const data = await fetchVendorPaymentOpenBills(id);
      setOpenBills(data.bills);
      const next: Record<string, number> = {};
      for (const b of data.bills) next[b.id] = 0;
      setAlloc(next);
      await refreshPayments();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load bills");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const allocations = Object.entries(alloc)
        .filter(([, amt]) => amt > 0)
        .map(([vendorBillId, amountInPaise]) => ({ vendorBillId, amountInPaise }));
      const created = await createAccountingVendorPayment({
        vendorId,
        paymentDate,
        amountInPaise: allocatedTotal,
        paymentMethod: method,
        utr: method === "CASH" ? utr || null : utr,
        bankAccountId: bankAccountId || null,
        notes: notes || null,
        allocations
      });
      const id = String(created.payment.id);
      setSelectedPaymentId(id);
      setMsg(`Draft saved ${String(created.payment.paymentNumber)}`);
      const p = await previewAccountingVendorPayment(id);
      setPreview(p);
      await refreshPayments();
      await loadOpenBills(vendorId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview(paymentId: string) {
    setBusy(true);
    setErr(null);
    try {
      setSelectedPaymentId(paymentId);
      const p = await previewAccountingVendorPayment(paymentId);
      setPreview(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPost() {
    if (!selectedPaymentId) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const result = await postAccountingVendorPayment(selectedPaymentId);
      setMsg(
        result.duplicate
          ? `Already posted — ${result.journal.entryNumber}`
          : `Posted ${result.journal.entryNumber}`
      );
      await runPreview(selectedPaymentId);
      await refreshPayments();
      if (vendorId) await loadOpenBills(vendorId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Post failed");
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(paymentId: string) {
    setBusy(true);
    setErr(null);
    try {
      await deleteAccountingVendorPayment(paymentId);
      setMsg("Draft deleted");
      if (selectedPaymentId === paymentId) {
        setSelectedPaymentId(null);
        setPreview(null);
      }
      await refreshPayments();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const proposal = preview?.proposal as
    | {
        balanced?: boolean;
        lines?: Array<{ accountCode: string; debitInPaise: number; creditInPaise: number; lineMemo: string }>;
      }
    | null
    | undefined;
  const snapshot = preview?.snapshot as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Vendor Payments / AP Settlement"
        subtitle="VENDOR_PAYMENT_MADE_V1 — Dr 2000 AP, Cr 1010 Bank / 1000 Cash. Mark paid alone never creates this journal. Zoho remains authoritative."
      />
      <AdminAccountingNav />

      <p className="text-sm text-neutral-600">
        Posting flag:{" "}
        <span className={flagOn ? "text-emerald-700" : "text-amber-700"}>
          {flagOn ? "ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED on" : "OFF (default)"}
        </span>
        . Ops Mark paid on purchases bills remains available and is not an accounting authority.
      </p>

      {err ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      {msg ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}

      <section className="space-y-3 border border-neutral-200 p-4">
        <h2 className="text-lg font-medium text-[#1e3a2f]">New Vendor Payment</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            Vendor
            <select
              className="mt-1 w-full border border-neutral-300 px-2 py-1.5"
              value={vendorId}
              onChange={(e) => {
                const id = e.target.value;
                setVendorId(id);
                if (id) void loadOpenBills(id);
                else setOpenBills([]);
              }}
            >
              <option value="">Select vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Payment date
            <input
              type="date"
              className="mt-1 w-full border border-neutral-300 px-2 py-1.5"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Method
            <select
              className="mt-1 w-full border border-neutral-300 px-2 py-1.5"
              value={method}
              onChange={(e) => setMethod(e.target.value as VendorPaymentMethod)}
            >
              <option value="BANK_TRANSFER">Bank transfer → 1010</option>
              <option value="UPI">UPI → 1010</option>
              <option value="CHEQUE">Cheque → 1010</option>
              <option value="CASH">Cash → 1000</option>
            </select>
          </label>
          <label className="text-sm">
            Bank / cash account (optional — legacy 1010/1000 if empty)
            <select
              className="mt-1 w-full border border-neutral-300 px-2 py-1.5"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">Legacy default</option>
              {bankAccounts
                .filter((b) =>
                  method === "CASH" ? b.accountType !== "BANK" : b.accountType === "BANK"
                )
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.glAccountCode})
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            UTR / reference {method === "CASH" ? "(optional)" : "(required)"}
            <input
              className="mt-1 w-full border border-neutral-300 px-2 py-1.5"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="UTR / cheque no"
            />
          </label>
        </div>
        <label className="block text-sm">
          Notes
          <input
            className="mt-1 w-full border border-neutral-300 px-2 py-1.5"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-600">
                <th className="py-2 pr-3">Bill</th>
                <th className="py-2 pr-3">Ops status</th>
                <th className="py-2 pr-3">Bill total</th>
                <th className="py-2 pr-3">Native outstanding</th>
                <th className="py-2 pr-3">Allocate (paise)</th>
              </tr>
            </thead>
            <tbody>
              {openBills.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 text-neutral-500">
                    Select a vendor with POSTED AP bills that still have native outstanding.
                  </td>
                </tr>
              ) : (
                openBills.map((b) => (
                  <tr key={b.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 font-medium">{b.billNumber}</td>
                    <td className="py-2 pr-3">
                      {b.status} / ops paid {formatPaise(b.paidInPaise)}
                    </td>
                    <td className="py-2 pr-3">{formatPaise(b.totalInPaise)}</td>
                    <td className="py-2 pr-3">{formatPaise(b.nativeOutstandingInPaise)}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        max={b.nativeOutstandingInPaise}
                        className="w-36 border border-neutral-300 px-2 py-1"
                        value={alloc[b.id] ?? 0}
                        onChange={(e) =>
                          setAlloc((prev) => ({
                            ...prev,
                            [b.id]: Math.max(0, Math.floor(Number(e.target.value) || 0))
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="ml-2 text-xs text-[#1e3a2f] underline"
                        onClick={() =>
                          setAlloc((prev) => ({
                            ...prev,
                            [b.id]: b.nativeOutstandingInPaise
                          }))
                        }
                      >
                        Full
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            Amount / allocated: <strong>{formatPaise(allocatedTotal)}</strong>
          </span>
          <button
            type="button"
            disabled={busy || !vendorId || allocatedTotal <= 0}
            className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-white disabled:opacity-50"
            onClick={() => void saveDraft()}
          >
            Save DRAFT
          </button>
          <button
            type="button"
            disabled={busy || !selectedPaymentId}
            className="rounded-md border border-[#1e3a2f] px-3 py-1.5 text-[#1e3a2f] disabled:opacity-50"
            onClick={() => selectedPaymentId && void runPreview(selectedPaymentId)}
          >
            Preview journal
          </button>
          <button
            type="button"
            disabled={busy || !selectedPaymentId || !flagOn}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-white disabled:opacity-50"
            onClick={() => void runPost()}
          >
            POST
          </button>
        </div>
      </section>

      <section className="space-y-3 border border-neutral-200 p-4">
        <h2 className="text-lg font-medium text-[#1e3a2f]">Payments</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-600">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">UTR</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Journal</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={String(p.id)} className="border-b border-neutral-100">
                  <td className="py-2 pr-3 font-medium">{String(p.paymentNumber)}</td>
                  <td className="py-2 pr-3">
                    {String((p.vendor as { name?: string } | undefined)?.name ?? p.vendorId)}
                  </td>
                  <td className="py-2 pr-3">{String(p.paymentDate)}</td>
                  <td className="py-2 pr-3">{String(p.paymentMethod)}</td>
                  <td className="py-2 pr-3">{String(p.paidAccountCode)}</td>
                  <td className="py-2 pr-3">{String(p.utr ?? "—")}</td>
                  <td className="py-2 pr-3">{formatPaise(Number(p.amountInPaise))}</td>
                  <td className="py-2 pr-3">{String(p.status)}</td>
                  <td className="py-2 pr-3">
                    {String(
                      (p.journalEntry as { entryNumber?: string } | null | undefined)?.entryNumber ??
                        "—"
                    )}
                  </td>
                  <td className="space-x-2 py-2 pr-3">
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() => void runPreview(String(p.id))}
                    >
                      Open
                    </button>
                    {p.status === "DRAFT" ? (
                      <button
                        type="button"
                        className="text-xs text-red-700 underline"
                        onClick={() => void runDelete(String(p.id))}
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview ? (
        <section className="space-y-2 border border-neutral-200 p-4 text-sm">
          <h2 className="text-lg font-medium text-[#1e3a2f]">Journal preview</h2>
          <p>
            {String(snapshot?.paymentNumber)} · {String(snapshot?.status)} ·{" "}
            {String(snapshot?.paymentMethod)} → {String(snapshot?.paidAccountCode)} ·{" "}
            {formatPaise(Number(snapshot?.amountInPaise))}
          </p>
          {proposal?.lines ? (
            <ul className="space-y-1 font-mono text-xs">
              {proposal.lines.map((l, i) => (
                <li key={i}>
                  {l.accountCode} Dr {l.debitInPaise} Cr {l.creditInPaise} — {l.lineMemo}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-amber-800">{String((preview.buildError as { message?: string })?.message ?? "No proposal")}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
