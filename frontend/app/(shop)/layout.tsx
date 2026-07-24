import { Suspense } from "react";

import { ShopShell } from "@/components/shop/ShopShell";
import { fetchCategoryTree } from "@/lib/api";
import { sortShopCategories } from "@/lib/shop-categories";

export default async function ShopBrowseLayout({ children }: { children: React.ReactNode }) {
  let categories: Awaited<ReturnType<typeof fetchCategoryTree>> = [];
  try {
    categories = await fetchCategoryTree({ next: { revalidate: 300 } });
  } catch {
    /* Keep Vercel builds green when EC2 is briefly unreachable */
  }

  /*
   * Next.js requires a Suspense boundary around useSearchParams() for static generation
   * (Vercel build fails otherwise on /shop).
   *
   * Use fallback={null} — NOT “Loading shop…” text. A full-page text fallback can stick
   * forever during Link / startTransition soft-nav. Category switches use isPending opacity.
   */
  return (
    <Suspense fallback={null}>
      <ShopShell categories={sortShopCategories(categories)}>{children}</ShopShell>
    </Suspense>
  );
}
