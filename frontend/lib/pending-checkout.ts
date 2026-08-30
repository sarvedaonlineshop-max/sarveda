import type { CreateOrderResponse } from "@/lib/checkout-api";

const STORAGE_KEY = "sarveda_pending_checkout";

/** Commercial fingerprint format version (sessionStorage only — not a DB migration). */
export const CHECKOUT_FINGERPRINT_VERSION = 2;

export type PendingCheckout = CreateOrderResponse & {
  email: string;
  savedAt: string;
  /**
   * Commercial checkout fingerprint (v2): lines + currency + payable minor units.
   * Legacy v1 was lines-only (`variantId:qty|…`) without a version field.
   */
  cartFingerprint?: string;
  fingerprintVersion?: number;
};

export type CartFingerprintLine = {
  variantId: string;
  quantity: number;
};

export type CommercialFingerprintInput = {
  lines: CartFingerprintLine[];
  currency: string;
  /** Final payable in minor units (paise/cents) — same integer money model as Orders. */
  payableMinor: number;
};

/** Sorted line identity: `variantId:qty|…` */
export function buildCartLinesKey(lines: CartFingerprintLine[]): string {
  return lines
    .map((l) => `${l.variantId}:${l.quantity}`)
    .sort()
    .join("|");
}

/**
 * @deprecated Use {@link buildCommercialFingerprint}. Kept for call-site clarity during migration.
 */
export function buildCartFingerprint(lines: CartFingerprintLine[]): string {
  return buildCartLinesKey(lines);
}

/**
 * Stable commercial identity for resume compatibility.
 * Format: `v2|{lines}|{CURRENCY}|{payableMinor}`
 */
export function buildCommercialFingerprint(input: CommercialFingerprintInput): string {
  const lines = buildCartLinesKey(input.lines);
  const currency = (input.currency || "INR").trim().toUpperCase() || "INR";
  const payable = Number.isFinite(input.payableMinor)
    ? Math.max(0, Math.round(input.payableMinor))
    : 0;
  return `v${CHECKOUT_FINGERPRINT_VERSION}|${lines}|${currency}|${payable}`;
}

export function isHardenedCommercialFingerprint(fingerprint: string | undefined): boolean {
  if (!fingerprint) return false;
  return fingerprint.startsWith(`v${CHECKOUT_FINGERPRINT_VERSION}|`);
}

export function savePendingCheckout(
  order: CreateOrderResponse,
  email: string,
  cartFingerprint?: string
): void {
  if (typeof window === "undefined") return;
  const hardened = isHardenedCommercialFingerprint(cartFingerprint);
  const payload: PendingCheckout = {
    ...order,
    email: email.trim().toLowerCase(),
    savedAt: new Date().toISOString(),
    ...(cartFingerprint ? { cartFingerprint } : {}),
    ...(hardened ? { fingerprintVersion: CHECKOUT_FINGERPRINT_VERSION } : {})
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadPendingCheckout(): PendingCheckout | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingCheckout;
  } catch {
    return null;
  }
}

export function clearPendingCheckout(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * True when pending unpaid checkout still matches the live commercial snapshot.
 * Legacy / missing / non-v2 fingerprints never match (forces create-order).
 */
export function pendingMatchesCart(
  pending: PendingCheckout | null,
  cartFingerprint: string,
  email?: string
): boolean {
  if (!pending?.orderNumber) return false;
  if (pending.fingerprintVersion !== CHECKOUT_FINGERPRINT_VERSION) return false;
  if (!isHardenedCommercialFingerprint(pending.cartFingerprint)) return false;
  if (!isHardenedCommercialFingerprint(cartFingerprint)) return false;
  if (pending.cartFingerprint !== cartFingerprint) return false;
  if (email && pending.email !== email.trim().toLowerCase()) return false;
  return true;
}

/** Alias for clarity at call sites. */
export const pendingMatchesCommercial = pendingMatchesCart;
