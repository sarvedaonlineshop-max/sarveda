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
    <main className="min-h-screen bg-stone-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <nav className="text-sm text-stone-500">
          <Link href="/cart" className="hover:text-amber-700">
            ← Back to cart
          </Link>
        </nav>
        <h1 className="mt-6 font-serif text-3xl font-semibold text-stone-900">Checkout</h1>
        <p className="mt-2 text-stone-500">
          Enter your shipping details and pay securely with Razorpay. If the gateway is slow, we keep checking your
          order for up to 30 seconds after you pay. You will never get a duplicate order from double-clicking Pay.
        </p>
        <div className="mt-10">
          <Suspense fallback={<p className="text-stone-500">Loading checkout…</p>}>
            <CheckoutClient />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
