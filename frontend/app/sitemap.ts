import type { MetadataRoute } from "next";

import { fetchCategorySlugs, fetchCourseSlugs, fetchProductSitemapEntries } from "@/lib/api";
import { absoluteUrl, isProductionSite } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isProductionSite()) {
    return [];
  }

  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/shop"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/courses"), lastModified: now, changeFrequency: "weekly", priority: 0.85 }
  ];

  const [products, categorySlugs, courseSlugs] = await Promise.all([
    fetchProductSitemapEntries({ next: { revalidate: 3600 } }),
    fetchCategorySlugs({ next: { revalidate: 3600 } }),
    fetchCourseSlugs({ next: { revalidate: 3600 } })
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

  return [...staticRoutes, ...categoryRoutes, ...courseRoutes, ...productRoutes];
}
