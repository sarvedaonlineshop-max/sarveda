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
   * No Suspense around the shell or product children here.
   * Soft-nav + Suspense/useSearchParams previously left /shop blank, then stuck on skeletons.
   * ShopShell avoids useSearchParams; the product grid renders as normal RSC children.
   */
  return <ShopShell categories={sortShopCategories(categories)}>{children}</ShopShell>;
}
