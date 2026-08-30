"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PaymentFailMark } from "@/components/orders/PaymentFailMark";
import { fetchPublicOrder, type PublicOrderSummary } from "@/lib/checkout-api";
import { formatMinorFromPaise } from "@/lib/money";
import { clearPendingCheckout } from "@/lib/pending-checkout";
import {
  parsePaymentOutcome,
  paymentComplaintHref,
  paymentOutcomeCopy
} from "@/lib/payment-outcome";

function PaymentFailedContent() {
  const sp = useSearchParams();
  const orderNumber = sp.get("orderNumber") ?? "";
  const email = sp.get("email") ?? "";
  const outcome = parsePaymentOutcome(sp.get("outcome"));
  const copy = paymentOutcomeCopy(outcome);

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

  const checkoutResume = useMemo(() => {
    if (!orderNumber || !email) return "/checkout";
    return `/checkout?${new URLSearchParams({ orderNumber, email }).toString()}`;
  }, [orderNumber, email]);

  const checkoutFresh = "/checkout";

  const complaintHref = paymentComplaintHref({ orderNumber, email, outcome });
  const banner =
    outcome === "failed"
      ? "from-[#5c1c1a] via-[#8a2e28] to-[#c0453f]"
      : outcome === "pending"
        ? "from-[#633806] via-[#8a5a12] to-[#d99a2b]"
        : "from-[#3d342e] via-[#5c4f46] to-[#8a7060]";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${banner} p-8 text-center shadow-lg`}>
        <span className="pointer-events-none absolute -left-10 top-4 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <span className="pointer-events-none absolute -right-8 bottom-2 h-28 w-28 rounded-full bg-black/20 blur-2xl" aria-hidden />
        <PaymentFailMark outcome={outcome} />
        <h1 className="mt-5 font-serif text-3xl font-semibold text-white sm:text-4xl">{copy.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/90">{copy.body}</p>
        {orderNumber ? (
          <span className="mt-5 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 font-mono text-xs font-semibold tracking-wide text-white">
            {orderNumber}
          </span>
        ) : null}
      </div>

      {summary === undefined && orderNumber ? (
        <p className="text-center text-sm text-brand-muted">Loading order…</p>
      ) : summary ? (
        <div className="rounded-2xl border border-brand-cream-dark bg-white p-4 text-sm text-brand-ink shadow-card">
          <p>
            <span className="text-brand-muted">Amount</span>{" "}
            <span className="font-semibold">
              {formatMinorFromPaise(summary.grandTotalInPaise, summary.currency)}
            </span>
          </p>
          {summary.email ? <p className="mt-1 text-xs text-brand-muted">{summary.email}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {copy.tryAgain ? (
          <Link
            href={checkoutResume}
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-forest px-4 text-sm font-semibold text-brand-cream hover:bg-brand-night"
          >
            Try payment again
          </Link>
        ) : null}
        <Link
          href={checkoutFresh}
          onClick={() => {
            clearPendingCheckout();
          }}
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-brand-forest/30 bg-white px-4 text-sm font-semibold text-brand-forest hover:bg-brand-cream"
        >
          Checkout with current cart
        </Link>
        <Link
          href={complaintHref}
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#c0453f] px-4 text-sm font-semibold text-white hover:bg-[#9a3530]"
        >
          Raise a complaint
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/profile?tab=orders"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-brand-cream-dark bg-white px-4 text-sm font-semibold text-brand-ink hover:border-brand-gold"
          >
            My orders
          </Link>
          <Link
            href="/store"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-brand-cream-dark bg-white px-4 text-sm font-semibold text-brand-ink hover:border-brand-gold"
          >
            Back to shop
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <main className="min-h-screen bg-brand-cream px-4 py-16">
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
