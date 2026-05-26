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
import { checkIndiaDelhiveryDelivery } from "@/lib/shipping-india-api";

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
    loading,
    refreshCart
  } = useCartData();
  const [rzpReady, setRzpReady] = useState(false);
  const [rzpLoadError, setRzpLoadError] = useState<string | null>(null);
  const [completingCheckout, setCompletingCheckout] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [pinHint, setPinHint] = useState<{ kind: "idle" | "loading" | "ok" | "err"; text?: string }>({
    kind: "idle"
  });

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

  const onRefreshCart = useCallback(async () => {
    await refreshCart(form.country || "IN", form.email.trim() || undefined);
  }, [refreshCart, form.country, form.email]);

  useEffect(() => {
    void refreshCart(form.country || "IN", form.email.trim() || undefined);
  }, [form.country, form.email, refreshCart]);

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

  useEffect(() => {
    let cancelled = false;
    if (form.country !== "IN") {
      setPinHint({ kind: "idle" });
      return () => {
        cancelled = true;
      };
    }
    const pin = form.postalCode.replace(/\D/g, "");
    if (pin.length !== 6) {
      setPinHint({ kind: "idle" });
      return () => {
        cancelled = true;
      };
    }
    const handle = window.setTimeout(() => {
      setPinHint({ kind: "loading", text: "Checking delivery to this PIN…" });
      const weightKg = Math.max(0.05, Math.min(30, Math.max(itemCount, 1) * 0.35));
      void checkIndiaDelhiveryDelivery(pin)
        .then((r) => {
          if (cancelled) return;
          if (r.serviceable) {
            setPinHint({
              kind: "ok",
              text: `Deliverable via Delhivery${r.estimatedDays ? ` (~${r.estimatedDays} days after dispatch)` : ""}.`
            });
          } else {
            setPinHint({
              kind: "err",
              text: "No courier quoted for this PIN at the estimated cart weight. Checkout will verify again with your full cart before payment."
            });
          }
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setPinHint({
            kind: "err",
            text: e instanceof Error ? e.message : "Could not verify this PIN right now."
          });
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [form.country, form.postalCode, itemCount]);

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
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-5">
          <h2 className="text-xl font-semibold text-stone-900">Shipping details</h2>
          <AddressFields
            form={form}
            fieldErrors={fieldErrors}
            indiaCheckoutOnly={indiaCheckoutOnly}
            onChange={(next) => {
              setForm(next);
              setFieldErrors({});
            }}
          />
          {pinHint.kind !== "idle" ? (
            <p
              className={`text-xs ${
                pinHint.kind === "ok"
                  ? "text-emerald-700"
                  : pinHint.kind === "loading"
                    ? "text-stone-500"
                    : "text-amber-800"
              }`}
              role="status"
            >
              {pinHint.text}
            </p>
          ) : null}
          <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-4">
            <h3 className="text-sm font-semibold text-stone-800">Cart</h3>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm text-stone-600">
              {items.map((item) => (
                <li key={item.variantId} className="flex justify-between gap-2">
                  <span className="line-clamp-2">
                    {item.productName} × {item.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="lg:sticky lg:top-24 space-y-4">
          {!resumeOrderNumber && items.length > 0 ? (
            <CouponInput
              shippingCountry={form.country}
              checkoutEmail={form.email.trim() || undefined}
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
            subtotalInPaise={subtotalInPaise}
            discountInPaise={discountInPaise}
            cartCurrency={currency}
            itemCount={itemCount}
            onRefreshCart={onRefreshCart}
            onCheckoutCompleting={() => {
              saveCheckoutShipping(form);
              setCompletingCheckout(true);
            }}
            onFieldErrors={setFieldErrors}
            resumeOrderNumber={resumeOrderNumber}
          />
        </div>
      </div>
    </>
  );
}
