"use client";

import Link from "next/link";

import type { CategoryNode } from "@/lib/types";

type Props = {
  nodes: CategoryNode[];
  selectedSlug: string | undefined;
  depth: number;
  showActiveDot?: boolean;
  onNavigate?: () => void;
  /** Client-side category switch — keeps header/sidebar/footer mounted, no full page reload. */
  onSelect?: (slug: string | undefined) => void;
  /** Accordion: which top-level slug is currently open (only one at a time). */
  openSlug?: string | null;
  /** Chevron click — toggles open/closed. */
  onToggle?: (slug: string) => void;
  /** Category name click — always opens its own branch (closing siblings). */
  onOpen?: (slug: string) => void;
};

const linkBase =
  "block min-h-[30px] rounded-md py-1 pl-2 pr-2 text-sm leading-snug transition-colors duration-150";

/** A handful of real subcategories are literally named "All" — the parent category
 *  link already shows everything, so this redundant child is hidden from the tree. */
function visibleChildren(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.filter((n) => n.name.trim().toLowerCase() !== "all");
}

export function CategoryNavTree({
  nodes,
  selectedSlug,
  depth,
  showActiveDot = true,
  onNavigate,
  onSelect,
  openSlug,
  onToggle,
  onOpen
}: Props) {
  const visible = depth === 0 ? nodes : visibleChildren(nodes);

  return (
    <ul
      className={
        depth === 0
          ? "space-y-0.5"
          : "ml-1 mt-0.5 space-y-0 border-l-2 border-brand-cream-dark pl-3"
      }
    >
      {visible.map((cat) => {
        const active = selectedSlug === cat.slug;
        const children = visibleChildren(cat.children);
        const hasChildren = children.length > 0;
        const isParent = depth === 0;
        const isOpen = isParent ? openSlug === cat.slug : true;

        return (
          <li key={cat.id}>
            <div className="flex items-stretch gap-0.5">
              {hasChildren && isParent ? (
                <button
                  type="button"
                  onClick={() => onToggle?.(cat.slug)}
                  className="flex w-6 shrink-0 items-center justify-center rounded-md text-brand-muted transition-colors duration-150 hover:bg-brand-cream hover:text-brand-forest"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Collapse ${cat.name}` : `Expand ${cat.name}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-3.5 w-3.5 transition-transform duration-200 ease-out ${isOpen ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              ) : (
                <span className="w-6 shrink-0" aria-hidden />
              )}
              <Link
                href={`/product-category/${encodeURIComponent(cat.slug)}`}
                onClick={(e) => {
                  if (onSelect) {
                    e.preventDefault();
                    onSelect(cat.slug);
                  }
                  if (isParent && hasChildren) onOpen?.(cat.slug);
                  onNavigate?.();
                }}
                className={`${linkBase} flex-1 ${
                  isParent
                    ? active
                      ? "bg-brand-forest/10 font-bold text-brand-forest"
                      : "font-semibold text-brand-forest hover:bg-brand-cream"
                    : active
                      ? "bg-brand-forest/5 font-medium text-brand-forest"
                      : "text-brand-muted hover:bg-brand-cream hover:text-brand-ink"
                }`}
              >
                <span className="flex items-start gap-1.5">
                  {active && showActiveDot ? (
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold" aria-hidden />
                  ) : (
                    <span className="mt-1.5 w-1.5 flex-shrink-0" aria-hidden />
                  )}
                  <span>{cat.name}</span>
                </span>
              </Link>
            </div>
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
                    showActiveDot={showActiveDot}
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
