/**
 * Stable native-only Google Merchant offer identities (no historical CTX / Woo numeric g:id).
 * IDs are derived from immutable Prisma UUIDs and never recycled.
 */

export const NATIVE_MERCHANT_OFFER_PREFIX = "sv_";
export const NATIVE_MERCHANT_GROUP_PREFIX = "sv_group_";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function nativeMerchantOfferId(variantId: string): string {
  if (!UUID_RE.test(variantId)) {
    throw new Error(`nativeMerchantOfferId requires variant UUID, got: ${variantId}`);
  }
  return `${NATIVE_MERCHANT_OFFER_PREFIX}${variantId}`;
}

export function nativeMerchantGroupId(productId: string): string {
  if (!UUID_RE.test(productId)) {
    throw new Error(`nativeMerchantGroupId requires product UUID, got: ${productId}`);
  }
  return `${NATIVE_MERCHANT_GROUP_PREFIX}${productId}`;
}

/** Parse ?offer=sv_<variantUuid> → variant UUID or null. */
export function parseNativeMerchantOfferId(offer: string): string | null {
  const trimmed = offer.trim();
  if (!trimmed.startsWith(NATIVE_MERCHANT_OFFER_PREFIX)) return null;
  const id = trimmed.slice(NATIVE_MERCHANT_OFFER_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

export function isNativeMerchantOfferId(gId: string): boolean {
  return gId.startsWith(NATIVE_MERCHANT_OFFER_PREFIX);
}
