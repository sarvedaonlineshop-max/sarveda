export const SHOP_SCROLL_KEY = "sarveda_shop_scroll";

export type ShopScrollState = {
  path: string;
  scrollY: number;
};

export function currentShopPath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

export function saveShopScroll(): void {
  if (typeof window === "undefined") return;
  const payload: ShopScrollState = {
    path: currentShopPath(),
    scrollY: window.scrollY
  };
  sessionStorage.setItem(SHOP_SCROLL_KEY, JSON.stringify(payload));
}

export function readShopScroll(): ShopScrollState | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SHOP_SCROLL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ShopScrollState;
    if (typeof parsed.path !== "string" || typeof parsed.scrollY !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearShopScroll(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SHOP_SCROLL_KEY);
}
