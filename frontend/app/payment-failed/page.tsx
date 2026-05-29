"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { fetchPublicOrder, type PublicOrderSummary } from "@/lib/checkout-api";
import { formatMinorFromPaise } from "@/lib/money";

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
      <div className="mx-auto max-w-lg rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white p-8 text-center shadow-sm">
        <p className="text-brand-mid">Missing order details. Return to checkout to try again.</p>
        <Link href="/checkout" className="mt-6 inline-block font-semibold text-brand-violet hover:underline">
          Go to checkout
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white p-8 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-violet">Sarveda</p>
        <h1 className="display-text mt-2 font-serif text-2xl font-semibold text-brand-ink">Payment was not completed</h1>
        <p className="mt-2 text-sm text-brand-mid">{reason}</p>
      </div>

      {summary === undefined ? (
        <p className="text-sm text-brand-muted">Loading order…</p>
      ) : summary ? (
        <div className="rounded-xl border border-[rgba(196,176,232,0.25)] bg-brand-bg p-4 text-sm text-brand-mid">
          <p>
            <span className="font-medium">Order:</span> {summary.orderNumber}
          </p>
          <p className="mt-1">
            <span className="font-medium">Status:</span> {summary.status.replace(/_/g, " ")}
          </p>
          <p className="mt-1">
            <span className="font-medium">Amount:</span>{" "}
            {formatMinorFromPaise(summary.grandTotalInPaise, summary.currency)}
          </p>
          <p className="mt-1 text-xs text-brand-muted">{summary.email}</p>
        </div>
      ) : (
        <p className="text-sm text-brand-muted">We could not load this order. Check the link or contact support.</p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href={`/checkout?${new URLSearchParams({ orderNumber, email }).toString()}`}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-brand-violet-deep px-4 text-center text-sm font-semibold text-brand-gold hover:bg-brand-violet-mid"
        >
          Retry payment
        </Link>
        <Link
          href={`/checkout?${new URLSearchParams({ orderNumber, email }).toString()}`}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-[rgba(196,176,232,0.35)] bg-white px-4 text-center text-sm font-semibold text-brand-ink hover:border-brand-violet"
        >
          Pay via COD instead
        </Link>
      </div>
      <p className="text-xs text-brand-muted">
        COD availability depends on your cart and zone. If checkout does not offer COD, email us with your order
        number.
      </p>

      <a
        href="mailto:hello@sarveda.com"
        className="block text-center text-sm font-medium text-brand-violet underline-offset-2 hover:underline"
      >
        Contact support
      </a>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <main className="min-h-screen bg-brand-bg px-4 py-16">
      <Suspense
        fallback={
          <p className="text-center text-brand-muted" role="status">
            Loading…
          </p>
        }
      >
        <PaymentFailedContent />
      </Suspense>
    </main>
  );
}
