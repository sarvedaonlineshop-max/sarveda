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
      className={`group relative flex h-full flex-col overflow-hidden border-[rgba(196,176,232,0.25)] bg-brand-ivory transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_36px_rgba(91,62,155,0.16)] ${
        rail
          ? "w-[72vw] max-w-[18rem] rounded-2xl border"
          : "rounded-none border-b md:rounded-2xl md:border"
      }`}
    >
      {/* Image area */}
      <Link href={href} className="relative aspect-square overflow-hidden bg-brand-violet-light">
        {product.primaryImageUrl ? (
          <Image
            src={product.primaryImageUrl}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
            sizes={rail ? "72vw" : "(max-width:768px) 50vw,(max-width:1024px) 50vw,33vw"}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-brand-muted">
            No image
          </div>
        )}

        {/* Badges top-left */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex max-w-[calc(100%-1.25rem)] flex-col gap-1">
          {discountPercent && (
            <span
              className="inline-flex w-fit rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white"
              style={{ background: "#C45A4A" }}
            >
              {discountPercent}% OFF
            </span>
          )}
          {badges.slice(0, 2).map((badge) => (
            <span
              key={badge.key}
              className="inline-flex w-fit rounded-md border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
              style={{
                background: "rgba(91,62,155,0.10)",
                color: "#3A2070",
                borderColor: "rgba(91,62,155,0.22)",
              }}
            >
              {badge.label}
            </span>
          ))}
        </div>

        {/* Audio badge */}
        {product.hasAudio && (
          <span
            className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full border border-[#EAE4F5] bg-white/95 text-sm shadow-sm"
            title="Includes audio sample"
          >
            🎵
          </span>
        )}

        {/* Quick view on hover — desktop */}
        <div
          className="absolute inset-x-0 bottom-0 hidden translate-y-full items-center justify-center py-3 text-xs font-medium uppercase tracking-wide text-brand-lavender transition-transform duration-300 group-hover:translate-y-0 md:flex"
          style={{ background: "rgba(34,19,74,0.82)" }}
        >
          Quick view →
        </div>
      </Link>

      {/* Info area */}
      <div className="flex flex-1 flex-col gap-1.5 p-3 md:gap-2 md:p-4">
        {primaryCat && (
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-sage">
            {primaryCat.name}
          </p>
        )}

        <Link
          href={href}
          className="display-text line-clamp-2 text-[17px] font-normal leading-[1.25] text-brand-ink transition-colors hover:text-brand-violet"
        >
          {product.name}
        </Link>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0 flex flex-wrap items-baseline gap-2">
            <p className="price-text text-[15px] font-medium tracking-[0.01em] text-brand-ink">
              {priceLabel}
            </p>
            {product.fromMrpInPaise &&
              product.fromPriceInPaise &&
              product.fromMrpInPaise > product.fromPriceInPaise && (
                <p className="price-text text-[11px] text-brand-muted line-through">
                  {formatINRFromPaise(product.fromMrpInPaise)}
                </p>
              )}
          </div>
          <ProductCardAddButton product={product} />
        </div>
      </div>
    </article>
  );
}
