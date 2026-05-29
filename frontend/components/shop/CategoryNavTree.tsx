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
  "block min-h-[40px] rounded-md py-2 pr-2 text-[13px] font-light leading-snug transition-colors";

export function CategoryNavTree({
  nodes,
  selectedSlug,
  depth,
  showActiveDot = true,
  onNavigate
}: Props) {
  return (
    <ul
      className={
        depth === 0
          ? "space-y-0.5"
          : "ml-2 mt-0.5 space-y-0.5 border-l border-[rgba(196,176,232,0.25)] pl-3"
      }
    >
      {nodes.map((cat) => {
        const active = selectedSlug === cat.slug;
        return (
          <li key={cat.id}>
            <Link
              href={`/product-category/${encodeURIComponent(cat.slug)}`}
              onClick={() => onNavigate?.()}
              className={`${linkBase} ${
                active
                  ? "bg-[rgba(91,62,155,0.06)] pl-5 font-semibold text-brand-violet"
                  : "pl-3 text-brand-mid hover:bg-[rgba(91,62,155,0.06)] hover:pl-5 hover:text-brand-violet"
              }`}
            >
              <span className="flex items-start gap-2">
                {active && showActiveDot ? (
                  <span
                    className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-violet"
                    aria-hidden
                  />
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
