"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
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
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  PreviewFact,
  SalesPageShell,
  SalesTableWrap,
  accountLabel,
  accountingButtonClass,
  accountingInputClass,
  fieldLabelClass,
  formatSalesDate,
  humanizePostingError,
  lineRoleLabel,
  moneyClass,
  providerLabel,
  salesTd,
  salesTh,
  settlementStatusLabel,
  settlementStatusTone,
  softUnavailableMessage
} from "@/components/admin/accounting/sales/sales-ui";

type BankOpt = { id: string; name: string; glAccountCode: string };

type ProposalLine = {
  accountCode: string;
  accountName?: string;
  debitInPaise: number;
  creditInPaise: number;
  amountSource?: string;
  lineMemo?: string;
};

export default function AdminGatewaySettlementsPage() {
  const searchParams = useSearchParams();
  const autoLoadDone = useRef(false);
  const [settlementId, setSettlementId] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [settlementPostingEnabled, setSettlementPostingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetBankAccountId, setTargetBankAccountId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankOpt[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listReady, setListReady] = useState(false);

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
        setBankAccounts(
          banks.accounts
            .filter((b) => b.accountType === "BANK")
            .map((b) => ({ id: b.id, name: b.name, glAccountCode: b.glAccountCode }))
        );
        await refreshList();
      } catch (e) {
        setListError(e instanceof Error ? e.message : "Could not load settlements.");
      } finally {
        setListReady(true);
      }
    })();
  }, []);

  const destinationBank = useMemo(() => {
    if (!targetBankAccountId) return null;
    return bankAccounts.find((b) => b.id === targetBankAccountId) ?? null;
  }, [bankAccounts, targetBankAccountId]);

  const proposal = (preview?.proposal ?? null) as {
    balanced?: boolean;
    totalDebitPaise?: number;
    totalCreditPaise?: number;
    lines?: ProposalLine[];
  } | null;

  const bundle = (preview?.bundle ?? null) as {
    providerSettlementId?: string;
    settledAt?: string;
    grossInPaise?: number;
    feeInPaise?: number;
    netInPaise?: number;
    utr?: string | null;
  } | null;

  const postingEvent = preview?.postingEvent as
    | { status?: string; journalEntry?: { entryNumber?: string } | null }
    | null
    | undefined;

  const displayId =
    bundle?.providerSettlementId ??
    (detail?.providerSettlementId as string | undefined) ??
    settlementId.trim();

  const gross = Number(bundle?.grossInPaise ?? detail?.grossInPaise ?? 0) || 0;
  const fees = Number(bundle?.feeInPaise ?? detail?.feeInPaise ?? 0) || 0;
  const net = Number(bundle?.netInPaise ?? detail?.netInPaise ?? 0) || 0;
  const settledAt = String(bundle?.settledAt ?? detail?.settledAt ?? "");
  const status = String(detail?.status ?? preview?.status ?? "");

  const alreadyRecorded =
    postingEvent?.status === "POSTED" ||
    Boolean(postingEvent?.journalEntry?.entryNumber) ||
    Boolean(detail?.journalEntryNumber);

  const canRecord =
    Boolean(proposal) &&
    Boolean(settlementId.trim()) &&
    settlementPostingEnabled &&
    !alreadyRecorded &&
    proposal?.balanced !== false;

  async function handleReview(id?: string) {
    const sid = (id ?? settlementId).trim();
    if (!sid) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      setSettlementId(sid);
      const data = await previewAccountingSettlement(sid, targetBankAccountId || null);
      setPreview(data);
      setDetail(await fetchAccountingSettlement(sid));
      setMessage("Settlement ready for review.");
      await refreshList();
    } catch (e) {
      setError(
        humanizePostingError(e instanceof AdminApiError ? e.message : "Review failed")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadEvidence() {
    setLoading(true);
    setError(null);
    try {
      await importAccountingSettlement(settlementId.trim());
      setDetail(await fetchAccountingSettlement(settlementId.trim()));
      setMessage("Settlement details loaded.");
      await refreshList();
    } catch (e) {
      setError(
        humanizePostingError(e instanceof AdminApiError ? e.message : "Could not load settlement")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRecord() {
    setLoading(true);
    setError(null);
    try {
      const result = await postAccountingSettlement(
        settlementId.trim(),
        targetBankAccountId || null
      );
      setConfirmOpen(false);
      setMessage(
        result.duplicate
          ? `Already recorded — journal ${result.journal.entryNumber}`
          : `Settlement recorded — journal ${result.journal.entryNumber}`
      );
      setDetail(await fetchAccountingSettlement(settlementId.trim()));
      setPreview(
        await previewAccountingSettlement(settlementId.trim(), targetBankAccountId || null)
      );
      await refreshList();
    } catch (e) {
      setConfirmOpen(false);
      setError(
        humanizePostingError(e instanceof AdminApiError ? e.message : "Recording failed")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleFindSettlements() {
    setLoading(true);
    setError(null);
    try {
      const data = await discoverAccountingSettlements({ dryRun: true, limit: 5 });
      setMessage(
        data.scanned > 0
          ? `Reviewed ${data.scanned} settlement${data.scanned === 1 ? "" : "s"} from Razorpay.`
          : "No new settlements found."
      );
      await refreshList();
    } catch (e) {
      setError(
        humanizePostingError(
          e instanceof AdminApiError ? e.message : "Could not find settlements"
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!listReady || autoLoadDone.current) return;
    const sid = searchParams.get("settlement")?.trim();
    if (sid) {
      autoLoadDone.current = true;
      void handleReview(sid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- overview deep-link once
  }, [listReady, searchParams]);

  return (
    <SalesPageShell
      title="Gateway Settlements"
      subtitle="Record gateway payouts received into bank accounts."
    >
      {!settlementPostingEnabled && (preview || detail) ? (
        <AccountingAlert tone="warning">{softUnavailableMessage("settlements")}</AccountingAlert>
      ) : null}
      {listError ? <AccountingAlert tone="error">{listError}</AccountingAlert> : null}

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Look up settlement"
          description="Enter a Razorpay settlement ID to review the payout and record it to a bank account."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <label>
            <span className={fieldLabelClass()}>Settlement ID</span>
            <input
              className={accountingInputClass()}
              value={settlementId}
              onChange={(e) => setSettlementId(e.target.value)}
              placeholder="setl_…"
              disabled={loading}
            />
          </label>
          <label>
            <span className={fieldLabelClass()}>Destination Bank Account</span>
            <select
              className={accountingInputClass()}
              value={targetBankAccountId}
              onChange={(e) => setTargetBankAccountId(e.target.value)}
              disabled={loading}
            >
              <option value="">Use configured Razorpay destination</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || !settlementId.trim()}
            onClick={() => void handleReview()}
            className={accountingButtonClass("primary")}
          >
            {loading ? "Working…" : "Review Settlement"}
          </button>
          <button
            type="button"
            disabled={loading || !settlementId.trim()}
            onClick={() => void handleLoadEvidence()}
            className={accountingButtonClass("secondary")}
          >
            Load Settlement
          </button>
          <button
            type="button"
            disabled={loading || !canRecord}
            onClick={() => setConfirmOpen(true)}
            className={accountingButtonClass("secondary")}
          >
            Record Settlement
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#ebe4db] pt-3 text-xs">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleFindSettlements()}
            className={accountingButtonClass("secondary", true)}
          >
            Find Razorpay Settlements
          </button>
          <Link
            href="/admin/accounting/banking/gateway"
            className="font-medium text-[#1c352a] underline-offset-2 hover:underline"
          >
            View Gateway Clearing
          </Link>
          {destinationBank ? (
            <Link
              href={`/admin/accounting/banking/accounts/${destinationBank.id}`}
              className="font-medium text-[#1c352a] underline-offset-2 hover:underline"
            >
              View Bank Account
            </Link>
          ) : null}
        </div>
      </AccountingSectionCard>

      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {message ? <AccountingAlert tone="success">{message}</AccountingAlert> : null}

      {preview || detail ? (
        <div className="space-y-4">
          <AccountingSectionCard>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <AccountingSectionHeader title="Settlement" />
              {status ? (
                <AccountingStatusBadge tone={settlementStatusTone(status)}>
                  {settlementStatusLabel(status)}
                </AccountingStatusBadge>
              ) : alreadyRecorded ? (
                <AccountingStatusBadge tone="success">Recorded</AccountingStatusBadge>
              ) : null}
            </div>
            <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <PreviewFact label="Provider">{providerLabel("RAZORPAY")}</PreviewFact>
              <PreviewFact label="Settlement ID">
                <span className="break-all">{displayId || "—"}</span>
              </PreviewFact>
              <PreviewFact label="Settlement Date">{formatSalesDate(settledAt)}</PreviewFact>
              <PreviewFact label="Destination Bank">
                {destinationBank?.name ?? "Configured Razorpay destination"}
              </PreviewFact>
              <PreviewFact label="Gross Amount" emphasize>
                {formatInrPaise(gross)}
              </PreviewFact>
              <PreviewFact label="Fees" emphasize>
                {formatInrPaise(fees)}
              </PreviewFact>
              <PreviewFact label="Net Amount" emphasize>
                {formatInrPaise(net)}
              </PreviewFact>
              {detail?.utr || bundle?.utr ? (
                <PreviewFact label="UTR">{String(detail?.utr ?? bundle?.utr)}</PreviewFact>
              ) : null}
            </dl>
          </AccountingSectionCard>

          {proposal?.lines?.length ? (
            <AccountingSectionCard>
              <AccountingSectionHeader
                title="Accounting Effect"
                description="Clears gateway balance into the selected bank and records fees where present."
              />
              <SalesTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={salesTh()}>Account</th>
                      <th className={salesTh(true)}>Debit</th>
                      <th className={salesTh(true)}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.lines.map((line, i) => {
                      const acc = accountLabel(line.accountCode, line.accountName);
                      const role = lineRoleLabel(
                        line.accountCode,
                        line.amountSource,
                        line.accountName
                      );
                      const isBank =
                        line.amountSource === "settlement.net" || role === "Bank Account";
                      const isFee =
                        line.amountSource === "settlement.gateway_charges" ||
                        role === "Gateway Fees";
                      const isClearing =
                        line.amountSource?.includes("payment") ||
                        line.amountSource?.includes("refund") ||
                        line.amountSource?.includes("adjustment") ||
                        role === "Gateway Clearing";
                      const label = isBank
                        ? "Bank Account"
                        : isFee
                          ? "Gateway Fees"
                          : isClearing
                            ? "Gateway Clearing"
                            : role || acc.primary;
                      return (
                        <tr key={i} className="border-t border-[#eee8e0]">
                          <td className={salesTd()}>
                            <span className="font-medium text-[#2c2420]">{label}</span>
                            <span className="mt-0.5 block text-[11px] tabular-nums text-[#8a7060]">
                              {acc.code}
                              {destinationBank && isBank ? ` · ${destinationBank.name}` : ""}
                            </span>
                          </td>
                          <td className={`${salesTd(true)} ${moneyClass()}`}>
                            {line.debitInPaise ? formatInrPaise(line.debitInPaise) : "—"}
                          </td>
                          <td className={`${salesTd(true)} ${moneyClass()}`}>
                            {line.creditInPaise ? formatInrPaise(line.creditInPaise) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#e0d8ce] bg-[#faf5ec]/60">
                      <td className={`${salesTd()} font-semibold`}>Totals</td>
                      <td className={`${salesTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(proposal.totalDebitPaise ?? 0)}
                      </td>
                      <td className={`${salesTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(proposal.totalCreditPaise ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </SalesTableWrap>
              {proposal.balanced === false ? (
                <p className="mt-2 text-xs text-amber-800">
                  This settlement entry does not balance. Recording is blocked until review is
                  complete.
                </p>
              ) : null}
            </AccountingSectionCard>
          ) : preview?.buildError ? (
            <AccountingAlert tone="error" title="Could not build settlement entry">
              {String((preview.buildError as { message?: string }).message ?? "Unknown error")}
            </AccountingAlert>
          ) : null}
        </div>
      ) : null}

      <AccountingSectionCard>
        <AccountingSectionHeader title="Settlements" />
        {rows.length === 0 ? (
          <AccountingEmptyState
            title="No settlements have been loaded yet"
            description="Enter a Razorpay settlement ID to review, or find recent settlements from Razorpay."
          />
        ) : (
          <SalesTableWrap>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={salesTh()}>Settlement ID</th>
                  <th className={salesTh()}>Provider</th>
                  <th className={salesTh()}>Settlement Date</th>
                  <th className={salesTh(true)}>Gross</th>
                  <th className={salesTh(true)}>Fees</th>
                  <th className={salesTh(true)}>Net Amount</th>
                  <th className={salesTh()}>Status</th>
                  <th className={salesTh()}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const id = String(r.providerSettlementId ?? "");
                  return (
                    <tr key={String(r.id ?? id)} className="border-t border-[#eee8e0]">
                      <td className={salesTd()}>
                        <span className="break-all text-[12px]">{id}</span>
                      </td>
                      <td className={salesTd()}>{providerLabel("RAZORPAY")}</td>
                      <td className={salesTd()}>
                        {formatSalesDate(String(r.settledAt ?? ""))}
                      </td>
                      <td className={`${salesTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(Number(r.grossInPaise ?? 0))}
                      </td>
                      <td className={`${salesTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(Number(r.feeInPaise ?? 0))}
                      </td>
                      <td className={`${salesTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(Number(r.netInPaise ?? 0))}
                      </td>
                      <td className={salesTd()}>
                        <AccountingStatusBadge tone={settlementStatusTone(String(r.status))}>
                          {settlementStatusLabel(String(r.status))}
                        </AccountingStatusBadge>
                      </td>
                      <td className={salesTd()}>
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                          onClick={() => void handleReview(id)}
                          disabled={loading || !id}
                        >
                          Review Settlement
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SalesTableWrap>
        )}
      </AccountingSectionCard>

      <AdminConfirmModal
        open={confirmOpen}
        title="Record settlement?"
        message="This clears the payment gateway balance and records the amount received into the selected bank account. Gateway fees are recorded where present."
        details={[
          `Provider: Razorpay`,
          `Settlement: ${displayId || settlementId}`,
          `Destination: ${destinationBank?.name ?? "Configured Razorpay destination"}`,
          `Net amount: ${formatInrPaise(net)}`
        ]}
        confirmLabel="Record Settlement"
        cancelLabel="Cancel"
        busy={loading}
        onConfirm={() => void handleRecord()}
        onClose={() => setConfirmOpen(false)}
      />
    </SalesPageShell>
  );
}
