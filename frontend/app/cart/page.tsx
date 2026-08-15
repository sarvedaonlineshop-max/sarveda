import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { CartPageClient } from "@/components/cart/CartPageClient";

export const metadata = {
  title: "Cart",
  description: "Your Sarveda cart",
  robots: { index: false, follow: false }
};

export default function CartPage() {
  return (
    <div className="min-h-[60vh] bg-brand-cream pb-10 md:py-8 lg:px-8">
      <MobileSubpageHeader title="Your cart" backHref="/shop" />
      <div className="page-shell">
        <h1 className="mt-6 hidden font-serif text-3xl font-semibold text-brand-ink lg:block">Shopping Cart</h1>
        <CartPageClient />
      </div>
    </div>
  );
}
