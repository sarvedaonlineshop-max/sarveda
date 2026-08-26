"use client";

import { useState } from "react";
import {
  discoverAccountingVendorBills,
  fetchAccountingReconciliationV4,
  postAccountingVendorBill,
  previewAccountingVendorBill
} from "@/lib/accounting-api";
import { AdminAccountingHeader, AdminAccountingNav } from "@/components/admin/accounting/AdminAccountingNav";

function formatPaise(p: number | undefined | null) {
  if (p == null) return "—";
  return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function VendorBillsAccountingPage() {
  const [billId, setBillId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [recon, setRecon] = useState<Record<string, unknown> | null>(null);
  const [discoverRows, setDiscoverRows] = useState<Array<Record<string, unknown>>>([]);

  async function runPreview() {
    setBusy(true);
    setErr(null);
    try {
      const data = await previewAccountingVendorBill({
        billId: billId.trim() || undefined,
        billNumber: billNumber.trim() || undefined
      });
      setPreview(data);
      const id = (data.snapshot as { billId?: string } | undefined)?.billId;
      if (id) {
        const r = await fetchAccountingReconciliationV4({ billId: id });
        setRecon(r.rows[0] ?? null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPost() {
    setBusy(true);
    setErr(null);
    try {
      await postAccountingVendorBill({
        billId: billId.trim() || undefined,
        billNumber: billNumber.trim() || undefined
      });
      await runPreview();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Post failed");
      setBusy(false);
    }
  }

  async function runDiscover() {
    setBusy(true);
    setErr(null);
    try {
      const data = await discoverAccountingVendorBills({
        billId: billId.trim() || undefined,
        billNumber: billNumber.trim() || undefined,
        dryRun: true,
        limit: 25
      });
      setDiscoverRows(data.rows as Array<Record<string, unknown>>);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Discover failed");
    } finally {
      setBusy(false);
    }
  }

  const proposal = preview?.proposal as
    | {
        balanced?: boolean;
        totalDebitPaise?: number;
        totalCreditPaise?: number;
        lines?: Array<{ accountCode: string; debitInPaise: number; creditInPaise: number; lineMemo: string }>;
        diagnostics?: Record<string, unknown>;
      }
    | null
    | undefined;
  const snapshot = preview?.snapshot as Record<string, unknown> | undefined;
  const eligibility = preview?.eligibility as { eligible?: boolean; code?: string; warnings?: string[] } | undefined;
  const gst = proposal?.diagnostics?.gst as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Vendor Bill / AP Shadow"
        subtitle="VENDOR_BILL_POSTED_V1 — Dr 1210 clearing / 5300 expense + provisional Input GST, Cr 2000 AP. Zoho remains authoritative."
      />
      <AdminAccountingNav />

      <div className="flex flex-wrap gap-2">
        <input
          className="rounded-md border px-3 py-2 text-sm"
          placeholder="Bill UUID"
          value={billId}
          onChange={(e) => setBillId(e.target.value)}
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          placeholder="Bill number"
          value={billNumber}
          onChange={(e) => setBillNumber(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void runPreview()}
          className="rounded-md bg-[#1e3a2f] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runPost()}
          className="rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Post shadow
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runDiscover()}
          className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Dry-run discover
        </button>
      </div>

      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}

      {snapshot ? (
        <div className="grid gap-3 rounded-lg border bg-white p-4 text-sm sm:grid-cols-2 dark:border-stone-700 dark:bg-stone-900">
          <div>
            <p className="text-xs text-stone-500">Vendor</p>
            <p className="font-semibold">{String(snapshot.vendorName ?? "")}</p>
            <p className="font-mono text-xs">{String(snapshot.vendorGstin ?? "—")}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Bill / Supplier ref</p>
            <p className="font-mono font-semibold">{String(snapshot.billNumber ?? "")}</p>
            <p>{String(snapshot.referenceNumber ?? "—")}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Dates</p>
            <p>Bill: {String(snapshot.billDate ?? "—")}</p>
            <p>Due: {String(snapshot.dueDate ?? "—")}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">PO / Status</p>
            <p>{String(snapshot.purchaseOrderNumber ?? "—")}</p>
            <p>{String(snapshot.status ?? "")}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Totals</p>
            <p>Subtotal {formatPaise(snapshot.subtotalInPaise as number)}</p>
            <p>Discount {formatPaise(snapshot.discountInPaise as number)}</p>
            <p>Adjustment {formatPaise(snapshot.adjustmentInPaise as number)}</p>
            <p>Tax {formatPaise(snapshot.taxInPaise as number)}</p>
            <p className="font-semibold">Total {formatPaise(snapshot.totalInPaise as number)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Eligibility / ITC</p>
            <p>
              {eligibility?.eligible ? "Eligible" : "Not eligible"} ({eligibility?.code})
            </p>
            <p>ITC: {String(gst?.itcStatus ?? "—")}</p>
            <p>GST: {String(gst?.jurisdiction ?? "—")}</p>
            {(eligibility?.warnings ?? []).length ? (
              <p className="text-amber-700">{(eligibility?.warnings ?? []).join(", ")}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {proposal ? (
        <div className="overflow-hidden rounded-lg border bg-white dark:border-stone-700 dark:bg-stone-900">
          <div className="border-b px-4 py-2 text-sm">
            Journal preview — balanced={String(proposal.balanced)} · Dr{" "}
            {formatPaise(proposal.totalDebitPaise)} / Cr {formatPaise(proposal.totalCreditPaise)}
            <span className="ml-2 text-xs text-stone-500">
              Stock clearing {formatPaise(proposal.diagnostics?.stockClearingInPaise as number)} · Expense{" "}
              {formatPaise(proposal.diagnostics?.expenseInPaise as number)}
            </span>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 dark:bg-stone-800">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-left">Memo</th>
              </tr>
            </thead>
            <tbody>
              {(proposal.lines ?? []).map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 font-mono">{l.accountCode}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPaise(l.debitInPaise)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPaise(l.creditInPaise)}</td>
                  <td className="px-3 py-2">{l.lineMemo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {recon ? (
        <div className="rounded-lg border bg-white p-4 text-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="font-semibold">Reconciliation V4</p>
          <p>
            Status: <span className="font-mono">{String(recon.status)}</span> — {String(recon.statusReason)}
          </p>
          <p>Journal: {String(recon.journalEntryNumber ?? "—")}</p>
          <p>Native AP outstanding: {formatPaise(recon.outstandingNativeApInPaise as number)}</p>
          <p>Ops paid (info only): {formatPaise(recon.opsPaidInPaise as number)}</p>
        </div>
      ) : null}

      {discoverRows.length ? (
        <div className="overflow-hidden rounded-lg border bg-white text-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="border-b px-4 py-2 font-semibold">Discovery dry-run</div>
          <ul className="divide-y">
            {discoverRows.map((r) => (
              <li key={String(r.billId)} className="px-4 py-2 font-mono text-xs">
                {String(r.billNumber)} · {String(r.code)} · eligible={String(r.eligible)} · posted=
                {String(r.posted)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
