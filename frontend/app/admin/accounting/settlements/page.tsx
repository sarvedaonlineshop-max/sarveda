"use client";

import { useEffect, useState } from "react";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import {
  discoverAccountingSettlements,
  fetchAccountingSettlement,
  fetchAccountingStatus,
  formatInrPaise,
  importAccountingSettlement,
  listAccountingSettlements,
  listBankAccounts,
  postAccountingSettlement,
  previewAccountingSettlement
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";

export default function AdminSettlementsShadowPage() {
  const [settlementId, setSettlementId] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [settlementPostingEnabled, setSettlementPostingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetBankAccountId, setTargetBankAccountId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; name: string; glAccountCode: string }>>([]);

  async function refreshList() {
    const data = await listAccountingSettlements(25);
    setRows(data.rows);
  }

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchAccountingStatus();
        setSettlementPostingEnabled(Boolean(s.settlementPostingEnabled));
        const banks = await listBankAccounts();
        setBankAccounts(banks.accounts.filter((b) => b.accountType === "BANK"));
        await refreshList();
      } catch {
        /* module may be disabled */
      }
    })();
  }, []);

  async function handlePreview() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await previewAccountingSettlement(
        settlementId.trim(),
        targetBankAccountId || null
      );
      setPreview(data);
      setDetail(await fetchAccountingSettlement(settlementId.trim()));
      setMessage("Settlement preview loaded (evidence imported if new).");
      await refreshList();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    setLoading(true);
    setError(null);
    try {
      await importAccountingSettlement(settlementId.trim());
      setMessage("Settlement evidence imported (Accounting* only).");
      setDetail(await fetchAccountingSettlement(settlementId.trim()));
      await refreshList();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handlePost() {
    setLoading(true);
    setError(null);
    try {
      const result = await postAccountingSettlement(
        settlementId.trim(),
        targetBankAccountId || null
      );
      setMessage(
        result.duplicate
          ? `Idempotent duplicate — ${result.journal.entryNumber}`
          : `Posted ${result.journal.entryNumber}`
      );
      setDetail(await fetchAccountingSettlement(settlementId.trim()));
      await refreshList();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscoverDry() {
    setLoading(true);
    setError(null);
    try {
      const data = await discoverAccountingSettlements({ dryRun: true, limit: 5 });
      setMessage(`Dry-run discovery scanned ${data.scanned}, imported ${data.imported}`);
      await refreshList();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const proposal = (preview?.proposal ?? null) as Record<string, unknown> | null;
  const diagnostics = (proposal?.diagnostics ?? null) as Record<string, unknown> | null;

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Gateway Settlements"
        subtitle="Import and review payment gateway settlements for clearing and fee posting."
      />

      <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
        <p className="text-sm text-neutral-600">
          Settlement posting enabled:{" "}
          <span className="font-medium">{settlementPostingEnabled ? "yes" : "no (flag off)"}</span>
        </p>
        <label className="block text-sm font-medium text-neutral-700">
          Razorpay settlement id (setl_…)
          <input
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            value={settlementId}
            onChange={(e) => setSettlementId(e.target.value)}
            placeholder="setl_…"
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Target bank account (optional — uses Razorpay target or legacy 1010)
          <select
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            value={targetBankAccountId}
            onChange={(e) => setTargetBankAccountId(e.target.value)}
          >
            <option value="">Default / configured target</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.glAccountCode})
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || !settlementId.trim()}
            onClick={() => void handlePreview()}
            className="rounded bg-[#1e3a2f] px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Preview / import evidence
          </button>
          <button
            type="button"
            disabled={loading || !settlementId.trim()}
            onClick={() => void handleImport()}
            className="rounded bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Import only
          </button>
          <button
            type="button"
            disabled={loading || !settlementId.trim() || !settlementPostingEnabled}
            onClick={() => void handlePost()}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Post journal
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleDiscoverDry()}
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Discover dry-run (≤5)
          </button>
        </div>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>

      {proposal ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-2 text-sm">
          <h2 className="font-semibold text-[#1e3a2f]">Journal preview</h2>
          <p>
            Balanced: {String(proposal.balanced)} · Debit {formatInrPaise(Number(proposal.totalDebitPaise ?? 0))} ·
            Credit {formatInrPaise(Number(proposal.totalCreditPaise ?? 0))}
          </p>
          {diagnostics ? (
            <p className="text-neutral-600">
              Fee {formatInrPaise(Number(diagnostics.feeInPaise ?? 0))} · Tax{" "}
              {formatInrPaise(Number(diagnostics.taxInPaise ?? 0))} · Net bank{" "}
              {formatInrPaise(Number(diagnostics.netBankPaise ?? 0))} · ITC{" "}
              {String(diagnostics.gstItcStatus ?? "")}
            </p>
          ) : null}
          <pre className="overflow-auto rounded bg-neutral-50 p-2 text-xs">
            {JSON.stringify(proposal.lines ?? [], null, 2)}
          </pre>
        </div>
      ) : null}

      {detail ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-2 text-sm">
          <h2 className="font-semibold text-[#1e3a2f]">Settlement detail</h2>
          <pre className="overflow-auto rounded bg-neutral-50 p-2 text-xs max-h-96">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 font-semibold text-[#1e3a2f]">Imported settlements</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-neutral-500">
                <th className="py-2 pr-3">Settlement</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">UTR</th>
                <th className="py-2 pr-3">Net</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Journal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-neutral-100">
                  <td className="py-2 pr-3 font-mono text-xs">{String(r.providerSettlementId)}</td>
                  <td className="py-2 pr-3">{String(r.settledAt ?? "").slice(0, 10)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{String(r.utr ?? "—")}</td>
                  <td className="py-2 pr-3">{formatInrPaise(Number(r.netInPaise ?? 0))}</td>
                  <td className="py-2 pr-3">{String(r.status)}</td>
                  <td className="py-2 pr-3">{String(r.journalEntryNumber ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
