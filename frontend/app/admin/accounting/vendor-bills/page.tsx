"use client";

import { useState } from "react";
import {
  discoverAccountingVendorBills,
  fetchAccountingReconciliationV4,
  formatInrPaise,
  postAccountingVendorBill,
  previewAccountingVendorBill
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
  const snapshot = preview?.snapshot as Record<string, unknown> | undefined;
  const eligibility = preview?.eligibility as
    | { eligible?: boolean; code?: string; warnings?: string[] }
    | undefined;
  const gst = proposal?.diagnostics?.gst as Record<string, unknown> | undefined;

  return (
    <AdvancedPageShell
      title="Bill Recognition"
      subtitle="Record supplier bills into accounts payable from purchase documents."
    >
      <AdvancedWarning>
        Posting creates permanent accounting entries when accounting posting is enabled. Preview
        first.
      </AdvancedWarning>

      <AdvancedSection title="Find bill">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[160px] flex-1 text-xs font-semibold text-[#6b5c52]">
            Bill number
            <input
              className={`${accountingInputClass()} mt-1`}
              placeholder="Supplier bill #"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
            />
          </label>
          <label className="min-w-[200px] flex-1 text-xs font-semibold text-[#6b5c52]">
            Internal reference
            <input
              className={`${accountingInputClass()} mt-1 font-mono text-xs`}
              placeholder="Optional system id"
              value={billId}
              onChange={(e) => setBillId(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runPreview()}
            className={accountingButtonClass("primary")}
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runPost()}
            className={accountingButtonClass("danger")}
          >
            Post to books
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runDiscover()}
            className={accountingButtonClass("secondary")}
          >
            Find candidates
          </button>
        </div>
      </AdvancedSection>

      {err ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
        </p>
      ) : null}

      {snapshot ? (
        <AdvancedSection title="Bill summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-[#8a7060]">Vendor</p>
              <p className="font-semibold text-[#2c2420]">{String(snapshot.vendorName ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Bill number</p>
              <p className="font-semibold text-[#2c2420]">{String(snapshot.billNumber ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Bill date</p>
              <p className="font-semibold text-[#2c2420]">{String(snapshot.billDate ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Amount</p>
              <p className="font-semibold tabular-nums text-[#1c352a]">
                {formatPaise(snapshot.totalInPaise as number)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Status</p>
              <p className="font-semibold text-[#2c2420]">{String(snapshot.status ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-[#8a7060]">Recognition</p>
              <p className="font-semibold text-[#2c2420]">
                {eligibility?.eligible ? "Ready to record" : humanizeEligibilityCode(eligibility?.code)}
              </p>
            </div>
          </div>
          <details className="mt-3 text-xs text-[#8a7060]">
            <summary className="cursor-pointer">More details</summary>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <div>Due: {String(snapshot.dueDate ?? "—")}</div>
              <div>PO: {String(snapshot.purchaseOrderNumber ?? "—")}</div>
              <div>Tax: {formatPaise(snapshot.taxInPaise as number)}</div>
              <div>GST: {String(gst?.jurisdiction ?? "—")}</div>
              {(eligibility?.warnings ?? []).length ? (
                <div className="sm:col-span-2 text-amber-800">
                  {(eligibility?.warnings ?? []).join(", ")}
                </div>
              ) : null}
            </div>
          </details>
        </AdvancedSection>
      ) : null}

      {proposal ? (
        <AdvancedSection title="Accounting entry preview">
          <p className="mb-2 text-xs text-[#6b5c52]">
            {proposal.balanced ? "Balanced entry" : "Out of balance"} · Debit{" "}
            {formatPaise(proposal.totalDebitPaise)} · Credit {formatPaise(proposal.totalCreditPaise)}
          </p>
          <div className="overflow-x-auto rounded-[12px] border border-[#ebe4db]">
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
                {(proposal.lines ?? []).map((l, i) => (
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
        </AdvancedSection>
      ) : null}

      {recon ? (
        <AdvancedSection title="Reconciliation note">
          <p className="text-sm text-[#2c2420]">
            {humanizeEligibilityCode(String(recon.status))}
            {recon.statusReason ? ` — ${String(recon.statusReason)}` : ""}
          </p>
          <p className="mt-1 text-xs text-[#8a7060]">
            Journal {String(recon.journalEntryNumber ?? "—")} · Outstanding{" "}
            {formatPaise(recon.outstandingNativeApInPaise as number)}
          </p>
        </AdvancedSection>
      ) : null}

      {discoverRows.length ? (
        <AdvancedSection title="Candidates (preview only)">
          <ul className="divide-y divide-[#eee8e0] text-sm">
            {discoverRows.map((r) => (
              <li key={String(r.billId)} className="flex flex-wrap justify-between gap-2 py-2">
                <div>
                  <div className="font-medium text-[#2c2420]">{String(r.billNumber ?? "—")}</div>
                  <div className="text-xs text-[#8a7060]">
                    {humanizeEligibilityCode(String(r.code))}
                    {r.posted ? " · Already recorded" : ""}
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
