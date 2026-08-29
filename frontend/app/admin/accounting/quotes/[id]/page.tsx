"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  AccountingAlert,
  AccountingSectionCard,
  SalesPageShell
} from "@/components/admin/accounting/sales/sales-ui";
import {
  cancelQuotation,
  fetchQuotation,
  formatQuoteMoney,
  markQuotationAccepted,
  markQuotationSent,
  proformaPdfUrl,
  quotationPdfUrl,
  type QuotationDetail
} from "@/lib/quotations-api";

export default function QuoteDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
  const [expiryLabel, setExpiryLabel] = useState<string | null>(null);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const data = await fetchQuotation(id);
      setQuotation(data.quotation);
      setExpiryLabel(data.expiry?.label ?? null);
      setConvertNote(data.convertToOrder?.reason ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
      setQuotation(null);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    setErr(null);
    try {
      await action();
      setToast(okMsg);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!quotation && !err) {
    return (
      <SalesPageShell title="Quote">
        <p className="text-sm text-[#8a7060]">Loading…</p>
      </SalesPageShell>
    );
  }

  if (!quotation) {
    return (
      <SalesPageShell title="Quote">
        <AccountingAlert tone="error">{err ?? "Not found"}</AccountingAlert>
      </SalesPageShell>
    );
  }

  const billing = quotation.billingAddress;
  const shipping = quotation.shippingAddress;
  const locked = ["ACCEPTED", "CONVERTED", "CANCELLED"].includes(quotation.status);
  const canSend = quotation.status === "DRAFT" || quotation.status === "SENT";
  const canAccept = ["DRAFT", "SENT", "ACCEPTED"].includes(quotation.status);
  const canProforma = ["SENT", "ACCEPTED", "CONVERTED"].includes(quotation.status);
  const canCancel = quotation.status !== "CONVERTED" && quotation.status !== "CANCELLED";

  return (
    <SalesPageShell
      title={quotation.quoteNumber}
      subtitle={`Status: ${quotation.status}${expiryLabel ? ` · ${expiryLabel}` : ""}`}
      actions={
        <Link href="/admin/accounting/quotes" className="text-sm text-[#8a7060] underline">
          All quotes
        </Link>
      }
    >
      {toast ? <AccountingAlert tone="success">{toast}</AccountingAlert> : null}
      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}

      <div className="flex flex-wrap gap-2">
        {!locked && (quotation.status === "DRAFT" || quotation.status === "SENT") ? (
          <Link
            href={`/admin/accounting/quotes/${quotation.id}/edit`}
            className="rounded-lg border border-[#e0d8ce] px-3 py-1.5 text-sm"
          >
            Edit
          </Link>
        ) : null}
        <a
          href={quotationPdfUrl(quotation.id)}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-[#1c352a] px-3 py-1.5 text-sm font-medium text-[#1c352a]"
        >
          Download Quote
        </a>
        {canSend ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => markQuotationSent(quotation.id), "Quotation issued")}
            className="rounded-lg bg-[#1c352a] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Mark Sent
          </button>
        ) : null}
        {canAccept && quotation.status !== "ACCEPTED" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() => markQuotationAccepted(quotation.id), "Quotation accepted")
            }
            className="rounded-lg border border-[#e0d8ce] px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Mark Accepted
          </button>
        ) : null}
        {canProforma ? (
          <a
            href={proformaPdfUrl(quotation.id)}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[#e0d8ce] px-3 py-1.5 text-sm font-medium"
            onClick={() => setToast("Proforma generated")}
          >
            Create / Download Proforma
          </a>
        ) : (
          <span className="rounded-lg border border-dashed border-[#e0d8ce] px-3 py-1.5 text-xs text-[#8a7060]">
            Mark Sent before Proforma
          </span>
        )}
        {canCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => cancelQuotation(quotation.id), "Quotation cancelled")}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-800 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {convertNote ? (
        <AccountingAlert tone="warning">
          Convert to Order: {convertNote}
        </AccountingAlert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <AccountingSectionCard>
          <h2 className="text-sm font-semibold">Customer</h2>
          <p className="mt-2 font-medium">{quotation.customerName}</p>
          {quotation.email ? <p className="text-sm text-[#6b5a4e]">{quotation.email}</p> : null}
          {quotation.phone ? <p className="text-sm text-[#6b5a4e]">{quotation.phone}</p> : null}
          {quotation.buyerGstin ? (
            <p className="mt-1 text-sm">GSTIN: {quotation.buyerGstin}</p>
          ) : null}
          {quotation.validUntil ? (
            <p className="mt-2 text-sm text-[#8a7060]">
              Valid until {new Date(quotation.validUntil).toLocaleDateString("en-IN")}
            </p>
          ) : null}
          {quotation.proformaIssuedAt ? (
            <p className="mt-1 text-xs text-[#8a7060]">
              Proforma issued {new Date(quotation.proformaIssuedAt).toLocaleString("en-IN")}
            </p>
          ) : null}
        </AccountingSectionCard>
        <AccountingSectionCard>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase text-[#8a7060]">Billing</h3>
              <AddrBlock addr={billing} />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-[#8a7060]">Shipping</h3>
              <AddrBlock addr={shipping} />
            </div>
          </div>
        </AccountingSectionCard>
      </div>

      <AccountingSectionCard className="overflow-hidden p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-[#faf5ec] text-left text-xs uppercase text-[#8a7060]">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">HSN</th>
              <th className="px-4 py-2">Qty</th>
              <th className="px-4 py-2">Rate</th>
              <th className="px-4 py-2">Disc</th>
              <th className="px-4 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((it) => (
              <tr key={it.id} className="border-t border-[#f0ebe3]">
                <td className="px-4 py-2">
                  <div className="font-medium">{it.productName}</div>
                  {it.sku ? <div className="text-xs text-[#8a7060]">{it.sku}</div> : null}
                </td>
                <td className="px-4 py-2">{it.hsnCode || "—"}</td>
                <td className="px-4 py-2">{it.quantity}</td>
                <td className="px-4 py-2">{formatQuoteMoney(it.unitPriceInPaise, quotation.currency)}</td>
                <td className="px-4 py-2">{formatQuoteMoney(it.discountInPaise, quotation.currency)}</td>
                <td className="px-4 py-2 font-medium">
                  {formatQuoteMoney(it.lineTotalInPaise, quotation.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AccountingSectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AccountingSectionCard>
          <h2 className="text-sm font-semibold">Totals & estimated GST</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Subtotal" value={formatQuoteMoney(quotation.subtotalInPaise, quotation.currency)} />
            <Row label="Discount" value={formatQuoteMoney(quotation.discountInPaise, quotation.currency)} />
            <Row label="Shipping" value={formatQuoteMoney(quotation.shippingInPaise, quotation.currency)} />
            {quotation.taxPreviewMode === "INTRA_STATE" ? (
              <>
                <Row label="Est. CGST" value={formatQuoteMoney(quotation.cgstInPaise, quotation.currency)} />
                <Row label="Est. SGST" value={formatQuoteMoney(quotation.sgstInPaise, quotation.currency)} />
              </>
            ) : null}
            {quotation.taxPreviewMode === "INTER_STATE" ? (
              <Row label="Est. IGST" value={formatQuoteMoney(quotation.igstInPaise, quotation.currency)} />
            ) : null}
            {quotation.taxPreviewMode === "UNAVAILABLE" ? (
              <p className="text-xs text-amber-800">Estimated GST unavailable — check shipping state.</p>
            ) : null}
            <Row
              label="Grand total"
              value={formatQuoteMoney(quotation.grandTotalInPaise, quotation.currency)}
              strong
            />
          </dl>
        </AccountingSectionCard>
        <AccountingSectionCard>
          {quotation.terms ? (
            <>
              <h2 className="text-sm font-semibold">Terms</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#4a3f38]">{quotation.terms}</p>
            </>
          ) : null}
          {quotation.notes ? (
            <>
              <h2 className="mt-4 text-sm font-semibold">Notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#4a3f38]">{quotation.notes}</p>
            </>
          ) : null}
        </AccountingSectionCard>
      </div>
    </SalesPageShell>
  );
}

function AddrBlock({ addr }: { addr: QuotationDetail["billingAddress"] }) {
  return (
    <div className="mt-1 text-sm text-[#4a3f38]">
      <p className="font-medium">{addr.fullName}</p>
      <p>{addr.line1}</p>
      {addr.line2 ? <p>{addr.line2}</p> : null}
      <p>
        {[addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ")}
      </p>
      <p>{addr.country}</p>
    </div>
  );
}

function Row({
  label,
  value,
  strong
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-[#ebe4db] pt-2 font-semibold" : ""}`}>
      <dt className="text-[#8a7060]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
