"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchBills,
  fetchPurchasesVendors,
  formatInrPaise,
  patchPurchasesVendor,
  postPurchasesVendor,
  type VendorRow
} from "@/lib/purchases-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingSectionCard,
  AccountingStatusBadge,
  FormSection,
  PurchasesFilterBar,
  PurchasesPageShell,
  PurchasesTableWrap,
  accountingButtonClass,
  accountingInputClass,
  fieldLabelClass,
  purchasesTd,
  purchasesTh
} from "@/components/admin/purchases/purchases-ui";

function VendorForm({
  initial,
  onSave,
  onCancel,
  busy
}: {
  initial?: VendorRow | null;
  onSave: (draft: Partial<VendorRow> & { name: string }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [gstin, setGstin] = useState(initial?.gstin ?? "");
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? "Due on Receipt");
  const [billingCity, setBillingCity] = useState(initial?.billingCity ?? "");
  const [billingState, setBillingState] = useState(initial?.billingState ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  return (
    <FormSection
      title={initial ? "Edit Vendor" : "New Vendor"}
      description="Supplier details used across purchase orders, bills and payments."
    >
      <label className={fieldLabelClass()}>
        Vendor name *
        <input className={accountingInputClass()} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={fieldLabelClass()}>
        GSTIN
        <input className={accountingInputClass()} value={gstin} onChange={(e) => setGstin(e.target.value)} />
      </label>
      <label className={fieldLabelClass()}>
        Email
        <input className={accountingInputClass()} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className={fieldLabelClass()}>
        Phone
        <input className={accountingInputClass()} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className={fieldLabelClass()}>
        Payment terms
        <input
          className={accountingInputClass()}
          value={paymentTerms}
          onChange={(e) => setPaymentTerms(e.target.value)}
        />
      </label>
      <label className={fieldLabelClass()}>
        City
        <input
          className={accountingInputClass()}
          value={billingCity}
          onChange={(e) => setBillingCity(e.target.value)}
        />
      </label>
      <label className={fieldLabelClass()}>
        State
        <input
          className={accountingInputClass()}
          value={billingState}
          onChange={(e) => setBillingState(e.target.value)}
        />
      </label>
      <label className={`flex items-center gap-2 pt-6 text-sm text-[#2c2420]`}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active vendor
      </label>
      <label className={`${fieldLabelClass()} sm:col-span-2`}>
        Notes
        <textarea
          className={`${accountingInputClass()} h-auto min-h-[4.5rem] py-2`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            void onSave({
              name: name.trim(),
              email: email.trim() || null,
              phone: phone.trim() || null,
              gstin: gstin.trim() || null,
              paymentTerms: paymentTerms.trim() || null,
              billingCity: billingCity.trim() || null,
              billingState: billingState.trim() || null,
              notes: notes.trim() || null,
              isActive
            })
          }
          className={accountingButtonClass("primary")}
        >
          {busy ? "Saving…" : "Save Vendor"}
        </button>
        <button type="button" onClick={onCancel} className={accountingButtonClass("secondary")}>
          Cancel
        </button>
      </div>
    </FormSection>
  );
}

export default function PurchasesVendorsPage() {
  const [items, setItems] = useState<VendorRow[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<number | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchPurchasesVendors({ q: q.trim() || undefined });
      setItems(data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load vendors");
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    void (async () => {
      try {
        const bills = await fetchBills();
        setOutstanding(bills.summary.outstandingInPaise);
        setOverdue(bills.summary.overdueInPaise);
      } catch {
        /* optional AP summary */
      }
    })();
  }, []);

  const activeCount = useMemo(() => items.filter((v) => v.isActive).length, [items]);

  async function handleSave(draft: Partial<VendorRow> & { name: string }) {
    setBusy(true);
    setErr(null);
    try {
      if (editing) await patchPurchasesVendor(editing.id, draft);
      else await postPurchasesVendor(draft);
      setEditing(null);
      setCreating(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PurchasesPageShell
      title="Vendors"
      subtitle="Manage suppliers, payment terms and outstanding balances."
      actions={
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
          className={accountingButtonClass("primary")}
        >
          + New Vendor
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AccountingMetricCard label="Total Vendors" value={String(items.length)} hint="In current list" />
        <AccountingMetricCard label="Active Vendors" value={String(activeCount)} hint="Marked active" />
        {outstanding != null ? (
          <AccountingMetricCard
            label="Outstanding Payables"
            value={formatInrPaise(outstanding)}
            hint="Open vendor bills"
          />
        ) : null}
        {overdue != null ? (
          <AccountingMetricCard
            label="Overdue Payables"
            value={formatInrPaise(overdue)}
            hint="Past due date"
          />
        ) : null}
      </div>

      <PurchasesFilterBar>
        <label className={fieldLabelClass()}>
          Search
          <input
            className={accountingInputClass()}
            placeholder="Vendor, GSTIN, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </PurchasesFilterBar>

      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}

      {creating || editing ? (
        <VendorForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          busy={busy}
        />
      ) : null}

      {items.length === 0 ? (
        <AccountingEmptyState
          title="No vendors yet"
          description="Add your first supplier to start purchase orders and bills."
        />
      ) : (
        <PurchasesTableWrap>
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e8e2d9]">
                <th className={purchasesTh()}>Vendor</th>
                <th className={purchasesTh()}>GSTIN</th>
                <th className={purchasesTh()}>Contact</th>
                <th className={purchasesTh()}>Payment Terms</th>
                <th className={purchasesTh()}>Status</th>
                <th className={purchasesTh(true)}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id} className="h-11 border-b border-[#f0ece6] last:border-0 hover:bg-[#faf5ec]/70">
                  <td className={purchasesTd()}>
                    <span className="font-semibold text-[#1c352a]">{v.name}</span>
                    {v.billingCity ? (
                      <span className="mt-0.5 block text-[11px] text-[#8a7060]">{v.billingCity}</span>
                    ) : null}
                  </td>
                  <td className={`${purchasesTd()} font-mono text-[12px]`}>{v.gstin ?? "—"}</td>
                  <td className={purchasesTd()}>{v.email ?? v.phone ?? "—"}</td>
                  <td className={purchasesTd()}>{v.paymentTerms ?? "—"}</td>
                  <td className={purchasesTd()}>
                    <AccountingStatusBadge tone={v.isActive ? "success" : "neutral"}>
                      {v.isActive ? "Active" : "Inactive"}
                    </AccountingStatusBadge>
                  </td>
                  <td className={purchasesTd(true)}>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                      onClick={() => {
                        setEditing(v);
                        setCreating(false);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PurchasesTableWrap>
      )}

      <AccountingSectionCard className="!py-3">
        <p className="text-xs text-[#8a7060]">
          Vendor outstanding balances appear on Vendor Bills and Vendor Payments. Per-vendor AP columns
          are not available from the current API.
        </p>
      </AccountingSectionCard>
    </PurchasesPageShell>
  );
}
