import Image from "next/image";
import Link from "next/link";

import { discountPercentOff, formatINRFromPaise } from "@/lib/money";
import { productListBadges } from "@/lib/product-badges";
import type { ProductListItem } from "@/lib/types";

import { ProductCardAddButton } from "./ProductCardAddButton";

type Props = {
  product: ProductListItem;
  layout?: "grid" | "rail";
};

export function ProductCard({ product, layout = "grid" }: Props) {
  const priceLabel = formatINRFromPaise(product.fromPriceInPaise);
  const discountPercent =
    product.fromMrpInPaise && product.fromPriceInPaise
      ? discountPercentOff(product.fromMrpInPaise, product.fromPriceInPaise)
      : null;
  const href = `/product/${product.slug}`;
  const badges = productListBadges(product);
  const primaryCat = product.categories[0];
  const rail = layout === "rail";

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden bg-white transition-shadow duration-300 md:rounded-2xl md:border md:border-stone-100 md:shadow-sm md:hover:shadow-lg ${
        rail
          ? "w-[72vw] max-w-[18rem] border border-stone-200"
          : "rounded-none border-b border-stone-200 md:border"
      }`}
    >
      <Link href={href} className="relative aspect-square overflow-hidden bg-stone-100">
        {product.primaryImageUrl ? (
          <Image
            src={product.primaryImageUrl}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.03]"
            sizes={
              rail
                ? "72vw"
                : "(max-width: 768px) 50vw, (max-width: 1024px) 50vw, 33vw"
            }
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">No image</div>
        )}

        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-col gap-1">
          {badges.map((badge) => (
            <span
              key={badge.key}
              className="inline-flex w-fit rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 md:text-xs"
            >
              {badge.label}
            </span>
          ))}
        </div>

        {product.hasAudio ? (
          <span
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-sm shadow-md backdrop-blur-sm md:h-9 md:w-9 md:text-base"
            title="Includes audio sample"
          >
            🎵
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-2 border-t border-stone-100 p-3 md:gap-3 md:p-4">
        {primaryCat ? (
          <p className="text-[10px] font-medium uppercase tracking-widest text-stone-400 md:text-xs">
            {primaryCat.name}
          </p>
        ) : null}

        <Link
          href={href}
          className="line-clamp-2 text-sm font-medium leading-snug text-stone-900 hover:text-amber-800 md:text-base"
        >
          {product.name}
        </Link>

        <div className="mt-auto flex flex-col gap-3 pt-1">
          {discountPercent ? (
            <span className="inline-flex w-fit rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              {discountPercent}% off
            </span>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-base font-semibold text-stone-900 md:text-lg">{priceLabel}</p>
            {product.fromMrpInPaise && product.fromPriceInPaise && product.fromMrpInPaise > product.fromPriceInPaise ? (
              <p className="text-xs text-stone-500 line-through md:text-sm">
                {formatINRFromPaise(product.fromMrpInPaise)}
              </p>
            ) : null}
          </div>
          <ProductCardAddButton product={product} />
        </div>
      </div>
    </article>
  );
}
