"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { fetchPublicOrder, type PublicOrderSummary } from "@/lib/checkout-api";
import { formatINRFromPaise } from "@/lib/money";

function PaymentFailedContent() {
  const sp = useSearchParams();
  const orderNumber = sp.get("orderNumber") ?? "";
  const email = sp.get("email") ?? "";
  const reason = sp.get("reason") ?? "Payment was not completed";

  const [summary, setSummary] = useState<PublicOrderSummary | null | undefined>(undefined);

  useEffect(() => {
    if (!orderNumber || !email) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const o = await fetchPublicOrder(orderNumber, email);
      if (!cancelled) setSummary(o ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, email]);

  if (!orderNumber || !email) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">Missing order details. Return to checkout to try again.</p>
        <Link href="/checkout" className="mt-6 inline-block font-semibold text-amber-800 hover:underline">
          Go to checkout
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">Sarveda</p>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-stone-900">Payment was not completed</h1>
        <p className="mt-2 text-sm text-stone-600">{reason}</p>
      </div>

      {summary === undefined ? (
        <p className="text-sm text-stone-500">Loading order…</p>
      ) : summary ? (
        <div className="rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm text-stone-700">
          <p>
            <span className="font-medium">Order:</span> {summary.orderNumber}
          </p>
          <p className="mt-1">
            <span className="font-medium">Status:</span> {summary.status.replace(/_/g, " ")}
          </p>
          <p className="mt-1">
            <span className="font-medium">Amount:</span> {formatINRFromPaise(summary.grandTotalInPaise)}
          </p>
          <p className="mt-1 text-xs text-stone-500">{summary.email}</p>
        </div>
      ) : (
        <p className="text-sm text-stone-500">We could not load this order. Check the link or contact support.</p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/checkout"
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-stone-900 px-4 text-center text-sm font-semibold text-amber-400 hover:bg-amber-800"
        >
          Retry payment
        </Link>
        <Link
          href="/checkout"
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-center text-sm font-semibold text-stone-800 hover:border-amber-600"
        >
          Pay via COD instead
        </Link>
      </div>
      <p className="text-xs text-stone-500">
        COD availability depends on your cart and zone. If checkout does not offer COD, email us with your order
        number.
      </p>

      <a
        href="mailto:hello@sarveda.com"
        className="block text-center text-sm font-medium text-amber-800 underline-offset-2 hover:underline"
      >
        Contact support
      </a>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-16">
      <Suspense
        fallback={
          <p className="text-center text-stone-500" role="status">
            Loading…
          </p>
        }
      >
        <PaymentFailedContent />
      </Suspense>
    </main>
  );
}
