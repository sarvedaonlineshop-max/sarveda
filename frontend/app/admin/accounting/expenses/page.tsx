"use client";

import { useState } from "react";
import {
  discoverAccountingExpenses,
  fetchAccountingReconciliationV5Expenses,
  fetchAccountingStatus,
  formatInrPaise,
  postAccountingExpense,
  previewAccountingExpense
} from "@/lib/accounting-api";
import {
  AdvancedPageShell,
  AdvancedSection,
  AdvancedWarning
} from "@/components/admin/accounting/advanced/advanced-ui";
import {
  AccountingStatusBadge,
  accountingButtonClass,
  accountingInputClass
} from "@/components/admin/accounting/accounting-ui";
import {
  expenseCoaLabel,
  humanizeEligibilityCode
} from "@/components/admin/accounting/presentation";

function formatPaise(p: number | undefined | null) {
  if (p == null) return "—";
  return formatInrPaise(p);
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
          ? `Already recorded — ${result.journal.entryNumber}`
          : `Recorded ${result.journal.entryNumber}`
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
      setMsg(`Found ${data.scanned} candidate(s) (preview only)`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Discover failed");
    } finally {
      setBusy(false);
    }
  }

  const snapshot = preview?.snapshot as Record<string, unknown> | undefined;
  const eligibility = preview?.eligibility as
    | { eligible?: boolean; code?: string; reason?: string }
    | undefined;
  const proposal = preview?.proposal as
    | {
        lines?: Array<{
          accountCode: string;
          debitInPaise: number;
          creditInPaise: number;
          lineMemo: string;
        }>;
        diagnostics?: Record<string, unknown>;
      }
    | null
    | undefined;
  const duplicate = preview?.duplicate as { classification?: string } | undefined;

  return (
    <AdvancedPageShell
      title="Expense Recognition"
      subtitle="Record standalone operating expenses to the ledger with mapped accounts."
    >
      <AdvancedWarning>
        Expense posting must be enabled by operations before entries can be recorded. Preview before
        posting.
      </AdvancedWarning>

      <p className="text-sm text-[#6b5c52]">
        Expense posting:{" "}
        <span className={flagOn ? "font-semibold text-emerald-800" : "font-semibold text-amber-800"}>
          {flagOn ? "Enabled" : "Disabled"}
        </span>
      </p>

      {err ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}

      <AdvancedSection title="Find expense">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-xs font-semibold text-[#6b5c52]">
            Expense reference
            <input
              className={`${accountingInputClass()} mt-1 font-mono text-xs`}
              placeholder="Expense id"
              value={expenseId}
              onChange={(e) => setExpenseId(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-[#2c2420]">
            <input type="checkbox" checked={ackDup} onChange={(e) => setAckDup(e.target.checked)} />
            Acknowledge possible bill duplicate
          </label>
          <button
            type="button"
            disabled={busy || !expenseId.trim()}
            className={accountingButtonClass("primary")}
            onClick={() => void runPreview()}
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy || !expenseId.trim() || !flagOn}
            className={accountingButtonClass("danger")}
            onClick={() => void runPost()}
          >
            Post to books
          </button>
          <button
            type="button"
            disabled={busy}
            className={accountingButtonClass("secondary")}
            onClick={() => void runDiscover()}
          >
            Find candidates
          </button>
        </div>
      </AdvancedSection>

      {preview ? (
        <AdvancedSection title="Expense summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-[#8a7060]">Category</p>
              <p className="font-semibold">{String(snapshot?.expenseAccount ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Paid through</p>
              <p className="font-semibold">{String(snapshot?.paidThrough ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Amount</p>
              <p className="font-semibold tabular-nums text-[#1c352a]">
                {formatPaise(Number(snapshot?.amountInPaise))}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Tax</p>
              <p className="font-semibold tabular-nums">
                {formatPaise(Number(snapshot?.taxInPaise))}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Mapped expense account</p>
              <p className="font-semibold">
                {expenseCoaLabel(String(snapshot?.mappedExpenseAccountCode ?? ""))}
              </p>
              <p className="font-mono text-[11px] text-[#8a7060]">
                {String(snapshot?.mappedExpenseAccountCode ?? "Not mapped")}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Recognition</p>
              <p className="font-semibold">
                {eligibility?.eligible
                  ? "Ready to record"
                  : humanizeEligibilityCode(eligibility?.code)}
              </p>
              {eligibility?.reason ? (
                <p className="text-xs text-[#8a7060]">{eligibility.reason}</p>
              ) : null}
            </div>
          </div>
          {duplicate?.classification ? (
            <p className="mt-2 text-xs text-amber-800">
              Duplicate note: {humanizeEligibilityCode(duplicate.classification)}
            </p>
          ) : null}

          {proposal?.lines ? (
            <div className="mt-4 overflow-x-auto rounded-[12px] border border-[#ebe4db]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#faf5ec] text-left text-[11px] uppercase tracking-wide text-[#8a7060]">
                  <tr>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2">Memo</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.lines.map((l, i) => (
                    <tr key={i} className="border-t border-[#eee8e0]">
                      <td className="px-3 py-2">
                        <div className="font-medium">{expenseCoaLabel(l.accountCode)}</div>
                        <div className="font-mono text-[11px] text-[#8a7060]">{l.accountCode}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatPaise(l.debitInPaise)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatPaise(l.creditInPaise)}
                      </td>
                      <td className="px-3 py-2 text-[#6b5c52]">{l.lineMemo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-800">
              {String(
                (preview.buildError as { message?: string } | undefined)?.message ??
                  "No accounting entry available for this expense."
              )}
            </p>
          )}
        </AdvancedSection>
      ) : null}

      {recon ? (
        <AdvancedSection title="Reconciliation note">
          <p className="text-sm">
            {humanizeEligibilityCode(String(recon.status ?? recon.primaryStatus ?? ""))}
          </p>
          <details className="mt-2 text-xs text-[#8a7060]">
            <summary className="cursor-pointer">Technical details</summary>
            <div className="mt-1 space-y-1 font-mono">
              {Object.entries(recon)
                .slice(0, 12)
                .map(([k, v]) => (
                  <div key={k}>
                    {k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </div>
                ))}
            </div>
          </details>
        </AdvancedSection>
      ) : null}

      {discoverRows.length > 0 ? (
        <AdvancedSection title="Candidates (preview only)">
          <ul className="divide-y divide-[#eee8e0] text-sm">
            {discoverRows.map((r, i) => (
              <li key={String(r.expenseId ?? i)} className="flex flex-wrap justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{String(r.expenseAccount ?? r.expenseId ?? "—")}</div>
                  <div className="text-xs text-[#8a7060]">
                    {humanizeEligibilityCode(String(r.code ?? r.status ?? ""))}
                  </div>
                </div>
                <AccountingStatusBadge tone={r.eligible ? "success" : "warning"}>
                  {r.eligible ? "Ready" : "Review"}
                </AccountingStatusBadge>
              </li>
            ))}
          </ul>
        </AdvancedSection>
      ) : null}
    </AdvancedPageShell>
  );
}
