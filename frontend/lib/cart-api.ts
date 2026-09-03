import { getApiBase } from "./api";
import { trackAddToCart } from "./analytics";
import { readZoneFromCookie, zoneToPricingCountry } from "./currency";
import { clearPendingCheckout } from "./pending-checkout";

const SESSION_STORAGE_KEY = "sarveda_cart_session_id";

/** When true, cart API uses only the logged-in account cart (no guest session header). */
let useAccountCartOnly = false;

export function setAccountCartOnly(enabled: boolean): void {
  useAccountCartOnly = enabled;
}

export function notifyCartChanged(data?: CartApiResponse): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sarveda-cart-changed", { detail: data }));
  }
}

/** Cart mutations invalidate any abandoned unpaid checkout resume. */
function invalidatePendingCheckoutOnCartChange(): void {
  clearPendingCheckout();
}

/** Country for cart price zone — explicit override, else `sarveda_zone` cookie. */
export function resolveCartPricingCountry(override?: string): string {
  const trimmed = override?.trim();
  if (trimmed) return trimmed.toUpperCase();
  return zoneToPricingCountry(readZoneFromCookie());
}

function withCountryQuery(path: string, shippingCountry?: string): string {
  const country = resolveCartPricingCountry(shippingCountry);
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}country=${encodeURIComponent(country)}`;
}

export type CartApiItem = {
  id: string;
  variantId: string | null;
  digitalOfferId?: string | null;
  productSlug: string;
  productName: string;
  quantity: number;
  unitPriceInPaise: number;
  variantLabel: string | null;
  primaryImageUrl: string | null;
  maxQuantity: number | null;
  dropShipEnabled?: boolean;
  warehouseAvailable?: number | null;
  isDigital?: boolean;
};

/** Stable key for cart UI / mutations (product variant or digital offer). */
export function cartLineKey(item: {
  variantId?: string | null;
  digitalOfferId?: string | null;
  id?: string;
}): string {
  if (item.digitalOfferId) return `d:${item.digitalOfferId}`;
  if (item.variantId) return item.variantId;
  return item.id ?? "";
}

export type CartCouponInfo = {
  code: string;
  type: string;
  value: number;
  discountInPaise: number;
};

export type CheckoutCouponOffer = {
  code: string;
  label: string;
  type: string;
  value: number;
  eligible: boolean;
  ineligibleReason?: string;
};

/** Keep cart line order stable when qty changes (API row order can flicker). */
export function preserveCartItemOrder(
  previous: CartApiItem[],
  incoming: CartApiItem[]
): CartApiItem[] {
  if (incoming.length === 0) return incoming;
  if (previous.length === 0) {
    return [...incoming].sort((a, b) => a.id.localeCompare(b.id));
  }
  const incomingByKey = new Map(incoming.map((i) => [cartLineKey(i), i]));
  const ordered: CartApiItem[] = [];
  for (const item of previous) {
    const key = cartLineKey(item);
    const updated = incomingByKey.get(key);
    if (updated) {
      ordered.push(updated);
      incomingByKey.delete(key);
    }
  }
  for (const item of incoming) {
    const key = cartLineKey(item);
    if (incomingByKey.has(key)) {
      ordered.push(item);
    }
  }
  return ordered;
}

export type CartCouponRejected = {
  code: string;
  message: string;
};

export type CartApiResponse = {
  items: CartApiItem[];
  /** Minor units for `currency` (paise, cents, or pence). */
  subtotalInPaise: number;
  discountInPaise?: number;
  totalInPaise?: number;
  coupon?: CartCouponInfo | null;
  /** Set when a saved coupon was removed because it is not valid for this cart/account. */
  couponRejected?: CartCouponRejected | null;
  itemCount: number;
  currency: string;
  isDigitalOnly?: boolean;
  sessionId?: string;
};

function readSession(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}

export function writeSession(id: string): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, id);
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

/** Exported for checkout + cart requests that need the guest session header. */
export function buildHeaders(includeJsonContentType: boolean): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json"
  };
  if (includeJsonContentType) {
    h["Content-Type"] = "application/json";
  }
  if (!useAccountCartOnly) {
    const sid = readSession();
    if (sid) {
      h["X-Sarveda-Cart-Session"] = sid;
    }
  }
  return h;
}

/** After login: merge guest cart once, then stop sending guest session on cart calls. */
export async function mergeGuestCartSession(): Promise<CartApiResponse | null> {
  const sid = readSession();
  if (!sid) {
    setAccountCartOnly(true);
    return null;
  }
  // Always attach guest session for merge — even if account-cart mode is already on.
  const res = await fetch(`${getApiBase()}${withCountryQuery("/api/cart/merge-session")}`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Sarveda-Cart-Session": sid
    }
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CartApiResponse;
    error?: string;
  };
  clearSession();
  setAccountCartOnly(true);
  if (!res.ok || !json.success || !json.data) {
    return null;
  }
  notifyCartChanged(json.data);
  return json.data;
}

export async function cartGet(
  shippingCountry?: string,
  checkoutEmail?: string
): Promise<CartApiResponse> {
  const params = new URLSearchParams();
  params.set("country", resolveCartPricingCountry(shippingCountry));
  const email = checkoutEmail?.trim();
  if (email) params.set("email", email);
  const qs = `?${params.toString()}`;
  const res = await fetch(`${getApiBase()}/api/cart${qs}`, {
    method: "GET",
    credentials: "include",
    headers: buildHeaders(false)
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Cart fetch failed (${res.status})`);
  }
  const json = (await res.json()) as { success: boolean; data: CartApiResponse };
  if (json.data?.sessionId) {
    writeSession(json.data.sessionId);
  }
  return json.data;
}

export async function cartAdd(variantId: string, quantity: number): Promise<CartApiResponse> {
  return cartAddLine({ variantId, quantity });
}

export async function cartAddDigital(
  digitalOfferId: string,
  quantity = 1
): Promise<CartApiResponse> {
  return cartAddLine({ digitalOfferId, quantity });
}

async function cartAddLine(input: {
  variantId?: string;
  digitalOfferId?: string;
  quantity: number;
}): Promise<CartApiResponse> {
  const res = await fetch(`${getApiBase()}${withCountryQuery("/api/cart/add")}`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(true),
    body: JSON.stringify({
      ...(input.variantId ? { variantId: input.variantId } : {}),
      ...(input.digitalOfferId ? { digitalOfferId: input.digitalOfferId } : {}),
      quantity: Number(input.quantity) || 1
    })
  });
  const raw = await res.text();
  let json: {
    success?: boolean;
    data?: CartApiResponse;
    error?: string;
    code?: string;
  } = {};
  try {
    json = JSON.parse(raw) as typeof json;
  } catch {
    if (raw.trim()) {
      json = { error: raw.trim() };
    }
  }
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Could not add to cart (${res.status})`);
  }
  if (json.data?.sessionId) {
    writeSession(json.data.sessionId);
  }
  const addedLine = json.data!.items.find((i) =>
    input.digitalOfferId
      ? i.digitalOfferId === input.digitalOfferId
      : i.variantId === input.variantId
  );
  if (addedLine) {
    trackAddToCart({
      itemId: cartLineKey(addedLine),
      name: addedLine.productName,
      value: addedLine.unitPriceInPaise * (Number(input.quantity) || 1),
      currency: json.data!.currency
    });
  }
  invalidatePendingCheckoutOnCartChange();
  notifyCartChanged(json.data);
  return json.data!;
}

export async function cartUpdate(
  line: { variantId?: string | null; digitalOfferId?: string | null } | string,
  quantity: number
): Promise<CartApiResponse> {
  const variantId = typeof line === "string" ? line : line.variantId ?? undefined;
  const digitalOfferId = typeof line === "string" ? undefined : line.digitalOfferId ?? undefined;
  const res = await fetch(`${getApiBase()}${withCountryQuery("/api/cart/update")}`, {
    method: "PUT",
    credentials: "include",
    headers: buildHeaders(true),
    body: JSON.stringify({
      ...(digitalOfferId ? { digitalOfferId } : { variantId }),
      quantity
    })
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CartApiResponse;
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not update cart");
  }
  invalidatePendingCheckoutOnCartChange();
  notifyCartChanged(json.data);
  return json.data;
}

/** Clear server cart after successful payment (guest session or logged-in). */
export async function cartClearAll(): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/cart`, {
    method: "DELETE",
    credentials: "include",
    headers: buildHeaders(false)
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Cart clear failed (${res.status})`);
  }
  clearSession();
  invalidatePendingCheckoutOnCartChange();
  notifyCartChanged();
}

export async function cartRemove(
  line: { variantId?: string | null; digitalOfferId?: string | null } | string
): Promise<CartApiResponse> {
  const variantId = typeof line === "string" ? line : line.variantId ?? undefined;
  const digitalOfferId = typeof line === "string" ? undefined : line.digitalOfferId ?? undefined;
  const path = digitalOfferId
    ? `/api/cart/remove/digital/${encodeURIComponent(digitalOfferId)}`
    : `/api/cart/remove/${encodeURIComponent(variantId!)}`;
  const res = await fetch(`${getApiBase()}${withCountryQuery(path)}`, {
    method: "DELETE",
    credentials: "include",
    headers: buildHeaders(false)
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CartApiResponse;
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not remove item");
  }
  invalidatePendingCheckoutOnCartChange();
  notifyCartChanged(json.data);
  return json.data;
}

export async function fetchCheckoutCouponOffers(opts?: {
  country?: string;
  email?: string;
}): Promise<{ offers: CheckoutCouponOffer[]; appliedCode: string | null }> {
  const params = new URLSearchParams();
  params.set("country", resolveCartPricingCountry(opts?.country));
  if (opts?.email?.trim()) params.set("email", opts.email.trim());
  const qs = `?${params.toString()}`;
  const res = await fetch(`${getApiBase()}/api/cart/coupon/offers${qs}`, {
    method: "GET",
    credentials: "include",
    headers: buildHeaders(false)
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { offers: CheckoutCouponOffer[]; appliedCode: string | null };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not load offers");
  }
  return json.data;
}

export async function applyCartCoupon(
  code: string,
  opts?: { country?: string; email?: string }
): Promise<CartApiResponse> {
  const qs = `?country=${encodeURIComponent(resolveCartPricingCountry(opts?.country))}`;
  const res = await fetch(`${getApiBase()}/api/cart/coupon${qs}`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(true),
    body: JSON.stringify({
      code: code.trim(),
      ...(opts?.email?.trim() ? { email: opts.email.trim() } : {})
    })
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CartApiResponse;
    error?: string;
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not apply coupon");
  }
  if (json.data?.sessionId) {
    writeSession(json.data.sessionId);
  }
  invalidatePendingCheckoutOnCartChange();
  notifyCartChanged(json.data);
  return json.data!;
}

export async function removeCartCoupon(shippingCountry?: string): Promise<CartApiResponse> {
  const qs = `?country=${encodeURIComponent(resolveCartPricingCountry(shippingCountry))}`;
  const res = await fetch(`${getApiBase()}/api/cart/coupon${qs}`, {
    method: "DELETE",
    credentials: "include",
    headers: buildHeaders(false)
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CartApiResponse;
    error?: string;
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not remove coupon");
  }
  invalidatePendingCheckoutOnCartChange();
  notifyCartChanged(json.data);
  return json.data!;
}
