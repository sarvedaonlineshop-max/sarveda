import fs from "fs";
import path from "path";

type RelatedArticlesMap = {
  byWooCommerceId: Record<string, string[]>;
  byProductSlug: Record<string, string[]>;
};

let cached: RelatedArticlesMap | null = null;

function loadMap(): RelatedArticlesMap {
  if (cached) return cached;
  const candidates = [
    path.join(__dirname, "related-articles-map.json"),
    path.join(__dirname, "../../data/related-articles-map.json"),
    path.join(process.cwd(), "src/data/related-articles-map.json"),
    path.join(process.cwd(), "data/related-articles-map.json"),
    path.join(process.cwd(), "../data/compare/related-articles-map.json")
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      cached = JSON.parse(fs.readFileSync(file, "utf8")) as RelatedArticlesMap;
      return cached;
    } catch {
      /* try next */
    }
  }
  cached = { byWooCommerceId: {}, byProductSlug: {} };
  return cached;
}

/** Resolve related blog slugs from Woo ACF export when DB field is empty. */
export function resolveRelatedArticleSlugs(input: {
  slug: string;
  wooCommerceId?: number | null;
  relatedArticleSlugs?: string[] | null;
}): string[] {
  const existing = (input.relatedArticleSlugs ?? []).map((s) => s.trim()).filter(Boolean);
  if (existing.length) return existing;

  const map = loadMap();
  if (input.wooCommerceId != null) {
    const byWoo = map.byWooCommerceId[String(input.wooCommerceId)];
    if (byWoo?.length) return [...byWoo];
  }
  const bySlug = map.byProductSlug[input.slug];
  return bySlug?.length ? [...bySlug] : [];
}
