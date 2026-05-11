"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useMemo, useState } from "react";

import { PaymentSelector } from "@/components/checkout/PaymentSelector";
import { useCartData } from "@/components/cart/CartProvider";
import type { CreateOrderBody } from "@/lib/checkout-api";

export function CheckoutClient() {
  const { items, subtotalInPaise, itemCount, loading, refreshCart } = useCartData();
  const [rzpReady, setRzpReady] = useState(false);

  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    []
  );

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

  const formBody: CreateOrderBody = {
    email: form.email.trim(),
    phone: form.phone.trim(),
    shippingFullName: form.shippingFullName.trim(),
    line1: form.line1.trim(),
    line2: form.line2?.trim() || undefined,
    city: form.city.trim(),
    state: form.state.trim(),
    postalCode: form.postalCode.trim(),
    country: form.country || "IN"
  };

  const onRefreshCart = useCallback(async () => {
    await refreshCart();
  }, [refreshCart]);

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

          <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-4">
            <h3 className="text-sm font-semibold text-stone-800">Cart</h3>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm text-stone-600">
              {items.map((i) => (
                <li key={i.variantId} className="flex justify-between gap-2">
                  <span className="line-clamp-2">
                    {i.productName} × {i.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="lg:sticky lg:top-24">
          <PaymentSelector
            rzpReady={rzpReady}
            idempotencyKey={idempotencyKey}
            form={formBody}
            subtotalInPaise={subtotalInPaise}
            itemCount={itemCount}
            onRefreshCart={onRefreshCart}
          />
        </div>
      </div>
    </>
  );
}
