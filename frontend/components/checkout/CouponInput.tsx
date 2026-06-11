"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  applyCartCoupon,
  fetchCheckoutCouponOffers,
  removeCartCoupon,
  type CheckoutCouponOffer
} from "@/lib/cart-api";

type Props = {
  isLoggedIn?: boolean;
  shippingCountry?: string;
  appliedCode?: string | null;
  discountInPaise?: number;
  currency?: string;
  onUpdated: () => Promise<void>;
};

export function CouponInput({
  isLoggedIn = false,
  shippingCountry,
  appliedCode,
  discountInPaise = 0,
  currency = "INR",
  onUpdated
}: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<CheckoutCouponOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);

  const formatDiscount =
    currency === "INR"
      ? `₹${(discountInPaise / 100).toLocaleString("en-IN")}`
      : `${(discountInPaise / 100).toFixed(2)} ${currency}`;

  const loadOffers = useCallback(async () => {
    if (!isLoggedIn) {
      setOffers([]);
      setOffersLoading(false);
      return;
    }
    setOffersLoading(true);
    try {
      const data = await fetchCheckoutCouponOffers({
        country: shippingCountry
      });
      setOffers(data.offers);
    } catch {
      setOffers([]);
    } finally {
      setOffersLoading(false);
    }
  }, [isLoggedIn, shippingCountry]);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  useEffect(() => {
    if (appliedCode) setError(null);
  }, [appliedCode]);

  async function applyCode(couponCode: string) {
    setBusy(true);
    setError(null);
    try {
      await applyCartCoupon(couponCode, { country: shippingCountry });
      setCode("");
      await onUpdated();
      await loadOffers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply coupon.");
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter a coupon code.");
      return;
    }
    await applyCode(trimmed);
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await removeCartCoupon(shippingCountry);
      await onUpdated();
      await loadOffers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove coupon.");
    } finally {
      setBusy(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
        <p className="text-sm font-semibold text-stone-800">Coupon code</p>
        <p className="mt-2 text-sm text-stone-600">
          Sign in to apply coupon codes. Guest checkout is available without coupons.
        </p>
        <Link
          href="/login?next=/checkout"
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-100"
        >
          Sign in for coupons
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
      <p className="text-sm font-semibold text-stone-800">Coupon code</p>
      <p className="mt-1 text-xs text-stone-500">
        Apply or remove coupons freely before you pay. A one-time coupon only becomes unavailable after you
        complete a paid order with it.
      </p>

      {appliedCode ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2">
          <p className="text-sm text-stone-800">
            <span className="font-mono font-semibold text-emerald-900">{appliedCode}</span>
            {discountInPaise > 0 ? (
              <span className="ml-2 font-medium text-emerald-800">−{formatDiscount}</span>
            ) : null}
            <span className="mt-0.5 block text-xs font-normal text-emerald-800/90">Applied to this order</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRemove()}
            className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-emerald-50 disabled:opacity-50"
          >
            {busy ? "…" : "Remove"}
          </button>
        </div>
      ) : (
        <>
          {!offersLoading && offers.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-stone-600">Available offers</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {offers.map((offer) => (
                  <button
                    key={offer.code}
                    type="button"
                    disabled={busy || !offer.eligible}
                    title={
                      offer.eligible
                        ? `Apply ${offer.code}`
                        : offer.ineligibleReason ?? "Not available"
                    }
                    onClick={() => void applyCode(offer.code)}
                    className={`rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      offer.eligible
                        ? "border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-500 hover:bg-amber-100"
                        : "border-stone-200 bg-stone-100 text-stone-500"
                    }`}
                  >
                    <span className="font-mono">{offer.code}</span>
                    <span className="ml-1.5 font-normal opacity-90">{offer.label}</span>
                  </button>
                ))}
              </div>
              {offers.some((o) => !o.eligible) ? (
                <p className="mt-2 text-xs text-stone-500">
                  Greyed-out offers may already be used on your account or do not apply to your cart total.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Or type a code"
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
        </>
      )}

      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
