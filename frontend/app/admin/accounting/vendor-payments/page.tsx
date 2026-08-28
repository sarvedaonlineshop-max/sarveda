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
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import { accountingButtonClass } from "@/components/admin/accounting/accounting-ui";
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
        title="Vendor Payments"
        subtitle="Record payments made against supplier bills."
      />

      {flagOn ? null : (
        <p className="text-xs text-[#8a7060]">
          You can save payment drafts now. Recording to the ledger will be available when posting is
          enabled.
        </p>
      )}

      {err ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      {msg ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}

      <section className="space-y-4 rounded-[12px] border border-[#e8e2d9] bg-white p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-semibold text-[#1c352a]">Record Vendor Payment</h2>
          <p className="mt-0.5 text-xs text-[#8a7060]">
            Recording a vendor payment updates the supplier balance and accounting records.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-[#6b5c52]">
            Vendor
            <select
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
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
          <label className="text-xs font-semibold text-[#6b5c52]">
            Payment Date
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-[#6b5c52]">
            Payment Method
            <select
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as VendorPaymentMethod)}
            >
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="UPI">UPI</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[#6b5c52]">
            Paid From
            <select
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">Default payment account</option>
              {bankAccounts
                .filter((b) =>
                  method === "CASH" ? b.accountType !== "BANK" : b.accountType === "BANK"
                )
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-[#6b5c52]">
            Reference / UTR {method === "CASH" ? "(optional)" : ""}
            <input
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="UTR / cheque number"
            />
          </label>
          <label className="text-xs font-semibold text-[#6b5c52]">
            Notes
            <input
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-[#1c352a]">Bills to Pay</h3>
          <div className="overflow-x-auto rounded-[10px] border border-[#e8e2d9]">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#e8e2d9] bg-[#faf5ec]/60 text-[11px] uppercase tracking-wide text-[#8a7060]">
                  <th className="px-3 py-2.5">Bill #</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Bill Amount</th>
                  <th className="px-3 py-2.5 text-right">Amount Due</th>
                  <th className="px-3 py-2.5 text-right">Payment Amount</th>
                </tr>
              </thead>
              <tbody>
                {openBills.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-[#8a7060]">
                      Select a vendor to see bills with an outstanding balance.
                    </td>
                  </tr>
                ) : (
                  openBills.map((b) => (
                    <tr key={b.id} className="border-b border-[#f0ece6] last:border-0">
                      <td className="px-3 py-2.5 font-semibold text-[#1c352a]">{b.billNumber}</td>
                      <td className="px-3 py-2.5 text-[#4a3f38]">{b.status}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatPaise(b.totalInPaise)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                        {formatPaise(b.nativeOutstandingInPaise)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          max={b.nativeOutstandingInPaise / 100}
                          className="ml-auto w-32 rounded-lg border border-[#e0d8ce] px-2 py-1.5 text-right"
                          value={((alloc[b.id] ?? 0) / 100).toFixed(2)}
                          onChange={(e) =>
                            setAlloc((prev) => ({
                              ...prev,
                              [b.id]: Math.max(
                                0,
                                Math.min(
                                  b.nativeOutstandingInPaise,
                                  Math.round(parseFloat(e.target.value || "0") * 100)
                                )
                              )
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="ml-2 text-xs font-semibold text-[#1c352a] underline"
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8e2d9] pt-3">
          <p className="text-sm text-[#2c2420]">
            Total Payment{" "}
            <strong className="text-lg tabular-nums text-[#1c352a]">{formatPaise(allocatedTotal)}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !vendorId || allocatedTotal <= 0}
              className={accountingButtonClass("secondary")}
              onClick={() => void saveDraft()}
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={busy || !selectedPaymentId}
              className={accountingButtonClass("secondary")}
              onClick={() => selectedPaymentId && void runPreview(selectedPaymentId)}
            >
              Preview Entry
            </button>
            <button
              type="button"
              disabled={busy || !selectedPaymentId || !flagOn}
              className={accountingButtonClass("primary")}
              onClick={() => void runPost()}
            >
              Record Payment
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-[12px] border border-[#e8e2d9] bg-white p-4">
        <h2 className="text-lg font-medium text-[#1c352a]">Recent Payments</h2>
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
          <h2 className="text-lg font-medium text-[#1e3a2f]">Entry preview</h2>
          <p>
            {String(snapshot?.paymentNumber)} · {String(snapshot?.status)} ·{" "}
            {String(snapshot?.paymentMethod)}
            {snapshot?.paidAccountCode ? ` · ${String(snapshot.paidAccountCode)}` : ""} ·{" "}
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
