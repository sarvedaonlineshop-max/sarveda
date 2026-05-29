import Link from "next/link";
import { Suspense } from "react";

import { CheckoutClient } from "@/components/checkout/CheckoutClient";

export const metadata = {
  title: "Checkout",
  description: "Complete your Sarveda order",
  robots: { index: false, follow: false }
};

export default function CheckoutPage() {
  return (
    <main className="min-h-screen bg-brand-bg px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <nav className="text-sm font-light text-brand-mid">
          <Link href="/cart" className="text-brand-violet hover:text-brand-violet-mid hover:underline">
            ← Back to cart
          </Link>
        </nav>
        <h1 className="display-text mt-6 text-4xl font-normal text-brand-ink">Checkout</h1>
        <p className="mt-2 max-w-3xl text-sm font-light leading-relaxed text-brand-mid">
          Enter your shipping details and pay securely with Razorpay. If the gateway is slow, we keep checking your
          order for up to 30 seconds after you pay. You will never get a duplicate order from double-clicking Pay.
        </p>
        <div className="mt-10">
          <Suspense fallback={<p className="font-light text-brand-mid">Loading checkout…</p>}>
            <CheckoutClient />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
