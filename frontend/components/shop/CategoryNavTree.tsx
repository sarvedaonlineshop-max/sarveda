"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { CategoryNode } from "@/lib/types";
import { defaultExpandedCategorySlugs } from "@/lib/shop-categories";

type Props = {
  nodes: CategoryNode[];
  selectedSlug: string | undefined;
  depth: number;
  showActiveDot?: boolean;
  onNavigate?: () => void;
  defaultExpanded?: Set<string>;
};

const linkBase =
  "block min-h-[40px] rounded-md py-2 pl-2 pr-2 text-sm leading-snug transition-colors";

export function CategoryNavTree({
  nodes,
  selectedSlug,
  depth,
  showActiveDot = true,
  onNavigate,
  defaultExpanded
}: Props) {
  const initialExpanded = useMemo(
    () => defaultExpanded ?? defaultExpandedCategorySlugs(nodes),
    [defaultExpanded, nodes]
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialExpanded));

  function toggle(slug: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <ul
      className={
        depth === 0
          ? "space-y-1"
          : "ml-1 mt-0.5 space-y-0.5 border-l-2 border-brand-cream-dark pl-3"
      }
    >
      {nodes.map((cat) => {
        const active = selectedSlug === cat.slug;
        const hasChildren = cat.children.length > 0;
        const isOpen = expanded.has(cat.slug);
        const isParent = depth === 0;

        return (
          <li key={cat.id}>
            <div className="flex items-stretch gap-0.5">
              {hasChildren && isParent ? (
                <button
                  type="button"
                  onClick={() => toggle(cat.slug)}
                  className="flex w-7 shrink-0 items-center justify-center rounded-md text-brand-muted hover:bg-brand-cream hover:text-brand-forest"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Collapse ${cat.name}` : `Expand ${cat.name}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
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
                <span className="w-7 shrink-0" aria-hidden />
              )}
              <Link
                href={`/product-category/${encodeURIComponent(cat.slug)}`}
                onClick={() => onNavigate?.()}
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
                <span className="flex items-start gap-2">
                  {active && showActiveDot ? (
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-gold" aria-hidden />
                  ) : (
                    <span className="mt-1.5 w-2 flex-shrink-0" aria-hidden />
                  )}
                  <span>{cat.name}</span>
                </span>
              </Link>
            </div>
            {hasChildren && (!isParent || isOpen) ? (
              <CategoryNavTree
                nodes={cat.children}
                selectedSlug={selectedSlug}
                depth={depth + 1}
                showActiveDot={showActiveDot}
                onNavigate={onNavigate}
                defaultExpanded={defaultExpanded}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
