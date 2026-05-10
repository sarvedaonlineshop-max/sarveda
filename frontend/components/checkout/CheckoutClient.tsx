"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useCartData } from "@/components/cart/CartProvider";
import { clearSession } from "@/lib/cart-api";
import { createOrder, verifyRazorpayPayment, type CreateOrderBody } from "@/lib/checkout-api";
import { formatINRFromPaise } from "@/lib/money";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (ev: string, fn: () => void) => void };
  }
}

export function CheckoutClient() {
  const router = useRouter();
  const { items, subtotalInPaise, itemCount, loading, refreshCart } = useCartData();
  const [rzpReady, setRzpReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    phone: "",
    shippingFullName: "",
    line1: "",
    line2: "" as string,
    city: "",
    state: "",
    postalCode: "",
    country: "IN"
  });

  const onPay = useCallback(async () => {
    setErr(null);
    if (items.length === 0) {
      setErr("Your cart is empty.");
      return;
    }
    setSubmitting(true);
    try {
      const order = await createOrder({
        email: form.email.trim(),
        phone: form.phone.trim(),
        shippingFullName: form.shippingFullName.trim(),
        line1: form.line1.trim(),
        line2: form.line2?.trim() || undefined,
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        country: form.country || "IN"
      });

      await refreshCart();
      clearSession();

      if (!window.Razorpay) {
        setErr("Payment script not loaded. Please refresh.");
        setSubmitting(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: order.razorpayKeyId,
        amount: order.amountInPaise,
        currency: order.currency,
        order_id: order.rzpOrderId,
        name: "Sarveda",
        description: `Order ${order.orderNumber}`,
        prefill: {
          email: form.email.trim(),
          contact: form.phone.trim()
        },
        theme: { color: "#44403c" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const { orderNumber } = await verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            const q = new URLSearchParams({
              orderNumber,
              email: form.email.trim().toLowerCase()
            });
            router.push(`/order/confirmed?${q.toString()}`);
          } catch (e) {
            console.error(e);
            setErr(e instanceof Error ? e.message : "Verification failed");
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => setSubmitting(false)
        }
      });

      rzp.open();
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "Checkout failed");
      setSubmitting(false);
    }
  }, [form, items.length, refreshCart, router]);

  if (loading) {
    return <p className="text-center text-stone-500">Loading cart…</p>;
  }

  if (items.length === 0) {
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
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setRzpReady(true)}
      />
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-5">
          <h2 className="font-serif text-xl font-semibold text-stone-900">Shipping details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-stone-500">
                Full name
              </span>
              <input
                required
                className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
                value={form.shippingFullName}
                onChange={(e) => setForm((f) => ({ ...f, shippingFullName: e.target.value }))}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-stone-500">Email</span>
              <input
                required
                type="email"
                autoComplete="email"
                className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-stone-500">Phone</span>
              <input
                required
                type="tel"
                autoComplete="tel"
                className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-stone-500">
                Address line 1
              </span>
              <input
                required
                className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
                value={form.line1}
                onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-stone-500">
                Address line 2 (optional)
              </span>
              <input
                className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
                value={form.line2}
                onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-stone-500">City</span>
              <input
                required
                className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-stone-500">State</span>
              <input
                required
                className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-stone-500">PIN</span>
              <input
                required
                className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-stone-500">Country</span>
              <input
                required
                maxLength={2}
                className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 uppercase text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
              />
            </label>
          </div>
        </div>

        <div className="lg:sticky lg:top-24">
          <div className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
            <h2 className="font-serif text-xl font-semibold text-stone-900">Order summary</h2>
            <ul className="mt-4 max-h-60 space-y-2 overflow-y-auto text-sm text-stone-600">
              {items.map((i) => (
                <li key={i.variantId} className="flex justify-between gap-2">
                  <span className="line-clamp-2">
                    {i.productName} × {i.quantity}
                  </span>
                  <span className="shrink-0 font-medium text-amber-800">
                    {formatINRFromPaise(i.unitPriceInPaise * i.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-stone-100 pt-4 text-stone-900">
              <span>{itemCount} items</span>
              <span className="font-serif text-2xl font-semibold text-amber-800">
                {formatINRFromPaise(subtotalInPaise)}
              </span>
            </div>
            <p className="mt-2 text-xs text-stone-500">GST included · Shipping Rs 0 for this demo</p>

            {err ? <p className="mt-4 text-sm text-red-600">{err}</p> : null}

            <button
              type="button"
              disabled={submitting || !rzpReady}
              onClick={() => void onPay()}
              className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-stone-900 py-3.5 text-base font-semibold tracking-wide text-amber-400 shadow-lg transition-colors hover:bg-amber-700 hover:text-white disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
            >
              {!rzpReady ? "Loading payment…" : submitting ? "Processing…" : "Pay with Razorpay"}
            </button>
            {!rzpReady ? (
              <p className="mt-2 text-center text-xs text-stone-500">Secure checkout powered by Razorpay</p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
