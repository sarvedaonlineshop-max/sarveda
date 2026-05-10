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

export type CartApiResponse = {
  items: CartApiItem[];
  subtotalInPaise: number;
  itemCount: number;
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

export async function cartGet(): Promise<CartApiResponse> {
  const res = await fetch(`${getApiBase()}/api/cart`, {
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
    body: JSON.stringify({ variantId, quantity })
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CartApiResponse;
    error?: string;
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not add to cart");
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
