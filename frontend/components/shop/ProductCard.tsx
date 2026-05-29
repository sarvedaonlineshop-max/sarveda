import Image from "next/image";
import Link from "next/link";

import { discountPercentOff, formatINRFromPaise } from "@/lib/money";
import { productListBadges } from "@/lib/product-badges";
import type { ProductListItem } from "@/lib/types";

type Props = {
  product: ProductListItem;
  layout?: "grid" | "rail";
};

export function ProductCard({ product, layout = "grid" }: Props) {
  const priceLabel =
    formatINRFromPaise(product.fromPriceInPaise);
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
      className={`group relative flex h-full flex-col overflow-hidden transition-all duration-300 ${
        rail
          ? "w-[72vw] max-w-[18rem] rounded-2xl border border-stone-200 bg-white shadow-card hover:shadow-card-hover"
          : "rounded-none border-b border-stone-100 bg-white md:rounded-2xl md:border md:border-stone-100 md:shadow-card md:hover:shadow-card-hover"
      }`}
      style={{ background: "#fffbf5" }}
    >
      <Link href={href} className="flex min-h-0 flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-[#108967] focus-visible:ring-offset-2">
        <div className="relative aspect-square overflow-hidden bg-brand-cream-dark">
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
              sizes={rail ? "72vw" : "(max-width:768px) 50vw,(max-width:1024px) 50vw,33vw"}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-brand-muted">No image</div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          <div className="pointer-events-none absolute left-2.5 top-2.5 flex max-w-[calc(100%-1.25rem)] flex-col gap-1">
            {discountPercent ? (
              <span
                className="inline-flex w-fit rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ background: "#b85c38" }}
              >
                {discountPercent}% OFF
              </span>
            ) : null}
            {badges.slice(0, 2).map((badge) => (
              <span
                key={badge.key}
                className="inline-flex w-fit rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: "rgba(200,150,10,0.15)",
                  color: "#8a5c00",
                  border: "1px solid rgba(200,150,10,0.3)"
                }}
              >
                {badge.label}
              </span>
            ))}
          </div>

          {product.hasAudio ? (
            <span
              className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full text-sm shadow-md"
              style={{ background: "rgba(255,251,245,0.95)", backdropFilter: "blur(4px)" }}
              title="Includes audio sample"
            >
              🎵
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3 md:gap-2 md:p-4">
          {primaryCat ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-sage md:text-[11px]">
              {primaryCat.name}
            </p>
          ) : null}

          <h2 className="line-clamp-2 text-sm font-medium leading-snug text-brand-ink transition-colors group-hover:text-brand-forest md:text-base">
            {product.name}
          </h2>

          <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-2">
            <p className="text-base font-bold text-brand-ink md:text-lg">{priceLabel}</p>
            {product.fromMrpInPaise &&
              product.fromPriceInPaise &&
              product.fromMrpInPaise > product.fromPriceInPaise && (
                <p className="text-xs text-brand-muted line-through md:text-sm">
                  {formatINRFromPaise(product.fromMrpInPaise)}
                </p>
              )}
          </div>

          <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-800 transition group-hover:border-[#108967] group-hover:text-[#108967]">
            Know more
            <span aria-hidden>→</span>
          </span>
        </div>
      </Link>
    </article>
  );
}
