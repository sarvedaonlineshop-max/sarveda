/**
 * Build native PDP links for CTX / Merchant compatibility feeds.
 * Uses ?offer=<wooOfferId> for deterministic variant preselection.
 */

import { nativeMerchantOfferId } from "./nativeMerchantIdentity";

export function buildMerchantProductLink(
  siteOrigin: string,
  slug: string,
  wooOfferId: number
): string {
  const origin = siteOrigin.replace(/\/$/, "");
  const path = `/product/${encodeURIComponent(slug)}`;
  const params = new URLSearchParams();
  params.set("offer", String(wooOfferId));
  return `${origin}${path}?${params.toString()}`;
}

export function buildMerchantCanonicalLink(siteOrigin: string, slug: string): string {
  const origin = siteOrigin.replace(/\/$/, "");
  return `${origin}/product/${encodeURIComponent(slug)}`;
}

/** Native-only Merchant offers: ?offer=sv_<variantUuid> */
export function buildNativeMerchantProductLink(
  siteOrigin: string,
  slug: string,
  variantId: string
): string {
  const origin = siteOrigin.replace(/\/$/, "");
  const path = `/product/${encodeURIComponent(slug)}`;
  const params = new URLSearchParams();
  params.set("offer", nativeMerchantOfferId(variantId));
  return `${origin}${path}?${params.toString()}`;
}

/** CTX item_group_id semantics: emit stored value when present (includes simple self-group). */
export function ctxFeedItemGroupId(
  ctxItemGroupId: string | null,
  wooOfferId: number,
  wooParentId: number | null,
  productWooId: number | null
): string | null {
  if (ctxItemGroupId) return ctxItemGroupId;
  if (wooParentId != null && wooParentId !== wooOfferId) return String(wooParentId);
  if (productWooId != null && productWooId !== wooOfferId) return String(productWooId);
  return String(wooOfferId);
}
