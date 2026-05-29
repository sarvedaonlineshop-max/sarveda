"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";
import { clearCartAfterPayment } from "@/lib/clear-cart-after-payment";
import { clearPendingCheckout, loadPendingCheckout } from "@/lib/pending-checkout";

function PayPalReturnInner() {
  const search = useSearchParams();
  const router = useRouter();
  const orderNumber = search.get("orderNumber") ?? "";
  const token = search.get("token") ?? "";
  const [status, setStatus] = useState<"working" | "ok" | "err">("working");
  const [message, setMessage] = useState("Completing your PayPal payment…");

  useEffect(() => {
    if (!token) {
      setStatus("err");
      setMessage("Missing PayPal session. Please try checkout again.");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/payments/paypal/capture`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paypalOrderId: token })
        });
        const json = (await res.json()) as { success?: boolean; data?: { captured?: boolean }; error?: string };
        if (!res.ok || !json.success || !json.data?.captured) {
          throw new Error(json.error ?? "PayPal capture failed");
        }
        const pending = loadPendingCheckout();
        const email =
          search.get("email")?.trim() ||
          pending?.email ||
          "";
        clearPendingCheckout();
        await clearCartAfterPayment();
        setStatus("ok");
        const q = new URLSearchParams({
          orderNumber: orderNumber || pending?.orderNumber || "",
          email
        });
        router.replace(`/order/confirmed?${q.toString()}`);
      } catch (e) {
        setStatus("err");
        setMessage(e instanceof Error ? e.message : "Payment could not be completed.");
      }
    })();
  }, [orderNumber, router, search, token]);

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="display-text font-serif text-2xl text-brand-ink">PayPal</h1>
      <p className="mt-4 text-brand-mid">{message}</p>
      {status === "err" ? (
        <Link href="/checkout" className="mt-8 inline-block text-brand-violet underline">
          Back to checkout
        </Link>
      ) : null}
    </main>
  );
}

export default function PayPalReturnPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-brand-muted">Loading…</p>}>
      <PayPalReturnInner />
    </Suspense>
  );
}
