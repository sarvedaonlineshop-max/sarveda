"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  ADJUSTMENT_REASONS,
  fetchAdjustmentOptions,
  submitOrderAdjustRequest,
  type AdjustmentOptions
} from "@/lib/order-service-request";

type LineItem = {
  id: string;
  title: string;
  quantity: number;
};

type Props = {
  orderNumber: string;
  lineItems: LineItem[];
  backHref: string;
};

export function OrderAdjustmentRequestForm({ orderNumber, lineItems, backHref }: Props) {
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState<(typeof ADJUSTMENT_REASONS)[number]["code"]>("change_address");
  const [orderItemId, setOrderItemId] = useState(lineItems[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [options, setOptions] = useState<AdjustmentOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [requestedVariantId, setRequestedVariantId] = useState("");
  const [requestedQty, setRequestedQty] = useState(1);
  const [address, setAddress] = useState({
    fullName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "IN"
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!orderItemId) return;
    let cancelled = false;
    setLoadingOptions(true);
    void (async () => {
      try {
        const data = await fetchAdjustmentOptions(orderNumber, orderItemId);
        if (cancelled) return;
        setOptions(data);
        setRequestedVariantId(
          data.variants.find((v) => !v.isCurrent && v.inStock)?.id ?? data.currentVariantId
        );
        setRequestedQty(data.currentQty);
        if (data.shippingAddress) {
          setAddress({
            fullName: data.shippingAddress.fullName,
            phone: data.shippingAddress.phone,
            line1: data.shippingAddress.line1,
            line2: data.shippingAddress.line2 ?? "",
            city: data.shippingAddress.city,
            state: data.shippingAddress.state,
            postalCode: data.shippingAddress.postalCode,
            country: data.shippingAddress.country
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load options");
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, orderItemId]);

  const selectedLine = useMemo(
    () => lineItems.find((l) => l.id === orderItemId) ?? lineItems[0],
    [lineItems, orderItemId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !orderItemId) return;
    setBusy(true);
    setError(null);
    try {
      await submitOrderAdjustRequest(orderNumber, {
        reasonCode,
        orderItemId,
        message: message.trim() || undefined,
        ...(reasonCode === "change_address"
          ? {
              requestedAddress: {
                fullName: address.fullName.trim(),
                phone: address.phone.trim(),
                line1: address.line1.trim(),
                line2: address.line2.trim() || null,
                city: address.city.trim(),
                state: address.state.trim(),
                postalCode: address.postalCode.trim(),
                country: address.country.trim() || "IN"
              }
            }
          : {}),
        ...(reasonCode === "wrong_item" ? { requestedVariantId } : {}),
        ...(reasonCode === "change_quantity" ? { requestedQty } : {})
      });
      setSuccess(true);
      setTimeout(() => router.push(backHref), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-brand-cream-dark bg-white p-8 text-center shadow-card">
        <p className="text-lg font-semibold text-brand-forest">Request submitted</p>
        <p className="mt-2 text-sm text-brand-muted">
          We&apos;ll review your request before your order is dispatched.
        </p>
        <Link href={backHref} className="mt-4 inline-block text-sm font-semibold text-brand-forest underline">
          Back to orders
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="rounded-2xl border border-brand-cream-dark bg-white p-6 shadow-card">
      <h1 className="text-xl font-bold text-brand-ink">Request order change</h1>
      <p className="mt-1 text-sm text-brand-muted">
        Tell us what you&apos;d like to change. We&apos;ll review your request before dispatch — nothing is changed until
        our team confirms.
      </p>

      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <fieldset className="mt-5 space-y-2">
        <legend className="text-sm font-semibold text-brand-ink">What would you like to change?</legend>
        {ADJUSTMENT_REASONS.map((r) => (
          <label key={r.code} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="reason"
              value={r.code}
              checked={reasonCode === r.code}
              onChange={() => setReasonCode(r.code)}
              className="mt-1"
            />
            {r.label}
          </label>
        ))}
      </fieldset>

      {lineItems.length > 1 ? (
        <div className="mt-5">
          <label className="block text-sm font-semibold text-brand-ink">Order line</label>
          <select
            value={orderItemId}
            onChange={(e) => setOrderItemId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
          >
            {lineItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} × {item.quantity}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {loadingOptions ? (
        <p className="mt-4 text-sm text-brand-muted">Loading options…</p>
      ) : null}

      {reasonCode === "change_address" && options?.shippingAddress ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase text-brand-muted">Full name</label>
            <input
              required
              value={address.fullName}
              onChange={(e) => setAddress((a) => ({ ...a, fullName: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-brand-muted">Phone</label>
            <input
              required
              value={address.phone}
              onChange={(e) => setAddress((a) => ({ ...a, phone: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-brand-muted">Postal code</label>
            <input
              required
              value={address.postalCode}
              onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase text-brand-muted">Address line 1</label>
            <input
              required
              value={address.line1}
              onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase text-brand-muted">Address line 2 (optional)</label>
            <input
              value={address.line2}
              onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-brand-muted">City</label>
            <input
              required
              value={address.city}
              onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-brand-muted">State</label>
            <input
              required
              value={address.state}
              onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
            />
          </div>
        </div>
      ) : null}

      {reasonCode === "wrong_item" && options ? (
        <div className="mt-5">
          <label className="block text-sm font-semibold text-brand-ink">
            Desired option for {selectedLine?.title ?? options.productName}
          </label>
          <select
            required
            value={requestedVariantId}
            onChange={(e) => setRequestedVariantId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
          >
            {options.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={v.isCurrent}>
                {v.label} {v.isCurrent ? "(current)" : v.inStock ? "" : "(out of stock)"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {reasonCode === "change_quantity" && options ? (
        <div className="mt-5">
          <label className="block text-sm font-semibold text-brand-ink">Requested quantity</label>
          <input
            type="number"
            min={1}
            max={99}
            required
            value={requestedQty}
            onChange={(e) => setRequestedQty(Number(e.target.value))}
            className="mt-1 w-32 rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-brand-muted">Current quantity: {options.currentQty}</p>
        </div>
      ) : null}

      <div className="mt-5">
        <label className="block text-sm font-semibold text-brand-ink">Additional notes (optional)</label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-lg border border-brand-cream-dark px-3 py-2 text-sm"
          placeholder="Anything else we should know?"
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || loadingOptions}
          className="rounded-full bg-brand-forest px-6 py-2.5 text-sm font-semibold text-brand-cream disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit change request"}
        </button>
        <Link href={backHref} className="rounded-full border border-brand-cream-dark px-6 py-2.5 text-sm font-semibold">
          Cancel
        </Link>
      </div>
    </form>
  );
}
