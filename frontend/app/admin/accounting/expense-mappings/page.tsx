"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchExpenseMappings,
  patchExpenseAccountMappingApi,
  patchExpensePaymentMappingApi,
  upsertExpenseAccountMappingApi,
  upsertExpensePaymentMappingApi
} from "@/lib/accounting-api";
import {
  AdvancedPageShell,
  AdvancedSection,
  AdvancedWarning
} from "@/components/admin/accounting/advanced/advanced-ui";
import {
  accountingButtonClass,
  accountingInputClass
} from "@/components/admin/accounting/accounting-ui";
import {
  EXPENSE_COA_OPTIONS,
  PAYMENT_COA_OPTIONS,
  expenseCoaLabel
} from "@/components/admin/accounting/presentation";

export default function ExpenseMappingsPage() {
  const [data, setData] = useState<{
    accounts: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    unmappedAccounts: Array<Record<string, unknown>>;
    unmappedPayments: Array<Record<string, unknown>>;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [coa, setCoa] = useState("5380");
  const [paidSource, setPaidSource] = useState("");
  const [paidCode, setPaidCode] = useState<"1000" | "1010">("1010");

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      setData(await fetchExpenseMappings());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load expense rules.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdvancedPageShell
      title="Expense Account Rules"
      subtitle="When an expense category is recorded, choose which ledger account it should use."
    >
      <AdvancedWarning>
        These rules affect future accounting entries. Review carefully before enabling or changing
        mappings.
      </AdvancedWarning>

      {err ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <AdvancedSection title="Map expense category">
          <p className="mb-3 text-xs text-[#8a7060]">
            When this expense description is recorded, use this accounting account.
          </p>
          <label className="block text-xs font-semibold text-[#6b5c52]">
            Expense description
            <input
              className={`${accountingInputClass()} mt-1`}
              placeholder="e.g. Office supplies"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-[#6b5c52]">
            Accounting account
            <select
              className={`${accountingInputClass()} mt-1`}
              value={coa}
              onChange={(e) => setCoa(e.target.value)}
            >
              {EXPENSE_COA_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !sourceName.trim()}
            className={`${accountingButtonClass("primary")} mt-3`}
            onClick={() =>
              void (async () => {
                await upsertExpenseAccountMappingApi({
                  sourceName: sourceName.trim(),
                  accountingAccountCode: coa
                });
                setSourceName("");
                await load();
              })()
            }
          >
            Save rule
          </button>
        </AdvancedSection>

        <AdvancedSection title="Map payment method">
          <p className="mb-3 text-xs text-[#8a7060]">
            When this payment method is used, credit this cash or bank account.
          </p>
          <label className="block text-xs font-semibold text-[#6b5c52]">
            Payment description
            <input
              className={`${accountingInputClass()} mt-1`}
              placeholder="e.g. Company card"
              value={paidSource}
              onChange={(e) => setPaidSource(e.target.value)}
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-[#6b5c52]">
            Cash or bank account
            <select
              className={`${accountingInputClass()} mt-1`}
              value={paidCode}
              onChange={(e) => setPaidCode(e.target.value as "1000" | "1010")}
            >
              {PAYMENT_COA_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !paidSource.trim()}
            className={`${accountingButtonClass("primary")} mt-3`}
            onClick={() =>
              void (async () => {
                await upsertExpensePaymentMappingApi({
                  sourceName: paidSource.trim(),
                  paidAccountCode: paidCode
                });
                setPaidSource("");
                await load();
              })()
            }
          >
            Save rule
          </button>
        </AdvancedSection>
      </div>

      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdvancedSection title="Expense category rules">
            <ul className="space-y-2 text-sm">
              {data.accounts.map((a) => (
                <li
                  key={String(a.id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ebe4db] px-3 py-2"
                >
                  <div>
                    <div className="font-medium text-[#2c2420]">{String(a.normalizedSourceName)}</div>
                    <div className="text-[13px] text-[#2c2420]">
                      {expenseCoaLabel(String(a.accountingAccountCode))}
                    </div>
                    <div className="font-mono text-[11px] text-[#8a7060]">
                      {String(a.accountingAccountCode)} · {String(a.expenseRowCount)} expenses
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                    onClick={() =>
                      void patchExpenseAccountMappingApi(String(a.id), !a.isActive).then(load)
                    }
                  >
                    {a.isActive ? "Disable" : "Enable"}
                  </button>
                </li>
              ))}
              {data.accounts.length === 0 ? (
                <li className="text-sm text-[#8a7060]">No expense category rules yet.</li>
              ) : null}
            </ul>
            {data.unmappedAccounts.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-amber-900">Unmapped categories</p>
                <ul className="mt-1 space-y-1 text-xs text-amber-800">
                  {data.unmappedAccounts.map((u) => (
                    <li key={String(u.expenseAccount)}>
                      {String(u.expenseAccount)} ({String(u.count)})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </AdvancedSection>

          <AdvancedSection title="Payment method rules">
            <ul className="space-y-2 text-sm">
              {data.payments.map((a) => (
                <li
                  key={String(a.id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ebe4db] px-3 py-2"
                >
                  <div>
                    <div className="font-medium text-[#2c2420]">{String(a.normalizedSourceName)}</div>
                    <div className="text-[13px] text-[#2c2420]">
                      {expenseCoaLabel(String(a.paidAccountCode))}
                    </div>
                    <div className="font-mono text-[11px] text-[#8a7060]">
                      {String(a.paidAccountCode)} · {String(a.expenseRowCount)} expenses
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                    onClick={() =>
                      void patchExpensePaymentMappingApi(String(a.id), !a.isActive).then(load)
                    }
                  >
                    {a.isActive ? "Disable" : "Enable"}
                  </button>
                </li>
              ))}
              {data.payments.length === 0 ? (
                <li className="text-sm text-[#8a7060]">No payment method rules yet.</li>
              ) : null}
            </ul>
            {data.unmappedPayments.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-amber-900">Unmapped payment methods</p>
                <ul className="mt-1 space-y-1 text-xs text-amber-800">
                  {data.unmappedPayments.map((u) => (
                    <li key={String(u.paidThrough)}>
                      {String(u.paidThrough)} ({String(u.count)})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </AdvancedSection>
        </div>
      ) : null}
    </AdvancedPageShell>
  );
}
