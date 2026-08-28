"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fetchAdminPickupLocations, type AdminPickupLocationRow } from "@/lib/admin-api";
import {
  fetchPurchasesVendors,
  formatInrPaise,
  postPurchaseOrder,
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
  PurchasesTableWrap,
  accountingButtonClass,
  accountingInputClass,
  fieldLabelClass,
  moneyClass,
  purchasesTd,
  purchasesTh
} from "@/components/admin/purchases/purchases-ui";

function emptyLine(): LineDraft {
  return { itemName: "", quantity: 1, rateInPaise: 0, variantId: null };
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [locations, setLocations] = useState<AdminPickupLocationRow[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [pickupLocationId, setPickupLocationId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Due on Receipt");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [searchQ, setSearchQ] = useState<Record<number, string>>({});
  const [searchHits, setSearchHits] = useState<Record<number, CatalogSearchItem[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetchPurchasesVendors({ activeOnly: true }).then((d) => setVendors(d.items));
    void fetchAdminPickupLocations({ status: "active" }).then(setLocations);
  }, []);

  const subtotalPaise = useMemo(
    () => lines.reduce((s, l) => s + Math.max(0, l.quantity) * Math.max(0, l.rateInPaise), 0),
    [lines]
  );

  async function searchRow(idx: number, q: string) {
    setSearchQ((s) => ({ ...s, [idx]: q }));
    if (q.trim().length < 2) {
      setSearchHits((s) => ({ ...s, [idx]: [] }));
      return;
    }
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
        hsnCode: item.hsnCode,
        taxClass: item.taxClass,
        quantity: next[idx]?.quantity ?? 1,
        rateInPaise: item.rateInPaise
      };
      return next;
    });
    setSearchHits((s) => ({ ...s, [idx]: [] }));
    setSearchQ((s) => ({ ...s, [idx]: item.itemName }));
  }

  async function save(asSent: boolean) {
    if (!vendorId) {
      setErr("Select a vendor");
      return;
    }
    const validLines = lines.filter((l) => l.itemName.trim() && l.quantity > 0);
    if (validLines.length === 0) {
      setErr("Add at least one line item");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { item } = await postPurchaseOrder({
        vendorId,
        pickupLocationId: pickupLocationId || null,
        referenceNumber: referenceNumber || null,
        paymentTerms,
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes: notes || null,
        termsAndConditions: terms || null,
        status: asSent ? "SENT" : "DRAFT",
        lines: validLines.map((l) => ({
          variantId: l.variantId,
          itemName: l.itemName,
          sku: l.sku,
          hsnCode: l.hsnCode,
          quantity: l.quantity,
          rateInPaise: l.rateInPaise,
          taxClass: l.taxClass
        }))
      });
      router.push(`/admin/purchases/purchase-orders/${item.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PurchasesPageShell
      title="New Purchase Order"
      subtitle="Create a purchase commitment to a supplier."
      actions={
        <Link href="/admin/purchases/purchase-orders" className={accountingButtonClass("secondary")}>
          Cancel
        </Link>
      }
    >
      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}

      <FormSection title="Vendor & PO Details" description="Who you are ordering from and basic PO references.">
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
          Reference
          <input
            className={accountingInputClass()}
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
          />
        </label>
        <label className={fieldLabelClass()}>
          Expected delivery date
          <input
            type="date"
            className={accountingInputClass()}
            value={expectedDeliveryDate}
            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
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

      <FormSection title="Delivery Details" description="Where goods will be received.">
        <label className={`${fieldLabelClass()} sm:col-span-2`}>
          Receiving warehouse
          <select
            className={accountingInputClass()}
            value={pickupLocationId}
            onChange={(e) => setPickupLocationId(e.target.value)}
          >
            <option value="">Select location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </FormSection>

      <AccountingSectionCard className="!p-0 overflow-hidden">
        <div className="border-b border-[#e8e2d9] px-4 py-3 sm:px-5">
          <AccountingSectionHeader
            title="Items"
            description="Search the catalog or enter item details. Tax is calculated by the server from item tax class when available."
          />
        </div>
        <PurchasesTableWrap>
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e8e2d9]">
                <th className={purchasesTh()}>Item / Description</th>
                <th className={purchasesTh()}>SKU</th>
                <th className={purchasesTh(true)}>Qty</th>
                <th className={purchasesTh(true)}>Rate</th>
                <th className={purchasesTh()}>Tax</th>
                <th className={purchasesTh(true)}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const amount = line.quantity * line.rateInPaise;
                return (
                  <tr key={idx} className="border-b border-[#f0ece6]">
                    <td className={`${purchasesTd()} relative min-w-[220px]`}>
                      <input
                        className={accountingInputClass()}
                        value={searchQ[idx] ?? line.itemName}
                        onChange={(e) => {
                          void searchRow(idx, e.target.value);
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], itemName: e.target.value };
                            return next;
                          });
                        }}
                        placeholder="Search catalog…"
                      />
                      {(searchHits[idx]?.length ?? 0) > 0 ? (
                        <div className="absolute z-20 mt-1 max-h-40 w-[min(100%,22rem)] overflow-auto rounded-lg border border-[#e8e2d9] bg-white shadow-md">
                          {searchHits[idx]?.map((hit) => (
                            <button
                              key={hit.variantId}
                              type="button"
                              className="block w-full px-2 py-1.5 text-left text-xs hover:bg-[#faf5ec]"
                              onClick={() => pickItem(idx, hit)}
                            >
                              {hit.itemName} · {hit.sku}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${purchasesTd()} font-mono text-[12px]`}>{line.sku ?? "—"}</td>
                    <td className={purchasesTd(true)}>
                      <input
                        type="number"
                        min={1}
                        className={`${accountingInputClass()} ml-auto w-20`}
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], quantity: parseInt(e.target.value, 10) || 1 };
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className={purchasesTd(true)}>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className={`${accountingInputClass()} ml-auto w-28`}
                        value={(line.rateInPaise / 100).toFixed(2)}
                        onChange={(e) =>
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx] = {
                              ...next[idx],
                              rateInPaise: Math.round(parseFloat(e.target.value || "0") * 100)
                            };
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className={purchasesTd()}>
                      <span className="text-xs text-[#8a7060]">{line.taxClass ?? "—"}</span>
                    </td>
                    <td className={`${purchasesTd(true)} ${moneyClass()}`}>{formatInrPaise(amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PurchasesTableWrap>
        <div className="border-t border-[#e8e2d9] px-4 py-3">
          <button
            type="button"
            className="text-sm font-semibold text-[#1c352a] underline-offset-2 hover:underline"
            onClick={() => setLines((l) => [...l, emptyLine()])}
          >
            + Add Item
          </button>
        </div>
      </AccountingSectionCard>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <FormSection title="Notes / Terms">
          <label className={`${fieldLabelClass()} sm:col-span-2`}>
            Notes
            <textarea
              className={`${accountingInputClass()} h-auto min-h-[4.5rem] py-2`}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className={`${fieldLabelClass()} sm:col-span-2`}>
            Terms &amp; conditions
            <textarea
              className={`${accountingInputClass()} h-auto min-h-[4.5rem] py-2`}
              rows={2}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </label>
        </FormSection>

        <AccountingSectionCard>
          <AccountingSectionHeader title="Order Summary" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[#8a7060]">Subtotal</dt>
              <dd className={moneyClass()}>{formatInrPaise(subtotalPaise)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#8a7060]">Tax</dt>
              <dd className="text-xs text-[#8a7060]">Applied on save</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-[#e8e2d9] pt-2">
              <dt className="font-semibold text-[#2c2420]">Estimated total</dt>
              <dd className={`text-lg ${moneyClass()}`}>{formatInrPaise(subtotalPaise)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-[#8a7060]">
            Final tax and grand total are calculated by the server when the PO is saved.
          </p>
        </AccountingSectionCard>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(true)}
          className={accountingButtonClass("primary")}
        >
          {busy ? "Saving…" : "Create Purchase Order"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(false)}
          className={accountingButtonClass("secondary")}
        >
          Save Draft
        </button>
        <Link href="/admin/purchases/purchase-orders" className={accountingButtonClass("secondary")}>
          Cancel
        </Link>
      </div>
    </PurchasesPageShell>
  );
}
