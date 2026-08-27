export const SHOP_SCROLL_KEY = "sarveda_shop_scroll";
export const SHOP_LOADED_PAGES_KEY = "sarveda_shop_loaded_pages";

export type ShopScrollState = {
  path: string;
  scrollY: number;
  /** Product slug clicked — scroll to this card after pages reload. */
  productSlug?: string;
  /** How many infinite-scroll pages were loaded when leaving for PDP. */
  loadedPages?: number;
};

export function currentShopPath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

export function setShopLoadedPages(pages: number): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SHOP_LOADED_PAGES_KEY, String(Math.max(1, pages)));
}

export function getShopLoadedPages(): number {
  if (typeof window === "undefined") return 1;
  const n = Number(sessionStorage.getItem(SHOP_LOADED_PAGES_KEY) || "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function saveShopScroll(productSlug?: string): void {
  if (typeof window === "undefined") return;
  const payload: ShopScrollState = {
    path: currentShopPath(),
    scrollY: window.scrollY,
    productSlug: productSlug || undefined,
    loadedPages: getShopLoadedPages()
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

/** Read saved state only if it matches the current shop URL. */
export function readShopScrollForCurrentPath(): ShopScrollState | null {
  const saved = readShopScroll();
  if (!saved || saved.path !== currentShopPath()) return null;
  return saved;
}

export function clearShopScroll(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SHOP_SCROLL_KEY);
}
