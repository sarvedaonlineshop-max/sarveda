import Link from "next/link";

import { CartPageClient } from "@/components/cart/CartPageClient";

export const metadata = {
  title: "Cart",
  description: "Your Sarveda cart"
};

export default function CartPage() {
  return (
    <div className="min-h-[50vh] bg-stone-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <nav className="text-sm text-stone-500">
          <Link href="/shop" className="hover:text-amber-700">
            ← Continue shopping
          </Link>
        </nav>
        <h1 className="mt-6 font-serif text-3xl font-semibold text-stone-900">Your cart</h1>
        <p className="mt-2 text-stone-500">Items stay on this device until checkout is connected.</p>
        <CartPageClient />
      </div>
    </div>
  );
}
