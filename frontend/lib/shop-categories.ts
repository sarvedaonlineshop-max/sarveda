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

/**
 * Accordion default: only one top-level branch is open at a time. If the
 * current selection lives under a branch (or is one), open that branch;
 * otherwise default to Sound & Musical Instruments.
 */
export function defaultOpenBranchSlug(
  categories: CategoryNode[],
  selectedSlug: string | undefined
): string | null {
  const topLevel = categories.filter((c) => c.children.length > 0);
  if (selectedSlug) {
    const containing = topLevel.find(
      (c) => c.slug === selectedSlug || c.children.some((child) => child.slug === selectedSlug)
    );
    if (containing) return containing.slug;
  }
  const sound = categories.find(isSoundCategory);
  if (sound) return sound.slug;
  return topLevel[0]?.slug ?? null;
}
