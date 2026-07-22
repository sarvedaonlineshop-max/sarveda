import { Suspense } from "react";

import { ShopShell } from "@/components/shop/ShopShell";
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
      {/*
        Do NOT wrap `{children}` in Suspense with a product-grid skeleton.
        Next.js Link navigations run inside React transitions; a Suspense fallback
        here can stick forever when arriving from PDP (or other non-shop routes).
        Category switches use `useShopNavigate` + `isPending` in ShopShell instead.
      */}
      <ShopShell categories={sortShopCategories(categories)}>{children}</ShopShell>
    </Suspense>
  );
}
