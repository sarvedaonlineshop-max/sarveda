"use client";

import { useCallback, useEffect, useState } from "react";

import { checkoutFormBlockClass, checkoutInputClass } from "@/lib/checkout-ui";
import {
  applyCartCoupon,
  fetchCheckoutCouponOffers,
  removeCartCoupon,
  type CheckoutCouponOffer
} from "@/lib/cart-api";

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
  const [offers, setOffers] = useState<CheckoutCouponOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);

  const formatDiscount =
    currency === "INR"
      ? `₹${(discountInPaise / 100).toLocaleString("en-IN")}`
      : `${(discountInPaise / 100).toFixed(2)} ${currency}`;

  const loadOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const data = await fetchCheckoutCouponOffers({
        country: shippingCountry,
        email: checkoutEmail
      });
      setOffers(data.offers);
    } catch {
      setOffers([]);
    } finally {
      setOffersLoading(false);
    }
  }, [shippingCountry, checkoutEmail]);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  async function applyCode(couponCode: string) {
    setBusy(true);
    setError(null);
    try {
      await applyCartCoupon(couponCode, { country: shippingCountry, email: checkoutEmail });
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

  return (
    <div className={checkoutFormBlockClass}>
      <p className="text-[10px] font-normal uppercase tracking-[0.12em] text-brand-violet">Coupon code</p>
      <p className="mt-2 text-xs font-light text-brand-mid">
        Most coupons are one-time per customer (email or account) after a successful order. You can remove
        a coupon before paying and try another.
      </p>

      {appliedCode ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-brand-sage-light bg-brand-sage-light/50 px-3 py-2">
          <p className="text-sm text-brand-ink">
            <span className="font-mono font-semibold text-brand-green">{appliedCode}</span>
            {discountInPaise > 0 ? (
              <span className="price-text ml-2 font-medium text-brand-green">−{formatDiscount}</span>
            ) : null}
            <span className="mt-0.5 block text-xs font-light text-brand-green">Applied to this order</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRemove()}
            className="shrink-0 rounded-lg border border-[rgba(196,176,232,0.3)] bg-brand-ivory px-3 py-1.5 text-xs font-medium text-brand-mid hover:bg-brand-bg disabled:opacity-50"
          >
            {busy ? "…" : "Remove"}
          </button>
        </div>
      ) : (
        <>
          {!offersLoading && offers.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-brand-mid">Available offers</p>
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
                    className={`rounded-full border px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      offer.eligible
                        ? "border-[rgba(196,176,232,0.4)] bg-[rgba(91,62,155,0.08)] text-brand-violet hover:border-brand-lavender-mid"
                        : "border-[rgba(196,176,232,0.22)] bg-transparent text-brand-muted"
                    }`}
                  >
                    <span className="font-mono">{offer.code}</span>
                    <span className="ml-1.5 font-normal opacity-90">{offer.label}</span>
                  </button>
                ))}
              </div>
              {offers.some((o) => !o.eligible) && checkoutEmail ? (
                <p className="mt-2 text-xs font-light text-brand-muted">
                  Greyed-out offers may already be used on this email or do not apply to your cart total.
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
              className={`${checkoutInputClass} min-h-[44px] flex-1 text-sm uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal`}
              aria-label="Coupon code"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void onApply()}
              className="min-h-[44px] rounded-[10px] border border-[rgba(196,176,232,0.3)] bg-brand-violet px-4 text-sm font-semibold uppercase tracking-wide text-white hover:bg-brand-violet-mid disabled:opacity-50"
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
