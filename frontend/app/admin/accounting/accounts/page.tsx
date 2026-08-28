"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAccountingAccounts,
  type AccountingAccountRow
} from "@/lib/accounting-api";
import {
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  AccountantPageShell,
  AccountantSkeleton,
  AccTableWrap,
  accountingInputClass,
  accTd,
  accTh,
  humanizeAccountType,
  reportsGlHref
} from "@/components/admin/accounting/accountant/accountant-ui";

export default function ChartOfAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountingAccountRow[]>([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selected, setSelected] = useState<AccountingAccountRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAccountingAccounts();
      setAccounts(data.accounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accounts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const types = useMemo(() => {
    const set = new Set(accounts.map((a) => a.type.toUpperCase()));
    return Array.from(set).sort();
  }, [accounts]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of accounts) {
      const t = a.type.toUpperCase();
      c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [accounts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter !== "all" && a.type.toUpperCase() !== typeFilter) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        a.code.toLowerCase().includes(needle)
      );
    });
  }, [accounts, q, typeFilter]);

  return (
    <AccountantPageShell
      title="Chart of Accounts"
      subtitle="Review the ledger accounts used by Sarveda's accounting system."
      actions={
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
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
      {loading ? <AccountantSkeleton /> : null}

      {!loading ? (
        <>
          <p className="text-xs leading-relaxed text-[#8a7060]">
            Accounts are maintained by Sarveda&apos;s accounting system and are shown here for
            reference.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <AccountingMetricCard label="Total Accounts" value={String(accounts.length)} />
            <AccountingMetricCard
              label="Assets"
              value={String(counts.ASSET ?? 0)}
            />
            <AccountingMetricCard
              label="Liabilities"
              value={String(counts.LIABILITY ?? 0)}
            />
            <AccountingMetricCard
              label="Income"
              value={String((counts.INCOME ?? 0) + (counts.REVENUE ?? 0))}
            />
            <AccountingMetricCard
              label="Expenses"
              value={String((counts.EXPENSE ?? 0) + (counts.COGS ?? 0))}
            />
            <AccountingMetricCard
              label="Equity"
              value={String(counts.EQUITY ?? 0)}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-xs font-semibold text-[#6b5c52]">
              Search
              <input
                className={accountingInputClass()}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Account name or code"
              />
            </label>
            <label className="text-xs font-semibold text-[#6b5c52]">
              Type
              <select
                className={accountingInputClass()}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All types</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {humanizeAccountType(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <AccountingSectionCard>
            <AccountingSectionHeader
              title="Accounts"
              description={`${filtered.length} account${filtered.length === 1 ? "" : "s"}`}
            />
            {filtered.length === 0 ? (
              <AccountingEmptyState title="No accounts found for the selected filters." />
            ) : (
              <AccTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={accTh()}>Account</th>
                      <th className={accTh()}>Type</th>
                      <th className={accTh()}>System</th>
                      <th className={accTh()}>Status</th>
                      <th className={accTh()}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr
                        key={a.id}
                        className="border-t border-[#eee8e0] transition-colors hover:bg-[#faf5ec]/40"
                      >
                        <td className={accTd()}>
                          <div className="font-semibold text-[#2c2420]">{a.name}</div>
                          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[#8a7060]">
                            {a.code}
                          </div>
                        </td>
                        <td className={accTd()}>{humanizeAccountType(a.type)}</td>
                        <td className={accTd()}>{a.isSystem ? "System" : "Custom"}</td>
                        <td className={accTd()}>
                          <AccountingStatusBadge tone={a.isActive ? "success" : "neutral"}>
                            {a.isActive ? "Active" : "Inactive"}
                          </AccountingStatusBadge>
                        </td>
                        <td className={accTd()}>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                              onClick={() => setSelected(a)}
                            >
                              View
                            </button>
                            <Link
                              href={reportsGlHref(a.code)}
                              className="text-xs font-medium text-[#8a7060] underline-offset-2 hover:text-[#1c352a] hover:underline"
                            >
                              General Ledger →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AccTableWrap>
            )}
          </AccountingSectionCard>

          {selected ? (
            <AccountingSectionCard>
              <AccountingSectionHeader
                title={selected.name}
                description={`Code ${selected.code}`}
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
              <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <Fact label="Code">{selected.code}</Fact>
                <Fact label="Type">{humanizeAccountType(selected.type)}</Fact>
                <Fact label="Status">{selected.isActive ? "Active" : "Inactive"}</Fact>
                <Fact label="System account">{selected.isSystem ? "Yes" : "No"}</Fact>
                {selected.currency ? <Fact label="Currency">{selected.currency}</Fact> : null}
              </dl>
              <p className="mt-3">
                <Link
                  href={reportsGlHref(selected.code)}
                  className="text-sm font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                >
                  Open in General Ledger →
                </Link>
              </p>
            </AccountingSectionCard>
          ) : null}
        </>
      ) : null}
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
