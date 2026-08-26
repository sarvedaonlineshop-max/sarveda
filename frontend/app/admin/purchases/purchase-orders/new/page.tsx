"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchAdminPickupLocations, type AdminPickupLocationRow } from "@/lib/admin-api";
import {
  fetchPurchasesVendors,
  postPurchaseOrder,
  searchPurchasesCatalog,
  type CatalogSearchItem,
  type LineDraft,
  type VendorRow
} from "@/lib/purchases-api";

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
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [searchQ, setSearchQ] = useState<Record<number, string>>({});
  const [searchHits, setSearchHits] = useState<Record<number, CatalogSearchItem[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetchPurchasesVendors({ activeOnly: true }).then((d) => setVendors(d.items));
    void fetchAdminPickupLocations({ status: "active" }).then(setLocations);
  }, []);

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
        notes: notes || null,
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/purchases/purchase-orders" className="text-[#1e3a2f] hover:underline">
          ← Purchase orders
        </Link>
      </div>

      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}

      <div className="grid gap-4 rounded-lg border bg-white p-4 dark:border-stone-700 dark:bg-stone-900 md:grid-cols-2">
        <label className="text-xs font-medium">
          Vendor *
          <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">Select vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Receiving warehouse
          <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={pickupLocationId} onChange={(e) => setPickupLocationId(e.target.value)}>
            <option value="">Select location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Reference#
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </label>
        <label className="text-xs font-medium">
          Payment terms
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
        </label>
        <label className="text-xs font-medium md:col-span-2">
          Notes
          <textarea className="mt-1 w-full rounded border px-2 py-1.5 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white dark:border-stone-700 dark:bg-stone-900">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-stone-50 dark:bg-stone-800">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Rate (₹)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="border-b">
                <td className="relative px-3 py-2">
                  <input
                    className="w-full rounded border px-2 py-1 text-sm"
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
                    <div className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded border bg-white shadow-lg">
                      {searchHits[idx]?.map((hit) => (
                        <button
                          key={hit.variantId}
                          type="button"
                          className="block w-full px-2 py-1.5 text-left text-xs hover:bg-stone-100"
                          onClick={() => pickItem(idx, hit)}
                        >
                          {hit.itemName} · {hit.sku}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{line.sku ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={1}
                    className="w-20 rounded border px-2 py-1 text-right text-sm"
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
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="w-24 rounded border px-2 py-1 text-right text-sm"
                    value={(line.rateInPaise / 100).toFixed(2)}
                    onChange={(e) =>
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], rateInPaise: Math.round(parseFloat(e.target.value || "0") * 100) };
                        return next;
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t px-3 py-2">
          <button type="button" className="text-sm font-medium text-[#1e3a2f]" onClick={() => setLines((l) => [...l, emptyLine()])}>
            + Add row
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void save(false)} className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          Save as draft
        </button>
        <button type="button" disabled={busy} onClick={() => void save(true)} className="rounded-md bg-[#1e3a2f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Save & issue
        </button>
      </div>
    </div>
  );
}
