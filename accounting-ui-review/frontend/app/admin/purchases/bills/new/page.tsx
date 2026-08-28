"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  fetchPurchasesVendors,
  postBill,
  searchPurchasesCatalog,
  type CatalogSearchItem,
  type LineDraft,
  type VendorRow
} from "@/lib/purchases-api";

function emptyLine(): LineDraft {
  return { itemName: "", quantity: 1, rateInPaise: 0 };
}

export default function NewBillPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [searchQ, setSearchQ] = useState<Record<number, string>>({});
  const [searchHits, setSearchHits] = useState<Record<number, CatalogSearchItem[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetchPurchasesVendors({ activeOnly: true }).then((d) => setVendors(d.items));
  }, []);

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
  }

  async function save(open: boolean) {
    if (!vendorId) return setErr("Select vendor");
    const validLines = lines.filter((l) => l.itemName.trim());
    if (!validLines.length) return setErr("Add line items");
    setBusy(true);
    setErr(null);
    try {
      const { item } = await postBill({
        vendorId,
        referenceNumber: referenceNumber || null,
        subject: subject || null,
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
      void item;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/purchases/bills" className="text-sm text-[#1e3a2f] hover:underline">← Bills</Link>
      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      <div className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-2 dark:border-stone-700 dark:bg-stone-900">
        <label className="text-xs font-medium">Vendor *
          <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">Select</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium">Reference#
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </label>
        <label className="text-xs font-medium md:col-span-2">Subject
          <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
      </div>
      <div className="rounded-lg border bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
        {lines.map((line, idx) => (
          <div key={idx} className="mb-2 grid gap-2 border-b pb-2 sm:grid-cols-4">
            <input className="rounded border px-2 py-1 text-sm sm:col-span-2" placeholder="Item" value={searchQ[idx] ?? line.itemName}
              onChange={(e) => { void searchRow(idx, e.target.value); setLines((p) => { const n=[...p]; n[idx]={...n[idx], itemName:e.target.value}; return n; }); }} />
            <input type="number" min={1} className="rounded border px-2 py-1 text-sm" value={line.quantity}
              onChange={(e) => setLines((p) => { const n=[...p]; n[idx]={...n[idx], quantity: parseInt(e.target.value,10)||1}; return n; })} />
            <input type="number" min={0} step={0.01} className="rounded border px-2 py-1 text-sm" value={(line.rateInPaise/100).toFixed(2)}
              onChange={(e) => setLines((p) => { const n=[...p]; n[idx]={...n[idx], rateInPaise: Math.round(parseFloat(e.target.value||"0")*100)}; return n; })} />
            {(searchHits[idx]?.length ?? 0) > 0 ? (
              <div className="sm:col-span-4">{searchHits[idx]?.map((h) => (
                <button key={h.variantId} type="button" className="mr-2 text-xs text-[#1e3a2f] underline" onClick={() => pickItem(idx, h)}>{h.itemName}</button>
              ))}</div>
            ) : null}
          </div>
        ))}
        <button type="button" className="text-sm text-[#1e3a2f]" onClick={() => setLines((l) => [...l, emptyLine()])}>+ Add row</button>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save(false)} className="rounded-md border px-4 py-2 text-sm">Save draft</button>
        <button type="button" disabled={busy} onClick={() => void save(true)} className="rounded-md bg-[#1e3a2f] px-4 py-2 text-sm font-semibold text-white">Save as open</button>
      </div>
    </div>
  );
}
