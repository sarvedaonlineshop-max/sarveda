"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  fetchPurchasesVendors,
  formatInrPaise,
  postBill,
  searchPurchasesCatalog,
  type CatalogSearchItem,
  type LineDraft,
  type VendorRow
} from "@/lib/purchases-api";
import {
  AccountingAlert,
  AccountingSectionCard,
  AccountingSectionHeader,
  FormSection,
  PurchasesPageShell,
  accountingButtonClass,
  accountingInputClass,
  fieldLabelClass,
  moneyClass
} from "@/components/admin/purchases/purchases-ui";

function emptyLine(): LineDraft {
  return { itemName: "", quantity: 1, rateInPaise: 0 };
}

export default function NewBillPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Due on Receipt");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [searchQ, setSearchQ] = useState<Record<number, string>>({});
  const [searchHits, setSearchHits] = useState<Record<number, CatalogSearchItem[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetchPurchasesVendors({ activeOnly: true }).then((d) => setVendors(d.items));
  }, []);

  const subtotalPaise = useMemo(
    () => lines.reduce((s, l) => s + Math.max(0, l.quantity) * Math.max(0, l.rateInPaise), 0),
    [lines]
  );

  async function searchRow(idx: number, q: string) {
    setSearchQ((s) => ({ ...s, [idx]: q }));
    if (q.trim().length < 2) return setSearchHits((s) => ({ ...s, [idx]: [] }));
    const data = await searchPurchasesCatalog(q.trim());
    setSearchHits((s) => ({ ...s, [idx]: data.items }));
  }

  function pickItem(idx: number, item: CatalogSearchItem) {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = {
        variantId: item.variantId,
        itemName: item.itemName,
        sku: item.sku,
        taxClass: item.taxClass,
        quantity: next[idx]?.quantity ?? 1,
        rateInPaise: item.rateInPaise
      };
      return next;
    });
    setSearchHits((s) => ({ ...s, [idx]: [] }));
    setSearchQ((s) => ({ ...s, [idx]: item.itemName }));
  }

  async function save(open: boolean) {
    if (!vendorId) return setErr("Select a vendor");
    const validLines = lines.filter((l) => l.itemName.trim());
    if (!validLines.length) return setErr("Add line items");
    setBusy(true);
    setErr(null);
    try {
      await postBill({
        vendorId,
        referenceNumber: referenceNumber || null,
        subject: subject || null,
        billDate: billDate || undefined,
        dueDate: dueDate || null,
        paymentTerms: paymentTerms || null,
        notes: notes || null,
        status: open ? "OPEN" : "DRAFT",
        lines: validLines.map((l) => ({
          variantId: l.variantId,
          itemName: l.itemName,
          sku: l.sku,
          quantity: l.quantity,
          rateInPaise: l.rateInPaise,
          taxClass: l.taxClass
        }))
      });
      router.push("/admin/purchases/bills");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PurchasesPageShell
      title="New Vendor Bill"
      subtitle="Record a supplier invoice. Link a PO reference when the bill follows a purchase order."
      compact
      actions={
        <Link href="/admin/purchases/bills" className={accountingButtonClass("secondary")}>
          Cancel
        </Link>
      }
    >
      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}

      <FormSection compact title="Vendor & Bill Details">
        <label className={fieldLabelClass()}>
          Vendor *
          <select
            className={accountingInputClass()}
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">Select vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabelClass()}>
          Bill date
          <input
            type="date"
            className={accountingInputClass()}
            value={billDate}
            onChange={(e) => setBillDate(e.target.value)}
          />
        </label>
        <label className={fieldLabelClass()}>
          Due date
          <input
            type="date"
            className={accountingInputClass()}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <label className={fieldLabelClass()}>
          Payment terms
          <input
            className={accountingInputClass()}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
          />
        </label>
      </FormSection>

      <FormSection
        compact
        title="Purchase Order / Reference"
        description="Enter the related purchase order number, if applicable."
      >
        <label className={fieldLabelClass()}>
          Reference / PO number
          <input
            className={accountingInputClass()}
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g. PO-2026-0001"
          />
        </label>
        <label className={fieldLabelClass()}>
          Subject
          <input
            className={accountingInputClass()}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
      </FormSection>

      <AccountingSectionCard className="!p-3 sm:!p-4">
        <AccountingSectionHeader
          title="Items"
          description="Select items and enter quantities and rates."
        />
        <div className="space-y-2.5">
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="grid gap-2 rounded-[10px] border border-[#e8e2d9] p-3 sm:grid-cols-4"
            >
              <label className={`${fieldLabelClass()} sm:col-span-2`}>
                Item
                <input
                  className={accountingInputClass()}
                  placeholder="Search or type item"
                  value={searchQ[idx] ?? line.itemName}
                  onChange={(e) => {
                    void searchRow(idx, e.target.value);
                    setLines((p) => {
                      const n = [...p];
                      n[idx] = { ...n[idx], itemName: e.target.value };
                      return n;
                    });
                  }}
                />
              </label>
              <label className={fieldLabelClass()}>
                Qty
                <input
                  type="number"
                  min={1}
                  className={accountingInputClass()}
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((p) => {
                      const n = [...p];
                      n[idx] = { ...n[idx], quantity: parseInt(e.target.value, 10) || 1 };
                      return n;
                    })
                  }
                />
              </label>
              <label className={fieldLabelClass()}>
                Rate (₹)
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={accountingInputClass()}
                  value={(line.rateInPaise / 100).toFixed(2)}
                  onChange={(e) =>
                    setLines((p) => {
                      const n = [...p];
                      n[idx] = {
                        ...n[idx],
                        rateInPaise: Math.round(parseFloat(e.target.value || "0") * 100)
                      };
                      return n;
                    })
                  }
                />
              </label>
              {(searchHits[idx]?.length ?? 0) > 0 ? (
                <div className="sm:col-span-4 flex flex-wrap gap-2">
                  {searchHits[idx]?.map((h) => (
                    <button
                      key={h.variantId}
                      type="button"
                      className="rounded-md border border-[#e8e2d9] px-2 py-1 text-xs text-[#1c352a] hover:bg-[#faf5ec]"
                      onClick={() => pickItem(idx, h)}
                    >
                      {h.itemName}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-semibold text-[#1c352a] underline-offset-2 hover:underline"
            onClick={() => setLines((l) => [...l, emptyLine()])}
          >
            + Add Item
          </button>
        </div>
      </AccountingSectionCard>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <FormSection compact title="Notes">
          <label className={`${fieldLabelClass()} sm:col-span-2`}>
            Notes
            <textarea
              className={`${accountingInputClass()} h-auto min-h-[4rem] py-2`}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </FormSection>
        <AccountingSectionCard className="!p-3 sm:!p-4">
          <AccountingSectionHeader title="Totals" />
          <div className="flex justify-between text-sm">
            <span className="text-[#8a7060]">Estimated subtotal</span>
            <span className={moneyClass()}>{formatInrPaise(subtotalPaise)}</span>
          </div>
          <p className="mt-2 text-[11px] text-[#8a7060]">Tax and grand total are finalized on save.</p>
        </AccountingSectionCard>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(true)}
          className={accountingButtonClass("primary")}
        >
          {busy ? "Saving…" : "Save as Open Bill"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(false)}
          className={accountingButtonClass("secondary")}
        >
          Save Draft
        </button>
      </div>
    </PurchasesPageShell>
  );
}
