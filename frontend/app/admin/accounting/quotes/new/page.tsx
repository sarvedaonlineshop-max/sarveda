"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  AccountingAlert,
  AccountingSectionCard,
  SalesPageShell,
  fieldLabelClass
} from "@/components/admin/accounting/sales/sales-ui";
import {
  createQuotation,
  formatQuoteMoney,
  markQuotationSent,
  searchQuoteCatalog,
  searchQuoteCustomers,
  type QuoteAddress,
  type QuoteLineDraft,
  type QuoteUpsertBody
} from "@/lib/quotations-api";

function emptyAddr(): QuoteAddress {
  return {
    fullName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "IN"
  };
}

function emptyLine(): QuoteLineDraft {
  return {
    productName: "",
    quantity: 1,
    unitPriceInPaise: 0,
    discountInPaise: 0
  };
}

function rupeesToPaise(raw: string): number {
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function paiseToRupeesInput(paise: number): string {
  return (paise / 100).toFixed(2);
}

export default function NewQuotePage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [billing, setBilling] = useState<QuoteAddress>(emptyAddr());
  const [shipping, setShipping] = useState<QuoteAddress>(emptyAddr());
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [lines, setLines] = useState<QuoteLineDraft[]>([emptyLine()]);
  const [shippingInPaise, setShippingInPaise] = useState(0);
  const [headerDiscountInPaise, setHeaderDiscountInPaise] = useState(0);
  const [validUntil, setValidUntil] = useState("");
  const [terms, setTerms] = useState(
    "Prices are estimates and subject to confirmation. This quotation is not a tax invoice."
  );
  const [notes, setNotes] = useState("");
  const [custQ, setCustQ] = useState("");
  const [custHits, setCustHits] = useState<
    Array<{ id: string; name: string | null; email: string; phone: string | null }>
  >([]);
  const [searchQ, setSearchQ] = useState<Record<number, string>>({});
  const [searchHits, setSearchHits] = useState<
    Record<
      number,
      Array<{
        variantId: string;
        productId: string;
        itemName: string;
        sku: string;
        hsnCode: string | null;
        taxClass: string | null;
        rateInPaise: number;
      }>
    >
  >({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const preview = useMemo(() => {
    const subtotal = lines.reduce(
      (s, l) => s + Math.max(0, l.quantity) * Math.max(0, l.unitPriceInPaise),
      0
    );
    const lineDisc = lines.reduce((s, l) => s + Math.max(0, l.discountInPaise ?? 0), 0);
    const net = Math.max(0, subtotal - lineDisc - headerDiscountInPaise);
    return {
      subtotal,
      discount: lineDisc + headerDiscountInPaise,
      shipping: shippingInPaise,
      grand: net + shippingInPaise
    };
  }, [lines, headerDiscountInPaise, shippingInPaise]);

  function buildBody(): QuoteUpsertBody {
    const ship = sameAsBilling ? { ...billing, fullName: billing.fullName || customerName } : shipping;
    return {
      customerId,
      customerName: customerName.trim() || billing.fullName,
      email: email.trim() || null,
      phone: phone.trim() || null,
      buyerGstin: buyerGstin.trim() || null,
      billingAddress: { ...billing, fullName: billing.fullName || customerName },
      shippingAddress: ship,
      shippingSameAsBilling: sameAsBilling,
      currency: "INR",
      shippingInPaise,
      discountInPaise: headerDiscountInPaise,
      validUntil: validUntil ? new Date(`${validUntil}T23:59:59.000Z`).toISOString() : null,
      terms: terms.trim() || null,
      notes: notes.trim() || null,
      lines: lines.filter((l) => l.productName.trim() && l.quantity > 0)
    };
  }

  async function save(andSend: boolean) {
    setErr(null);
    const body = buildBody();
    if (!body.customerName.trim()) {
      setErr("Customer name is required");
      return;
    }
    if (!body.billingAddress.line1 || !body.billingAddress.city || !body.billingAddress.state) {
      setErr("Complete billing address (line, city, state)");
      return;
    }
    if (body.lines.length === 0) {
      setErr("Add at least one line item");
      return;
    }
    setBusy(true);
    try {
      const { quotation } = await createQuotation(body);
      setToast("Quotation saved");
      if (andSend) {
        await markQuotationSent(quotation.id);
        setToast("Quotation issued");
      }
      router.push(`/admin/accounting/quotes/${quotation.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function findCustomers(raw: string) {
    setCustQ(raw);
    if (raw.trim().length < 2) {
      setCustHits([]);
      return;
    }
    const data = await searchQuoteCustomers(raw.trim());
    setCustHits(data.items);
  }

  async function findProducts(idx: number, raw: string) {
    setSearchQ((s) => ({ ...s, [idx]: raw }));
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, productName: raw };
      return next;
    });
    if (raw.trim().length < 2) {
      setSearchHits((s) => ({ ...s, [idx]: [] }));
      return;
    }
    const data = await searchQuoteCatalog(raw.trim());
    setSearchHits((s) => ({ ...s, [idx]: data.items }));
  }

  return (
    <SalesPageShell
      title="New Quote"
      subtitle="Draft a commercial quotation. Does not create invoices, journals, or stock movements."
      actions={
        <Link href="/admin/accounting/quotes" className="text-sm text-[#8a7060] underline">
          Back to list
        </Link>
      }
    >
      {toast ? <AccountingAlert tone="success">{toast}</AccountingAlert> : null}
      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <AccountingSectionCard>
            <h2 className="text-sm font-semibold text-[#1c352a]">Customer</h2>
            <div className="mt-3 relative">
              <label className={fieldLabelClass()}>Find existing customer</label>
              <input
                className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                value={custQ}
                onChange={(e) => void findCustomers(e.target.value)}
                placeholder="Search name, email, phone"
              />
              {custHits.length > 0 ? (
                <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-[#e0d8ce] bg-white shadow">
                  {custHits.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-[#faf5ec]"
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustomerName(c.name || "");
                          setEmail(c.email);
                          setPhone(c.phone || "");
                          setCustHits([]);
                          setCustQ(c.email);
                        }}
                      >
                        {c.name || "Customer"} · {c.email}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={fieldLabelClass()}>Customer name *</label>
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
                <label className={fieldLabelClass()}>Buyer GSTIN (B2B optional)</label>
                <input
                  className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm uppercase"
                  value={buyerGstin}
                  onChange={(e) => setBuyerGstin(e.target.value)}
                />
              </div>
            </div>
          </AccountingSectionCard>

          <AccountingSectionCard>
            <h2 className="text-sm font-semibold text-[#1c352a]">Address & GST</h2>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <AddressFields
                title="Billing"
                value={billing}
                onChange={setBilling}
              />
              <div>
                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-[#6b5a4e]">
                  <input
                    type="checkbox"
                    checked={sameAsBilling}
                    onChange={(e) => setSameAsBilling(e.target.checked)}
                  />
                  Shipping same as billing
                </label>
                {!sameAsBilling ? (
                  <AddressFields title="Shipping" value={shipping} onChange={setShipping} />
                ) : (
                  <p className="text-xs text-[#8a7060]">Shipping will mirror billing.</p>
                )}
              </div>
            </div>
          </AccountingSectionCard>

          <AccountingSectionCard>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#1c352a]">Items</h2>
              <button
                type="button"
                className="text-xs font-medium text-[#1c352a] underline"
                onClick={() => setLines((l) => [...l, emptyLine()])}
              >
                Add line
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {lines.map((line, idx) => (
                <div key={idx} className="rounded-lg border border-[#ebe4db] p-3">
                  <div className="relative">
                    <label className={fieldLabelClass()}>Product / description</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                      value={searchQ[idx] ?? line.productName}
                      onChange={(e) => void findProducts(idx, e.target.value)}
                    />
                    {(searchHits[idx] ?? []).length > 0 ? (
                      <ul className="absolute z-10 mt-1 max-h-36 w-full overflow-auto rounded-lg border bg-white shadow">
                        {(searchHits[idx] ?? []).map((hit) => (
                          <li key={hit.variantId}>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-[#faf5ec]"
                              onClick={() => {
                                setLines((prev) => {
                                  const next = [...prev];
                                  next[idx] = {
                                    productId: hit.productId,
                                    variantId: hit.variantId,
                                    productName: hit.itemName,
                                    sku: hit.sku,
                                    hsnCode: hit.hsnCode,
                                    taxClass: hit.taxClass,
                                    quantity: next[idx]?.quantity ?? 1,
                                    unitPriceInPaise: hit.rateInPaise,
                                    discountInPaise: 0
                                  };
                                  return next;
                                });
                                setSearchQ((s) => ({ ...s, [idx]: hit.itemName }));
                                setSearchHits((s) => ({ ...s, [idx]: [] }));
                              }}
                            >
                              {hit.itemName} · {hit.sku} · {formatQuoteMoney(hit.rateInPaise)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <label className={fieldLabelClass()}>Qty</label>
                      <input
                        type="number"
                        min={1}
                        className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-2 py-1.5 text-sm"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx] = {
                              ...next[idx]!,
                              quantity: Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                            };
                            return next;
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className={fieldLabelClass()}>Rate (₹)</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-2 py-1.5 text-sm"
                        value={paiseToRupeesInput(line.unitPriceInPaise)}
                        onChange={(e) =>
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx] = {
                              ...next[idx]!,
                              unitPriceInPaise: rupeesToPaise(e.target.value)
                            };
                            return next;
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className={fieldLabelClass()}>Discount (₹)</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-2 py-1.5 text-sm"
                        value={paiseToRupeesInput(line.discountInPaise ?? 0)}
                        onChange={(e) =>
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx] = {
                              ...next[idx]!,
                              discountInPaise: rupeesToPaise(e.target.value)
                            };
                            return next;
                          })
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="text-xs text-red-700 underline"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {line.sku ? (
                    <p className="mt-1 text-xs text-[#8a7060]">
                      SKU {line.sku}
                      {line.hsnCode ? ` · HSN ${line.hsnCode}` : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </AccountingSectionCard>

          <AccountingSectionCard>
            <h2 className="text-sm font-semibold text-[#1c352a]">Charges / validity / terms</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className={fieldLabelClass()}>Shipping (₹)</label>
                <input
                  className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                  value={paiseToRupeesInput(shippingInPaise)}
                  onChange={(e) => setShippingInPaise(rupeesToPaise(e.target.value))}
                />
              </div>
              <div>
                <label className={fieldLabelClass()}>Extra discount (₹)</label>
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
            <div className="mt-3">
              <label className={fieldLabelClass()}>Terms</label>
              <textarea
                className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <label className={fieldLabelClass()}>Notes</label>
              <textarea
                className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-2 text-sm"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </AccountingSectionCard>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <AccountingSectionCard>
            <h2 className="text-sm font-semibold text-[#1c352a]">Summary</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#8a7060]">Subtotal</dt>
                <dd>{formatQuoteMoney(preview.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#8a7060]">Discount</dt>
                <dd>−{formatQuoteMoney(preview.discount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#8a7060]">Shipping</dt>
                <dd>{formatQuoteMoney(preview.shipping)}</dd>
              </div>
              <p className="text-xs text-[#8a7060]">
                Estimated GST is calculated on save from inclusive line prices (India INR).
              </p>
              <div className="flex justify-between border-t border-[#ebe4db] pt-2 font-semibold">
                <dt>Grand total</dt>
                <dd>{formatQuoteMoney(preview.grand)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(false)}
                className="rounded-lg border border-[#1c352a] px-3 py-2 text-sm font-medium text-[#1c352a] disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(true)}
                className="rounded-lg bg-[#1c352a] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save & Mark Sent
              </button>
            </div>
          </AccountingSectionCard>
        </aside>
      </div>
    </SalesPageShell>
  );
}

function AddressFields({
  title,
  value,
  onChange
}: {
  title: string;
  value: QuoteAddress;
  onChange: (v: QuoteAddress) => void;
}) {
  function set<K extends keyof QuoteAddress>(key: K, v: QuoteAddress[K]) {
    onChange({ ...value, [key]: v });
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7060]">{title}</p>
      {(
        [
          ["fullName", "Full name"],
          ["line1", "Address line 1"],
          ["line2", "Address line 2"],
          ["city", "City"],
          ["state", "State"],
          ["postalCode", "PIN / Postal"],
          ["phone", "Phone"]
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <label className={fieldLabelClass()}>{label}</label>
          <input
            className="mt-1 w-full rounded-lg border border-[#e0d8ce] px-3 py-1.5 text-sm"
            value={value[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
