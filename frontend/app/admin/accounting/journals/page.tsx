"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import {
  fetchAccountingJournalDetail,
  fetchAccountingJournals,
  formatInrPaise,
  type AccountingJournalDetail,
  type AccountingJournalEntry
} from "@/lib/accounting-api";
import {
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  AccountantPageShell,
  AccountantSkeleton,
  AccTableWrap,
  accountingInputClass,
  accTd,
  accTh,
  documentHref,
  humanizeDocumentType,
  humanizeJournalStatus,
  humanizePostingEvent,
  journalStatusTone,
  moneyClass,
  reportsGlHref,
  reportsTbHref
} from "@/components/admin/accounting/accountant/accountant-ui";

const PAGE_SIZE = 50;

export default function JournalEntriesPage() {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AccountingJournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detail, setDetail] = useState<AccountingJournalDetail | null>(null);
  const [techOpen, setTechOpen] = useState(false);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const offset = (nextPage - 1) * PAGE_SIZE;
      const data = await fetchAccountingJournals(PAGE_SIZE, offset);
      setItems(data.items);
      setTotal(data.total);
      setPage(nextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Journal entries could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const statuses = useMemo(() => {
    const set = new Set(items.map((j) => j.status.toUpperCase()));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((j) => {
      if (statusFilter !== "all" && j.status.toUpperCase() !== statusFilter) return false;
      const d = j.entryDate.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (!needle) return true;
      return (
        j.entryNumber.toLowerCase().includes(needle) ||
        (j.memo ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, q, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterActive = Boolean(q.trim() || statusFilter !== "all" || dateFrom || dateTo);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setTechOpen(false);
    setError(null);
    try {
      setDetail(await fetchAccountingJournalDetail(id));
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "Journal detail could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  }

  const sourceLabel = detail?.postingEvent
    ? humanizePostingEvent(detail.postingEvent.eventType)
    : "—";

  const balanced =
    detail != null && detail.totalDebitInPaise === detail.totalCreditInPaise;

  return (
    <AccountantPageShell
      title="Journal Entries"
      subtitle="Inspect posted accounting entries and their debit and credit lines."
      actions={
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(page)}
          className="rounded-md border border-[#ebe4db] bg-white px-3 py-1.5 text-xs font-semibold text-[#1c352a] hover:bg-[#faf5ec] disabled:opacity-50"
        >
          Refresh
        </button>
      }
    >
      {error ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-[#8a7060]">
        Journal entries are created by Sarveda&apos;s accounting workflows and are read-only once
        posted.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[200px] flex-1 text-xs font-semibold text-[#6b5c52]">
          Search
          <input
            className={accountingInputClass()}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Journal # or description"
          />
        </label>
        <label className="text-xs font-semibold text-[#6b5c52]">
          From
          <input
            type="date"
            className={accountingInputClass()}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-[#6b5c52]">
          To
          <input
            type="date"
            className={accountingInputClass()}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-[#6b5c52]">
          Status
          <select
            className={accountingInputClass()}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {humanizeJournalStatus(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filterActive ? (
        <p className="text-[11px] text-[#8a7060]">
          Filters apply to the current page of results ({items.length} loaded). Use pagination to
          load other pages.
        </p>
      ) : null}

      {loading ? <AccountantSkeleton rows={8} /> : null}

      {!loading ? (
        <AccountingSectionCard>
          <AccountingSectionHeader
            title="Entries"
            description={`${total.toLocaleString("en-IN")} total · showing page ${page}`}
            action={
              <div className="flex flex-wrap gap-3 text-xs font-semibold">
                <Link
                  href={reportsTbHref()}
                  className="text-[#1c352a] underline-offset-2 hover:underline"
                >
                  Trial Balance
                </Link>
                <Link
                  href={reportsGlHref("1010")}
                  className="text-[#1c352a] underline-offset-2 hover:underline"
                >
                  General Ledger
                </Link>
              </div>
            }
          />
          {filtered.length === 0 ? (
            <AccountingEmptyState title="No journal entries found for this period." />
          ) : (
            <AccTableWrap>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className={accTh()}>Date</th>
                    <th className={accTh()}>Journal #</th>
                    <th className={accTh()}>Description</th>
                    <th className={accTh(true)}>Debit</th>
                    <th className={accTh(true)}>Credit</th>
                    <th className={accTh()}>Status</th>
                    <th className={accTh()}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((j) => (
                    <tr
                      key={j.id}
                      className="border-t border-[#eee8e0] transition-colors hover:bg-[#faf5ec]/40"
                    >
                      <td className={accTd()}>{j.entryDate.slice(0, 10)}</td>
                      <td className={`${accTd()} font-mono text-[12px]`}>{j.entryNumber}</td>
                      <td className={accTd()}>
                        <span className="line-clamp-2">{j.memo ?? "—"}</span>
                      </td>
                      <td className={`${accTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(j.totalDebitInPaise)}
                      </td>
                      <td className={`${accTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(j.totalCreditInPaise)}
                      </td>
                      <td className={accTd()}>
                        <AccountingStatusBadge tone={journalStatusTone(j.status)}>
                          {humanizeJournalStatus(j.status)}
                        </AccountingStatusBadge>
                      </td>
                      <td className={accTd()}>
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                          onClick={() => void openDetail(j.id)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AccTableWrap>
          )}

          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={total}
            itemLabel="journal entries"
            onPrev={() => {
              if (page > 1) void load(page - 1);
            }}
            onNext={() => {
              if (page < totalPages) void load(page + 1);
            }}
          />
        </AccountingSectionCard>
      ) : null}

      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-black/30"
          role="presentation"
          onClick={() => {
            if (!detailLoading) setDetail(null);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Journal entry detail"
            className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[#ebe4db] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#ebe4db] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">
                  Journal Entry
                </p>
                <h2 className="mt-0.5 font-mono text-lg font-semibold text-[#1c352a]">
                  {detail?.entryNumber ?? (detailLoading ? "…" : "—")}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-md border border-[#ebe4db] px-2.5 py-1 text-xs font-medium text-[#6b5c52] hover:bg-[#faf5ec]"
                onClick={() => setDetail(null)}
                disabled={detailLoading}
              >
                Close
              </button>
            </div>

            {detailLoading ? (
              <div className="space-y-3 p-5 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-[#faf5ec]" />
                ))}
              </div>
            ) : detail ? (
              <div className="space-y-5 p-5">
                <dl className="grid gap-2.5 sm:grid-cols-2">
                  <Fact label="Date">{detail.entryDate.slice(0, 10)}</Fact>
                  <Fact label="Status">
                    <AccountingStatusBadge tone={journalStatusTone(detail.status)}>
                      {humanizeJournalStatus(detail.status)}
                    </AccountingStatusBadge>
                    {detail.status === "POSTED" ? (
                      <span className="mt-1 block text-[11px] text-[#8a7060]">
                        Posted journal entries are read-only.
                      </span>
                    ) : null}
                  </Fact>
                  <Fact label="Source">{sourceLabel}</Fact>
                  <Fact label="Description">{detail.memo ?? "—"}</Fact>
                </dl>

                {detail.documentLinks && detail.documentLinks.length > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-[#2c2420]">References</p>
                    <ul className="space-y-2">
                      {detail.documentLinks.map((link) => {
                        const href = documentHref(link.documentType, link.documentId);
                        return (
                          <li
                            key={link.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ebe4db] px-3 py-2 text-sm"
                          >
                            <span>
                              <span className="font-medium text-[#2c2420]">
                                {humanizeDocumentType(link.documentType)}
                              </span>
                              <span className="mt-0.5 block font-mono text-[11px] text-[#8a7060]">
                                {link.documentId.length > 12
                                  ? `${link.documentId.slice(0, 8)}…`
                                  : link.documentId}
                              </span>
                            </span>
                            {href ? (
                              <Link
                                href={href}
                                className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                              >
                                View related screen
                              </Link>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-sm font-semibold text-[#2c2420]">Accounting Entry</p>
                  <AccTableWrap>
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className={accTh()}>Account</th>
                          <th className={accTh(true)}>Debit</th>
                          <th className={accTh(true)}>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line) => (
                          <tr key={line.id} className="border-t border-[#eee8e0]">
                            <td className={accTd()}>
                              <div className="font-medium text-[#2c2420]">{line.account.name}</div>
                              <div className="mt-0.5 font-mono text-[11px] text-[#8a7060]">
                                {line.account.code}
                              </div>
                              {line.lineMemo ? (
                                <div className="mt-0.5 text-[11px] text-[#8a7060]">
                                  {line.lineMemo}
                                </div>
                              ) : null}
                            </td>
                            <td className={`${accTd(true)} ${moneyClass()}`}>
                              {line.debitInPaise ? formatInrPaise(line.debitInPaise) : "—"}
                            </td>
                            <td className={`${accTd(true)} ${moneyClass()}`}>
                              {line.creditInPaise ? formatInrPaise(line.creditInPaise) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#e0d8ce] bg-[#faf5ec]/60">
                          <td className={`${accTd()} font-semibold`}>Total</td>
                          <td className={`${accTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(detail.totalDebitInPaise)}
                          </td>
                          <td className={`${accTd(true)} ${moneyClass()}`}>
                            {formatInrPaise(detail.totalCreditInPaise)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </AccTableWrap>
                  <p className="mt-2 text-xs text-[#6b5c52]">
                    {balanced ? "Entry is balanced." : "Debit and credit totals differ."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-xs font-semibold">
                  {detail.lines[0]?.account.code ? (
                    <Link
                      href={reportsGlHref(detail.lines[0].account.code)}
                      className="text-[#1c352a] underline-offset-2 hover:underline"
                    >
                      View in General Ledger
                    </Link>
                  ) : null}
                  <Link
                    href={reportsTbHref()}
                    className="text-[#1c352a] underline-offset-2 hover:underline"
                  >
                    View Trial Balance
                  </Link>
                </div>

                <details
                  className="rounded-lg border border-[#ebe4db] px-3 py-2"
                  open={techOpen}
                  onToggle={(e) => setTechOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="cursor-pointer text-xs font-medium text-[#8a7060]">
                    Technical details
                  </summary>
                  <dl className="mt-2 space-y-1.5 text-[11px] text-[#6b5c52]">
                    <div>
                      Journal ID: <span className="font-mono">{detail.id}</span>
                    </div>
                    {detail.postingEvent ? (
                      <>
                        <div>
                          Event type:{" "}
                          <span className="font-mono">{detail.postingEvent.eventType}</span>
                        </div>
                        <div>
                          Event ID:{" "}
                          <span className="font-mono">{detail.postingEvent.id}</span>
                        </div>
                      </>
                    ) : null}
                  </dl>
                </details>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </AccountantPageShell>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#ebe4db] bg-[#faf5ec] px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[#8a7060]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-[#2c2420]">{children}</dd>
    </div>
  );
}
