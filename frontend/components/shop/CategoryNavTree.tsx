"use client";

import type { CategoryNode } from "@/lib/types";

type Props = {
  nodes: CategoryNode[];
  selectedSlug: string | undefined;
  depth: number;
  onNavigate?: () => void;
  /** Client-side category switch — keeps header/sidebar/footer mounted, no full page reload. */
  onSelect: (slug: string | undefined) => void;
  /** Accordion: which top-level slug is currently open (only one at a time). */
  openSlug?: string | null;
  /** Fires on any category click — opens its own branch (closing siblings). */
  onOpen?: (slug: string) => void;
};

/** A handful of real subcategories are literally named "All" — the parent category
 *  link already shows everything, so this redundant child is hidden from the tree. */
function visibleChildren(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.filter((n) => n.name.trim().toLowerCase() !== "all");
}

export function CategoryNavTree({
  nodes,
  selectedSlug,
  depth,
  onNavigate,
  onSelect,
  openSlug,
  onOpen
}: Props) {
  const visible = depth === 0 ? nodes : visibleChildren(nodes);

  return (
    <ul
      className={
        depth === 0
          ? "space-y-0.5"
          : "ml-3 mt-0.5 space-y-0 border-l-2 border-brand-cream-dark pl-3"
      }
    >
      {visible.map((cat) => {
        const active = selectedSlug === cat.slug;
        const children = visibleChildren(cat.children);
        const hasChildren = children.length > 0;
        const isParent = depth === 0;
        const isOpen = isParent ? openSlug === cat.slug : true;
        const showAsOpenBranch = isParent && hasChildren && isOpen && !active;

        return (
          <li key={cat.id}>
            {/* Plain button, not next/link — a category switch here is a pure
                client-side state+fetch update (see ShopBrowser), and a <Link>'s
                own internal click/prefetch handling has no business anywhere
                near it. Crawlable URLs to every category still exist via the
                breadcrumbs and direct /product-category/[slug] pages. */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(cat.slug);
                if (isParent && hasChildren) onOpen?.(cat.slug);
                onNavigate?.();
              }}
              className={`block w-full min-h-[30px] rounded-md px-2.5 py-1 text-left text-sm leading-snug transition-colors duration-150 ${
                isParent
                  ? active
                    ? "bg-brand-forest font-semibold text-brand-cream"
                    : showAsOpenBranch
                      ? "bg-brand-cream font-semibold text-brand-forest"
                      : "font-semibold text-brand-forest hover:bg-brand-cream"
                  : active
                    ? "bg-brand-forest/10 font-medium text-brand-forest"
                    : "text-brand-muted hover:bg-brand-cream hover:text-brand-ink"
              }`}
            >
              {cat.name}
            </button>
            {hasChildren ? (
              <div
                className="grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: !isParent || isOpen ? "1fr" : "0fr" }}
              >
                <div className="min-h-0">
                  <CategoryNavTree
                    nodes={children}
                    selectedSlug={selectedSlug}
                    depth={depth + 1}
                    onNavigate={onNavigate}
                    onSelect={onSelect}
                    onOpen={onOpen}
                  />
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
