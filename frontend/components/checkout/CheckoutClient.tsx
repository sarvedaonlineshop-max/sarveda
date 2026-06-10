"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AddressFields, type CheckoutAddressForm } from "@/components/checkout/AddressFields";
import { CouponInput } from "@/components/checkout/CouponInput";
import { PaymentSelector } from "@/components/checkout/PaymentSelector";
import { useCartData } from "@/components/cart/CartProvider";
import { loadSavedCheckoutShipping, saveCheckoutShipping } from "@/lib/checkout-prefill";
import { toCheckoutApiPhone, type CheckoutFieldErrors } from "@/lib/checkout-validation";
import type { CreateOrderBody } from "@/lib/checkout-api";
import { countryByCode } from "@/lib/countries";
import { fetchMe } from "@/lib/auth-client";
import { loadRazorpayScript } from "@/lib/load-razorpay";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const indiaCheckoutOnly =
  typeof process.env.NEXT_PUBLIC_INDIA_CHECKOUT_ONLY === "string" &&
  ["1", "true", "yes"].includes(process.env.NEXT_PUBLIC_INDIA_CHECKOUT_ONLY.toLowerCase());

export function CheckoutClient() {
  const searchParams = useSearchParams();
  const resumeOrderNumber = searchParams.get("orderNumber");
  const resumeEmail = searchParams.get("email");

  const {
    items,
    subtotalInPaise,
    discountInPaise,
    coupon,
    currency,
    itemCount,
    isDigitalOnly,
    loading,
    refreshCart
  } = useCartData();
  const [rzpReady, setRzpReady] = useState(false);
  const [rzpLoadError, setRzpLoadError] = useState<string | null>(null);
  const [completingCheckout, setCompletingCheckout] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [showAllFieldErrors, setShowAllFieldErrors] = useState(false);
  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    []
  );

  const [form, setForm] = useState<CheckoutAddressForm>({
    email: "",
    phone: "",
    phoneDial: "+91",
    shippingFullName: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "IN"
  });

  const debouncedEmail = useDebouncedValue(form.email, 450);

  const formBody: CreateOrderBody = {
    email: form.email.trim(),
    phone: toCheckoutApiPhone(form),
    shippingFullName: form.shippingFullName.trim(),
    line1: form.line1.trim(),
    line2: form.line2?.trim() || undefined,
    city: form.city.trim(),
    state: form.state.trim(),
    postalCode: form.country === "IN" ? form.postalCode.replace(/\D/g, "") : form.postalCode.trim(),
    country: form.country || "IN"
  };

  const checkoutEmailForCart = useMemo(() => {
    const email = debouncedEmail.trim().toLowerCase();
    return email.includes("@") ? email : undefined;
  }, [debouncedEmail]);

  const onRefreshCart = useCallback(async () => {
    await refreshCart(form.country || "IN", checkoutEmailForCart);
  }, [refreshCart, form.country, checkoutEmailForCart]);

  useEffect(() => {
    void refreshCart(form.country || "IN", checkoutEmailForCart);
  }, [form.country, checkoutEmailForCart, refreshCart]);

  useEffect(() => {
    const saved = loadSavedCheckoutShipping();
    if (saved) {
      setForm((current) => ({
        ...current,
        ...saved,
        phoneDial: saved.phoneDial ?? countryByCode(saved.country ?? "IN")?.dial ?? "+91"
      }));
    }
    void fetchMe().then((user) => {
      if (!user) return;
      setForm((current) => ({
        ...current,
        email: current.email || user.email,
        shippingFullName: current.shippingFullName || user.name?.trim() || current.shippingFullName,
        phone: current.phone || user.phone?.replace(/^\+\d+/, "") || current.phone
      }));
    });
  }, []);

  useEffect(() => {
    if (resumeEmail) {
      setForm((current) => ({ ...current, email: resumeEmail }));
    }
  }, [resumeEmail]);

  useEffect(() => {
    const onPageShow = () => {
      void refreshCart();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [refreshCart]);

  useEffect(() => {
    let cancelled = false;
    void loadRazorpayScript().then((ready) => {
      if (cancelled) return;
      setRzpReady(ready);
      if (!ready) {
        setRzpLoadError("Payment gateway is taking longer than usual. You can still try Pay after checking your connection.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-center text-stone-500">Loading cart…</p>;
  }

  if (completingCheckout) {
    return (
      <div className="rounded-2xl border border-stone-100 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-700">Payment received. Taking you to your order confirmation…</p>
      </div>
    );
  }

  if (items.length === 0 && !resumeOrderNumber) {
    return (
      <div className="rounded-2xl border border-stone-100 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">Your cart is empty.</p>
        <Link
          href="/shop"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-stone-900 px-8 font-semibold text-amber-400 hover:bg-amber-700 hover:text-white"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <>
      {rzpLoadError ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          {rzpLoadError}
        </p>
      ) : null}
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="min-w-0 space-y-5">
          <h2 className="text-xl font-semibold text-stone-900">
            {isDigitalOnly ? "Billing details" : "Shipping details"}
          </h2>
          {isDigitalOnly ? (
            <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Digital purchase — no shipping charge. We will email your confirmation and access details.
            </p>
          ) : null}
          <AddressFields
            form={form}
            fieldErrors={fieldErrors}
            showAllErrors={showAllFieldErrors}
            indiaCheckoutOnly={indiaCheckoutOnly}
            onChange={(next) => {
              setForm(next);
            }}
          />
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          {!resumeOrderNumber && items.length > 0 ? (
            <CouponInput
              shippingCountry={form.country}
              checkoutEmail={checkoutEmailForCart}
              appliedCode={coupon?.code}
              discountInPaise={discountInPaise}
              currency={currency}
              onUpdated={onRefreshCart}
            />
          ) : null}
          {resumeOrderNumber ? (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Resume payment for order <span className="font-mono font-medium">{resumeOrderNumber}</span>. Your
              cart is unchanged if you left checkout earlier.
            </p>
          ) : null}
          <PaymentSelector
            rzpReady={rzpReady}
            idempotencyKey={idempotencyKey}
            form={formBody}
            addressForm={form}
            cartItems={items}
            isDigitalOnly={isDigitalOnly}
            subtotalInPaise={subtotalInPaise}
            discountInPaise={discountInPaise}
            cartCurrency={currency}
            itemCount={itemCount}
            onRefreshCart={onRefreshCart}
            onCheckoutCompleting={() => {
              saveCheckoutShipping(form);
              setCompletingCheckout(true);
            }}
            onFieldErrors={(errors) => {
              setShowAllFieldErrors(true);
              setFieldErrors(errors);
            }}
            resumeOrderNumber={resumeOrderNumber}
          />
        </div>
      </div>
    </>
  );
}
