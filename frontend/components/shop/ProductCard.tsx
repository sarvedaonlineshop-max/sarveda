import Image from "next/image";
import Link from "next/link";

import { formatINRFromPaise } from "@/lib/money";
import { productListBadges } from "@/lib/product-badges";
import type { ProductListItem } from "@/lib/types";

import { ProductCardAddButton } from "./ProductCardAddButton";

type Props = {
  product: ProductListItem;
};

export function ProductCard({ product }: Props) {
  const priceLabel = formatINRFromPaise(product.fromPriceInPaise);
  const href = `/product/${product.slug}`;
  const badges = productListBadges(product);
  const primaryCat = product.categories[0];

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg">
      <Link href={href} className="relative aspect-square overflow-hidden bg-stone-100">
        {product.primaryImageUrl ? (
          <Image
            src={product.primaryImageUrl}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">
            No image
          </div>
        )}

        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-col gap-1">
          {badges.map((b) => (
            <span
              key={b.key}
              className="inline-flex w-fit rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800"
            >
              {b.label}
            </span>
          ))}
        </div>

        {product.hasAudio ? (
          <span
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-base shadow-md backdrop-blur-sm"
            title="Includes audio sample"
          >
            🎵
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-3 rounded-b-2xl border-t border-stone-100 bg-white p-4">
        {primaryCat ? (
          <p className="text-xs font-medium uppercase tracking-widest text-stone-400">
            {primaryCat.name}
          </p>
        ) : null}

        <Link href={href} className="line-clamp-2 text-base font-medium leading-snug text-stone-900 hover:text-amber-800">
          {product.name}
        </Link>

        <div className="mt-auto flex flex-col gap-4 pt-1">
          <p className="text-lg font-semibold text-amber-800">{priceLabel}</p>
          <ProductCardAddButton product={product} />
        </div>
      </div>
    </article>
  );
}
