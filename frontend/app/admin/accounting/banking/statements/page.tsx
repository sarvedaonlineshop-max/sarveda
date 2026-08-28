"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  categorizeBankCharge, categorizeBankInterest, commitBankStatementImport,
  confirmBankStatementMatch, fetchBankingDashboard, formatInrPaise,
  ignoreBankStatementLine, listBankStatementImports, listBankStatementLines,
  previewBankStatementImport, rerunBankStatementMatching, unmatchBankStatementLine,
  type BankAccountRow, type BankStatementImportRow, type BankStatementLineRow,
  type BankStatementPreview
} from "@/lib/accounting-api";
import {
  AccountingAlert, AccountingEmptyState, AccountingSectionCard, AccountingSectionHeader,
  AccountingStatusBadge, BankingPageShell, BankingTableWrap, FeatureUnavailable,
  accountDisplayName, accountingButtonClass, accountingInputClass, bankingTd, bankingTh,
  confidenceLabel, fieldLabelClass, formatBankDate, humanizeBankingError,
  matchStatusLabel, matchStatusTone, moneyClass
} from "@/components/admin/accounting/banking/banking-ui";

type Queue = "ALL" | "UNMATCHED" | "POSSIBLE" | "REVIEW_REQUIRED" | "MATCHED" | "IGNORED";
type Action = { kind: "confirm" | "unmatch" | "charge" | "interest" | "ignore"; line: BankStatementLineRow } | null;
const matchedStatuses = ["MATCHED_EXACT", "MATCHED_MANUAL", "MATCHED_CATEGORIZED"];

export default function StatementsPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [reconEnabled, setReconEnabled] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BankStatementPreview | null>(null);
  const [imports, setImports] = useState<BankStatementImportRow[]>([]);
  const [importId, setImportId] = useState("");
  const [lines, setLines] = useState<BankStatementLineRow[]>([]);
  const [queue, setQueue] = useState<Queue>("ALL");
  const [selected, setSelected] = useState<BankStatementLineRow | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const loadLines = useCallback(async () => {
    const serverStatus = queue === "MATCHED" || queue === "ALL" ? undefined : queue;
    const result = await listBankStatementLines({ bankAccountId: bankAccountId || undefined, importId: importId || undefined, matchStatus: serverStatus, limit: 200 });
    setLines(queue === "MATCHED" ? result.lines.filter((l) => matchedStatuses.includes(l.matchStatus)) : result.lines);
  }, [bankAccountId, importId, queue]);

  useEffect(() => {
    void Promise.all([fetchBankingDashboard(), listBankStatementImports()]).then(([dash, imp]) => {
      const banks = dash.accounts.filter((a) => a.accountType === "BANK" && a.isActive);
      setAccounts(banks);
      setEnabled(Boolean(dash.statementImportEnabled));
      setReconEnabled(Boolean(dash.bankReconciliationEnabled));
      setImports(imp.imports);
      const requested = new URLSearchParams(window.location.search).get("bankAccountId");
      if (requested && banks.some((a) => a.id === requested)) setBankAccountId(requested);
    }).catch((e) => setNotice({ tone: "error", text: e instanceof Error ? e.message : "Statements could not be loaded." }));
  }, []);
  useEffect(() => { if (enabled) void loadLines().catch(() => undefined); }, [enabled, loadLines]);

  const account = accounts.find((a) => a.id === bankAccountId);
  const suggested = selected?.matches.find((m) => m.status === "CANDIDATE");
  const confirmed = selected?.matches.find((m) => m.status === "CONFIRMED");

  async function runPreview() {
    if (!file || !bankAccountId) return;
    setBusy(true); setNotice(null);
    try { setPreview(await previewBankStatementImport(bankAccountId, file)); }
    catch (e) { setNotice({ tone: "error", text: humanizeBankingError(e instanceof Error ? e.message : "Statement preview failed.") }); }
    finally { setBusy(false); }
  }

  async function importStatement() {
    if (!file || !bankAccountId) return;
    setBusy(true);
    try {
      const result = await commitBankStatementImport(bankAccountId, file);
      setPreview(null); setFile(null); setImportId(result.id); setImports((v) => [result, ...v]);
      setNotice({ tone: "success", text: `${result.rowCount} statement transactions imported.` }); await loadLines();
    } catch (e) { setNotice({ tone: "error", text: humanizeBankingError(e instanceof Error ? e.message : "Statement import failed.") }); }
    finally { setBusy(false); }
  }

  async function runAction() {
    if (!action) return;
    const candidate = action.line.matches.find((m) => m.status === "CANDIDATE");
    setBusy(true);
    try {
      if (action.kind === "confirm" && candidate) await confirmBankStatementMatch({ lineId: action.line.id, journalEntryId: candidate.journalEntryId });
      if (action.kind === "unmatch") await unmatchBankStatementLine(action.line.id);
      if (action.kind === "charge") await categorizeBankCharge(action.line.id);
      if (action.kind === "interest") await categorizeBankInterest(action.line.id);
      if (action.kind === "ignore") await ignoreBankStatementLine(action.line.id, reason.trim());
      setNotice({ tone: "success", text: action.kind === "charge" ? "Bank charge recorded." : action.kind === "interest" ? "Interest income recorded." : action.kind === "ignore" ? "Transaction ignored." : action.kind === "unmatch" ? "Match removed." : "Match confirmed." });
      setAction(null); setReason(""); setSelected(null); await loadLines();
    } catch (e) {
      setNotice({
        tone: "error",
        text: humanizeBankingError(e instanceof Error ? e.message : "Action could not be completed.")
      });
    }
    finally { setBusy(false); }
  }

  const actionMessage = action?.kind === "confirm" ? "This links the bank transaction to the suggested journal. It does not create accounting entries."
    : action?.kind === "unmatch" ? "This removes the link. Any journal already recorded remains unchanged."
    : action?.kind === "charge" ? "This records the amount as Bank Charges. The journal will debit Bank Charges (5390) and credit this bank account."
    : action?.kind === "interest" ? "This records the amount as Interest Income. The journal will debit this bank account and credit Interest Income (4500)."
    : "The transaction will be excluded from unresolved items. A reason is required for the audit trail.";

  return (
    <BankingPageShell title="Statements & Matching" subtitle="Import bank statements and link transactions to existing accounting entries.">
      {!enabled ? <FeatureUnavailable>Statement import and matching are currently unavailable. Existing banking information remains unchanged.</FeatureUnavailable> : null}
      {notice ? <AccountingAlert tone={notice.tone}>{notice.text}</AccountingAlert> : null}
      {enabled ? <AccountingSectionCard><AccountingSectionHeader title="Import statement" description="CSV and XLSX files are previewed before import. Importing a statement does not create accounting entries." />
        <div className="grid gap-3 md:grid-cols-2"><label className={fieldLabelClass()}>Bank account<select className={accountingInputClass()} value={bankAccountId} onChange={(e) => { setBankAccountId(e.target.value); setPreview(null); }}><option value="">Select a bank account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.maskedAccountNumber ? ` •••• ${a.maskedAccountNumber.slice(-4)}` : ""}</option>)}</select></label><label className={fieldLabelClass()}>Statement file<input type="file" accept=".csv,.xlsx" className={`${accountingInputClass()} pt-2`} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} /></label></div>
        <div className="mt-3"><button className={accountingButtonClass("secondary")} disabled={busy || !bankAccountId || !file} onClick={() => void runPreview()}>Preview</button></div>
        {preview ? <div className="mt-4 rounded-xl border border-[#e0d8ce] bg-[#faf5ec]/40 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs text-[#75675e]">Valid rows</span><strong className="block text-lg">{preview.validRowCount}</strong></div><div><span className="text-xs text-[#75675e]">Money out</span><strong className="block">{formatInrPaise(preview.debitTotalInPaise)}</strong></div><div><span className="text-xs text-[#75675e]">Money in</span><strong className="block">{formatInrPaise(preview.creditTotalInPaise)}</strong></div><div><span className="text-xs text-[#75675e]">Period</span><strong className="block text-sm">{formatBankDate(preview.statementFrom)} – {formatBankDate(preview.statementTo)}</strong></div></div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-[#8a7060]">File</span> · {preview.fileName}</p>
            <p><span className="text-[#8a7060]">Transactions found</span> · {preview.rowCount}</p>
            {preview.openingBalanceInPaise != null ? (
              <p><span className="text-[#8a7060]">Statement opening</span> · {formatInrPaise(preview.openingBalanceInPaise)}</p>
            ) : null}
            {preview.closingBalanceInPaise != null ? (
              <p><span className="text-[#8a7060]">Statement closing</span> · {formatInrPaise(preview.closingBalanceInPaise)}</p>
            ) : null}
          </div>
          {preview.invalidRows.length ? (
            <div className="mt-3">
              <AccountingAlert tone="warning" title="Issues found">
                {preview.invalidRows.length} rows need correction before this file can be imported.
              </AccountingAlert>
              <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-[#6b5c52]">
                {preview.invalidRows.slice(0, 8).map((row) => (
                  <li key={`${row.rowNumber}-${row.code}`}>
                    Row {row.rowNumber}: {row.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-4 text-sm font-semibold text-[#1c352a]">Importing into {account?.name}{account?.maskedAccountNumber ? ` •••• ${account.maskedAccountNumber.slice(-4)}` : ""}</p>
          <button className={`mt-3 ${accountingButtonClass()}`} disabled={busy || !preview.canCommit} onClick={() => void importStatement()}>Import Statement</button>
        </div> : null}
      </AccountingSectionCard> : null}

      <AccountingSectionCard><AccountingSectionHeader title="Matching work queue" action={importId ? <button className={accountingButtonClass("secondary", true)} disabled={busy} onClick={() => void rerunBankStatementMatching(importId).then(loadLines)}>Refresh matching</button> : undefined} />
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["ALL", "All"],
              ["UNMATCHED", "Unmatched"],
              ["POSSIBLE", "Suggested Matches"],
              ["REVIEW_REQUIRED", "Needs Review"],
              ["MATCHED", "Matched"],
              ["IGNORED", "Ignored"]
            ] as const
          ).map(([q, label]) => (
            <button
              key={q}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                queue === q ? "bg-[#1c352a] text-white" : "border border-[#e0d8ce] bg-white"
              }`}
              onClick={() => setQueue(q)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mb-3 grid gap-2 md:grid-cols-2"><select className={accountingInputClass()} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}><option value="">All bank accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select className={accountingInputClass()} value={importId} onChange={(e) => setImportId(e.target.value)}><option value="">All statement imports</option>{imports.map((i) => <option key={i.id} value={i.id}>{i.fileName} ({i.rowCount} rows)</option>)}</select></div>
        {lines.length === 0 ? <AccountingEmptyState title="No transactions in this queue" description="Import a statement or choose a different filter." /> : <BankingTableWrap><table className="min-w-full"><thead><tr><th className={bankingTh()}>Date</th><th className={bankingTh()}>Description</th><th className={bankingTh()}>Reference</th><th className={bankingTh(true)}>Money Out</th><th className={bankingTh(true)}>Money In</th><th className={bankingTh()}>Match</th><th className={bankingTh()}>Status</th><th className={bankingTh()}>Action</th></tr></thead><tbody>{lines.map((line) => {
          const candidate = line.matches.find((m) => m.status === "CANDIDATE"); const isConfirmed = line.matches.some((m) => m.status === "CONFIRMED");
          return <tr key={line.id} className="border-t border-[#eee8e0]"><td className={bankingTd()}>{formatBankDate(line.transactionDate)}</td><td className={`${bankingTd()} max-w-[18rem] truncate`}>{line.description}</td><td className={`${bankingTd()} font-mono text-xs`}>{line.reference ?? "—"}</td><td className={`${bankingTd(true)} ${moneyClass()}`}>{line.debitInPaise ? formatInrPaise(line.debitInPaise) : "—"}</td><td className={`${bankingTd(true)} ${moneyClass()}`}>{line.creditInPaise ? formatInrPaise(line.creditInPaise) : "—"}</td><td className={bankingTd()}>{candidate ? `${confidenceLabel(candidate.confidence)} · ${candidate.journalEntry?.entryNumber ?? "Journal"}` : isConfirmed ? "Linked" : "—"}</td><td className={bankingTd()}><AccountingStatusBadge tone={matchStatusTone(line.matchStatus)}>{matchStatusLabel(line.matchStatus)}</AccountingStatusBadge></td><td className={bankingTd()}><button className="font-semibold underline" onClick={() => setSelected(line)}>Review</button></td></tr>;
        })}</tbody></table></BankingTableWrap>}
      </AccountingSectionCard>

      {selected ? <AccountingSectionCard><AccountingSectionHeader title="Transaction review" action={<button className="text-xs underline" onClick={() => setSelected(null)}>Close</button>} /><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-lg bg-[#faf5ec] p-4 text-sm"><strong>Bank transaction</strong><dl className="mt-2 grid grid-cols-2 gap-2"><dt>Date</dt><dd>{formatBankDate(selected.transactionDate)}</dd><dt>Description</dt><dd>{selected.description}</dd><dt>Reference</dt><dd>{selected.reference ?? "—"}</dd><dt>Amount</dt><dd className={moneyClass()}>{formatInrPaise(selected.debitInPaise || selected.creditInPaise)}</dd></dl></div><div className="rounded-lg bg-stone-50 p-4 text-sm"><strong>{suggested ? "Suggested match" : confirmed ? "Current match" : "No suggested match"}</strong>{suggested || confirmed ? <dl className="mt-2 grid grid-cols-2 gap-2"><dt>Journal</dt><dd>{(suggested ?? confirmed)?.journalEntry?.entryNumber ?? "—"}</dd><dt>Date</dt><dd>{formatBankDate((suggested ?? confirmed)?.journalEntry?.entryDate)}</dd><dt>Confidence</dt><dd>{confidenceLabel((suggested ?? confirmed)?.confidence ?? "")}</dd></dl> : <p className="mt-2 text-[#75675e]">Record a bank charge, interest income, or ignore this transaction where appropriate.</p>}</div></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {suggested ? (
            <button className={accountingButtonClass()} onClick={() => setAction({ kind: "confirm", line: selected })}>
              Confirm Match
            </button>
          ) : null}
          {confirmed ? (
            <button className={accountingButtonClass("secondary")} onClick={() => setAction({ kind: "unmatch", line: selected })}>
              Unmatch
            </button>
          ) : null}
          {reconEnabled && !confirmed && selected.matchStatus === "UNMATCHED" && selected.debitInPaise > 0 ? (
            <button className={accountingButtonClass("secondary")} onClick={() => setAction({ kind: "charge", line: selected })}>
              Record Bank Charge
            </button>
          ) : null}
          {reconEnabled && !confirmed && selected.matchStatus === "UNMATCHED" && selected.creditInPaise > 0 ? (
            <button className={accountingButtonClass("secondary")} onClick={() => setAction({ kind: "interest", line: selected })}>
              Record Bank Interest
            </button>
          ) : null}
          {reconEnabled && !confirmed && selected.matchStatus === "UNMATCHED" ? (
            <button className={accountingButtonClass("secondary")} onClick={() => setAction({ kind: "ignore", line: selected })}>
              Ignore Transaction
            </button>
          ) : null}
        </div>
      </AccountingSectionCard> : null}

      {action?.kind === "ignore" ? <div className="fixed bottom-4 left-1/2 z-[101] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-[#e0d8ce] bg-white p-4 shadow-xl"><label className={fieldLabelClass()}>Reason for ignoring<textarea className={`${accountingInputClass()} h-20 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} /></label></div> : null}
      <AdminConfirmModal open={Boolean(action)} title={action ? ({ confirm: "Confirm suggested match?", unmatch: "Remove this match?", charge: "Record bank charge?", interest: "Record interest income?", ignore: "Ignore this transaction?" } as const)[action.kind] : ""} message={actionMessage} details={action ? [`Transaction: ${action.line.description}`, `Amount: ${formatInrPaise(action.line.debitInPaise || action.line.creditInPaise)}`] : undefined} confirmLabel={action?.kind === "confirm" ? "Confirm Match" : action?.kind === "unmatch" ? "Unmatch" : action?.kind === "charge" ? "Record Bank Charge" : action?.kind === "interest" ? "Record Interest" : "Ignore Transaction"} danger={action?.kind === "unmatch" || action?.kind === "ignore"} busy={busy || (action?.kind === "ignore" && reason.trim().length < 3)} onConfirm={() => void runAction()} onClose={() => { setAction(null); setReason(""); }} />
    </BankingPageShell>
  );
}
