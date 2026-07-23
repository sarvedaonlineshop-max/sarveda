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
   * Do NOT wrap ShopShell in <Suspense fallback="Loading shop…">.
   * ShopShell uses useSearchParams(); with Link / startTransition navigations,
   * that Suspense fallback can stick forever (blank cream page with only the text).
   * Category switches use useShopNavigate + isPending opacity instead.
   */
  return <ShopShell categories={sortShopCategories(categories)}>{children}</ShopShell>;
}
