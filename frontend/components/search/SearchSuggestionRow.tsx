"use client";

import Image from "next/image";
import Link from "next/link";

import { siteSearchHref, type SiteSearchSuggestion } from "@/lib/api";
import { usePricingZone } from "@/hooks/usePricingZone";
import { resolveMediaUrl } from "@/lib/media-cdn";
import { zoneToCurrency } from "@/lib/currency";
import { formatMinorFromPaise } from "@/lib/money";

type Props = {
  item: SiteSearchSuggestion;
  onNavigate?: () => void;
  className?: string;
};

export function SearchSuggestionRow({ item, onNavigate, className = "" }: Props) {
  const zone = usePricingZone();
  const href = siteSearchHref(item);
  const priceLabel =
    item.priceInPaise != null
      ? item.priceInPaise === 0
        ? "Free"
        : formatMinorFromPaise(item.priceInPaise, zoneToCurrency(zone))
      : null;

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 ${className}`}
      onClick={() => onNavigate?.()}
    >
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-stone-100">
        {item.imageUrl ? (
          <Image
            src={resolveMediaUrl(item.imageUrl) ?? item.imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
            unoptimized
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium text-stone-900">{item.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
          <span>{item.label}</span>
          {priceLabel ? <span>{priceLabel}</span> : null}
        </span>
      </span>
    </Link>
  );
}
