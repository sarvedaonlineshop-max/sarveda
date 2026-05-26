import { getApiBase } from "./api";

const SESSION_STORAGE_KEY = "sarveda_cart_session_id";

function notifyCartChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sarveda-cart-changed"));
  }
}

export type CartApiItem = {
  id: string;
  variantId: string;
  productSlug: string;
  productName: string;
  quantity: number;
  unitPriceInPaise: number;
  variantLabel: string | null;
  primaryImageUrl: string | null;
  maxQuantity: number | null;
};

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

export type CartApiResponse = {
  items: CartApiItem[];
  /** Minor units for `currency` (paise, cents, or pence). */
  subtotalInPaise: number;
  discountInPaise?: number;
  totalInPaise?: number;
  coupon?: CartCouponInfo | null;
  itemCount: number;
  currency: string;
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
  const sid = readSession();
  if (sid) {
    h["X-Sarveda-Cart-Session"] = sid;
  }
  return h;
}

export async function cartGet(
  shippingCountry?: string,
  checkoutEmail?: string
): Promise<CartApiResponse> {
  const params = new URLSearchParams();
  const country = shippingCountry?.trim();
  if (country) params.set("country", country);
  const email = checkoutEmail?.trim();
  if (email) params.set("email", email);
  const qs = params.toString() ? `?${params.toString()}` : "";
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
  const res = await fetch(`${getApiBase()}/api/cart/add`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(true),
    body: JSON.stringify({ variantId, quantity: Number(quantity) || 1 })
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
  notifyCartChanged();
  return json.data!;
}

export async function cartUpdate(variantId: string, quantity: number): Promise<CartApiResponse> {
  const res = await fetch(`${getApiBase()}/api/cart/update`, {
    method: "PUT",
    credentials: "include",
    headers: buildHeaders(true),
    body: JSON.stringify({ variantId, quantity })
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CartApiResponse;
    error?: string;
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not update cart");
  }
  notifyCartChanged();
  return json.data!;
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
  notifyCartChanged();
}

export async function cartRemove(variantId: string): Promise<CartApiResponse> {
  const res = await fetch(`${getApiBase()}/api/cart/remove/${encodeURIComponent(variantId)}`, {
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
    throw new Error(json.error || "Could not remove item");
  }
  notifyCartChanged();
  return json.data!;
}

export async function fetchCheckoutCouponOffers(opts?: {
  country?: string;
  email?: string;
}): Promise<{ offers: CheckoutCouponOffer[]; appliedCode: string | null }> {
  const params = new URLSearchParams();
  if (opts?.country?.trim()) params.set("country", opts.country.trim());
  if (opts?.email?.trim()) params.set("email", opts.email.trim());
  const qs = params.toString() ? `?${params.toString()}` : "";
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
  const params = new URLSearchParams();
  if (opts?.country?.trim()) params.set("country", opts.country.trim());
  const qs = params.toString() ? `?${params.toString()}` : "";
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
  notifyCartChanged();
  return json.data!;
}

export async function removeCartCoupon(shippingCountry?: string): Promise<CartApiResponse> {
  const country = shippingCountry?.trim();
  const qs = country ? `?country=${encodeURIComponent(country)}` : "";
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
  notifyCartChanged();
  return json.data!;
}
