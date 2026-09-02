/**
 * Legacy WooCommerce nested category URL compatibility.
 *
 * Historical Woo paths:
 *   /product-category/{parent}/{child}/
 * Native leaf categories:
 *   /product-category/{child}
 *
 * Evidence: docs/audit/seo-final-cutover/category_seo_mapping.csv
 * (23 nested_woo_path rows with verified native leaf slugs).
 *
 * Do NOT invent redirects for arbitrary nested paths — only the audited pairs.
 */

import { pickSafeLegacyProductQuery } from "./legacy-woo-product-url";

/** Audited nested Woo path → native leaf category slug. */
export const LEGACY_WOO_NESTED_CATEGORY_REDIRECTS: Readonly<
  Record<string, string>
> = {
  "/product-category/yoga-and-meditation/all-yoga-and-meditation":
    "all-yoga-and-meditation",
  "/product-category/sound-musical-instruments/all-musical-instruments":
    "all-musical-instruments",
  "/product-category/eco-living-sustainable/all-handpans-tonguedrum":
    "all-handpans-tonguedrum",
  "/product-category/sound-musical-instruments/singing-bowls-bells":
    "singing-bowls-bells",
  "/product-category/sound-musical-instruments/gongs-musical-instruments":
    "gongs-musical-instruments",
  "/product-category/sound-musical-instruments/rattles-shakers": "rattles-shakers",
  "/product-category/sound-musical-instruments/crystal-bowls": "crystal-bowls",
  "/product-category/sound-musical-instruments/chimes": "chimes",
  "/product-category/sound-musical-instruments/kids": "kids",
  "/product-category/sound-musical-instruments/handpans-tongue-drum":
    "handpans-tongue-drum",
  "/product-category/sound-musical-instruments/xylophones": "xylophones",
  "/product-category/sound-musical-instruments/percussion": "percussion",
  "/product-category/sound-musical-instruments/tuning-forks": "tuning-forks",
  "/product-category/sound-musical-instruments/indian-classical":
    "indian-classical",
  "/product-category/sound-musical-instruments/wind": "wind",
  "/product-category/sound-musical-instruments/accessories": "accessories",
  "/product-category/yoga-and-meditation/bottles-accessories":
    "bottles-accessories",
  "/product-category/yoga-and-meditation/meditation-cushions-benches":
    "meditation-cushions-benches",
  "/product-category/yoga-and-meditation/yoga-mats-props": "yoga-mats-props",
  "/product-category/eco-living-sustainable/bottles": "bottles",
  "/product-category/eco-living-sustainable/gift-sets": "gift-sets",
  "/product-category/eco-living-sustainable/home-workspace": "home-workspace",
  "/product-category/eco-living-sustainable/personal-care": "personal-care"
};

/** Native category leaves that audited nested redirects may target. */
export const LEGACY_WOO_KNOWN_CATEGORY_SLUGS: ReadonlySet<string> = new Set(
  Object.values(LEGACY_WOO_NESTED_CATEGORY_REDIRECTS)
);

const SLUG_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Normalize /product-category/... pathname (strip trailing slash, decode once).
 * Returns null for non-category, unsafe, or single-segment leaf paths.
 */
export function normalizeNestedCategoryPath(pathname: string): string | null {
  if (!pathname) return null;
  const raw = pathname.split("?")[0] ?? "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const normalized = decoded.replace(/\/+$/, "") || "/";
  if (!normalized.startsWith("/product-category/")) return null;

  const parts = normalized.split("/").filter(Boolean);
  // ["product-category", parent, child] — nested only (exactly 3 segments)
  if (parts.length !== 3 || parts[0] !== "product-category") return null;

  const parent = parts[1] ?? "";
  const child = parts[2] ?? "";
  if (!SLUG_SAFE.test(parent) || !SLUG_SAFE.test(child)) return null;
  if (parent.includes("..") || child.includes("..")) return null;
  return `/product-category/${parent}/${child}`;
}

/**
 * Build internal /product-category/{leaf} (+ safe tracking query).
 * Never returns an external URL.
 */
export function buildLegacyCategoryRedirectTarget(
  leafSlug: string,
  searchParams?: URLSearchParams | Iterable<[string, string]> | null
): string {
  if (!SLUG_SAFE.test(leafSlug) || !LEGACY_WOO_KNOWN_CATEGORY_SLUGS.has(leafSlug)) {
    throw new Error("Refusing redirect: leaf is not an audited native category slug");
  }
  const path = `/product-category/${encodeURIComponent(leafSlug)}`;
  if (!searchParams) return path;
  const qs = pickSafeLegacyProductQuery(searchParams);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** High-level: nested category pathname → internal redirect path, or null. */
export function resolveNestedCategoryRedirect(
  pathname: string,
  searchParams?: URLSearchParams | Iterable<[string, string]> | null
): string | null {
  const key = normalizeNestedCategoryPath(pathname);
  if (!key) return null;
  const leaf = LEGACY_WOO_NESTED_CATEGORY_REDIRECTS[key];
  if (!leaf) return null;
  if (!LEGACY_WOO_KNOWN_CATEGORY_SLUGS.has(leaf)) return null;
  // Guard: never redirect a path whose leaf equals the nested path's own leaf
  // into a loop via identity — destination is always single-segment.
  return buildLegacyCategoryRedirectTarget(leaf, searchParams ?? null);
}
