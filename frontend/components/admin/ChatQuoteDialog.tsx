"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { crmApi, type CrmCatalogHit, type CrmQuoteAddress, type CrmSalesQuote } from "@/lib/crm-api";

type Address = {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

function emptyAddress(name: string, phone?: string | null): Address {
  return {
    fullName: name || "",
    phone: phone || "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "IN"
  };
}

function fromSaved(name: string, phone: string | null | undefined, saved?: CrmQuoteAddress | null): Address {
  const base = emptyAddress(name, phone);
  if (!saved?.line1 || saved.line1 === "Address to be confirmed") return base;
  return {
    fullName: saved.fullName || name,
    phone: saved.phone || phone || "",
    line1: saved.line1 || "",
    line2: saved.line2 || "",
    city: saved.city || "",
    state: saved.state || "",
    postalCode: saved.postalCode || "",
    country: saved.country || "IN"
  };
}

type Line = {
  key: string;
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  combination: string;
  sku?: string | null;
  hsnCode?: string | null;
  taxClass?: string | null;
  quantity: number;
  unitPriceInPaise: number;
  discountPercent: number;
};

function AddressFields({
  title,
  value,
  onChange
}: {
  title: string;
  value: Address;
  onChange: (next: Address) => void;
}) {
  const fields: Array<[keyof Address, string]> = [
    ["fullName", "Name"],
    ["phone", "Phone"],
    ["line1", "Address line"],
    ["line2", "Address line 2"],
    ["city", "City"],
    ["state", "State"],
    ["postalCode", "PIN code"]
  ];
  return (
    <div className="mt-4">
      <p className="text-[12px] font-semibold text-[#1c352a]">{title}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {fields.map(([key, name]) => (
          <label key={key} className="text-[11px] text-[#4a6b58]">
            {name}
            <input
              value={value[key]}
              onChange={(event) => onChange({ ...value, [key]: event.target.value })}
              className="mt-0.5 w-full rounded border border-[#1c352a]/15 bg-white px-2 py-1 text-[13px] text-[#1c352a]"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(paise / 100);
}

export function ChatQuoteDialog({
  customerName,
  email,
  phone,
  dealId,
  existing,
  onClose,
  onSaved
}: {
  customerName: string;
  email?: string | null;
  phone?: string | null;
  dealId?: string | null;
  existing?: CrmSalesQuote | null;
  onClose: () => void;
  onSaved: (created: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CrmCatalogHit[]>([]);
  const [lines, setLines] = useState<Line[]>(
    (existing?.items ?? []).map((item) => ({
      key: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      combination: item.sku || "",
      sku: item.sku,
      quantity: item.quantity,
      unitPriceInPaise: item.unitPriceInPaise,
      discountPercent: item.discountPercent ?? 0
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<Address>(() => fromSaved(customerName, phone, existing?.billingAddress));
  const [shipping, setShipping] = useState<Address>(() => fromSaved(customerName, phone, existing?.shippingAddress));
  const [sameAsShipping, setSameAsShipping] = useState(true);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void crmApi
        .searchQuoteCatalog(term)
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceInPaise, 0);

  function addHit(hit: CrmCatalogHit) {
    setLines((prev) => {
      const found = prev.find((line) => line.variantId === hit.variantId);
      if (found) {
        return prev.map((line) =>
          line.variantId === hit.variantId ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [
        ...prev,
        {
          key: hit.variantId,
          productId: hit.productId,
          variantId: hit.variantId,
          productName: hit.itemName,
          combination: hit.combination,
          sku: hit.sku,
          hsnCode: hit.hsnCode,
          taxClass: hit.taxClass,
          quantity: 1,
          unitPriceInPaise: hit.rateInPaise,
          discountPercent: 0
        }
      ];
    });
  }

  async function save() {
    if (lines.length === 0) {
      setError("Add at least one product");
      return;
    }
    const bill = sameAsShipping ? shipping : billing;
    if (!shipping.line1.trim() || !shipping.city.trim() || !shipping.state.trim() || !shipping.postalCode.trim()) {
      setError("Fill the shipping address");
      return;
    }
    if (!bill.line1.trim() || !bill.city.trim() || !bill.state.trim() || !bill.postalCode.trim()) {
      setError("Fill the billing address");
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      customerName: customerName || "Customer",
      email: email || null,
      phone: phone || null,
      dealId: dealId ?? null,
      billingAddress: { ...bill, fullName: bill.fullName || customerName || "Customer" },
      shippingAddress: { ...shipping, fullName: shipping.fullName || customerName || "Customer" },
      shippingSameAsBilling: sameAsShipping,
      lines: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        productName: line.combination && line.combination !== "Standard"
          ? `${line.productName} — ${line.combination}`
          : line.productName,
        sku: line.sku,
        hsnCode: line.hsnCode,
        taxClass: line.taxClass,
        quantity: line.quantity,
        unitPriceInPaise: line.unitPriceInPaise,
        discountPercent: line.discountPercent
      }))
    };
    try {
      if (existing) {
        await crmApi.updateSalesQuote(existing.id, body);
        onSaved(false);
      } else {
        await crmApi.createSalesQuote(body);
        onSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the quotation");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-[#f7f3ea] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1c352a]/10 px-4 py-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#4a6b58]">
              {existing ? "Edit quotation" : "New quotation"}
            </p>
            <h2 className="text-[16px] font-semibold text-[#1c352a]">{customerName || "Customer"}</h2>
          </div>
          <button type="button" className="text-[13px] font-semibold text-[#1c352a]" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <label className="text-[12px] font-semibold text-[#1c352a]">Search products</label>
          <div className="relative mt-1">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products, the same as the store"
              className="w-full rounded-lg border border-[#1c352a]/15 bg-white px-3 py-2 pr-9 text-[13px]"
              autoFocus
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-[#4a6b58]"
                onClick={() => {
                  setQuery("");
                  setHits([]);
                }}
              >
                ×
              </button>
            ) : null}
          </div>
          <ul className="mt-2 space-y-1">
            {hits.map((hit) => (
              <li key={hit.variantId} className="flex items-center gap-2 rounded-lg bg-white px-2 py-2 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[#1c352a]">{hit.itemName}</span>
                  <span className="text-[#4a6b58]">
                    {hit.combination} · {hit.sku} · {rupees(hit.rateInPaise)}
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-[#1c352a] px-2.5 py-1 text-[12px] font-semibold text-white"
                  onClick={() => addHit(hit)}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] font-semibold text-[#1c352a]">On this quotation</p>
          {lines.length === 0 ? <p className="mt-1 text-[12px] text-[#4a6b58]">Nothing added yet.</p> : null}
          <ul className="mt-2 space-y-2">
            {lines.map((line) => (
              <li key={line.key} className="rounded-lg bg-white px-2 py-2 text-[13px]">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="font-semibold">{line.productName}</span>
                    {line.combination ? <span className="block text-[#4a6b58]">{line.combination}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="text-[12px] font-semibold text-red-700"
                    onClick={() => setLines((prev) => prev.filter((row) => row.key !== line.key))}
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <label className="text-[11px] text-[#4a6b58]">
                    Qty
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) =>
                        setLines((prev) =>
                          prev.map((row) =>
                            row.key === line.key ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row
                          )
                        )
                      }
                      className="mt-0.5 w-16 rounded border border-[#1c352a]/15 px-2 py-1"
                    />
                  </label>
                  <label className="text-[11px] text-[#4a6b58]">
                    Rupees
                    <input
                      value={String(line.unitPriceInPaise / 100)}
                      onChange={(event) => {
                        const paise = Math.round(Number(event.target.value) * 100);
                        if (!Number.isFinite(paise) || paise < 0) return;
                        setLines((prev) =>
                          prev.map((row) => (row.key === line.key ? { ...row, unitPriceInPaise: paise } : row))
                        );
                      }}
                      className="mt-0.5 w-24 rounded border border-[#1c352a]/15 px-2 py-1"
                    />
                  </label>
                  <label className="text-[11px] text-[#4a6b58]">
                    Discount %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={line.discountPercent}
                      onChange={(event) => {
                        const discountPercent = Math.min(100, Math.max(0, Number(event.target.value) || 0));
                        setLines((prev) =>
                          prev.map((row) => (row.key === line.key ? { ...row, discountPercent } : row))
                        );
                      }}
                      className="mt-0.5 w-16 rounded border border-[#1c352a]/15 px-2 py-1"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <AddressFields title="Shipping address" value={shipping} onChange={setShipping} />
          <label className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-[#1c352a]">
            <input
              type="checkbox"
              checked={sameAsShipping}
              onChange={(event) => setSameAsShipping(event.target.checked)}
            />
            Billing address is the same as shipping
          </label>
          {sameAsShipping ? null : <AddressFields title="Billing address" value={billing} onChange={setBilling} />}
          {error ? <p className="mt-3 text-[12px] text-red-700">{error}</p> : null}
        </div>
        <div className="flex items-center justify-between border-t border-[#1c352a]/10 px-4 py-3">
          <strong className="text-[14px] text-[#1c352a]">{rupees(total)}</strong>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg bg-[#1c352a] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {existing ? "Save quotation" : "Create quotation"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
