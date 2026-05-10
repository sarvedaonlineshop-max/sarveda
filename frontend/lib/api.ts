import type { CategoryNode, ProductDetail, ProductListItem, ProductListResponse } from "./types";

/**
 * API base for `fetch`.
 * - **Browser:** empty string → same origin (`/api/...`), proxied by Next rewrites to Express (cookies stay on the site host).
 * - **Server (dev):** direct Express URL (`INTERNAL_API_URL` / localhost) — rewrites are not applied to Node `fetch` the same way.
 * - **Server (production on Vercel):** deployment origin only (`NEXT_PUBLIC_SITE_URL` or `VERCEL_URL`) so requests go to `/api` on
 *   the same host and Next proxies to EC2 — avoid pointing `NEXT_PUBLIC_API_URL` at the raw backend URL in prod.
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return "";
  }

  if (process.env.NODE_ENV === "production") {
    const site =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    if (site) {
      return site;
    }
  }

  const url =
    process.env.INTERNAL_API_URL ??
    process.env.BACKEND_PROXY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:5000";
  return url.replace(/\/$/, "");
}

export type ApiSuccess<T> = { success: true; data: T };
export type ApiErrorBody = { success: false; error: string; code?: string };

export async function fetchApi<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers
    }
  });

  const json = (await res.json()) as ApiSuccess<T> | ApiErrorBody;

  if (!res.ok || !("success" in json) || !json.success) {
    const err = json as ApiErrorBody;
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return json.data as T;
}

/** Product detail for PDP; returns null when missing or inactive. */
export async function fetchProductBySlug(
  slug: string,
  init?: RequestInit
): Promise<ProductDetail | null> {
  const url = `${getApiBase()}/api/products/${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers
    }
  });
  const json = (await res.json()) as ApiSuccess<{ product: ProductDetail }> | ApiErrorBody;
  if (!res.ok || !("success" in json) || !json.success) {
    return null;
  }
  return json.data.product;
}

export async function fetchCategoryTree(init?: RequestInit): Promise<CategoryNode[]> {
  const data = await fetchApi<{ categories: CategoryNode[] }>("/api/categories", init);
  return data.categories;
}

export async function fetchProductList(
  searchParams: Record<string, string | string[] | undefined>,
  init?: RequestInit,
  options?: { limit?: number }
): Promise<ProductListResponse> {
  const page = typeof searchParams.page === "string" ? searchParams.page : "1";
  const category =
    typeof searchParams.category === "string" ? searchParams.category : undefined;
  const q = new URLSearchParams();
  q.set("page", page);
  q.set("limit", String(options?.limit ?? 24));
  if (category) q.set("category", category);
  return fetchApi<ProductListResponse>(`/api/products?${q.toString()}`, init);
}

/** Related picks: same category when possible, otherwise recent catalogue items. */
export async function fetchRelatedProducts(
  excludeSlug: string,
  categorySlug: string | undefined,
  init?: RequestInit
): Promise<ProductListItem[]> {
  const data = categorySlug
    ? await fetchProductList({ category: categorySlug }, init, { limit: 16 })
    : await fetchProductList({}, init, { limit: 16 });
  return data.items.filter((p) => p.slug !== excludeSlug).slice(0, 4);
}

/** Slugs for static generation (build-time; falls back to [] if API is offline). */
export async function fetchAllProductSlugs(): Promise<string[]> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const data = await fetchApi<ProductListResponse>("/api/products?limit=500", {
        cache: "no-store",
        signal: ctrl.signal
      });
      return data.items.map((p) => p.slug);
    } finally {
      clearTimeout(id);
    }
  } catch {
    return [];
  }
}
