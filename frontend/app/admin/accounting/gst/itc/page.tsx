"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  blockItc,
  discoverItc,
  fetchGstStatus,
  fetchItcEvidence,
  fetchItcList,
  fetchItcSummary,
  formatInrPaise,
  verifyItc,
  type ItcEvidenceRow,
  type ItcSummary
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  GstPageShell,
  GstSkeleton,
  GstTableWrap,
  GstUnavailableState,
  MonthFilter,
  accountingButtonClass,
  accountingInputClass,
  currentGstMonth,
  fieldLabelClass,
  gstStatusTone,
  gstTd,
  gstTh,
  humanizeGstStatus,
  moneyClass
} from "@/components/admin/accounting/gst/gst-ui";

type StatusFilter = "all" | "UNVERIFIED_PENDING_TAX_INVOICE" | "ELIGIBLE" | "BLOCKED" | "DATA_GAP";

type PendingAction =
  | { kind: "discover" }
  | { kind: "verify" | "block"; row: ItcEvidenceRow; reason: string };

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "UNVERIFIED_PENDING_TAX_INVOICE", label: "Awaiting verification" },
  { id: "ELIGIBLE", label: "Eligible" },
  { id: "BLOCKED", label: "Blocked" },
  { id: "DATA_GAP", label: "Needs review" }
];

export default function GstItcPage() {
  const [month, setMonth] = useState(currentGstMonth);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [itcEnabled, setItcEnabled] = useState(false);
  const [summary, setSummary] = useState<ItcSummary | null>(null);
  const [rows, setRows] = useState<ItcEvidenceRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<ItcEvidenceRow | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await fetchGstStatus();
      setGstEnabled(st.gstEnabled);
      const enabled = Boolean(st.itcVerificationEnabled ?? st.itcEligibleWorkflow);
      setItcEnabled(enabled);
      if (!st.gstEnabled || !enabled) return;
      setSummary(await fetchItcSummary(month));
      const list = await fetchItcList({ month, limit: 80 });
      setRows(list.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ITC could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  async function openDetail(id: string) {
    setBusy(true);
    try {
      setSelected(await fetchItcEvidence(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load detail.");
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (pending.kind === "discover") {
        const res = await discoverItc({ limit: 100 });
        setMessage(
          `Reviewed ${res.scanned} source${res.scanned === 1 ? "" : "s"} · ${res.created} new · ${res.updated} updated`
        );
      } else if (pending.kind === "verify") {
        const reason = pending.reason.trim();
        if (!reason) {
          setError("A verification note is required.");
          return;
        }
        const updated = await verifyItc(pending.row.id, reason);
        setSelected(updated);
        setMessage("Marked eligible for claimability.");
      } else {
        const reason = pending.reason.trim();
        if (!reason) {
          setError("A reason is required.");
          return;
        }
        const updated = await blockItc(pending.row.id, reason);
        setSelected(updated);
        setMessage("Blocked for claimability.");
      }
      setPending(null);
      setReasonDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const confirmTitle =
    pending?.kind === "discover"
      ? "Find ITC evidence?"
      : pending?.kind === "verify"
        ? "Mark ITC as eligible?"
        : pending?.kind === "block"
          ? "Block ITC claimability?"
          : "";

  const confirmMessage =
    pending?.kind === "discover"
      ? "This scans recent purchases and expenses and updates ITC evidence records. It does not change the accounting ledger."
      : pending?.kind === "verify"
        ? "This updates ITC claimability status only. It does not change Input GST ledger balances."
        : pending?.kind === "block"
          ? "This blocks claimability for this evidence. It does not change Input GST ledger balances."
          : "";

  return (
    <GstPageShell
      title="Purchase GST / ITC"
      subtitle="Review input tax credit evidence and claimability status."
      actions={
        <div className="flex flex-wrap items-end gap-3">
          <MonthFilter month={month} onChange={setMonth} disabled={loading || busy} />
          <button
            type="button"
            disabled={loading || busy || !itcEnabled}
            onClick={() => void load()}
            className="rounded-md border border-[#ebe4db] bg-white px-3 py-1.5 text-xs font-semibold text-[#1c352a] hover:bg-[#faf5ec] disabled:opacity-50"
          >
            Refresh
          </button>
          {itcEnabled ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setPending({ kind: "discover" })}
              className={accountingButtonClass("primary", true)}
            >
              Find ITC Evidence
            </button>
          ) : null}
        </div>
      }
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {message ? <AccountingAlert tone="success">{message}</AccountingAlert> : null}
      {loading ? <GstSkeleton /> : null}

      {!loading && !gstEnabled ? <GstUnavailableState /> : null}

      {!loading && gstEnabled && !itcEnabled ? (
        <AccountingEmptyState
          title="ITC review is not available"
          description="Input tax credit verification is not enabled for this environment."
        />
      ) : null}

      {!loading && gstEnabled && itcEnabled ? (
        <>
          <p className="text-xs leading-relaxed text-[#8a7060]">
            Verify and Block update claimability evidence only — posted Input GST balances are
            unchanged.
          </p>

          {summary ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <AccountingMetricCard
                label="Recognised in ledger"
                value={formatInrPaise(summary.recognizedInputGst.totalGstInPaise)}
                hint={`${summary.recognizedInputGst.count} item(s)`}
              />
              <AccountingMetricCard
                label="Eligible (claimability)"
                value={formatInrPaise(summary.eligibleInputGst.totalGstInPaise)}
                hint={`${summary.eligibleInputGst.count} item(s)`}
              />
              <AccountingMetricCard
                label="Awaiting verification"
                value={formatInrPaise(summary.unverifiedInputGst.totalGstInPaise)}
                hint={`${summary.unverifiedInputGst.count} item(s)`}
              />
              <AccountingMetricCard
                label="Blocked"
                value={formatInrPaise(summary.blockedInputGst.totalGstInPaise)}
                hint={`${summary.blockedInputGst.count} item(s)`}
              />
              <AccountingMetricCard
                label="Needs review"
                value={formatInrPaise(summary.dataGapInputGst.totalGstInPaise)}
                hint={`${summary.dataGapInputGst.count} item(s)`}
              />
              <AccountingMetricCard
                label="Payment fee tax"
                value={formatInrPaise(summary.gatewayProvisionalGst.totalGstInPaise)}
                hint="Not treated as input tax credit"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${
                    active
                      ? "bg-[#1c352a] text-white"
                      : "border border-[#ebe4db] bg-white text-[#8a7060] hover:bg-[#faf5ec]"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <AccountingSectionCard>
            <AccountingSectionHeader title="ITC worklist" />
            {filtered.length === 0 ? (
              <AccountingEmptyState title="No ITC evidence for this filter" />
            ) : (
              <GstTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={gstTh()}>Source</th>
                      <th className={gstTh()}>Document</th>
                      <th className={gstTh()}>Supplier</th>
                      <th className={gstTh()}>GSTIN</th>
                      <th className={gstTh(true)}>Taxable</th>
                      <th className={gstTh(true)}>Total GST</th>
                      <th className={gstTh()}>Status</th>
                      <th className={gstTh()}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr
                        key={r.id}
                        className="border-t border-[#eee8e0] transition-colors hover:bg-[#faf5ec]/40"
                      >
                        <td className={gstTd()}>{humanizeGstStatus(r.sourceType)}</td>
                        <td className={gstTd()}>{r.documentReference ?? "—"}</td>
                        <td className={gstTd()}>{r.supplierName ?? "—"}</td>
                        <td className={gstTd()}>{r.supplierGstin ?? "—"}</td>
                        <td className={`${gstTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(r.taxableValueInPaise)}
                        </td>
                        <td className={`${gstTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(r.totalGstInPaise)}
                        </td>
                        <td className={gstTd()}>
                          <AccountingStatusBadge tone={gstStatusTone(r.status)}>
                            {humanizeGstStatus(r.status)}
                          </AccountingStatusBadge>
                        </td>
                        <td className={gstTd()}>
                          <ItcRowActions
                            row={r}
                            menuOpen={menuFor === r.id}
                            onToggleMenu={() =>
                              setMenuFor((cur) => (cur === r.id ? null : r.id))
                            }
                            onCloseMenu={() => setMenuFor(null)}
                            onView={() => {
                              setMenuFor(null);
                              void openDetail(r.id);
                            }}
                            onVerify={() => {
                              setMenuFor(null);
                              setReasonDraft("");
                              setPending({ kind: "verify", row: r, reason: "" });
                            }}
                            onBlock={() => {
                              setMenuFor(null);
                              setReasonDraft("");
                              setPending({ kind: "block", row: r, reason: "" });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GstTableWrap>
            )}
          </AccountingSectionCard>

          {selected ? (
            <AccountingSectionCard>
              <AccountingSectionHeader
                title="Evidence detail"
                action={
                  <button
                    type="button"
                    className="text-xs text-[#8a7060] underline-offset-2 hover:underline"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                }
              />
              <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Source">{humanizeGstStatus(selected.sourceType)}</Detail>
                <Detail label="Document">{selected.documentReference ?? "—"}</Detail>
                <Detail label="Supplier">{selected.supplierName ?? "—"}</Detail>
                <Detail label="Supplier GSTIN">{selected.supplierGstin ?? "—"}</Detail>
                <Detail label="Document date">
                  {selected.documentDate ? String(selected.documentDate).slice(0, 10) : "—"}
                </Detail>
                <Detail label="Status">{humanizeGstStatus(selected.status)}</Detail>
                <Detail label="Taxable value" money>
                  {formatInrPaise(selected.taxableValueInPaise)}
                </Detail>
                <Detail label="CGST" money>
                  {formatInrPaise(selected.cgstInPaise)}
                </Detail>
                <Detail label="SGST" money>
                  {formatInrPaise(selected.sgstInPaise)}
                </Detail>
                <Detail label="IGST" money>
                  {formatInrPaise(selected.igstInPaise)}
                </Detail>
                <Detail label="Total GST" money>
                  {formatInrPaise(selected.totalGstInPaise)}
                </Detail>
                <Detail label="In Input GST ledger">
                  {selected.recognizedInInputGl ? "Yes" : "No"}
                </Detail>
                {selected.verificationNotes ? (
                  <Detail label="Notes">{selected.verificationNotes}</Detail>
                ) : null}
              </dl>
              {selected.statusHistory && selected.statusHistory.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-[#2c2420]">Status history</p>
                  <ul className="space-y-1.5 text-sm text-[#6b5c52]">
                    {selected.statusHistory.slice(0, 8).map((h) => (
                      <li key={h.id} className="rounded-lg border border-[#ebe4db] px-3 py-2">
                        {humanizeGstStatus(h.oldStatus)} → {humanizeGstStatus(h.newStatus)}
                        {h.reason ? ` · ${h.reason}` : ""}
                        <span className="mt-0.5 block text-[11px] text-[#8a7060]">
                          {h.createdAt ? String(h.createdAt).slice(0, 19).replace("T", " ") : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </AccountingSectionCard>
          ) : null}
        </>
      ) : null}

      {pending && (pending.kind === "verify" || pending.kind === "block") ? (
        <div className="fixed inset-0 z-[99] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-[#ebe4db] bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[#2c2420]">{confirmTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#6b5c52]">{confirmMessage}</p>
            <p className="mt-2 text-xs text-[#8a7060]">
              {pending.row.supplierName ?? "Supplier"} ·{" "}
              {formatInrPaise(pending.row.totalGstInPaise)} GST
            </p>
            <label className="mt-4 block">
              <span className={fieldLabelClass()}>
                {pending.kind === "verify" ? "Verification note" : "Reason"} (required)
              </span>
              <textarea
                className={`${accountingInputClass()} mt-1 min-h-[88px]`}
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                disabled={busy}
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                className={accountingButtonClass("secondary", true)}
                onClick={() => {
                  setPending(null);
                  setReasonDraft("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !reasonDraft.trim()}
                className={accountingButtonClass(
                  pending.kind === "block" ? "danger" : "primary",
                  true
                )}
                onClick={() => {
                  setPending({ ...pending, reason: reasonDraft });
                  void (async () => {
                    const next = { ...pending, reason: reasonDraft };
                    setPending(next);
                    setBusy(true);
                    setError(null);
                    try {
                      if (next.kind === "verify") {
                        const updated = await verifyItc(next.row.id, reasonDraft.trim());
                        setSelected(updated);
                        setMessage("Marked eligible for claimability.");
                      } else if (next.kind === "block") {
                        const updated = await blockItc(next.row.id, reasonDraft.trim());
                        setSelected(updated);
                        setMessage("Blocked for claimability.");
                      }
                      setPending(null);
                      setReasonDraft("");
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Action failed.");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                {busy ? "Working…" : pending.kind === "verify" ? "Confirm Verify" : "Confirm Block"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminConfirmModal
        open={pending?.kind === "discover"}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Find Evidence"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={() => void runConfirm()}
        onClose={() => setPending(null)}
      />
    </GstPageShell>
  );
}

function Detail({
  label,
  children,
  money
}: {
  label: string;
  children: React.ReactNode;
  money?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#ebe4db] bg-[#faf5ec] px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[#8a7060]">{label}</dt>
      <dd className={`mt-1 text-sm ${money ? moneyClass() : "font-semibold text-[#2c2420]"}`}>
        {children}
      </dd>
    </div>
  );
}

function ItcRowActions({
  row,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onView,
  onVerify,
  onBlock
}: {
  row: ItcEvidenceRow;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onView: () => void;
  onVerify: () => void;
  onBlock: () => void;
}) {
  const canVerify = row.status !== "ELIGIBLE" && row.status !== "BLOCKED";
  const canBlock = row.status !== "BLOCKED";
  const showMore = canVerify || canBlock;

  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
        onClick={onView}
      >
        View
      </button>
      {showMore ? (
        <div className="relative">
          <button
            type="button"
            className="rounded border border-[#ebe4db] px-2 py-0.5 text-[11px] font-medium text-[#6b5c52] hover:bg-[#faf5ec]"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
          >
            More
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 min-w-[140px] rounded-lg border border-[#ebe4db] bg-white py-1 shadow-md"
            >
              {canVerify ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-xs font-medium text-[#1c352a] hover:bg-[#faf5ec]"
                  onClick={onVerify}
                >
                  Verify
                </button>
              ) : null}
              {canBlock ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-xs font-medium text-[#8a4030] hover:bg-[#faf5ec]"
                  onClick={onBlock}
                >
                  Block
                </button>
              ) : null}
              <button
                type="button"
                className="sr-only"
                onClick={onCloseMenu}
                tabIndex={-1}
              >
                Close
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
