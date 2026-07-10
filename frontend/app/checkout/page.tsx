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
    <main className="min-h-screen bg-brand-cream px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <nav className="text-sm text-brand-muted">
          <Link href="/cart" className="hover:text-brand-gold">
            ← Back to cart
          </Link>
        </nav>
        <h1 className="mt-6 font-serif text-3xl font-semibold text-brand-ink">Checkout</h1>
        <p className="mt-2 text-brand-muted">
          Enter your details and complete payment securely. Your order is confirmed once payment is verified.
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
