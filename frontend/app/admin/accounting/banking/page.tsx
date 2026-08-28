"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  categorizeBankCharge,
  categorizeBankInterest,
  commitBankStatementImport,
  confirmBankStatementMatch,
  createBankAccount,
  createBankReconciliation,
  createBankTransfer,
  deactivateBankAccount,
  fetchBankingDashboard,
  formatInrPaise,
  ignoreBankStatementLine,
  listBankAccounts,
  listBankReconciliations,
  listBankStatementImports,
  listBankStatementLines,
  listBankTransfers,
  postBankTransfer,
  previewBankStatementImport,
  previewBankTransfer,
  reconcileBankReconciliation,
  reopenBankReconciliation,
  recomputeBankReconciliation,
  rerunBankStatementMatching,
  unmatchBankStatementLine,
  updateBankAccount,
  type BankAccountRow,
  type BankStatementImportRow,
  type BankStatementLineRow,
  type BankStatementPreview
} from "@/lib/accounting-api";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";

export default function BankingAccountingPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [transfers, setTransfers] = useState<Array<Record<string, unknown>>>([]);
  const [bankingEnabled, setBankingEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newGl, setNewGl] = useState("");
  const [newType, setNewType] = useState<"BANK" | "CASH" | "PETTY_CASH">("BANK");
  const [newMasked, setNewMasked] = useState("");

  const [transferKind, setTransferKind] = useState<
    "INTERNAL_TRANSFER" | "CASH_DEPOSIT" | "CASH_WITHDRAWAL"
  >("INTERNAL_TRANSFER");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferAmount, setTransferAmount] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [transferRef, setTransferRef] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [draftTransferId, setDraftTransferId] = useState<string | null>(null);

  const [statementImportEnabled, setStatementImportEnabled] = useState(false);
  const [bankReconciliationEnabled, setBankReconciliationEnabled] = useState(false);
  const [gatewayControls, setGatewayControls] = useState<
    Array<{
      provider: string;
      glCode: string;
      glName: string;
      balanceInPaise: number;
      status: string;
      warnings: string[];
      lastSettlementAt: string | null;
      lastSettlementUtr: string | null;
    }>
  >([]);
  const [reconcilations, setReconciliations] = useState<Array<Record<string, unknown>>>([]);
  const [reconPeriodStart, setReconPeriodStart] = useState(() =>
    new Date().toISOString().slice(0, 8) + "01"
  );
  const [reconPeriodEnd, setReconPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [reconStmtClosing, setReconStmtClosing] = useState("");
  const [selectedReconId, setSelectedReconId] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [ignoreReason, setIgnoreReason] = useState("");
  const [stmtBankId, setStmtBankId] = useState("");
  const [stmtFile, setStmtFile] = useState<File | null>(null);
  const [stmtPreview, setStmtPreview] = useState<BankStatementPreview | null>(null);
  const [stmtImports, setStmtImports] = useState<BankStatementImportRow[]>([]);
  const [stmtLines, setStmtLines] = useState<BankStatementLineRow[]>([]);
  const [stmtFilter, setStmtFilter] = useState("");
  const [selectedImportId, setSelectedImportId] = useState("");

  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === "BANK" && a.isActive),
    [accounts]
  );
  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.accountType !== "BANK" && a.isActive),
    [accounts]
  );

  const refresh = useCallback(async () => {
    const dash = await fetchBankingDashboard();
    setAccounts(dash.accounts);
    setBankingEnabled(dash.bankingEnabled);
    setStatementImportEnabled(Boolean(dash.statementImportEnabled));
    setBankReconciliationEnabled(Boolean(dash.bankReconciliationEnabled));
    setGatewayControls(dash.gatewayControls ?? []);
    const t = await listBankTransfers(30);
    setTransfers(t.transfers);
    if (dash.statementImportEnabled) {
      const imp = await listBankStatementImports();
      setStmtImports(imp.imports);
    }
    if (dash.bankReconciliationEnabled) {
      const r = await listBankReconciliations();
      setReconciliations(r.reconciliations);
    }
  }, []);

  const refreshStatementLines = useCallback(async () => {
    const lines = await listBankStatementLines({
      importId: selectedImportId || undefined,
      bankAccountId: stmtBankId || undefined,
      matchStatus: stmtFilter || undefined,
      limit: 200
    });
    setStmtLines(lines.lines);
  }, [selectedImportId, stmtBankId, stmtFilter]);

  useEffect(() => {
    void refresh().catch((e) => setErr(e instanceof Error ? e.message : "Load failed"));
  }, [refresh]);

  useEffect(() => {
    if (!statementImportEnabled) return;
    void refreshStatementLines().catch(() => undefined);
  }, [statementImportEnabled, refreshStatementLines]);

  async function handleCreateAccount() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await createBankAccount({
        name: newName.trim(),
        glAccountCode: newGl.trim(),
        accountType: newType,
        maskedAccountNumber: newMasked || null,
        createGlIfMissing: true
      });
      setNewName("");
      setNewGl("");
      setNewMasked("");
      setMsg("Bank account created");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTransfer() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    setPreview(null);
    try {
      const amountInPaise = Math.round(parseFloat(transferAmount) * 100);
      if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
        throw new Error("Enter a valid amount in rupees");
      }
      const draft = await createBankTransfer({
        transferDate,
        amountInPaise,
        transferKind,
        sourceBankAccountId: sourceId,
        destinationBankAccountId: destId,
        reference: transferRef || null
      });
      const id = String(draft.id);
      setDraftTransferId(id);
      const p = await previewBankTransfer(id);
      setPreview(p);
      setMsg(`Transfer draft ${String(draft.transferNumber)} — preview ready`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Transfer draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePostTransfer() {
    if (!draftTransferId) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await postBankTransfer(draftTransferId);
      setMsg(
        result.duplicate
          ? `Idempotent — ${result.journal.entryNumber}`
          : `Posted ${result.journal.entryNumber}`
      );
      setDraftTransferId(null);
      setPreview(null);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Post failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleStatementPreview() {
    if (!stmtBankId || !stmtFile) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    setStmtPreview(null);
    try {
      const p = await previewBankStatementImport(stmtBankId, stmtFile);
      setStmtPreview(p);
      setMsg(`Preview: ${p.validRowCount} valid rows`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Statement preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleStatementCommit() {
    if (!stmtBankId || !stmtFile) return;
    setBusy(true);
    setErr(null);
    try {
      const imp = await commitBankStatementImport(stmtBankId, stmtFile);
      setMsg(`Imported ${imp.fileName} — ${imp.rowCount} lines`);
      setStmtPreview(null);
      setStmtFile(null);
      setSelectedImportId(imp.id);
      await refresh();
      await refreshStatementLines();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Statement import failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmMatch(line: BankStatementLineRow) {
    const candidate = line.matches.find((m) => m.status === "CANDIDATE");
    if (!candidate) return;
    setBusy(true);
    setErr(null);
    try {
      await confirmBankStatementMatch({
        lineId: line.id,
        journalEntryId: candidate.journalEntryId
      });
      setMsg("Match confirmed");
      await refreshStatementLines();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnmatch(lineId: string) {
    setBusy(true);
    setErr(null);
    try {
      await unmatchBankStatementLine(lineId);
      setMsg("Line unmatched — matching re-run");
      await refreshStatementLines();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unmatch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Banking & Cash"
        subtitle="Bank transfers, statement import, reconciliation, and gateway clearing controls."
      />

      {!bankingEnabled ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <code>ACCOUNTING_BANKING_ENABLED=1</code> required for transfer posting persistence.
          Preview/create registry works when native accounting is on.
        </p>
      ) : null}
      {err ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      {msg ? <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">{msg}</p> : null}

      <section className="space-y-3">
        <h2 className="font-medium text-[#1e3a2f]">Accounts — BOOK BALANCE</h2>
        <div className="overflow-x-auto border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">GL</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Masked</th>
                <th className="px-3 py-2">Book balance</th>
                <th className="px-3 py-2">Stmt balance</th>
                <th className="px-3 py-2">Recon Δ</th>
                <th className="px-3 py-2">Recon status</th>
                <th className="px-3 py-2">Flags</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.glAccountCode}</td>
                  <td className="px-3 py-2">{a.accountType}</td>
                  <td className="px-3 py-2">{a.maskedAccountNumber ?? "—"}</td>
                  <td className="px-3 py-2">{formatInrPaise(a.bookBalanceInPaise)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-600">
                    {a.latestStatementBalanceInPaise != null
                      ? formatInrPaise(a.latestStatementBalanceInPaise)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.reconciliationDifferenceInPaise != null
                      ? formatInrPaise(a.reconciliationDifferenceInPaise)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.reconciliationStatus ?? "—"}
                    {a.unmatchedCount ? ` · U${a.unmatchedCount}` : ""}
                    {a.reviewRequiredCount ? ` · R${a.reviewRequiredCount}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.isDefault ? "default " : ""}
                    {a.razorpaySettlementTarget ? "razorpay-target" : ""}
                    {!a.isActive ? "inactive" : ""}
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    {a.isActive ? (
                      <>
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() =>
                            void updateBankAccount(a.id, { razorpaySettlementTarget: true }).then(
                              refresh
                            )
                          }
                        >
                          Set Razorpay target
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-700 underline"
                          onClick={() => void deactivateBankAccount(a.id).then(refresh)}
                        >
                          Deactivate
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 border border-neutral-200 p-4 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-medium text-[#1e3a2f]">Create account (synthetic / test)</h2>
          <input
            className="w-full border px-2 py-1.5 text-sm"
            placeholder="Name e.g. TEST-ACC-HDFC"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="w-full border px-2 py-1.5 text-sm font-mono"
            placeholder="GL code e.g. 1011"
            value={newGl}
            onChange={(e) => setNewGl(e.target.value)}
          />
          <select
            className="w-full border px-2 py-1.5 text-sm"
            value={newType}
            onChange={(e) => setNewType(e.target.value as typeof newType)}
          >
            <option value="BANK">BANK</option>
            <option value="CASH">CASH</option>
            <option value="PETTY_CASH">PETTY_CASH</option>
          </select>
          <input
            className="w-full border px-2 py-1.5 text-sm"
            placeholder="Account number (stored masked)"
            value={newMasked}
            onChange={(e) => setNewMasked(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !newName.trim() || !newGl.trim()}
            className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => void handleCreateAccount()}
          >
            Create account
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="font-medium text-[#1e3a2f]">Transfer</h2>
          <select
            className="w-full border px-2 py-1.5 text-sm"
            value={transferKind}
            onChange={(e) => setTransferKind(e.target.value as typeof transferKind)}
          >
            <option value="INTERNAL_TRANSFER">Bank → Bank</option>
            <option value="CASH_DEPOSIT">Cash → Bank</option>
            <option value="CASH_WITHDRAWAL">Bank → Cash</option>
          </select>
          <input
            type="date"
            className="w-full border px-2 py-1.5 text-sm"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
          />
          <input
            className="w-full border px-2 py-1.5 text-sm"
            placeholder="Amount (₹)"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
          />
          <select
            className="w-full border px-2 py-1.5 text-sm"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">Source account</option>
            {(transferKind === "CASH_DEPOSIT" ? cashAccounts : bankAccounts).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.glAccountCode})
              </option>
            ))}
          </select>
          <select
            className="w-full border px-2 py-1.5 text-sm"
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
          >
            <option value="">Destination account</option>
            {(transferKind === "CASH_WITHDRAWAL" ? cashAccounts : bankAccounts).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.glAccountCode})
              </option>
            ))}
          </select>
          <input
            className="w-full border px-2 py-1.5 text-sm"
            placeholder="Reference / UTR"
            value={transferRef}
            onChange={(e) => setTransferRef(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !sourceId || !destId}
              className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-sm text-white disabled:opacity-50"
              onClick={() => void handleCreateTransfer()}
            >
              Preview transfer
            </button>
            <button
              type="button"
              disabled={busy || !draftTransferId}
              className="rounded-md border border-[#1e3a2f] px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={() => void handlePostTransfer()}
            >
              Post transfer
            </button>
          </div>
          {preview ? (
            <pre className="max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-xs">
              {JSON.stringify(preview, null, 2)}
            </pre>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 border border-neutral-200 p-4">
        <h2 className="font-medium text-[#1e3a2f]">Bank statements</h2>
        {!statementImportEnabled ? (
          <p className="text-sm text-amber-900">
            Requires <code>NATIVE_ACCOUNTING_ENABLED=1</code>,{" "}
            <code>ACCOUNTING_BANKING_ENABLED=1</code>, and{" "}
            <code>ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED=1</code>. Import is evidence only — no
            GL posting.
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <select
                className="border px-2 py-1.5 text-sm"
                value={stmtBankId}
                onChange={(e) => setStmtBankId(e.target.value)}
              >
                <option value="">Select BANK account</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.glAccountCode})
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="text-sm"
                onChange={(e) => setStmtFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !stmtBankId || !stmtFile}
                className="rounded-md border border-[#1e3a2f] px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={() => void handleStatementPreview()}
              >
                Preview
              </button>
              <button
                type="button"
                disabled={busy || !stmtBankId || !stmtFile || !stmtPreview?.canCommit}
                className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() => void handleStatementCommit()}
              >
                Commit import
              </button>
            </div>
            {stmtPreview ? (
              <pre className="max-h-56 overflow-auto rounded bg-neutral-50 p-2 text-xs">
                {JSON.stringify(stmtPreview, null, 2)}
              </pre>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select
                className="border px-2 py-1"
                value={selectedImportId}
                onChange={(e) => setSelectedImportId(e.target.value)}
              >
                <option value="">All imports</option>
                {stmtImports.map((imp) => (
                  <option key={imp.id} value={imp.id}>
                    {imp.fileName} ({imp.rowCount} rows)
                  </option>
                ))}
              </select>
              <select
                className="border px-2 py-1"
                value={stmtFilter}
                onChange={(e) => setStmtFilter(e.target.value)}
              >
                <option value="">ALL</option>
                <option value="MATCHED_EXACT">MATCHED</option>
                <option value="MATCHED_MANUAL">MATCHED MANUAL</option>
                <option value="POSSIBLE">POSSIBLE</option>
                <option value="REVIEW_REQUIRED">REVIEW REQUIRED</option>
                <option value="UNMATCHED">UNMATCHED</option>
                <option value="DUPLICATE">DUPLICATE</option>
              </select>
              <button
                type="button"
                className="underline"
                onClick={() => void refreshStatementLines()}
              >
                Refresh lines
              </button>
              {selectedImportId ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    void rerunBankStatementMatching(selectedImportId).then(() => refreshStatementLines())
                  }
                >
                  Rerun matching
                </button>
              ) : null}
            </div>

            <div className="overflow-x-auto border border-neutral-200">
              <table className="min-w-full text-xs">
                <thead className="bg-neutral-50 text-left">
                  <tr>
                    <th className="px-2 py-1">Date</th>
                    <th className="px-2 py-1">Description</th>
                    <th className="px-2 py-1">Reference</th>
                    <th className="px-2 py-1">Debit</th>
                    <th className="px-2 py-1">Credit</th>
                    <th className="px-2 py-1">Balance</th>
                    <th className="px-2 py-1">Match</th>
                    <th className="px-2 py-1">Journal</th>
                    <th className="px-2 py-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stmtLines.map((line) => {
                    const confirmed = line.matches.find((m) => m.status === "CONFIRMED");
                    const candidate = line.matches.find((m) => m.status === "CANDIDATE");
                    return (
                      <tr key={line.id} className="border-t border-neutral-100">
                        <td className="px-2 py-1">{line.transactionDate.slice(0, 10)}</td>
                        <td className="px-2 py-1 max-w-[12rem] truncate">{line.description}</td>
                        <td className="px-2 py-1 font-mono">{line.reference ?? "—"}</td>
                        <td className="px-2 py-1">
                          {line.debitInPaise ? formatInrPaise(line.debitInPaise) : "—"}
                        </td>
                        <td className="px-2 py-1">
                          {line.creditInPaise ? formatInrPaise(line.creditInPaise) : "—"}
                        </td>
                        <td className="px-2 py-1">
                          {line.runningBalanceInPaise != null
                            ? formatInrPaise(line.runningBalanceInPaise)
                            : "—"}
                        </td>
                        <td className="px-2 py-1">
                          {line.matchStatus}
                          {confirmed ? ` (${confirmed.confidence})` : ""}
                          {candidate && !confirmed ? ` → ${candidate.confidence}` : ""}
                        </td>
                        <td className="px-2 py-1 font-mono">
                          {confirmed?.journalEntry?.entryNumber ??
                            candidate?.journalEntry?.entryNumber ??
                            "—"}
                        </td>
                        <td className="px-2 py-1 space-x-1">
                          {candidate && !confirmed ? (
                            <button
                              type="button"
                              className="underline"
                              onClick={() => void handleConfirmMatch(line)}
                            >
                              Confirm
                            </button>
                          ) : null}
                          {confirmed ? (
                            <button
                              type="button"
                              className="text-red-700 underline"
                              onClick={() => void handleUnmatch(line.id)}
                            >
                              Unmatch
                            </button>
                          ) : null}
                          {bankReconciliationEnabled && line.matchStatus === "UNMATCHED" ? (
                            <>
                              {line.debitInPaise > 0 ? (
                                <button
                                  type="button"
                                  className="underline"
                                  onClick={() =>
                                    void categorizeBankCharge(line.id)
                                      .then(() => {
                                        setMsg("Bank charge posted");
                                        return refreshStatementLines();
                                      })
                                      .catch((e) =>
                                        setErr(e instanceof Error ? e.message : "Charge failed")
                                      )
                                  }
                                >
                                  Charge
                                </button>
                              ) : null}
                              {line.creditInPaise > 0 ? (
                                <button
                                  type="button"
                                  className="underline"
                                  onClick={() =>
                                    void categorizeBankInterest(line.id)
                                      .then(() => {
                                        setMsg("Bank interest posted");
                                        return refreshStatementLines();
                                      })
                                      .catch((e) =>
                                        setErr(e instanceof Error ? e.message : "Interest failed")
                                      )
                                  }
                                >
                                  Interest
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="underline"
                                onClick={() => {
                                  const reason = ignoreReason.trim() || window.prompt("Ignore reason");
                                  if (!reason) return;
                                  void ignoreBankStatementLine(line.id, reason)
                                    .then(() => {
                                      setMsg("Line ignored");
                                      return refreshStatementLines();
                                    })
                                    .catch((e) =>
                                      setErr(e instanceof Error ? e.message : "Ignore failed")
                                    );
                                }}
                              >
                                Ignore
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3 border border-neutral-200 p-4">
        <h2 className="font-medium text-[#1e3a2f]">Payment gateway clearing</h2>
        <div className="overflow-x-auto border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left">
              <tr>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">GL</th>
                <th className="px-3 py-2">Outstanding</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last settlement</th>
                <th className="px-3 py-2">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {gatewayControls.map((g) => (
                <tr key={g.provider} className="border-t border-neutral-100">
                  <td className="px-3 py-2">{g.provider}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {g.glCode} {g.glName}
                  </td>
                  <td className="px-3 py-2">{formatInrPaise(g.balanceInPaise)}</td>
                  <td className="px-3 py-2">{g.status}</td>
                  <td className="px-3 py-2 text-xs">
                    {g.lastSettlementAt?.slice(0, 10) ?? "—"}
                    {g.lastSettlementUtr ? ` · ${g.lastSettlementUtr}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-amber-900">
                    {g.warnings.join("; ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 border border-neutral-200 p-4">
        <h2 className="font-medium text-[#1e3a2f]">Bank reconciliation</h2>
        {!bankReconciliationEnabled ? (
          <p className="text-sm text-amber-900">
            Requires <code>ACCOUNTING_BANK_RECONCILIATION_ENABLED=1</code> (and banking + statement
            import). Reconciliation does not post GL by itself.
          </p>
        ) : (
          <>
            <div className="grid gap-2 md:grid-cols-4">
              <select
                className="border px-2 py-1.5 text-sm"
                value={stmtBankId}
                onChange={(e) => setStmtBankId(e.target.value)}
              >
                <option value="">Bank account</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="border px-2 py-1.5 text-sm"
                value={reconPeriodStart}
                onChange={(e) => setReconPeriodStart(e.target.value)}
              />
              <input
                type="date"
                className="border px-2 py-1.5 text-sm"
                value={reconPeriodEnd}
                onChange={(e) => setReconPeriodEnd(e.target.value)}
              />
              <input
                className="border px-2 py-1.5 text-sm"
                placeholder="Statement closing ₹"
                value={reconStmtClosing}
                onChange={(e) => setReconStmtClosing(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !stmtBankId}
                className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() =>
                  void createBankReconciliation({
                    bankAccountId: stmtBankId,
                    periodStart: reconPeriodStart,
                    periodEnd: reconPeriodEnd,
                    statementImportId: selectedImportId || null,
                    statementClosingBalanceInPaise: reconStmtClosing
                      ? Math.round(parseFloat(reconStmtClosing) * 100)
                      : null
                  })
                    .then((r) => {
                      setSelectedReconId(String(r.id));
                      setMsg("Reconciliation created");
                      return refresh();
                    })
                    .catch((e) => setErr(e instanceof Error ? e.message : "Create recon failed"))
                }
              >
                Create reconciliation
              </button>
              <select
                className="border px-2 py-1 text-sm"
                value={selectedReconId}
                onChange={(e) => setSelectedReconId(e.target.value)}
              >
                <option value="">Select reconciliation</option>
                {reconcilations.map((r) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {String(r.status)} · {String(r.periodStart).slice(0, 10)}–
                    {String(r.periodEnd).slice(0, 10)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedReconId}
                className="underline text-sm"
                onClick={() =>
                  void recomputeBankReconciliation(selectedReconId).then(() => refresh())
                }
              >
                Recompute
              </button>
              <button
                type="button"
                disabled={!selectedReconId}
                className="underline text-sm"
                onClick={() =>
                  void reconcileBankReconciliation(selectedReconId)
                    .then(() => {
                      setMsg("RECONCILED");
                      return refresh();
                    })
                    .catch((e) => setErr(e instanceof Error ? e.message : "Reconcile failed"))
                }
              >
                Reconcile
              </button>
              <input
                className="border px-2 py-1 text-sm"
                placeholder="Reopen reason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
              <button
                type="button"
                disabled={!selectedReconId || !reopenReason.trim()}
                className="underline text-sm"
                onClick={() =>
                  void reopenBankReconciliation(selectedReconId, reopenReason)
                    .then(() => {
                      setMsg("REOPENED");
                      return refresh();
                    })
                    .catch((e) => setErr(e instanceof Error ? e.message : "Reopen failed"))
                }
              >
                Reopen
              </button>
            </div>
            <input
              className="w-full border px-2 py-1 text-sm"
              placeholder="Default ignore reason (optional)"
              value={ignoreReason}
              onChange={(e) => setIgnoreReason(e.target.value)}
            />
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium text-[#1e3a2f]">Recent transfers</h2>
        <ul className="space-y-1 text-sm">
          {transfers.map((t) => (
            <li key={String(t.id)} className="border-b border-neutral-100 py-1">
              {String(t.transferNumber)} — {String(t.transferKind)} —{" "}
              {formatInrPaise(Number(t.amountInPaise))} — {String(t.status)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
