"use client";

import { useCallback, useEffect, useState } from "react";

import {
  cancelAdminOrderEwayBill,
  fetchAdminOrderEwayBills,
  fetchAdminOrderEwayReview,
  markAdminOrderEwayNotRequired,
  prepareAdminOrderEwayBill,
  recordAdminOrderEwayBill,
  type AdminEwayBill,
  type AdminEwayListData,
  type AdminEwayReviewPack
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function FieldBadge({ status }: { status?: string }) {
  if (!status) return null;
  const label =
    status === "AUTO_FILLED"
      ? "Auto-filled"
      : status === "NEEDS_CONFIRMATION"
        ? "Confirm"
        : "Missing";
  const cls =
    status === "AUTO_FILLED"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : status === "NEEDS_CONFIRMATION"
        ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200";
  return (
    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {label}
    </span>
  );
}

type Props = {
  orderId: string;
  onToast: (message: string, error?: boolean) => void;
};

export function AdminOrderEwayBillCard({ orderId, onToast }: Props) {
  const [data, setData] = useState<AdminEwayListData | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"TAX_INVOICE" | "DELIVERY_CHALLAN" | "">("");
  const [pack, setPack] = useState<AdminEwayReviewPack | null>(null);
  const [ebn, setEbn] = useState("");
  const [ewbDate, setEwbDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [approxDistanceKm, setApproxDistanceKm] = useState("");
  const [transportMode, setTransportMode] = useState("ROAD");
  const [uomBySort, setUomBySort] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState<AdminEwayBill | null>(null);
  const [details, setDetails] = useState<AdminEwayBill | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchAdminOrderEwayBills(orderId);
      setData(d);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to load E-Way Bill", true);
    }
  }, [orderId, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openReview(preferred?: "TAX_INVOICE" | "DELIVERY_CHALLAN") {
    if (!data) return;
    const next =
      preferred ||
      (data.sources.taxInvoice ? "TAX_INVOICE" : data.sources.deliveryChallan ? "DELIVERY_CHALLAN" : "");
    if (!next) {
      onToast("Create a Tax Invoice or Delivery Challan first", true);
      return;
    }
    setBusy(true);
    try {
      const p = await fetchAdminOrderEwayReview(orderId, next);
      setSource(next);
      setPack(p);
      setBuyerGstin(p.recipient.gstin ?? "");
      setTransportMode(p.transport.transportMode || "ROAD");
      const uoms: Record<number, string> = {};
      for (const it of p.items) uoms[it.sortOrder] = it.unitOfMeasure || "NOS";
      setUomBySort(uoms);
      setOpen(true);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Could not load review pack", true);
    } finally {
      setBusy(false);
    }
  }

  async function switchSource(next: "TAX_INVOICE" | "DELIVERY_CHALLAN") {
    setBusy(true);
    try {
      const p = await fetchAdminOrderEwayReview(orderId, next);
      setSource(next);
      setPack(p);
      setBuyerGstin(p.recipient.gstin ?? "");
      const uoms: Record<number, string> = {};
      for (const it of p.items) uoms[it.sortOrder] = it.unitOfMeasure || "NOS";
      setUomBySort(uoms);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Could not load review pack", true);
    } finally {
      setBusy(false);
    }
  }

  function bodyExtras() {
    return {
      sourceDocumentType: source,
      buyerGstin: buyerGstin.trim() || null,
      transporterId: transporterId.trim() || null,
      vehicleNumber: vehicleNumber.trim() || null,
      approxDistanceKm: approxDistanceKm.trim() ? Number.parseInt(approxDistanceKm, 10) : null,
      transportMode: transportMode || null,
      transporterName: pack?.transport.transporterName ?? null,
      transportDocNo: pack?.transport.transportDocNo ?? null,
      transportDocDate: pack?.transport.transportDocDate ?? null,
      shipmentId: pack?.transport.shipmentId ?? null,
      notes: notes.trim() || null,
      itemOverrides: Object.entries(uomBySort).map(([sortOrder, unitOfMeasure]) => ({
        sortOrder: Number(sortOrder),
        unitOfMeasure
      }))
    };
  }

  async function handlePrepare() {
    if (!source) return;
    setBusy(true);
    try {
      await prepareAdminOrderEwayBill(orderId, bodyExtras());
      onToast("Preparation saved — generate on the government portal, then enter the EBN");
      setOpen(false);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Prepare failed", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleRecord() {
    if (!source) return;
    setBusy(true);
    try {
      const pendingId =
        data?.primary?.status === "PENDING" ? data.primary.id : null;
      await recordAdminOrderEwayBill(
        orderId,
        {
          ...bodyExtras(),
          ebn,
          ewbDate: ewbDate ? new Date(ewbDate).toISOString() : new Date().toISOString(),
          validUntil: validUntil ? new Date(validUntil).toISOString() : null
        },
        pendingId
      );
      onToast("Government EBN recorded");
      setOpen(false);
      setEbn("");
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Record failed", true);
    } finally {
      setBusy(false);
    }
  }

  const primary = data?.primary ?? null;

  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">E-Way Bill</p>

      {!data ? (
        <p className="mt-2 text-sm text-stone-400">Loading…</p>
      ) : !primary ? (
        <>
          <p className="mt-1 text-xs text-stone-500">{data.eligibilityCopy}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void openReview()}
              className="inline-flex min-h-[34px] items-center rounded-full border border-stone-700 bg-stone-800 px-4 text-sm font-semibold text-amber-50 hover:bg-stone-700 disabled:opacity-50 dark:border-stone-500 dark:bg-stone-200 dark:text-stone-900"
            >
              {busy ? "Loading…" : "Review E-Way Bill"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await markAdminOrderEwayNotRequired(
                    orderId,
                    data.likelyNotRequired
                      ? "International / non-IN shipment — admin confirmed not required"
                      : "Admin confirmed not required"
                  );
                  onToast("Marked E-Way Bill not required");
                  await load();
                } catch (e) {
                  onToast(e instanceof Error ? e.message : "Failed", true);
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex min-h-[34px] items-center rounded-full border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200"
            >
              Mark not required
            </button>
          </div>
        </>
      ) : primary.status === "NOT_REQUIRED" ? (
        <>
          <p className="mt-1 text-xs text-stone-500">Status: Not required</p>
          {primary.notes ? <p className="mt-1 text-xs text-stone-400">{primary.notes}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void openReview()}
            className="mt-3 inline-flex min-h-[34px] items-center rounded-full border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200"
          >
            Review / record anyway
          </button>
        </>
      ) : primary.status === "PENDING" ? (
        <>
          <p className="mt-1 text-xs text-stone-500">
            Status: Pending preparation · Source{" "}
            {primary.sourceDocumentType === "TAX_INVOICE" ? "Tax Invoice" : "Delivery Challan"}{" "}
            {primary.sourceDocumentNumber}
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            Generate the E-Way Bill on the government portal, then enter the issued EBN.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void openReview(primary.sourceDocumentType)}
            className="mt-3 inline-flex min-h-[34px] items-center rounded-full bg-amber-500 px-4 text-sm font-semibold text-stone-900 hover:bg-amber-400"
          >
            Enter EBN
          </button>
        </>
      ) : primary.status === "GENERATED" || primary.status === "CANCELLED" ? (
        <>
          <p className="mt-0.5 font-mono text-xs text-stone-500 dark:text-stone-400">
            EBN: {primary.ebn || "—"}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Generated: {fmtDate(primary.ewbDate)}
            {primary.validUntil ? ` · Valid until: ${fmtDate(primary.validUntil)}` : ""}
            {primary.displayExpiry === "EXPIRED" ? " · Validity ended" : ""}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Source:{" "}
            {primary.sourceDocumentType === "TAX_INVOICE" ? "Tax Invoice" : "Delivery Challan"}{" "}
            {primary.sourceDocumentNumber}
          </p>
          {primary.transportDocNo ? (
            <p className="mt-1 text-xs text-stone-500">
              Transport: {primary.transporterName || "—"}
              {primary.transportDocNo ? ` · AWB ${primary.transportDocNo}` : ""}
            </p>
          ) : null}
          <p className="mt-1 text-xs font-semibold text-stone-600 dark:text-stone-300">
            Status: {primary.status === "CANCELLED" ? "Cancelled (local record)" : "Generated"}
            {primary.provider === "PORTAL" ? " · Portal" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDetails(primary)}
              className="inline-flex min-h-[34px] items-center rounded-full border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200"
            >
              View details
            </button>
            {primary.status === "GENERATED" ? (
              <button
                type="button"
                onClick={() => setCancelConfirm(primary)}
                className="inline-flex min-h-[34px] items-center rounded-full border border-red-300 px-3 text-xs font-semibold text-red-800 hover:bg-red-50 dark:border-red-700 dark:text-red-200"
              >
                Mark cancelled
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void openReview(primary.sourceDocumentType)}
              className="inline-flex min-h-[34px] items-center rounded-full border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200"
            >
              New review
            </button>
          </div>
        </>
      ) : null}

      {open && pack ? (
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-stone-950/50 p-4">
          <div className="my-6 w-full max-w-3xl rounded-2xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-700 dark:bg-stone-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">
                  E-Way Bill review
                </h3>
                <p className="mt-1 text-xs text-stone-500">{pack.hints.eligibilityCopy}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {data?.sources.taxInvoice ? (
                <button
                  type="button"
                  onClick={() => void switchSource("TAX_INVOICE")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    source === "TAX_INVOICE"
                      ? "bg-stone-800 text-amber-50"
                      : "border border-stone-300 text-stone-700 dark:border-stone-600 dark:text-stone-200"
                  }`}
                >
                  Tax Invoice {data.sources.taxInvoice.documentNumber}
                </button>
              ) : null}
              {data?.sources.deliveryChallan ? (
                <button
                  type="button"
                  onClick={() => void switchSource("DELIVERY_CHALLAN")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    source === "DELIVERY_CHALLAN"
                      ? "bg-stone-800 text-amber-50"
                      : "border border-stone-300 text-stone-700 dark:border-stone-600 dark:text-stone-200"
                  }`}
                >
                  Delivery Challan {data.sources.deliveryChallan.documentNumber}
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <section className="rounded-xl border border-stone-200 p-3 dark:border-stone-700">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Document
                </p>
                <p className="mt-1 text-sm text-stone-800 dark:text-stone-100">
                  {source === "TAX_INVOICE" ? "Tax Invoice" : "Delivery Challan"}
                </p>
                <p className="font-mono text-xs text-stone-500">{pack.sourceDocumentNumber}</p>
                <p className="text-xs text-stone-500">{fmtDate(pack.sourceDocumentDate)}</p>
                <p className="mt-1 text-sm font-semibold">
                  {formatMinorFromPaise(pack.documentValueInPaise, pack.currency)}
                </p>
              </section>
              <section className="rounded-xl border border-stone-200 p-3 dark:border-stone-700">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Supplier / dispatch
                </p>
                <p className="mt-1 text-sm font-semibold">{pack.supplier.legalName}</p>
                <p className="text-xs text-stone-500">GSTIN {pack.supplier.gstin}</p>
                {pack.supplier.addressLines.map((l) => (
                  <p key={l} className="text-xs text-stone-600 dark:text-stone-300">
                    {l}
                  </p>
                ))}
                <p className="text-xs text-stone-500">
                  {pack.supplier.state}
                  {pack.supplier.postalCode ? ` · ${pack.supplier.postalCode}` : ""}
                </p>
              </section>
              <section className="rounded-xl border border-stone-200 p-3 dark:border-stone-700 sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Recipient
                </p>
                <p className="mt-1 text-sm font-semibold">{pack.recipient.name}</p>
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  {[pack.recipient.line1, pack.recipient.line2, pack.recipient.city]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p className="text-xs text-stone-500">
                  {pack.recipient.state} {pack.recipient.postalCode} · {pack.recipient.country}
                </p>
                <label className="mt-2 block text-xs text-stone-500">
                  Buyer GSTIN (optional for B2C / URP)
                  <input
                    value={buyerGstin}
                    onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-950"
                    placeholder="Leave blank for URP"
                  />
                </label>
              </section>
            </div>

            <section className="mt-4 overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-500 dark:bg-stone-950">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">HSN</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">UOM</th>
                    <th className="px-3 py-2">Taxable</th>
                    <th className="px-3 py-2">Rate</th>
                    <th className="px-3 py-2">CGST</th>
                    <th className="px-3 py-2">SGST</th>
                    <th className="px-3 py-2">IGST</th>
                  </tr>
                </thead>
                <tbody>
                  {pack.items.map((it) => (
                    <tr key={it.sortOrder} className="border-t border-stone-100 dark:border-stone-800">
                      <td className="px-3 py-2 text-stone-800 dark:text-stone-100">{it.productName}</td>
                      <td className="px-3 py-2 font-mono">
                        {it.hsnCode || "—"}
                        <FieldBadge status={it.fields.hsnCode} />
                      </td>
                      <td className="px-3 py-2">{it.quantity}</td>
                      <td className="px-3 py-2">
                        <input
                          value={uomBySort[it.sortOrder] ?? "NOS"}
                          onChange={(e) =>
                            setUomBySort((prev) => ({ ...prev, [it.sortOrder]: e.target.value }))
                          }
                          className="w-16 rounded border border-stone-300 px-1 py-0.5 dark:border-stone-600 dark:bg-stone-950"
                        />
                        <FieldBadge status={it.fields.unitOfMeasure} />
                      </td>
                      <td className="px-3 py-2">
                        {formatMinorFromPaise(it.taxableValueInPaise, pack.currency)}
                      </td>
                      <td className="px-3 py-2">{it.gstRatePercent}%</td>
                      <td className="px-3 py-2">{formatMinorFromPaise(it.cgstInPaise, pack.currency)}</td>
                      <td className="px-3 py-2">{formatMinorFromPaise(it.sgstInPaise, pack.currency)}</td>
                      <td className="px-3 py-2">{formatMinorFromPaise(it.igstInPaise, pack.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Transport
                </p>
                <p className="mt-1 text-sm">
                  {pack.transport.transporterName || "—"}
                  <FieldBadge status={pack.transport.fieldStatus.transporterName} />
                </p>
                <p className="text-xs text-stone-500">
                  AWB {pack.transport.transportDocNo || "—"}
                  <FieldBadge status={pack.transport.fieldStatus.transportDocNo} />
                </p>
                <label className="mt-2 block text-xs text-stone-500">
                  Transporter ID / GSTIN
                  <input
                    value={transporterId}
                    onChange={(e) => setTransporterId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                  <FieldBadge status="MISSING" />
                </label>
                <label className="mt-2 block text-xs text-stone-500">
                  Mode
                  <select
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  >
                    <option value="ROAD">Road</option>
                    <option value="RAIL">Rail</option>
                    <option value="AIR">Air</option>
                    <option value="SHIP">Ship</option>
                  </select>
                </label>
                <label className="mt-2 block text-xs text-stone-500">
                  Vehicle number
                  <input
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                  <FieldBadge status="MISSING" />
                </label>
                <label className="mt-2 block text-xs text-stone-500">
                  Approx distance (km)
                  <input
                    value={approxDistanceKm}
                    onChange={(e) => setApproxDistanceKm(e.target.value.replace(/\D/g, ""))}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                  <FieldBadge status="MISSING" />
                </label>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Government EBN
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Generate the E-Way Bill on the government portal, then enter the issued EBN below.
                  Sarveda does not generate EBNs.
                </p>
                <label className="mt-2 block text-xs text-stone-500">
                  EBN (12 digits)
                  <input
                    value={ebn}
                    onChange={(e) => setEbn(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-950"
                    placeholder="From government portal"
                  />
                </label>
                <label className="mt-2 block text-xs text-stone-500">
                  E-Way Bill date
                  <input
                    type="date"
                    value={ewbDate}
                    onChange={(e) => setEwbDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                </label>
                <label className="mt-2 block text-xs text-stone-500">
                  Valid until (optional)
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                </label>
                <label className="mt-2 block text-xs text-stone-500">
                  Notes
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                </label>
              </div>
            </section>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePrepare()}
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200"
              >
                Prepare (save without EBN)
              </button>
              <button
                type="button"
                disabled={busy || ebn.length !== 12 || !ewbDate}
                onClick={() => void handleRecord()}
                className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-50"
              >
                Record E-Way Bill
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {details ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-stone-950/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900">
            <div className="flex justify-between">
              <h3 className="font-bold text-stone-900 dark:text-stone-50">E-Way Bill details</h3>
              <button type="button" onClick={() => setDetails(null)} className="text-sm text-stone-500">
                Close
              </button>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-stone-500">EBN</dt>
                <dd className="font-mono">{details.ebn || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Status</dt>
                <dd>{details.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Source</dt>
                <dd>
                  {details.sourceDocumentType} {details.sourceDocumentNumber}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Items</dt>
                <dd>
                  {details.items.map((i) => (
                    <p key={i.id} className="text-xs">
                      {i.productName} · HSN {i.hsnCode || "—"} · {i.quantity} {i.unitOfMeasure}
                    </p>
                  ))}
                </dd>
              </div>
            </dl>
            <details className="mt-4 text-xs text-stone-500">
              <summary className="cursor-pointer font-semibold">Technical details</summary>
              <p className="mt-1">Method: {details.generationMethod}</p>
              <p>Provider: {details.provider || "—"}</p>
            </details>
          </div>
        </div>
      ) : null}

      <AdminConfirmModal
        open={cancelConfirm !== null}
        title="Mark E-Way Bill cancelled?"
        message="Confirm that this E-Way Bill has already been cancelled on the government portal. Sarveda will only update its local record and will retain the EBN."
        confirmLabel="Mark cancelled locally"
        danger
        onClose={() => setCancelConfirm(null)}
        onConfirm={() => {
          const row = cancelConfirm;
          setCancelConfirm(null);
          if (!row) return;
          void (async () => {
            setBusy(true);
            try {
              await cancelAdminOrderEwayBill(orderId, row.id);
              onToast("Local E-Way Bill record marked cancelled");
              await load();
            } catch (e) {
              onToast(e instanceof Error ? e.message : "Cancel failed", true);
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    </div>
  );
}
