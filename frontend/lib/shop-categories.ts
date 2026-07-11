import type { CategoryNode } from "@/lib/types";

const SOUND_FIRST = ["sound", "musical", "instrument"];
const ECO_LAST = ["eco", "sustainable", "living"];

function categoryRank(cat: CategoryNode): number {
  const slug = cat.slug.toLowerCase();
  const name = cat.name.toLowerCase();
  if (SOUND_FIRST.some((k) => slug.includes(k) || name.includes(k))) return 0;
  if (ECO_LAST.some((k) => slug.includes(k) || name.includes(k))) return 100;
  return 50;
}

export function sortShopCategories(categories: CategoryNode[]): CategoryNode[] {
  return [...categories]
    .sort((a, b) => {
      const ra = categoryRank(a);
      const rb = categoryRank(b);
      if (ra !== rb) return ra - rb;
      return (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name);
    })
    .map((c) => ({
      ...c,
      children: c.children.length ? sortShopCategories(c.children) : []
    }));
}

export function isSoundCategory(cat: CategoryNode): boolean {
  const slug = cat.slug.toLowerCase();
  const name = cat.name.toLowerCase();
  return SOUND_FIRST.some((k) => slug.includes(k) || name.includes(k));
}

/** All top-level branches with children start expanded in the shop sidebar. */
export function defaultExpandedCategorySlugs(categories: CategoryNode[]): Set<string> {
  const expanded = new Set<string>();
  for (const cat of categories) {
    if (cat.children.length > 0) expanded.add(cat.slug);
  }
  return expanded;
}
