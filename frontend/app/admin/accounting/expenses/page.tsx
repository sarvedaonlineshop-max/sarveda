"use client";

import { useState } from "react";
import {
  discoverAccountingExpenses,
  fetchAccountingReconciliationV5Expenses,
  fetchAccountingStatus,
  postAccountingExpense,
  previewAccountingExpense
} from "@/lib/accounting-api";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";

function formatPaise(p: number | undefined | null) {
  if (p == null) return "—";
  return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function AccountingExpensesPage() {
  const [expenseId, setExpenseId] = useState("");
  const [ackDup, setAckDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [flagOn, setFlagOn] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [recon, setRecon] = useState<Record<string, unknown> | null>(null);
  const [discoverRows, setDiscoverRows] = useState<Array<Record<string, unknown>>>([]);

  async function runPreview() {
    setBusy(true);
    setErr(null);
    try {
      const status = await fetchAccountingStatus();
      setFlagOn(Boolean(status.expensePostingEnabled));
      const data = await previewAccountingExpense({
        expenseId: expenseId.trim(),
        acknowledgePossibleDuplicate: ackDup
      });
      setPreview(data);
      const r = await fetchAccountingReconciliationV5Expenses({ expenseId: expenseId.trim() });
      setRecon(r.rows[0] ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPost() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const result = await postAccountingExpense({
        expenseId: expenseId.trim(),
        acknowledgePossibleDuplicate: ackDup
      });
      setMsg(
        result.duplicate
          ? `Already posted — ${result.journal.entryNumber}`
          : `Posted ${result.journal.entryNumber}`
      );
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
      const data = await discoverAccountingExpenses({
        expenseId: expenseId.trim() || undefined,
        dryRun: true,
        limit: 10
      });
      setDiscoverRows(data.rows);
      setMsg(`Dry-run scanned ${data.scanned}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Discover failed");
    } finally {
      setBusy(false);
    }
  }

  const snapshot = preview?.snapshot as Record<string, unknown> | undefined;
  const eligibility = preview?.eligibility as { eligible?: boolean; code?: string; reason?: string } | undefined;
  const proposal = preview?.proposal as
    | {
        lines?: Array<{ accountCode: string; debitInPaise: number; creditInPaise: number; lineMemo: string }>;
        diagnostics?: Record<string, unknown>;
      }
    | null
    | undefined;
  const duplicate = preview?.duplicate as { classification?: string } | undefined;

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Expense Recognition"
        subtitle="Post standalone operating expenses to the ledger with mapped accounts and GST where available."
      />

      <p className="text-sm text-neutral-600">
        Posting flag:{" "}
        <span className={flagOn ? "text-emerald-700" : "text-amber-700"}>
          {flagOn ? "ACCOUNTING_EXPENSE_POSTING_ENABLED on" : "OFF (default)"}
        </span>
      </p>

      {err ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      {msg ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}

      <section className="flex flex-wrap items-end gap-3 border border-neutral-200 p-4">
        <label className="text-sm">
          Expense ID
          <input
            className="mt-1 block w-80 border border-neutral-300 px-2 py-1.5 font-mono text-xs"
            value={expenseId}
            onChange={(e) => setExpenseId(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ackDup} onChange={(e) => setAckDup(e.target.checked)} />
          Acknowledge possible bill duplicate
        </label>
        <button
          type="button"
          disabled={busy || !expenseId.trim()}
          className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-white disabled:opacity-50"
          onClick={() => void runPreview()}
        >
          Preview
        </button>
        <button
          type="button"
          disabled={busy || !expenseId.trim() || !flagOn}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-white disabled:opacity-50"
          onClick={() => void runPost()}
        >
          POST
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-[#1e3a2f] px-3 py-1.5 text-[#1e3a2f] disabled:opacity-50"
          onClick={() => void runDiscover()}
        >
          Discover dry-run
        </button>
      </section>

      {preview ? (
        <section className="space-y-2 border border-neutral-200 p-4 text-sm">
          <h2 className="text-lg font-medium text-[#1e3a2f]">Preview</h2>
          <p>
            {String(snapshot?.expenseAccount)} · paidThrough {String(snapshot?.paidThrough ?? "—")} · mapped{" "}
            {String(snapshot?.mappedExpenseAccountCode ?? "UNMAPPED")} /{" "}
            {String(snapshot?.mappedPaymentAccountCode ?? "UNMAPPED")} · amount{" "}
            {formatPaise(Number(snapshot?.amountInPaise))} tax {formatPaise(Number(snapshot?.taxInPaise))}
          </p>
          <p>
            Eligibility: {eligibility?.eligible ? "yes" : "no"} ({eligibility?.code}){" "}
            {eligibility?.reason ? `— ${eligibility.reason}` : ""}
          </p>
          <p>Duplicate: {String(duplicate?.classification ?? "—")}</p>
          {proposal?.lines ? (
            <ul className="space-y-1 font-mono text-xs">
              {proposal.lines.map((l, i) => (
                <li key={i}>
                  {l.accountCode} Dr {l.debitInPaise} Cr {l.creditInPaise} — {l.lineMemo}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-amber-800">
              {String((preview.buildError as { message?: string } | undefined)?.message ?? "No proposal")}
            </p>
          )}
        </section>
      ) : null}

      {recon ? (
        <section className="border border-neutral-200 p-4 text-sm">
          <h2 className="mb-2 text-lg font-medium text-[#1e3a2f]">Recon V5 expense</h2>
          <pre className="overflow-x-auto text-xs">{JSON.stringify(recon, null, 2)}</pre>
        </section>
      ) : null}

      {discoverRows.length > 0 ? (
        <section className="border border-neutral-200 p-4 text-sm">
          <h2 className="mb-2 text-lg font-medium text-[#1e3a2f]">Discovery</h2>
          <pre className="overflow-x-auto text-xs">{JSON.stringify(discoverRows, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}
