import { Suspense } from "react";

import { ShopShell } from "@/components/shop/ShopShell";
import { ShopProductsSkeleton } from "@/components/shop/ShopProductsSkeleton";
import { fetchCategoryTree } from "@/lib/api";
import { sortShopCategories } from "@/lib/shop-categories";

function ShopBrowseFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-brand-muted">
      Loading shop…
    </div>
  );
}

export default async function ShopBrowseLayout({ children }: { children: React.ReactNode }) {
  const categories = await fetchCategoryTree({ next: { revalidate: 300 } });

  return (
    <Suspense fallback={<ShopBrowseFallback />}>
      <ShopShell categories={sortShopCategories(categories)}>
        <Suspense fallback={<ShopProductsSkeleton />}>{children}</Suspense>
      </ShopShell>
    </Suspense>
  );
}
