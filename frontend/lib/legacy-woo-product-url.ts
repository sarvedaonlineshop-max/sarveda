/**
 * Legacy WooCommerce / Google Merchant product URL compatibility.
 *
 * Purpose: 301 deep historical URLs like
 *   /store/category/subcategory/{legacyLeaf}/
 * to the current Sarveda PDP
 *   /product/{currentSarvedaSlug}
 *
 * Evidence: docs/audit/merchant_woo_sarveda_mapping.tsv (NEEDS 301 rows).
 * Do NOT change Product.slug values; this map preserves old landing leaves only.
 *
 * Unresolved audited leaves (no redirect): elemental-chimes, box-tanpura.
 */

/** Explicit audited Woo leaf → current Product.slug (renames only; leaf ≠ slug ignoring case). */
export const LEGACY_WOO_LEAF_ALIASES: Readonly<Record<string, string>> = {
  "7-chakra-morchang-set": "7-chakra-morchang",
  "7-chakras-copper-water-bottles-with-handle": "7-chakras-copper-bottles-with-handle",
  "9-10-notes-handpan": "handpan",
  "ankh-sound-healing-instrument": "ankh",
  "aslatau-or-asalato": "asalato-kashaka-shaker",
  "bamboo-rainstick-2": "bamboo-rainstick-wide-80cm",
  "ceg-crystal-singing-bowl-set": "triad-crystal-bowl-set",
  "cg-tuning-forks": "c-g-tuning-forks",
  "chau-gong-tam-tam-for-sound-therapy-meditation": "chau-gongs",
  "classic-morchang-set": "classic-morchang",
  "copper-water-bottle-with-2-glasses-set-with-7-chakra-design": "copper-bottle-gift-set-7-chakra",
  "crescent-zafu-cushion-wide": "crescent-zafu-cushion-compact-buck-wheat",
  "den-den-daiko-or-spin-twist-drum": "spin-twist-drum-or-den-den-daiko",
  "dumroo-medium-size": "dumru-dumroo",
  "engraved-flat-wind-tibetan-gong-for-meditation-sound-therapy": "wind-gong-etched",
  "ergonomic-meditation-bench": "zen-meditation-bench",
  "eye-shaped-natural-lavender-scented-eye-pillows": "eye-shaped-eye-pillows",
  "full-moon-singing-bowls": "full-moon-singing-bowls-all-sizes",
  "gaumukhi-shankh-natural-conch-shell": "gomukhi-shankh",
  "hand-hammered-singing-bowl": "dotted-singing-bowl",
  "handcrafted-wooden-stand-for-tuning-forks": "wooden-stand-for-tuning-forks",
  "handheld-coconut-shaker": "handheld-natural-coconut-shaker",
  "handheld-kenari-seed-shell-shaker": "kenari-seed-shell-shakers",
  "handmade-extra-large-meridian-singing-bowls": "extra-large-meridian-singing-bowls",
  "handmade-singing-bowls-for-sound-therapy": "handmade-singing-bowls-all-sizes",
  "hi-zafu-meditation-cushion-filled-with-lotus-embroidery": "hi-zafu-meditation-cushion-embroidered-with-lotus",
  "jala-neti-pot": "jala-neti-pot-ceramic-185-ml",
  "lotus-yoga-mat": "yoga-mats-lotus",
  "macrame-yoga-straps": "macrame-yoga-mat-straps",
  "mini-coconut-shaker-3-types": "mini-coconut-shakers-3-types",
  "mini-teak-wood-and-stainless-steel-xylophone": "teak-wood-stainless-steel-xylophone",
  "musical-wooden-frog": "wooden-frog",
  "non-printed-copper-water-bottles": "grooved-hammered-plain-copper-bottle",
  "pangi-seed-shell-shaker-rattle": "pangi-seed-shell-rattle",
  "plain-flat-wind-tibetan-gong-for-meditation-sound-therapy": "wind-gong-plain",
  "rectangular-yoga-bolster-made-from-organic-cotton": "rectangular-yoga-bolster",
  "sacred-heart-chakra-singing-bowl": "heart-chakra-singing-bowl",
  "sacred-root-chakra-singing-bowl": "root-chakra-singing-bowl",
  "sarveda-buddhist-bell": "tibetan-buddhist-bell",
  "sarveda-crystal-bowls": "crystal-bowls-frosted-white",
  "sarveda-flower-of-life-with-sacred-symbols-singing-bowls": "singing-bowls-flower-of-life-with-sacred-symbols",
  "sarveda-handcrafted-zen-singing-bowl": "vibroacoustic-therapy-bowls-universal-belly-and-head",
  "sarveda-joint-bowl-or-bowl-with-a-hole": "joint-knee-cut-bowl",
  "sarveda-sacred-symbols-singing-bowls": "sacred-symbols-singing-bowls",
  "sarveda-tuning-forks": "tuning-fork-single-weighted-unweighted",
  "sarveda-zabuton-cushion": "zabuton-cushion",
  "sarveda-zafu-cylindrical-meditation-cushion": "hi-zafu-meditation-cushion-filled-with-buckwheat",
  "sarveda-zafu-round": "zafu-meditation-cushion-plain",
  "sarveda-zafu-zabuton-meditation-cushion-combo": "zafu-zabuton-combo-plain",
  "shamanic-drum-bags-ocean-drum-bags": "shamanic-drum-ocean-drum-bags",
  "shamanic-drums": "shamanic-drum",
  "singing-bowl-silk-ring-cushions-accessories": "singing-bowls-silk-ring-cushion-accessories",
  "singing-bowl-with-7-chakra-healing-from-sound-therapy": "handcrafted-set-of-7-bowls-for-sound-therapy",
  "singing-bowl-with-mantra-rustic-blue-color": "singing-bowl-with-mantra-rustic-blue-colour",
  "sughosh-shankh-natural-conch-shell": "sughosh-shankh",
  "the-beginner-set": "the-three-bowl-set-root-heart-and-third-eye",
  "the-essential-set": "the-four-bowl-set-root-heart-third-eye-and-universal",
  "thunder-tube": "thunder-tube-basic-edition",
  "tuning-forks-activators": "tuning-fork-activators",
  "tuning-forks-extensions": "tuning-fork-extensions",
  "tuning-forks-gem-foot": "tuning-forks-gem-feet",
  "wooden-maracas-shaker": "coconut-maracas-shakers",
  "wooden-maracas-shaker-handheld-shaker": "wooden-maracas-shakers-plain-dot-painted",
  "wooden-tambourine-half-moon-2": "wooden-tambourines",
  "yoga-bolster": "round-yoga-bolster",
  "yoga-strap": "yoga-belt-strap",
  "zafu-meditation-cushion-with-lotus-embroidery": "zafu-meditation-cushion-lotus-embroidery",
  "zafu-zabuton-meditation-cushion-combo-with-lotus-embroidery": "zafu-zabuton-combo-lotus-embroidery",
};

/**
 * Audited current Product.slug values that Merchant NEEDS 301 paths resolve to.
 * Used for exact (A) and case-normalized (B) leaf resolution without a DB round-trip.
 */
export const LEGACY_WOO_KNOWN_PRODUCT_SLUGS: ReadonlySet<string> = new Set([
  "11-note-tongue-drum",
  "32-bar-rod-chime",
  "7-chakra-morchang",
  "7-chakras-copper-bottles-with-handle",
  "7-chakras-mystical-incense-sticks-set",
  "8-key-kalimba",
  "8-keys-metallophone",
  "8-keys-wooden-xylophone",
  "Copper-Tongue-Cleaner",
  "angel-tuning-forks",
  "ankh",
  "annapurna-shankh",
  "asalato-kashaka-shaker",
  "ayurvedic-copper-bedroom-jar",
  "bamboo-castanet",
  "bamboo-rainstick-wide-80cm",
  "belly-bowls",
  "bendo-chimes",
  "bendo-shaker",
  "bird-flute",
  "c-g-tuning-forks",
  "caxixi",
  "chau-gongs",
  "classic-morchang",
  "clay-ocarinas",
  "coconut-maracas-shakers",
  "coconut-rattle",
  "conscious-cards",
  "copper-bottle-curved-vintage-hammered",
  "copper-bottle-gift-set-7-chakra",
  "copper-bottle-hammered-copper-set",
  "copper-bottle-orange-light",
  "copper-bottle-pink-noble-toughts",
  "copper-bottle-vintage-plain-curved",
  "copper-bottle-with-brush-tattvamasi",
  "copper-bottle-with-brush-true-happiness-lies-within",
  "crescent-zafu-cushion-compact-buck-wheat",
  "crystal-bowl-bag",
  "crystal-bowls-frosted-white",
  "crystal-bowls-set-of-7",
  "crystal-pyramid",
  "djembe-drums",
  "dotted-singing-bowl",
  "dumru-dumroo",
  "egg-shaker-with-handle",
  "etched-gongs",
  "etched-handmade-singing-bowls",
  "extra-large-meridian-singing-bowls",
  "eye-shaped-eye-pillows",
  "full-moon-singing-bowls-all-sizes",
  "gomukhi-shankh",
  "gong-bags",
  "gong-stand",
  "grooved-hammered-plain-copper-bottle",
  "handcrafted-set-of-7-bowls-for-sound-therapy",
  "handheld-natural-coconut-shaker",
  "handmade-singing-bowls-all-sizes",
  "handpan",
  "handpan-stand",
  "hanging-bowls-zen-drops",
  "harmonium",
  "heart-chakra-singing-bowl",
  "hi-zafu-meditation-cushion-embroidered-with-lotus",
  "hi-zafu-meditation-cushion-filled-with-buckwheat",
  "jala-neti-pot-ceramic-185-ml",
  "joint-knee-cut-bowl",
  "kenari-bracelet",
  "kenari-chimes",
  "kenari-seed-shell-shakers",
  "large-tuning-fork",
  "macrame-yoga-mat-straps",
  "mayura-morchang-set",
  "mini-coconut-shakers-3-types",
  "mini-flat-maracas",
  "native-american-style-flute-handcrafted-wooden-melody-maker",
  "ocean-drums",
  "pangi-seed-shell-rattle",
  "pulse-tubes",
  "rectangle-wooden-maracas-shaker",
  "rectangular-yoga-bolster",
  "root-chakra-singing-bowl",
  "round-yoga-bolster",
  "s-shaped-didgeridoo",
  "sacred-symbols-singing-bowls",
  "shamanic-drum",
  "shamanic-drum-ocean-drum-bags",
  "shankh-conch",
  "shruti-box",
  "shruti-box-pedal",
  "singing-bowl-bags",
  "singing-bowl-set-g-a-b",
  "singing-bowl-with-handle",
  "singing-bowl-with-mantra-rustic-blue-colour",
  "singing-bowls-flower-of-life-with-sacred-symbols",
  "singing-bowls-silk-ring-cushion-accessories",
  "singing-bowls-with-sacred-mantra-printed",
  "sleigh-bells-wooden-jingle-stick",
  "solar-bell",
  "spin-twist-drum-or-den-den-daiko",
  "spiral-snake-didgeridoo",
  "stainless-steel-straws",
  "sughosh-shankh",
  "swinging-chimes",
  "teak-wood-stainless-steel-xylophone",
  "the-four-bowl-set-root-heart-third-eye-and-universal",
  "the-head-bowl",
  "the-three-bowl-set-root-heart-and-third-eye",
  "third-eye-chakra-singing-bowl",
  "thunder-tube-basic-edition",
  "tibetan-buddhist-bell",
  "tingsha-bell",
  "triad-crystal-bowl-set",
  "tuning-fork-activators",
  "tuning-fork-extensions",
  "tuning-fork-single-weighted-unweighted",
  "tuning-forks-7-chakra-set",
  "tuning-forks-gem-feet",
  "tuning-forks-solfeggio-set",
  "universal-bowl",
  "vibroacoustic-therapy-bowls-universal-belly-and-head",
  "wind-chimes",
  "wind-gong-etched",
  "wind-gong-plain",
  "wooden-finger-castanet",
  "wooden-frog",
  "wooden-guiro",
  "wooden-hand-taal-khartal",
  "wooden-mallets-for-singing-bowls",
  "wooden-maracas-shakers-plain-dot-painted",
  "wooden-stand-for-tuning-forks",
  "wooden-tambourines",
  "yoga-belt-strap",
  "yoga-blanket",
  "yoga-mats-lotus",
  "zabuton-cushion",
  "zafu-meditation-cushion-lotus-embroidery",
  "zafu-meditation-cushion-plain",
  "zafu-zabuton-combo-lotus-embroidery",
  "zafu-zabuton-combo-plain",
  "zen-meditation-bench",
]);

/** Explicit no-target leaves from the Merchant audit — never invent a destination. */
export const LEGACY_WOO_UNRESOLVED_LEAVES: ReadonlySet<string> = new Set([
  "elemental-chimes",
  "box-tanpura",
]);

const SLUG_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

const CASE_INDEX: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  Array.from(LEGACY_WOO_KNOWN_PRODUCT_SLUGS).forEach((slug) => {
    const key = slug.toLowerCase();
    // Only index unambiguous case folds (audit set has unique lowercase keys).
    if (!m.has(key)) m.set(key, slug);
  });
  return m;
})();

/**
 * Final non-empty pathname segment for /store/... deep paths.
 * Returns null for /store, /store/, non-store paths, or unsafe segments.
 */
export function extractLegacyStoreProductLeaf(pathname: string): string | null {
  if (!pathname) return null;
  const raw = pathname.split("?")[0] ?? "";
  const normalized = raw.replace(/\/+$/, "") || "/";
  if (normalized === "/store") return null;
  if (!normalized.startsWith("/store/")) return null;

  const parts = normalized.split("/").filter(Boolean);
  // ["store", ...segments]; need at least one product leaf after store
  if (parts.length < 2 || parts[0] !== "store") return null;

  const leaf = parts[parts.length - 1] ?? "";
  if (!leaf || !SLUG_SAFE.test(leaf)) return null;
  if (leaf.includes("..") || leaf.includes(":") || leaf.includes("%")) return null;
  return leaf;
}

export type LegacyWooResolveResult =
  | { ok: true; slug: string; via: "exact" | "case" | "alias" }
  | { ok: false; reason: "empty" | "unresolved_audit" | "unknown" | "unsafe" };

/**
 * Resolve a legacy leaf to current Product.slug.
 * Order: A exact slug → B case-normalized known slug → C audited alias map.
 */
export function resolveLegacyWooProductSlug(leaf: string | null | undefined): LegacyWooResolveResult {
  if (leaf == null || leaf === "") return { ok: false, reason: "empty" };
  if (!SLUG_SAFE.test(leaf) || leaf.includes("..") || leaf.includes(":")) {
    return { ok: false, reason: "unsafe" };
  }
  if (LEGACY_WOO_UNRESOLVED_LEAVES.has(leaf)) {
    return { ok: false, reason: "unresolved_audit" };
  }

  if (LEGACY_WOO_KNOWN_PRODUCT_SLUGS.has(leaf)) {
    return { ok: true, slug: leaf, via: "exact" };
  }

  const cased = CASE_INDEX.get(leaf.toLowerCase());
  if (cased) {
    return { ok: true, slug: cased, via: "case" };
  }

  const aliased = LEGACY_WOO_LEAF_ALIASES[leaf];
  if (aliased && LEGACY_WOO_KNOWN_PRODUCT_SLUGS.has(aliased) && SLUG_SAFE.test(aliased)) {
    return { ok: true, slug: aliased, via: "alias" };
  }

  return { ok: false, reason: "unknown" };
}

/** Safe marketing / click-id params preserved across legacy 301 (values never set host/path). */
const PRESERVED_TRACKING_KEYS = new Set([
  "gclid",
  "gbraid",
  "wbraid",
  "dclid",
  "gad_source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid"
]);

/** Destination-like keys — never forward (open-redirect / navigation control). */
const BLOCKED_DESTINATION_KEYS = new Set([
  "redirect",
  "return",
  "next",
  "url",
  "callback"
]);

function isPreservedLegacyQueryKey(key: string): boolean {
  if (BLOCKED_DESTINATION_KEYS.has(key)) return false;
  if (key.startsWith("attribute_")) return true;
  return PRESERVED_TRACKING_KEYS.has(key);
}

/** Preserve Woo attributes + approved ad/attribution params; drop everything else. */
export function pickSafeLegacyProductQuery(
  searchParams: URLSearchParams | Iterable<[string, string]>
): URLSearchParams {
  const src =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(Array.from(searchParams));
  const out = new URLSearchParams();
  Array.from(src.entries()).forEach(([key, value]) => {
    if (!isPreservedLegacyQueryKey(key)) return;
    // Reject absolute URLs / protocol tricks in values (values must not act as destinations)
    const v = value.trim();
    if (!v) return;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(v)) return;
    if (v.includes("//") || v.includes("\\")) return;
    out.append(key, value);
  });
  return out;
}

/**
 * Build an internal /product/{slug} path (+ safe query). Never returns an external URL.
 */
export function buildLegacyProductRedirectTarget(
  slug: string,
  searchParams?: URLSearchParams | Iterable<[string, string]> | null
): string {
  if (!SLUG_SAFE.test(slug) || !LEGACY_WOO_KNOWN_PRODUCT_SLUGS.has(slug)) {
    throw new Error("Refusing redirect: slug is not an audited internal product slug");
  }
  const path = `/product/${encodeURIComponent(slug)}`;
  if (!searchParams) return path;
  const qs = pickSafeLegacyProductQuery(searchParams);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** High-level: pathname + query → internal redirect path, or null if no product match. */
export function resolveStorePathToProductRedirect(
  pathname: string,
  searchParams?: URLSearchParams | Iterable<[string, string]> | null
): string | null {
  const leaf = extractLegacyStoreProductLeaf(pathname);
  const resolved = resolveLegacyWooProductSlug(leaf);
  if (!resolved.ok) return null;
  return buildLegacyProductRedirectTarget(resolved.slug, searchParams ?? null);
}
