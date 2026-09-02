import type { MetadataRoute } from "next";

import {
  fetchBlogSlugs,
  fetchCategorySlugs,
  fetchCmsPageSlugs,
  fetchCourseSlugs,
  fetchEventSlugs,
  fetchMentors,
  fetchOffers,
  fetchProductSitemapEntries,
  fetchRetreats,
  fetchVaidyas
} from "@/lib/api";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

/** CMS/blog slugs that must never appear in the production sitemap. */
const SITEMAP_EXCLUDED_SLUGS = new Set([
  "admin",
  "api",
  "cart",
  "checkout",
  "my-account",
  "profile",
  "chat",
  "store",
  "home",
  "payment-failed",
  "payment-confirmation",
  "stripe-checkout-result",
  "order",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "test-complaint",
  "complaints",
  // Legacy WP policy aliases (canonical policy routes are listed separately / redirected)
  "privacy-policy",
  "terms-of-use",
  "terms-conditions",
  "shipping-and-delivery-policy",
  "shipping-policy",
  "refund-policy",
  "cancellation-and-returns"
]);

function isSitemapIndexableSlug(slug: string): boolean {
  const s = slug.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!s) return false;
  if (SITEMAP_EXCLUDED_SLUGS.has(s)) return false;
  if (s.startsWith("admin/") || s.startsWith("api/")) return false;
  return true;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isProductionSite()) {
    return [];
  }

  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/shop"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/courses"), lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: absoluteUrl("/events"), lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: canonical("/offers"), lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.7 },
    { url: canonical("/insights"), lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: canonical("/vaidya"), lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: canonical("/mentor"), lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: canonical("/retreat"), lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: canonical("/about"), lastModified: new Date(), changeFrequency: "yearly", priority: 0.5 },
    { url: canonical("/contact"), lastModified: new Date(), changeFrequency: "yearly", priority: 0.5 },
    { url: canonical("/privacy"), lastModified: new Date(), changeFrequency: "yearly", priority: 0.4 },
    { url: canonical("/terms"), lastModified: new Date(), changeFrequency: "yearly", priority: 0.4 },
    { url: canonical("/shipping"), lastModified: new Date(), changeFrequency: "yearly", priority: 0.4 },
    { url: canonical("/refunds"), lastModified: new Date(), changeFrequency: "yearly", priority: 0.4 }
  ];

  const [products, categorySlugs, courseSlugs, eventSlugs, pageSlugs, blogSlugs, vaidyas, mentors, retreats, offers] = await Promise.all([
    fetchProductSitemapEntries({ next: { revalidate: 3600 } }),
    fetchCategorySlugs({ next: { revalidate: 3600 } }),
    fetchCourseSlugs({ next: { revalidate: 3600 } }),
    fetchEventSlugs({ next: { revalidate: 3600 } }),
    fetchCmsPageSlugs({ next: { revalidate: 3600 } }),
    fetchBlogSlugs({ next: { revalidate: 3600 } }),
    fetchVaidyas({ next: { revalidate: 3600 } }),
    fetchMentors({ next: { revalidate: 3600 } }),
    fetchRetreats({ next: { revalidate: 3600 } }),
    fetchOffers({ next: { revalidate: 3600 } })
  ]);

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: absoluteUrl(`/product/${p.slug}`),
    lastModified: new Date(p.updatedAt),
    changeFrequency: "weekly",
    priority: 0.8
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categorySlugs.map((slug) => ({
    url: absoluteUrl(`/product-category/${slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7
  }));

  const courseRoutes: MetadataRoute.Sitemap = courseSlugs.map((slug) => ({
    url: absoluteUrl(`/course/${slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.75
  }));

  const eventRoutes: MetadataRoute.Sitemap = eventSlugs.map((slug) => ({
    url: absoluteUrl(`/event/${slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7
  }));

  const cmsRoutes: MetadataRoute.Sitemap = pageSlugs
    .filter(isSitemapIndexableSlug)
    .map((slug) => ({
      url: absoluteUrl(`/${slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.65
    }));

  const blogRoutes: MetadataRoute.Sitemap = blogSlugs
    .filter(isSitemapIndexableSlug)
    .map((slug) => ({
      url: absoluteUrl(`/${slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.65
    }));
  const vaidyaRoutes: MetadataRoute.Sitemap = vaidyas.map((row) => ({
    url: absoluteUrl(`/vaidya/${row.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6
  }));

  const mentorRoutes: MetadataRoute.Sitemap = mentors.map((row) => ({
    url: absoluteUrl(`/mentor/${row.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6
  }));

  const retreatRoutes: MetadataRoute.Sitemap = retreats.map((row) => ({
    url: absoluteUrl(`/retreat/${row.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7
  }));

  const offerRoutes: MetadataRoute.Sitemap = offers.map((row) => ({
    url: absoluteUrl(`/offers/${row.slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7
  }));

  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...courseRoutes,
    ...eventRoutes,
    ...cmsRoutes,
    ...blogRoutes,
    ...vaidyaRoutes,
    ...mentorRoutes,
    ...retreatRoutes,
    ...offerRoutes,
    ...productRoutes
  ];
}
