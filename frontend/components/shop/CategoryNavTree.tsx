"use client";

import Link from "next/link";

import type { CategoryNode } from "@/lib/types";

type Props = {
  nodes: CategoryNode[];
  selectedSlug: string | undefined;
  depth: number;
  showActiveDot?: boolean;
  onNavigate?: () => void;
};

const linkBase =
  "block min-h-[40px] rounded-md py-2 pl-2 pr-2 text-sm leading-snug transition-colors";

export function CategoryNavTree({
  nodes,
  selectedSlug,
  depth,
  showActiveDot = true,
  onNavigate
}: Props) {
  return (
    <ul
      className={depth === 0 ? "space-y-0.5" : "ml-2 mt-0.5 space-y-0.5 border-l border-stone-200 pl-3"}
    >
      {nodes.map((cat) => {
        const active = selectedSlug === cat.slug;
        return (
          <li key={cat.id}>
            <Link
              href={`/shop?category=${encodeURIComponent(cat.slug)}`}
              onClick={() => onNavigate?.()}
              className={`${linkBase} ${
                active
                  ? "bg-amber-50 font-medium text-amber-700"
                  : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
              }`}
            >
              <span className="flex items-start gap-2">
                {active && showActiveDot ? (
                  <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-700" aria-hidden />
                ) : (
                  <span className="mt-1.5 w-2 flex-shrink-0" aria-hidden />
                )}
                <span>{cat.name}</span>
              </span>
            </Link>
            {cat.children.length > 0 ? (
              <CategoryNavTree
                nodes={cat.children}
                selectedSlug={selectedSlug}
                depth={depth + 1}
                showActiveDot={showActiveDot}
                onNavigate={onNavigate}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
