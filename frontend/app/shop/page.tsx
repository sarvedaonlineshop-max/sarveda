import Link from "next/link";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ShopCategoryFilterSidebar } from "@/components/shop/ShopCategoryFilterSidebar";
import { ShopMobileCategoryDrawer } from "@/components/shop/ShopMobileCategoryDrawer";
import { ShopPagination } from "@/components/shop/Pagination";
import { ProductCard } from "@/components/shop/ProductCard";
import { fetchCategoryTree, fetchProductList } from "@/lib/api";

export const revalidate = 60;

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function ShopPage({ searchParams }: Props) {
  const [categories, list] = await Promise.all([
    fetchCategoryTree({ next: { revalidate: 300 } }),
    fetchProductList(searchParams, { next: { revalidate: 60 } })
  ]);

  const categorySlug =
    typeof searchParams.category === "string" ? searchParams.category : undefined;

  return (
    <>
      <div className="border-b border-stone-200 bg-white md:border-stone-100 md:bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:py-6 lg:px-8">
          <div className="hidden md:block">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Shop" }]} />
          </div>
          <h1 className="mt-0 font-serif text-2xl font-semibold tracking-tight text-stone-900 md:mt-6 md:text-4xl">
            Shop
          </h1>
          <p className="mt-2 hidden max-w-2xl text-stone-500 md:block">
            Instruments, botanicals, and mindful goods — chosen for depth of practice and everyday ritual.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl md:px-4 md:py-8 lg:px-8">
        <ShopMobileCategoryDrawer categories={categories} selectedSlug={categorySlug} />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
            <ShopCategoryFilterSidebar categories={categories} selectedSlug={categorySlug} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="mb-3 px-4 text-sm text-stone-500 md:mb-6 md:px-0">
              Showing{" "}
              <span className="font-medium text-stone-800">{list.items.length}</span> of{" "}
              <span className="font-medium text-stone-800">{list.pagination.total}</span> products
              {categorySlug ? (
                <>
                  {" "}
                  <span className="text-stone-400">·</span> filtered by{" "}
                  <span className="font-medium text-stone-700">{categorySlug.replace(/-/g, " ")}</span>
                </>
              ) : null}
            </p>

            {list.items.length === 0 ? (
              <p className="mx-4 rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center text-stone-500 md:mx-0">
                No products match this filter yet.{" "}
                <Link href="/shop" className="font-medium text-amber-700 underline hover:text-amber-800">
                  Clear filters
                </Link>
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-2 gap-0 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
                  {list.items.map((product) => (
                    <li key={product.id} className="md:rounded-2xl">
                      <ProductCard product={product} />
                    </li>
                  ))}
                </ul>
                <div className="px-4 py-8 md:px-0">
                  <ShopPagination
                    page={list.pagination.page}
                    totalPages={list.pagination.totalPages}
                    categorySlug={categorySlug}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
