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
    <section className="border-t border-brand-cream-dark bg-brand-cream py-20 md:py-24">
      <div className="page-shell">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Keep exploring</p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-brand-ink sm:text-3xl">You may also like</h2>
        <p className="mt-2 text-brand-muted">More pieces chosen to complement what you&apos;re viewing.</p>
        <ul className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
