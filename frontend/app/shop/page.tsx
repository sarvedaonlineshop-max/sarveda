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
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Shop" }]} />
          <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">Shop</h1>
          <p className="mt-2 max-w-2xl text-stone-500">
            Instruments, botanicals, and mindful goods — chosen for depth of practice and everyday ritual.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ShopMobileCategoryDrawer categories={categories} selectedSlug={categorySlug} />

        <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
          <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
            <ShopCategoryFilterSidebar categories={categories} selectedSlug={categorySlug} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="mb-6 text-sm text-stone-500">
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
              <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center text-stone-500">
                No products match this filter yet.{" "}
                <Link href="/shop" className="font-medium text-amber-700 underline hover:text-amber-800">
                  Clear filters
                </Link>
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {list.items.map((product) => (
                    <li key={product.id}>
                      <ProductCard product={product} />
                    </li>
                  ))}
                </ul>
                <ShopPagination
                  page={list.pagination.page}
                  totalPages={list.pagination.totalPages}
                  categorySlug={categorySlug}
                />
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
