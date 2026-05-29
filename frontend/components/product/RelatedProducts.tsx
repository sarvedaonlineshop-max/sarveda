import { fetchRelatedProducts } from "@/lib/api";

import { ProductCard } from "../shop/ProductCard";

type Props = {
  excludeSlug: string;
  categorySlug: string | undefined;
};

export async function RelatedProducts({ excludeSlug, categorySlug }: Props) {
  const items = await fetchRelatedProducts(excludeSlug, categorySlug, { next: { revalidate: 120 } });

  if (items.length === 0) return null;

  return (
    <section className="border-t border-[rgba(196,176,232,0.25)] bg-brand-bg px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h2 className="display-text font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">You may also love</h2>
        <p className="mt-2 text-brand-muted">More pieces chosen to complement what you&apos;re viewing.</p>
        <ul className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
