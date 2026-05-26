"use client";

import { useState } from "react";

import { applyCartCoupon, removeCartCoupon } from "@/lib/cart-api";

type Props = {
  shippingCountry?: string;
  checkoutEmail?: string;
  appliedCode?: string | null;
  discountInPaise?: number;
  currency?: string;
  onUpdated: () => Promise<void>;
};

export function CouponInput({
  shippingCountry,
  checkoutEmail,
  appliedCode,
  discountInPaise = 0,
  currency = "INR",
  onUpdated
}: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDiscount =
    currency === "INR"
      ? `₹${(discountInPaise / 100).toLocaleString("en-IN")}`
      : `${(discountInPaise / 100).toFixed(2)} ${currency}`;

  async function onApply() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter a coupon code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await applyCartCoupon(trimmed, { country: shippingCountry, email: checkoutEmail });
      setCode("");
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply coupon.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await removeCartCoupon(shippingCountry);
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove coupon.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
      <p className="text-sm font-semibold text-stone-800">Coupon code</p>
      {appliedCode ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-stone-700">
            <span className="font-mono font-medium text-emerald-800">{appliedCode}</span>
            {discountInPaise > 0 ? (
              <span className="ml-2 text-emerald-700">−{formatDiscount}</span>
            ) : null}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRemove()}
            className="text-xs font-medium text-stone-600 underline hover:text-stone-900 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. WELCOME10"
            className="min-h-[44px] flex-1 rounded-lg border border-stone-200 bg-white px-3 text-sm uppercase tracking-wide text-stone-900 placeholder:normal-case placeholder:tracking-normal"
            aria-label="Coupon code"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onApply()}
            className="min-h-[44px] rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
          >
            {busy ? "Applying…" : "Apply"}
          </button>
        </div>
      )}
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
