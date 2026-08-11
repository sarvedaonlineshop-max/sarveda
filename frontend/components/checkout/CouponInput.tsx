"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  applyCartCoupon,
  fetchCheckoutCouponOffers,
  removeCartCoupon,
  type CartCouponRejected,
  type CheckoutCouponOffer
} from "@/lib/cart-api";

type Props = {
  isLoggedIn?: boolean;
  shippingCountry?: string;
  couponRejected?: CartCouponRejected | null;
  appliedCode?: string | null;
  discountInPaise?: number;
  currency?: string;
  onUpdated: () => Promise<void>;
};

export function CouponInput({
  isLoggedIn = false,
  shippingCountry,
  couponRejected,
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

  const eligibleOffers = offers.filter((o) => o.eligible);
  const ineligibleOffers = offers.filter((o) => !o.eligible);

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

  useEffect(() => {
    if (couponRejected) {
      setError(`${couponRejected.code}: ${couponRejected.message}`);
    }
  }, [couponRejected]);

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
      <div className="rounded-2xl border border-brand-cream-dark bg-white p-4 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Coupon code</p>
        <p className="mt-2 text-sm text-brand-muted">
          Sign in to apply coupon codes. Guest checkout is available without coupons.
        </p>
        <Link
          href="/login?next=/checkout"
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border border-brand-forest/25 bg-white px-4 text-sm font-semibold text-brand-forest hover:bg-brand-forest/5"
        >
          Sign in for coupons
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-cream-dark bg-white p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Coupon code</p>

      {couponRejected && !appliedCode ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
          <span className="font-semibold font-mono">{couponRejected.code}</span>: {couponRejected.message}
        </p>
      ) : null}

      {appliedCode ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-forest/20 bg-brand-cream/70 px-3 py-2">
          <p className="text-sm text-brand-ink">
            <span className="inline-flex rounded-full border border-brand-cream-dark bg-brand-cream px-2 py-0.5 font-mono text-xs font-semibold text-brand-forest">
              {appliedCode}
            </span>
            {discountInPaise > 0 ? (
              <span className="ml-2 font-medium text-brand-sage">−{formatDiscount}</span>
            ) : null}
            <span className="mt-1 block text-xs font-normal text-brand-muted">Applied to this order</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRemove()}
            className="shrink-0 rounded-full border border-brand-forest/25 bg-white px-3 py-1.5 text-xs font-semibold text-brand-forest hover:bg-brand-forest/5 disabled:opacity-50"
          >
            {busy ? "…" : "Remove"}
          </button>
        </div>
      ) : (
        <>
          {!offersLoading && eligibleOffers.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-brand-muted">Available for your account</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {eligibleOffers.map((offer) => (
                  <button
                    key={offer.code}
                    type="button"
                    disabled={busy}
                    title={`Apply ${offer.code}`}
                    onClick={() => void applyCode(offer.code)}
                    className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1.5 text-left text-xs font-semibold text-brand-ink transition-colors hover:border-brand-gold hover:bg-brand-gold/20 disabled:opacity-50"
                  >
                    <span className="font-mono">{offer.code}</span>
                    <span className="ml-1.5 font-normal opacity-90">{offer.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!offersLoading && ineligibleOffers.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-brand-muted">Not available for your account</p>
              <ul className="mt-2 space-y-2">
                {ineligibleOffers.map((offer) => (
                  <li
                    key={offer.code}
                    className="rounded-xl border border-brand-cream-dark bg-brand-cream/60 px-3 py-2 text-xs text-brand-muted"
                  >
                    <span className="font-mono font-semibold text-brand-ink/70">{offer.code}</span>
                    <span className="ml-1.5">{offer.label}</span>
                    {offer.ineligibleReason ? (
                      <span className="mt-0.5 block text-brand-muted/80">{offer.ineligibleReason}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Or type a code"
              className="min-h-[44px] flex-1 rounded-xl border border-[#E3D9C8] bg-white px-3 font-mono text-sm uppercase tracking-wide text-brand-ink placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-brand-muted/70 focus:border-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-forest/20"
              aria-label="Coupon code"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void onApply()}
              className="min-h-[44px] rounded-full border border-brand-forest/25 bg-white px-4 text-sm font-semibold text-brand-forest hover:bg-brand-forest/5 disabled:opacity-50"
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
