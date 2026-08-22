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
  /** Opens a top-level branch (pass same slug again to collapse when expandParentsOnly). */
  onOpen?: (slug: string) => void;
  /**
   * Mobile products sheet: parent click only expands/collapses.
   * Subcategory click loads products. Chevrons, no rail line, no parent highlight.
   */
  expandParentsOnly?: boolean;
};

/** A handful of real subcategories are literally named "All" — the parent category
 *  link already shows everything, so this redundant child is hidden from the tree. */
function visibleChildren(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.filter((n) => n.name.trim().toLowerCase() !== "all");
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function CategoryNavTree({
  nodes,
  selectedSlug,
  depth,
  onNavigate,
  onSelect,
  openSlug,
  onOpen,
  expandParentsOnly = false
}: Props) {
  const visible = depth === 0 ? nodes : visibleChildren(nodes);

  return (
    <ul
      className={
        depth === 0
          ? "space-y-0.5"
          : expandParentsOnly
            ? "ml-3 mt-0.5 space-y-0 pl-1"
            : "ml-3 mt-0.5 space-y-0 border-l-2 border-brand-cream-dark pl-3"
      }
    >
      {visible.map((cat) => {
        const active = selectedSlug === cat.slug;
        const children = visibleChildren(cat.children);
        const hasChildren = children.length > 0;
        const isParent = depth === 0;
        const isOpen = isParent ? openSlug === cat.slug : true;
        const showAsOpenBranch = !expandParentsOnly && isParent && hasChildren && isOpen && !active;

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
                if (expandParentsOnly && isParent && hasChildren) {
                  onOpen?.(cat.slug);
                  return;
                }
                onSelect(cat.slug);
                if (isParent && hasChildren) onOpen?.(cat.slug);
                onNavigate?.();
              }}
              aria-expanded={isParent && hasChildren ? isOpen : undefined}
              className={`flex w-full min-h-[36px] items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm leading-snug transition-colors duration-150 ${
                isParent
                  ? expandParentsOnly
                    ? "font-medium text-stone-700 hover:bg-stone-50"
                    : active
                      ? "bg-brand-forest font-semibold text-brand-cream"
                      : showAsOpenBranch
                        ? "bg-brand-cream font-semibold text-brand-forest"
                        : "font-semibold text-brand-forest hover:bg-brand-cream"
                  : active
                    ? "bg-brand-forest/10 font-medium text-brand-forest"
                    : "font-medium text-brand-ink/85 hover:bg-brand-cream hover:text-brand-ink"
              }`}
            >
              <span className="min-w-0">{cat.name}</span>
              {expandParentsOnly && isParent && hasChildren ? <Chevron open={isOpen} /> : null}
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
                    expandParentsOnly={expandParentsOnly}
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
