import type { BlogDetail, BlogListItem } from "./blog-types";
import type { CmsPage } from "./cms-types";
import type { CourseDetail, CourseListItem } from "./course-types";
import type { EventDetail, EventListItem } from "./event-types";
import type {
  MentorDetail,
  MentorListItem,
  OfferDetail,
  RetreatDetail,
  RetreatListItem,
  VaidyaDetail,
  OfferListItem,
  VaidyaListItem
} from "./people-types";
import { skipBuildTimeStaticParams } from "./build";
import { type ApiErrorBody, type ApiSuccess, parseApiResponse } from "./parse-api-response";
import type { CategoryNode, ProductDetail, ProductListItem, ProductListResponse } from "./types";

export { skipBuildTimeStaticParams };

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

export type { ApiErrorBody, ApiSuccess };

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

  const json = await parseApiResponse<T>(res);

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
  const json = await parseApiResponse<{ product: ProductDetail }>(res);
  if (!res.ok || !("success" in json) || !json.success) {
    return null;
  }
  return json.data.product;
}

export async function fetchCategoryTree(init?: RequestInit): Promise<CategoryNode[]> {
  const data = await fetchApi<{ categories: CategoryNode[] }>("/api/categories", init);
  return data.categories;
}

export type CategoryPublic = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  parent: { slug: string; name: string } | null;
};

export async function fetchCategoryBySlug(
  slug: string,
  init?: RequestInit
): Promise<CategoryPublic | null> {
  try {
    const data = await fetchApi<{ category: CategoryPublic }>(
      `/api/categories/${encodeURIComponent(slug)}`,
      init
    );
    return data.category;
  } catch {
    return null;
  }
}

export async function fetchCategorySlugs(init?: RequestInit): Promise<string[]> {
  try {
    const data = await fetchApi<{ slugs: string[] }>("/api/categories/sitemap/slugs", init);
    return data.slugs;
  } catch {
    const tree = await fetchCategoryTree(init);
    const slugs: string[] = [];
    const walk = (nodes: CategoryNode[]) => {
      for (const n of nodes) {
        slugs.push(n.slug);
        if (n.children.length) walk(n.children);
      }
    };
    walk(tree);
    return slugs;
  }
}

export async function fetchProductSitemapEntries(
  init?: RequestInit
): Promise<Array<{ slug: string; updatedAt: string }>> {
  try {
    const data = await fetchApi<{ entries: Array<{ slug: string; updatedAt: string }> }>(
      "/api/products/sitemap/entries",
      { ...init, next: { revalidate: 3600 } }
    );
    return data.entries;
  } catch {
    const slugs = await fetchAllProductSlugs();
    return slugs.map((slug) => ({ slug, updatedAt: new Date().toISOString() }));
  }
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
  const searchQ =
    typeof searchParams.q === "string"
      ? searchParams.q
      : typeof searchParams.search === "string"
        ? searchParams.search
        : undefined;
  if (searchQ?.trim()) q.set("q", searchQ.trim());
  return fetchApi<ProductListResponse>(`/api/products?${q.toString()}`, init);
}

export type ProductSuggestion = {
  slug: string;
  name: string;
  imageUrl: string | null;
  priceInPaise: number | null;
};

export async function fetchProductSuggestions(term: string): Promise<ProductSuggestion[]> {
  if (term.trim().length < 2) return [];
  const q = new URLSearchParams({ q: term.trim() });
  const data = await fetchApi<{ items: ProductSuggestion[] }>(`/api/products/suggest?${q.toString()}`);
  return data.items;
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

export async function fetchCourses(init?: RequestInit): Promise<CourseListItem[]> {
  try {
    const data = await fetchApi<{ courses: CourseListItem[] }>("/api/courses", init);
    return data.courses;
  } catch {
    return [];
  }
}

export async function fetchCourseBySlug(
  slug: string,
  init?: RequestInit
): Promise<CourseDetail | null> {
  try {
    const data = await fetchApi<{ course: CourseDetail }>(
      `/api/courses/${encodeURIComponent(slug)}`,
      init
    );
    return data.course;
  } catch {
    return null;
  }
}

export async function fetchCourseSlugs(init?: RequestInit): Promise<string[]> {
  try {
    const data = await fetchApi<{ slugs: string[] }>("/api/courses/sitemap/slugs", init);
    return data.slugs;
  } catch {
    return [];
  }
}

export async function fetchEvents(init?: RequestInit): Promise<EventListItem[]> {
  try {
    const data = await fetchApi<{ events: EventListItem[] }>("/api/events", init);
    return data.events;
  } catch {
    return [];
  }
}

export async function fetchEventBySlug(slug: string, init?: RequestInit): Promise<EventDetail | null> {
  try {
    const data = await fetchApi<{ event: EventDetail }>(`/api/events/${encodeURIComponent(slug)}`, init);
    return data.event;
  } catch {
    return null;
  }
}

export async function fetchEventSlugs(init?: RequestInit): Promise<string[]> {
  try {
    const data = await fetchApi<{ slugs: string[] }>("/api/events/sitemap/slugs", init);
    return data.slugs;
  } catch {
    return [];
  }
}

export async function fetchVaidyas(init?: RequestInit): Promise<VaidyaListItem[]> {
  try {
    const data = await fetchApi<{ vaidyas: VaidyaListItem[] }>("/api/vaidyas", init);
    return data.vaidyas;
  } catch {
    return [];
  }
}

export async function fetchVaidyaBySlug(slug: string, init?: RequestInit): Promise<VaidyaDetail | null> {
  try {
    const data = await fetchApi<{ vaidya: VaidyaDetail }>(`/api/vaidyas/${encodeURIComponent(slug)}`, init);
    return data.vaidya;
  } catch {
    return null;
  }
}

export async function fetchMentors(init?: RequestInit): Promise<MentorListItem[]> {
  try {
    const data = await fetchApi<{ mentors: MentorListItem[] }>("/api/mentors", init);
    return data.mentors;
  } catch {
    return [];
  }
}

export async function fetchMentorBySlug(slug: string, init?: RequestInit): Promise<MentorDetail | null> {
  try {
    const data = await fetchApi<{ mentor: MentorDetail }>(`/api/mentors/${encodeURIComponent(slug)}`, init);
    return data.mentor;
  } catch {
    return null;
  }
}

export async function fetchRetreats(init?: RequestInit): Promise<RetreatListItem[]> {
  try {
    const data = await fetchApi<{ retreats: RetreatListItem[] }>("/api/retreats", init);
    return data.retreats;
  } catch {
    return [];
  }
}

export async function fetchRetreatBySlug(slug: string, init?: RequestInit): Promise<RetreatDetail | null> {
  try {
    const data = await fetchApi<{ retreat: RetreatDetail }>(
      `/api/retreats/${encodeURIComponent(slug)}`,
      init
    );
    return data.retreat;
  } catch {
    return null;
  }
}

export async function fetchOffers(init?: RequestInit): Promise<OfferListItem[]> {
  try {
    const data = await fetchApi<{ offers: OfferListItem[] }>("/api/offers", init);
    return data.offers;
  } catch {
    return [];
  }
}

export async function fetchOfferBySlug(slug: string, init?: RequestInit): Promise<OfferDetail | null> {
  try {
    const data = await fetchApi<{ offer: OfferDetail }>(`/api/offers/${encodeURIComponent(slug)}`, init);
    return data.offer;
  } catch {
    return null;
  }
}

export async function fetchBlogPosts(init?: RequestInit): Promise<BlogListItem[]> {
  try {
    const data = await fetchApi<{ posts: BlogListItem[] }>("/api/blog", init);
    return data.posts;
  } catch {
    return [];
  }
}

export async function fetchBlogBySlug(slug: string, init?: RequestInit): Promise<BlogDetail | null> {
  try {
    const data = await fetchApi<{ post: BlogDetail }>(`/api/blog/${encodeURIComponent(slug)}`, init);
    return data.post;
  } catch {
    return null;
  }
}

export async function fetchBlogSlugs(init?: RequestInit): Promise<string[]> {
  try {
    const data = await fetchApi<{ slugs: string[] }>("/api/blog/sitemap/slugs", init);
    return data.slugs;
  } catch {
    return [];
  }
}

export async function fetchCmsPageBySlug(slug: string, init?: RequestInit): Promise<CmsPage | null> {
  try {
    const data = await fetchApi<{ page: CmsPage }>(`/api/pages/${encodeURIComponent(slug)}`, init);
    return data.page;
  } catch {
    return null;
  }
}

export async function fetchCmsPageSlugs(init?: RequestInit): Promise<string[]> {
  try {
    const data = await fetchApi<{ slugs: string[] }>("/api/pages/sitemap/slugs", init);
    return data.slugs;
  } catch {
    return [];
  }
}
