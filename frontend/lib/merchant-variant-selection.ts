/**
 * Resolve storefront PDP variant from Merchant / legacy Woo query parameters.
 */

const NATIVE_MERCHANT_OFFER_PREFIX = "sv_";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseNativeMerchantOfferParam(offer: string): string | null {
  const trimmed = offer.trim();
  if (!trimmed.startsWith(NATIVE_MERCHANT_OFFER_PREFIX)) return null;
  const id = trimmed.slice(NATIVE_MERCHANT_OFFER_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

export type VariantAttributeRow = {
  attributeValues: Array<{
    attributeValue: {
      value: string;
      slug: string;
      attribute: { slug: string; name: string };
    };
  }>;
};

export type VariantOfferRow = VariantAttributeRow & {
  id: string;
  wooCommerceVariationId?: number | null;
};

function normalizeAttrKey(key: string): string {
  return key
    .replace(/^attribute_/, "")
    .replace(/^pa_/, "")
    .replace(/_/g, "-")
    .toLowerCase();
}

function normalizeAttrValue(value: string): string {
  return decodeURIComponent(value).replace(/\+/g, " ").trim().toLowerCase();
}

/** Match legacy Woo attribute_* / attribute_pa_* query params to a variant. */
export function resolveVariantIdFromLegacyAttributes(
  variants: VariantOfferRow[],
  params: URLSearchParams
): string | null {
  const filters = new Map<string, string>();
  params.forEach((value, key) => {
    if (!key.startsWith("attribute_")) return;
    const k = normalizeAttrKey(key);
    const v = normalizeAttrValue(value);
    if (k && v) filters.set(k, v);
  });
  if (filters.size === 0) return null;

  for (const variant of variants) {
    const variantAttrs = new Map<string, string>();
    for (const av of variant.attributeValues) {
      const slug = av.attributeValue.attribute.slug.toLowerCase();
      const val = av.attributeValue.value.trim().toLowerCase();
      variantAttrs.set(slug, val);
      variantAttrs.set(slug.replace(/_/g, "-"), val);
    }
    let ok = true;
    for (const [k, v] of Array.from(filters.entries())) {
      const direct = variantAttrs.get(k);
      if (direct === v) continue;
      const alt = variantAttrs.get(k.replace(/-/g, "_"));
      if (alt === v) continue;
      ok = false;
      break;
    }
    if (ok) return variant.id;
  }
  return null;
}

/** Prefer ?offer=<wooCommerceVariationId>, then legacy attribute params. */
export function resolveVariantIdFromMerchantParams(
  variants: VariantOfferRow[],
  params: URLSearchParams | Record<string, string | string[] | undefined> | null | undefined
): string | null {
  if (!params || variants.length === 0) return null;

  const sp =
    params instanceof URLSearchParams
      ? params
      : new URLSearchParams(
          Object.entries(params).flatMap(([key, value]) => {
            if (value == null) return [];
            return Array.isArray(value)
              ? value.map((v) => [key, v] as [string, string])
              : [[key, value] as [string, string]];
          })
        );

  const offer = sp.get("offer")?.trim();
  if (offer) {
    const nativeId = parseNativeMerchantOfferParam(offer);
    if (nativeId) {
      const nativeHit = variants.find((v) => v.id === nativeId);
      if (nativeHit) return nativeHit.id;
    }
    if (/^\d+$/.test(offer)) {
      const hit = variants.find((v) => String(v.wooCommerceVariationId ?? "") === offer);
      if (hit) return hit.id;
    }
  }

  return resolveVariantIdFromLegacyAttributes(variants, sp);
}
