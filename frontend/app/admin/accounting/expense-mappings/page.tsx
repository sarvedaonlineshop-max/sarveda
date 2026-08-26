"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchExpenseMappings,
  patchExpenseAccountMappingApi,
  patchExpensePaymentMappingApi,
  upsertExpenseAccountMappingApi,
  upsertExpensePaymentMappingApi
} from "@/lib/accounting-api";
import { AdminAccountingHeader, AdminAccountingNav } from "@/components/admin/accounting/AdminAccountingNav";

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
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Expense Account / Payment Mappings"
        subtitle="Free-text Expense.expenseAccount and paidThrough are not GL authority. Map to EXPENSE CoA and 1000/1010 before posting."
      />
      <AdminAccountingNav />
      {err ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 border border-neutral-200 p-4">
          <h2 className="font-medium text-[#1e3a2f]">Map expense account</h2>
          <input
            className="w-full border px-2 py-1.5 text-sm"
            placeholder="Source free-text"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />
          <select className="w-full border px-2 py-1.5 text-sm" value={coa} onChange={(e) => setCoa(e.target.value)}>
            {["5300", "5310", "5320", "5330", "5340", "5350", "5360", "5370", "5380"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !sourceName.trim()}
            className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-sm text-white disabled:opacity-50"
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
            Save account mapping
          </button>
        </div>
        <div className="space-y-2 border border-neutral-200 p-4">
          <h2 className="font-medium text-[#1e3a2f]">Map paidThrough</h2>
          <input
            className="w-full border px-2 py-1.5 text-sm"
            placeholder="Source free-text"
            value={paidSource}
            onChange={(e) => setPaidSource(e.target.value)}
          />
          <select
            className="w-full border px-2 py-1.5 text-sm"
            value={paidCode}
            onChange={(e) => setPaidCode(e.target.value as "1000" | "1010")}
          >
            <option value="1000">1000 Cash</option>
            <option value="1010">1010 Bank</option>
          </select>
          <button
            type="button"
            disabled={busy || !paidSource.trim()}
            className="rounded-md bg-[#1e3a2f] px-3 py-1.5 text-sm text-white disabled:opacity-50"
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
            Save payment mapping
          </button>
        </div>
      </section>

      {data ? (
        <>
          <section className="border border-neutral-200 p-4 text-sm">
            <h2 className="mb-2 font-medium text-[#1e3a2f]">Account mappings</h2>
            <ul className="space-y-1">
              {data.accounts.map((a) => (
                <li key={String(a.id)} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{String(a.normalizedSourceName)}</span>→
                  <span>{String(a.accountingAccountCode)}</span>
                  <span className="text-neutral-500">({String(a.expenseRowCount)} rows)</span>
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() =>
                      void patchExpenseAccountMappingApi(String(a.id), !a.isActive).then(load)
                    }
                  >
                    {a.isActive ? "Disable" : "Enable"}
                  </button>
                </li>
              ))}
            </ul>
            <h3 className="mb-1 mt-4 font-medium">Unmapped accounts</h3>
            <ul className="text-xs text-amber-800">
              {data.unmappedAccounts.map((u) => (
                <li key={String(u.expenseAccount)}>
                  {String(u.expenseAccount)} ({String(u.count)})
                </li>
              ))}
            </ul>
          </section>
          <section className="border border-neutral-200 p-4 text-sm">
            <h2 className="mb-2 font-medium text-[#1e3a2f]">Payment mappings</h2>
            <ul className="space-y-1">
              {data.payments.map((a) => (
                <li key={String(a.id)} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{String(a.normalizedSourceName)}</span>→
                  <span>{String(a.paidAccountCode)}</span>
                  <span className="text-neutral-500">({String(a.expenseRowCount)} rows)</span>
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() =>
                      void patchExpensePaymentMappingApi(String(a.id), !a.isActive).then(load)
                    }
                  >
                    {a.isActive ? "Disable" : "Enable"}
                  </button>
                </li>
              ))}
            </ul>
            <h3 className="mb-1 mt-4 font-medium">Unmapped paidThrough</h3>
            <ul className="text-xs text-amber-800">
              {data.unmappedPayments.map((u) => (
                <li key={String(u.paidThrough)}>
                  {String(u.paidThrough)} ({String(u.count)})
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
