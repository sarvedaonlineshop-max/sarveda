"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AccountingAlert,
  AccountingSectionCard,
  SalesPageShell,
  fieldLabelClass
} from "@/components/admin/accounting/sales/sales-ui";
import {
  fetchQuotation,
  formatQuoteMoney,
  updateQuotation,
  type QuoteAddress,
  type QuoteLineDraft
} from "@/lib/quotations-api";

function rupeesToPaise(raw: string): number {
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function paiseToRupeesInput(paise: number): string {
  return (paise / 100).toFixed(2);
}

export default function EditQuotePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("DRAFT");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [billing, setBilling] = useState<QuoteAddress | null>(null);
  const [shipping, setShipping] = useState<QuoteAddress | null>(null);
  const [lines, setLines] = useState<QuoteLineDraft[]>([]);
  const [shippingInPaise, setShippingInPaise] = useState(0);
  const [headerDiscountInPaise, setHeaderDiscountInPaise] = useState(0);
  const [validUntil, setValidUntil] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const { quotation } = await fetchQuotation(id);
        if (!["DRAFT", "SENT"].includes(quotation.status)) {
          setErr("Only DRAFT or SENT quotations can be edited");
          return;
        }
        setStatus(quotation.status);
        setCustomerId(null);
        setCustomerName(quotation.customerName);
        setEmail(quotation.email ?? "");
        setPhone(quotation.phone ?? "");
        setBuyerGstin(quotation.buyerGstin ?? "");
        setBilling(quotation.billingAddress);
        setShipping(quotation.shippingAddress);
        setLines(
          quotation.items.map((it) => ({
            productName: it.productName,
            sku: it.sku,
            hsnCode: it.hsnCode,
            taxClass: it.taxClass,
            quantity: it.quantity,
            unitPriceInPaise: it.unitPriceInPaise,
            discountInPaise: it.discountInPaise
          }))
        );
        setShippingInPaise(quotation.shippingInPaise);
        const lineDisc = quotation.items.reduce((s, it) => s + it.discountInPaise, 0);
        setHeaderDiscountInPaise(Math.max(0, quotation.discountInPaise - lineDisc));
        setValidUntil(
          quotation.validUntil ? new Date(quotation.validUntil).toISOString().slice(0, 10) : ""
        );
        setTerms(quotation.terms ?? "");
        setNotes(quotation.notes ?? "");
        setReady(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Load failed");
      }
    })();
  }, [id]);

  async function save() {
    if (!billing || !shipping) return;
    setBusy(true);
    setErr(null);
    try {
      await updateQuotation(
        id,
        {
          customerId,
          customerName,
          email: email || null,
          phone: phone || null,
          buyerGstin: buyerGstin || null,
          billingAddress: billing,
          shippingAddress: shipping,
          shippingSameAsBilling: false,
          currency: "INR",
          shippingInPaise,
          discountInPaise: headerDiscountInPaise,
          validUntil: validUntil ? new Date(`${validUntil}T23:59:59.000Z`).toISOString() : null,
          terms: terms || null,
          notes: notes || null,
          lines
        },
        status === "SENT"
      );
      router.push(`/admin/accounting/quotes/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready && !err) {
    return (
      <SalesPageShell title="Edit Quote">
        <p className="text-sm text-[#8a7060]">Loading…</p>
      </SalesPageShell>
    );
  }

  if (err && !ready) {
    return (
      <SalesPageShell title="Edit Quote">
        <AccountingAlert tone="error">{err}</AccountingAlert>
        <Link href={`/admin/accounting/quotes/${id}`} className="text-sm underline">
          Back
        </Link>
      </SalesPageShell>
    );
  }

  return (
    <SalesPageShell
      title="Edit Quote"
      subtitle={status === "SENT" ? "Saving returns this quote to DRAFT." : undefined}
      actions={
        <Link href={`/admin/accounting/quotes/${id}`} className="text-sm underline text-[#8a7060]">
          Cancel
        </Link>
      }
    >
      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}
      <AccountingSectionCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={fieldLabelClass()}>Customer name</label>
            <input
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div>
            <label className={fieldLabelClass()}>Email</label>
            <input
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={fieldLabelClass()}>Phone</label>
            <input
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className={fieldLabelClass()}>Buyer GSTIN</label>
            <input
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm uppercase"
              value={buyerGstin}
              onChange={(e) => setBuyerGstin(e.target.value)}
            />
          </div>
        </div>
        {billing ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div>
              <label className={fieldLabelClass()}>Billing line 1</label>
              <input
                className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                value={billing.line1}
                onChange={(e) => setBilling({ ...billing, line1: e.target.value })}
              />
            </div>
            <div>
              <label className={fieldLabelClass()}>Billing state</label>
              <input
                className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                value={billing.state}
                onChange={(e) => setBilling({ ...billing, state: e.target.value })}
              />
            </div>
            <div>
              <label className={fieldLabelClass()}>Billing city</label>
              <input
                className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                value={billing.city}
                onChange={(e) => setBilling({ ...billing, city: e.target.value })}
              />
            </div>
            <div>
              <label className={fieldLabelClass()}>Billing PIN</label>
              <input
                className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                value={billing.postalCode}
                onChange={(e) => setBilling({ ...billing, postalCode: e.target.value })}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-[#8a7060]">Lines</p>
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-2">
              <input
                className="col-span-2 rounded border border-[#e0d8ce] px-2 py-1.5 text-sm"
                value={line.productName}
                onChange={(e) =>
                  setLines((prev) => {
                    const n = [...prev];
                    n[idx] = { ...n[idx]!, productName: e.target.value };
                    return n;
                  })
                }
              />
              <input
                type="number"
                className="rounded border border-[#e0d8ce] px-2 py-1.5 text-sm"
                value={line.quantity}
                onChange={(e) =>
                  setLines((prev) => {
                    const n = [...prev];
                    n[idx] = { ...n[idx]!, quantity: Math.max(1, Number(e.target.value) || 1) };
                    return n;
                  })
                }
              />
              <input
                className="rounded border border-[#e0d8ce] px-2 py-1.5 text-sm"
                value={paiseToRupeesInput(line.unitPriceInPaise)}
                onChange={(e) =>
                  setLines((prev) => {
                    const n = [...prev];
                    n[idx] = { ...n[idx]!, unitPriceInPaise: rupeesToPaise(e.target.value) };
                    return n;
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className={fieldLabelClass()}>Shipping ₹</label>
            <input
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={paiseToRupeesInput(shippingInPaise)}
              onChange={(e) => setShippingInPaise(rupeesToPaise(e.target.value))}
            />
          </div>
          <div>
            <label className={fieldLabelClass()}>Extra discount ₹</label>
            <input
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={paiseToRupeesInput(headerDiscountInPaise)}
              onChange={(e) => setHeaderDiscountInPaise(rupeesToPaise(e.target.value))}
            />
          </div>
          <div>
            <label className={fieldLabelClass()}>Valid until</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg bg-[#1c352a] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save changes
          </button>
          <p className="self-center text-xs text-[#8a7060]">
            Preview total uses server recalculation on save ({formatQuoteMoney(0)}…).
          </p>
        </div>
      </AccountingSectionCard>
    </SalesPageShell>
  );
}
