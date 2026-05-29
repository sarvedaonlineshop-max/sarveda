import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { CartPageClient } from "@/components/cart/CartPageClient";

export const metadata = {
  title: "Cart",
  description: "Your Sarveda cart",
  robots: { index: false, follow: false }
};

export default function CartPage() {
  return (
    <div className="min-h-[60vh] bg-brand-bg md:px-4 md:py-10 lg:px-8">
      <MobileSubpageHeader title="Your cart" backHref="/shop" />
      <div className="mx-auto max-w-2xl px-0 md:px-0">
        <h1 className="display-text mt-6 hidden text-3xl font-normal text-brand-ink md:block">
          Your cart
        </h1>
        <p className="mt-2 hidden text-sm font-light text-brand-mid md:block">
          Items stay on this device until checkout is connected.
        </p>
        <CartPageClient />
      </div>
    </div>
  );
}
