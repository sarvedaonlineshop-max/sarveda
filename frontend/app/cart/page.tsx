import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { CartPageClient } from "@/components/cart/CartPageClient";

export const metadata = {
  title: "Cart",
  description: "Your Sarveda cart",
  robots: { index: false, follow: false }
};

export default function CartPage() {
  return (
    <div className="min-h-[60vh] bg-stone-50 pb-10 md:py-8 lg:px-8">
      <MobileSubpageHeader title="Your cart" backHref="/shop" />
      <div className="mx-auto max-w-7xl px-0 sm:px-4 lg:px-6">
        <h1 className="mt-6 hidden font-serif text-3xl font-semibold text-stone-900 lg:block">Shopping Cart</h1>
        <CartPageClient />
      </div>
    </div>
  );
}
