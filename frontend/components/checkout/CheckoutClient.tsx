"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AddressFields, type CheckoutAddressForm } from "@/components/checkout/AddressFields";
import { CouponInput } from "@/components/checkout/CouponInput";
import { PaymentSelector } from "@/components/checkout/PaymentSelector";
import { useCartData } from "@/components/cart/CartProvider";
import { loadSavedCheckoutShipping, saveCheckoutShipping } from "@/lib/checkout-prefill";
import { toCheckoutApiPhone, type CheckoutFieldErrors } from "@/lib/checkout-validation";
import type { CreateOrderBody } from "@/lib/checkout-api";
import { fetchPublicOrder } from "@/lib/checkout-api";
import { fetchOrderPublic, reorderCancelledOrder, type OrderPublic } from "@/lib/orders-api";
import { countryByCode } from "@/lib/countries";
import { SavedAddressPicker } from "@/components/checkout/SavedAddressPicker";
import { fetchMe, fetchMyAddresses, type UserAddress } from "@/lib/auth-client";
import { loadRazorpayScript } from "@/lib/load-razorpay";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const indiaCheckoutOnly =
  typeof process.env.NEXT_PUBLIC_INDIA_CHECKOUT_ONLY === "string" &&
  ["1", "true", "yes"].includes(process.env.NEXT_PUBLIC_INDIA_CHECKOUT_ONLY.toLowerCase());

type CheckoutPaymentMode = "razorpay" | "cod" | "stripe" | "paypal";

function paymentModeFromProvider(provider: string | null | undefined): CheckoutPaymentMode | null {
  switch (provider) {
    case "STRIPE":
      return "stripe";
    case "PAYPAL":
      return "paypal";
    case "RAZORPAY":
      return "razorpay";
    case "COD":
      return "cod";
    default:
      return null;
  }
}

function formFromOrder(order: OrderPublic, email: string): CheckoutAddressForm {
  const addr = order.shippingAddress;
  const country = addr?.country?.trim().toUpperCase() || "IN";
  const phoneRaw = addr?.phone?.trim() ?? "";
  return {
    email: email.trim().toLowerCase(),
    phone: phoneRaw.replace(/^\+\d+/, ""),
    phoneDial: countryByCode(country)?.dial ?? "+91",
    shippingFullName: addr?.fullName?.trim() ?? "",
    line1: addr?.line1?.trim() ?? "",
    line2: addr?.line2?.trim() ?? "",
    city: addr?.city?.trim() ?? "",
    state: addr?.state?.trim() ?? "",
    postalCode: addr?.postalCode?.trim() ?? "",
    country
  };
}

export function CheckoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeOrderNumber = searchParams.get("orderNumber");
  const resumeEmail = searchParams.get("email");
  const reorderOrder = searchParams.get("reorderOrder");
  const reorderEmail = searchParams.get("reorderEmail");
  const [resumeCheckDone, setResumeCheckDone] = useState(!resumeOrderNumber);
  const [reorderDone, setReorderDone] = useState(!reorderOrder);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [resumePaymentMethod, setResumePaymentMethod] = useState<CheckoutPaymentMode | null>(null);

  const {
    items,
    subtotalInPaise,
    discountInPaise,
    coupon,
    couponRejected,
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [giftWrap, setGiftWrap] = useState(false);
  const [customerNotes, setCustomerNotes] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<UserAddress[]>([]);
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
    country: form.country || "IN",
    giftWrap,
    customerNotes: customerNotes.trim() || undefined
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
    if (!resumeOrderNumber) {
      const saved = loadSavedCheckoutShipping();
      if (saved) {
        setForm((current) => ({
          ...current,
          ...saved,
          phoneDial: saved.phoneDial ?? countryByCode(saved.country ?? "IN")?.dial ?? "+91"
        }));
      }
    }
    void fetchMe().then((user) => {
      if (!user) return;
      setIsLoggedIn(true);
      setForm((current) => ({
        ...current,
        email: current.email || user.email,
        shippingFullName: current.shippingFullName || user.name?.trim() || current.shippingFullName,
        phone: current.phone || user.phone?.replace(/^\+\d+/, "") || current.phone
      }));
      void fetchMyAddresses().then((addrs) => {
        setSavedAddresses(addrs);
        if (resumeOrderNumber) return;
        const primary = addrs.find((a) => a.isDefault) ?? addrs[0];
        if (!primary) return;
        setForm((current) => {
          if (current.line1.trim()) return current;
          return {
            ...current,
            email: current.email || user.email,
            shippingFullName: primary.fullName,
            phone: primary.phone.replace(/^\+\d+/, ""),
            phoneDial: countryByCode(primary.country)?.dial ?? "+91",
            line1: primary.line1,
            line2: primary.line2 ?? "",
            city: primary.city,
            state: primary.state,
            postalCode: primary.postalCode,
            country: primary.country
          };
        });
      });
    });
  }, []);

  useEffect(() => {
    if (reorderEmail) {
      setForm((current) => ({ ...current, email: reorderEmail }));
    }
  }, [reorderEmail]);

  useEffect(() => {
    if (!reorderOrder || !reorderEmail) {
      setReorderDone(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      setReorderDone(false);
      setReorderError(null);
      try {
        await reorderCancelledOrder(reorderOrder, reorderEmail);
        if (cancelled) return;
        await refreshCart("IN", reorderEmail.trim().toLowerCase());
        if (cancelled) return;
        router.replace("/checkout");
      } catch (e) {
        if (!cancelled) {
          setReorderError(e instanceof Error ? e.message : "Could not restore your items");
        }
      } finally {
        if (!cancelled) setReorderDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reorderOrder, reorderEmail, refreshCart, router]);

  useEffect(() => {
    if (!resumeOrderNumber || !resumeEmail) {
      setResumePaymentMethod(null);
      setResumeCheckDone(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const o = await fetchOrderPublic(resumeOrderNumber, resumeEmail);
        if (cancelled) return;
        if (o.status === "CANCELLED" || o.paymentStatus === "FAILED") {
          router.replace(
            `/order/cancelled?${new URLSearchParams({ orderNumber: resumeOrderNumber, email: resumeEmail }).toString()}`
          );
          return;
        }
        if (o.status !== "PENDING_PAYMENT") {
          router.replace(
            `/order/confirmed?${new URLSearchParams({ orderNumber: resumeOrderNumber, email: resumeEmail }).toString()}`
          );
          return;
        }
        const restored = formFromOrder(o, resumeEmail);
        setForm(restored);
        saveCheckoutShipping(restored);
        setResumePaymentMethod(paymentModeFromProvider(o.paymentProvider));
        setResumeCheckDone(true);
      } catch {
        const summary = await fetchPublicOrder(resumeOrderNumber, resumeEmail);
        if (cancelled) return;
        if (!summary) {
          setResumeCheckDone(true);
          return;
        }
        if (summary.status === "CANCELLED" || summary.paymentStatus === "FAILED") {
          router.replace(
            `/order/cancelled?${new URLSearchParams({ orderNumber: resumeOrderNumber, email: resumeEmail }).toString()}`
          );
          return;
        }
        if (summary.status !== "PENDING_PAYMENT") {
          router.replace(
            `/order/confirmed?${new URLSearchParams({ orderNumber: resumeOrderNumber, email: resumeEmail }).toString()}`
          );
          return;
        }
        setForm((current) => ({ ...current, email: resumeEmail }));
        setResumeCheckDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeOrderNumber, resumeEmail, router]);

  const debouncedForm = useDebouncedValue(form, 600);
  useEffect(() => {
    if (!debouncedForm.email.trim() && !debouncedForm.line1.trim()) return;
    saveCheckoutShipping(debouncedForm);
  }, [debouncedForm]);

  useEffect(() => {
    const onPageShow = () => {
      void refreshCart(form.country || "IN", checkoutEmailForCart);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [refreshCart, form.country, checkoutEmailForCart]);

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

  if (loading || !resumeCheckDone || !reorderDone) {
    return (
      <p className="text-center text-stone-500">
        {reorderOrder && !reorderDone ? "Restoring your items…" : "Loading cart…"}
      </p>
    );
  }

  if (reorderError) {
    return (
      <div className="rounded-2xl border border-stone-100 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-700">{reorderError}</p>
        <Link
          href="/shop"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-forest px-8 font-semibold text-brand-cream transition-colors hover:bg-brand-night"
        >
          Continue shopping
        </Link>
      </div>
    );
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
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-forest px-8 font-semibold text-brand-cream transition-colors hover:bg-brand-night"
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
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Delivery</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-brand-ink">
              {isDigitalOnly ? "Billing details" : "Shipping details"}
            </h2>
          </div>
          {isDigitalOnly ? (
            <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Digital purchase — no shipping charge. We will email your confirmation and access details.
            </p>
          ) : null}
          {isLoggedIn && savedAddresses.length > 0 ? (
            <SavedAddressPicker
              addresses={savedAddresses}
              onSelect={(partial) => setForm((current) => ({ ...current, ...partial }))}
            />
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
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-brand-cream-dark bg-brand-cream px-4 py-4 transition-colors hover:border-brand-gold/50">
            <input
              type="checkbox"
              checked={giftWrap}
              onChange={(e) => setGiftWrap(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-brand-cream-dark accent-[#1c352a] focus:ring-brand-forest"
            />
            <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="8" width="18" height="4" rx="1" />
              <path d="M12 8v13" />
              <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
              <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
            </svg>
            <span className="text-sm font-semibold text-brand-ink">I want this gift wrapped</span>
          </label>
          <div>
            <label htmlFor="checkout-customer-notes" className="mb-1.5 block text-sm font-medium text-brand-ink">
              Notes for our team <span className="font-normal text-brand-muted">(optional)</span>
            </label>
            <textarea
              id="checkout-customer-notes"
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Gift message, delivery instructions, or product preferences…"
              className="w-full rounded-xl border border-[#E3D9C8] bg-white px-3 py-2.5 text-sm text-brand-ink placeholder:text-brand-muted/70 focus:border-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-forest/20"
            />
          </div>
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          {!resumeOrderNumber && items.length > 0 ? (
            <CouponInput
              isLoggedIn={isLoggedIn}
              shippingCountry={form.country}
              couponRejected={couponRejected}
              appliedCode={coupon?.code}
              discountInPaise={discountInPaise}
              currency={currency}
              onUpdated={onRefreshCart}
            />
          ) : null}
          {resumeOrderNumber ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
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
            resumePaymentMethod={resumePaymentMethod}
          />
        </div>
      </div>
    </>
  );
}
